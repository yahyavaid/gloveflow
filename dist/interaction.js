/** Helpers shared by the camera controller and its regression tests. */
export function mapToVisibleWorkspace(rect, viewport, x, y) {
  if (!rect || !viewport || ![rect.left, rect.top, viewport.width, viewport.height, x, y].every(Number.isFinite)) return null;
  const right = Number.isFinite(rect.right) ? rect.right : rect.left + rect.width;
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
  if (!Number.isFinite(right) || !Number.isFinite(bottom) || right <= rect.left || bottom <= rect.top || viewport.width <= 0 || viewport.height <= 0) return null;
  const left = Math.max(0, rect.left) + 8;
  const top = Math.max(0, rect.top) + 8;
  const visibleRight = Math.min(viewport.width, right) - 8;
  const visibleBottom = Math.min(viewport.height, bottom) - 8;
  if (visibleRight <= left || visibleBottom <= top) return null;
  const bounded = value => Math.max(0, Math.min(1, value));
  return {x: left + bounded(x) * (visibleRight - left), y: top + bounded(y) * (visibleBottom - top)};
}

/** A one-second pose hold, with short classification interruptions tolerated. */
export class PoseHold {
  constructor() { this.reset(); }
  reset() {
    this.expected = null;
    this.lastTime = null;
    this.previousMatched = false;
    this.absentSince = null;
    this.elapsed = 0;
    this.latched = false;
  }
  update(mode, now, expected) {
    if (!Number.isFinite(now) || typeof expected !== 'string' || !expected) { this.reset(); return false; }
    // A different requested pose or a camera stall starts a fresh hold.
    if (this.expected !== expected || (this.lastTime !== null && (now < this.lastTime || now - this.lastTime > 150))) this.reset();
    this.expected = expected;
    const delta = this.lastTime === null ? 0 : now - this.lastTime;
    this.lastTime = now;
    if (mode !== expected) {
      this.absentSince ??= now;
      this.previousMatched = false;
      if (now - this.absentSince > 150) { this.elapsed = 0; this.latched = false; }
      return false;
    }
    if (this.absentSince !== null && now - this.absentSince > 150) { this.elapsed = 0; this.latched = false; }
    // Count only intervals bounded by two matching observations. Brief gaps
    // preserve progress, but neither the gap nor its boundary interval counts.
    if (this.previousMatched && this.absentSince === null) this.elapsed += delta;
    this.absentSince = null;
    this.previousMatched = true;
    if (!this.latched && this.elapsed >= 1000) { this.latched = true; return true; }
    return false;
  }
}
