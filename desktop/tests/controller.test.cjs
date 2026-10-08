'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createController} = require('../native/controller.cjs');
const {createNativeDriver} = require('../native/coregraphics.cjs');

function fixture(options = {}) {
  let time = 0, trusted = true;
  const calls = [], stopped = [];
  const driver = {
    bounds: () => ({x: -100, y: 20, width: 1000, height: 800}),
    isTrusted: () => trusted,
    move: (x, y) => calls.push(['move', x, y]),
    click: (x, y) => calls.push(['click', x, y]),
    scroll: delta => calls.push(['scroll', delta])
  };
  const controller = createController({driver, now: () => time, onStop: value => stopped.push(value), ...options});
  const frame = (mode, extra = {}) => controller.handleFrame({mode, x: .5, y: .5, click: false, scrollDelta: 0, ...extra});
  return {controller, driver, calls, stopped, frame, tick: ms => {time += ms;}, time: value => {time = value;}, trust: value => {trusted = value;}};
}
test('native construction is lazy and has no input side effects', () => {
  const driver = createNativeDriver();
  assert.deepEqual(Object.keys(driver).sort(), ['bounds', 'click', 'isTrusted', 'move', 'scroll']);
});
test('input cannot occur before explicit enable and a released hand', () => {
  const f = fixture();
  f.frame('pinch', {click: true});
  assert.equal(f.controller.status().enabled, false);
  assert.equal(f.controller.enable().enabled, true);
  f.frame('pinch', {click: true});
  assert.deepEqual(f.calls, []);
  f.tick(45); f.frame('point');
  assert.equal(f.controller.status().armed, true);
  assert.deepEqual(f.calls, []);
  f.tick(45); f.frame('point');
  assert.deepEqual(f.calls, [['move', 399.5, 419.5]]);
});
test('Accessibility trust is required and removal immediately stops control', () => {
  const f = fixture(); f.trust(false);
  assert.equal(f.controller.enable().enabled, false);
  f.trust(true); f.controller.enable(); f.frame('palm');
  f.trust(false); f.tick(45); f.frame('point');
  assert.equal(f.controller.status().enabled, false);
  assert.equal(f.controller.status().restartRequired, true);
  assert.deepEqual(f.calls, []);
});
test('finite normalized coordinates are capped inside the display', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm'); f.tick(45);
  f.frame('point', {x: -20, y: 20});
  assert.deepEqual(f.calls, [['move', -100, 819]]);
});
test('pinch emits one click until a release and respects the main-clock cooldown', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm'); f.tick(45);
  f.frame('pinch', {click: true});
  f.tick(45); f.frame('pinch', {click: true});
  assert.equal(f.calls.filter(call => call[0] === 'click').length, 1);
  f.tick(45); f.frame('point');
  f.tick(45); f.frame('pinch', {click: true});
  assert.equal(f.calls.filter(call => call[0] === 'click').length, 1);
  for (let i = 0; i < 8; i++) { f.tick(45); f.frame('pinch', {click: false}); }
  f.tick(45); f.frame('pinch', {click: true});
  assert.equal(f.calls.filter(call => call[0] === 'click').length, 2);
});
test('scroll is capped and never moves or clicks the cursor', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm'); f.tick(45);
  f.frame('scroll', {scrollDelta: 1e9}); f.tick(45); f.frame('scroll', {scrollDelta: -1e9});
  assert.deepEqual(f.calls, [['scroll', 55], ['scroll', -55]]);
});
test('pause and missing hands produce no input and require re-arming', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm');
  f.controller.setPaused(true); f.tick(45); f.frame('pinch', {click: true});
  f.controller.setPaused(false); f.tick(45); f.frame('pinch', {click: true});
  f.tick(45); f.frame('palm'); f.tick(45); f.frame('none');
  f.tick(45); f.frame('pinch', {click: true});
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.status().armed, false);
});
test('fist and rest cannot click or arm movement', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm');
  f.tick(45); f.frame('fist'); f.tick(45); f.frame('scroll', {scrollDelta: 10});
  f.tick(45); f.frame('rest'); f.tick(45); f.frame('pinch', {click: true});
  assert.deepEqual(f.calls, []);
});
test('heartbeat loss disables control before a resumed frame can post events', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm');
  f.tick(300); assert.equal(f.controller.checkHeartbeat().enabled, true);
  f.tick(1); f.frame('point');
  assert.equal(f.controller.status().enabled, false);
  assert.equal(f.controller.status().restartRequired, true);
  assert.match(f.controller.status().reason, /Restart tracking/);
  f.frame('palm'); f.frame('point');
  assert.deepEqual(f.calls, []);
  assert.equal(f.stopped.length, 1);
});
test('emergency stop remains off until a fresh explicit enable', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm');
  f.controller.emergencyStop(); f.tick(45); f.frame('point');
  f.controller.setPaused(false);
  assert.equal(f.controller.status().enabled, false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.enable().enabled, true);
  assert.equal(f.controller.status().armed, false);
});
test('malformed renderer payloads fail closed, including renderer timestamps', () => {
  const invalid = [null, [], {}, {mode: 'bad'}, {x: NaN}, {y: Infinity}, {scrollDelta: NaN}, {click: 'true'}, {mode: 'point', click: true}, {timestamp: 999999}, {frames: [1, 2, 3]}];
  for (const patch of invalid) {
    const f = fixture(); f.controller.enable(); f.frame('palm'); f.tick(45);
    const base = {mode: 'point', x: .5, y: .5, click: false, scrollDelta: 0};
    f.controller.handleFrame(patch === null || Array.isArray(patch) ? patch : Object.keys(patch).length ? {...base, ...patch} : patch);
    assert.equal(f.controller.status().enabled, false, JSON.stringify(patch));
    assert.deepEqual(f.calls, []);
  }
});
test('none frames may omit coordinates and keep the camera heartbeat alive', () => {
  const f = fixture(); f.controller.enable();
  for (let i = 0; i < 20; i++) { f.tick(100); f.controller.handleFrame({mode: 'none', click: false, scrollDelta: 0}); }
  assert.equal(f.controller.status().enabled, true);
  assert.equal(f.controller.status().armed, false);
  assert.deepEqual(f.calls, []);
});
test('main process caps rapid event bursts', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm');
  f.tick(45); f.frame('point');
  for (let i = 0; i < 15; i++) { f.tick(1); f.frame('point'); }
  assert.equal(f.calls.length, 1);
  f.tick(1); f.frame('point');
  assert.equal(f.calls.length, 2);
});
test('driver failures, unusable displays and interrupted clocks disable control', () => {
  const f = fixture(); f.controller.enable(); f.frame('palm');
  f.driver.move = () => { throw new Error('fake native failure'); };
  f.tick(45); f.frame('point');
  assert.equal(f.controller.status().enabled, false);
  const badDisplay = fixture({bounds: () => ({x: 0, y: 0, width: 0, height: 100})});
  assert.equal(badDisplay.controller.enable().enabled, false);
  const badClock = fixture(); badClock.controller.enable(); badClock.time(NaN);
  assert.equal(badClock.controller.checkHeartbeat().enabled, false);
  const backwards = fixture(); backwards.controller.enable(); backwards.frame('palm'); backwards.time(-1);
  assert.equal(backwards.controller.checkHeartbeat().enabled, false);
});
