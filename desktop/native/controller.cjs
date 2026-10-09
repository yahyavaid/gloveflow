'use strict';
const {performance} = require('node:perf_hooks');
const MODES = new Set(['point', 'pinch', 'scroll', 'fist', 'palm', 'rest', 'none']);
const KEYS = new Set(['mode', 'x', 'y', 'click', 'scrollDelta']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Main-process-only gate. Renderer timestamps are never accepted or consulted. */
function createController({driver, bounds = () => driver.bounds(), isTrusted = () => driver.isTrusted(), now = () => performance.now(), onStop = () => {}}) {
  if (!driver || !['move', 'click', 'scroll'].every(key => typeof driver[key] === 'function')) throw new TypeError('An input driver is required.');
  let enabled = false, paused = false, armed = false, scrollReady = false, scrollSince = null, lastFrameAt = null, lastInputAt = -Infinity, lastClickAt = -Infinity;
  let reason = 'Desktop control is off.', restartRequired = false;
  function status() { return {enabled, paused, armed, scrollReady, reason, restartRequired}; }
  function disarm() { armed = false; scrollReady = false; scrollSince = null; }
  function stop(message = 'Desktop control stopped.', restart = false) {
    const wasEnabled = enabled;
    enabled = false; paused = false; disarm(); lastFrameAt = null; lastInputAt = -Infinity;
    reason = String(message).slice(0, 240); restartRequired = Boolean(restart);
    if (wasEnabled) { try { onStop(status()); } catch {} }
    return status();
  }
  function clock() {
    const time = now();
    if (!Number.isFinite(time) || (lastFrameAt !== null && time < lastFrameAt)) throw new Error('Tracking clock is unavailable.');
    return time;
  }
  function displayBounds() {
    const display = bounds();
    if (!display || ![display.x, display.y, display.width, display.height].every(Number.isFinite) || display.width < 1 || display.height < 1 || display.width > 100000 || display.height > 100000 || Math.abs(display.x) > 1e7 || Math.abs(display.y) > 1e7) throw new Error('Main display bounds are unavailable.');
    return display;
  }
  function enable() {
    // An explicit second enable starts a fresh session but keeps click cooldown.
    stop('Desktop control is off.');
    try {
      if (isTrusted() !== true) return stop('Grant Accessibility permission, then restart tracking.', true);
      displayBounds(); lastFrameAt = clock();
      enabled = true; reason = 'Point to move the cursor, or hold two fingers to start scrolling.'; restartRequired = false;
    } catch { return stop('Desktop control could not start. Check permissions and restart tracking.', true); }
    return status();
  }
  function checkHeartbeat() {
    if (!enabled) return status();
    try {
      if (clock() - lastFrameAt > 300) return stop('Tracking heartbeat was lost. Restart tracking.', true);
      if (isTrusted() !== true) return stop('Accessibility permission was removed. Restart tracking.', true);
    } catch { return stop('Desktop control became unavailable. Restart tracking.', true); }
    return status();
  }
  function setPaused(value) {
    if (!enabled || typeof value !== 'boolean') return status();
    checkHeartbeat();
    if (!enabled) return status();
    paused = value; disarm();
    reason = paused ? 'Desktop control is paused.' : 'Point to move the cursor, or hold two fingers to resume scrolling.';
    return status();
  }
  function validate(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !KEYS.has(key)) || !MODES.has(payload.mode) || typeof payload.click !== 'boolean' || !Number.isFinite(payload.scrollDelta)) return null;
    if (payload.click && payload.mode !== 'pinch') return null;
    const active = ['point', 'pinch', 'scroll'].includes(payload.mode);
    if (active && (!Number.isFinite(payload.x) || !Number.isFinite(payload.y))) return null;
    if (!active && ((payload.x !== undefined && payload.x !== null && !Number.isFinite(payload.x)) || (payload.y !== undefined && payload.y !== null && !Number.isFinite(payload.y)))) return null;
    return {mode: payload.mode, x: active ? clamp(payload.x, 0, 1) : 0, y: active ? clamp(payload.y, 0, 1) : 0, click: payload.click, scrollDelta: clamp(payload.scrollDelta, -55, 55)};
  }
  function handleFrame(payload) {
    if (!enabled) return {...status(), accepted: false};
    checkHeartbeat();
    if (!enabled) return {...status(), accepted: false};
    const frame = validate(payload);
    if (!frame) return {...stop('Invalid tracking frame. Restart tracking.', true), accepted: false};
    let time;
    try { time = clock(); } catch { return {...stop('Tracking clock was interrupted. Restart tracking.', true), accepted: false}; }
    const frameGap = time - lastFrameAt;
    lastFrameAt = time;
    if (paused) { disarm(); return {...status(), accepted: true}; }
    if (['none', 'rest', 'fist'].includes(frame.mode)) {
      disarm();
      reason = frame.mode === 'none' ? 'Hand not detected. Point or hold two fingers to resume.' : 'Point to move the cursor, or hold two fingers to resume scrolling.';
      return {...status(), accepted: true};
    }
    if (frame.mode === 'scroll') {
      // Scrolling has its own recovery gate: it must never arm a later pinch.
      if (armed) { scrollReady = true; armed = false; }
      if (!scrollReady) {
        if (scrollSince === null || frameGap > 150) scrollSince = time;
        if (time - scrollSince >= 150) {
          scrollReady = true;
          reason = 'Two-finger scrolling is active.';
        } else reason = 'Hold two fingers steady briefly to resume scrolling.';
        // Discard recovery movement instead of replaying a jump after the hold.
        return {...status(), accepted: true};
      }
      reason = 'Two-finger scrolling is active.';
    } else {
      scrollReady = false; scrollSince = null;
      if (!armed) {
        if (frame.mode === 'palm' || frame.mode === 'point') { armed = true; reason = 'Desktop control is active.'; }
        else reason = 'Release your pinch and point before clicking.';
        return {...status(), accepted: true};
      }
      reason = 'Desktop control is active.';
    }
    if (frame.mode === 'palm') return {...status(), accepted: true};
    // Main process limits native event bursts to at most one frame per 16ms.
    if (time - lastInputAt < 16) return {...status(), accepted: true};
    try {
      const display = displayBounds();
      const x = display.x + frame.x * (display.width - 1), y = display.y + frame.y * (display.height - 1);
      if (frame.mode === 'scroll') {
        if (frame.scrollDelta) driver.scroll(frame.scrollDelta);
      } else {
        driver.move(x, y);
        if (frame.mode === 'pinch' && frame.click && time - lastClickAt >= 450) {
          driver.click(x, y); lastClickAt = time; armed = false;
          reason = 'Release your pinch to click again.';
        }
      }
      lastInputAt = time;
    } catch { return {...stop('Native input failed. Restart tracking.', true), accepted: false}; }
    return {...status(), accepted: true};
  }
  return Object.freeze({enable, stop, emergencyStop: () => stop('Emergency stop. Restart tracking to continue.', true), setPaused, handleFrame, checkHeartbeat, status});
}

module.exports = {createController};
