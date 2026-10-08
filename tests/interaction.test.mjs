import test from 'node:test';
import assert from 'node:assert/strict';
import {mapToVisibleWorkspace, PoseHold} from '../dist/interaction.js';

const viewport = {width: 1168, height: 849};
test('workspace mapping keeps the lower cursor edge inside the visible viewport', () => {
  const rect = {left: 356, top: 241, width: 765, height: 772};
  assert.deepEqual(mapToVisibleWorkspace(rect, viewport, 1, 1), {x: 1113, y: 841});
  assert.deepEqual(mapToVisibleWorkspace(rect, viewport, 0, 0), {x: 364, y: 249});
});
test('workspace mapping intersects all four viewport edges and bounds input', () => {
  const rect = {left: -100, top: -100, right: 1500, bottom: 1200};
  assert.deepEqual(mapToVisibleWorkspace(rect, viewport, -2, 3), {x: 8, y: 841});
  assert.deepEqual(mapToVisibleWorkspace(rect, viewport, .5, .5), {x: 584, y: 424.5});
});
test('a visible workspace retains its eight-pixel inset', () => {
  assert.deepEqual(mapToVisibleWorkspace({left: 20, top: 30, right: 220, bottom: 130}, viewport, .5, .5), {x: 120, y: 80});
});
test('an offscreen or too-small intersection cannot produce a pointer', () => {
  for (const rect of [
    {left: 1200, top: 20, width: 100, height: 100},
    {left: 20, top: 860, width: 100, height: 100},
    {left: 20, top: 840, width: 100, height: 100},
    {left: 1160, top: 20, width: 100, height: 100},
    {left: 20, top: 20, width: 16, height: 100}
  ]) assert.equal(mapToVisibleWorkspace(rect, viewport, .5, .5), null);
});
test('invalid geometry and coordinates fail closed', () => {
  const rect = {left: 20, top: 20, width: 100, height: 100};
  assert.equal(mapToVisibleWorkspace(null, viewport, 0, 0), null);
  assert.equal(mapToVisibleWorkspace(rect, {width: 0, height: 849}, 0, 0), null);
  assert.equal(mapToVisibleWorkspace({...rect, width: -1}, viewport, 0, 0), null);
  assert.equal(mapToVisibleWorkspace(rect, viewport, NaN, 0), null);
});

function observe(hold, mode, start, end, expected = 'fist') {
  const fires = [];
  for (let now = start; now <= end; now += 50) if (hold.update(mode, now, expected)) fires.push(now);
  return fires;
}
test('a sustained pose triggers at one second and stays latched', () => {
  const hold = new PoseHold();
  assert.deepEqual(observe(hold, 'fist', 0, 1600), [1000]);
});
test('short classification noise preserves progress without counting its interval', () => {
  const hold = new PoseHold();
  assert.deepEqual(observe(hold, 'fist', 0, 500), []);
  assert.equal(hold.update('rest', 550, 'fist'), false);
  assert.equal(hold.update('fist', 600, 'fist'), false);
  assert.deepEqual(observe(hold, 'fist', 650, 1150), [1100]);
});
test('an interruption lasting exactly 150ms is tolerated and not counted', () => {
  const hold = new PoseHold();
  observe(hold, 'fist', 0, 500);
  observe(hold, 'rest', 550, 650);
  assert.equal(hold.update('fist', 700, 'fist'), false);
  assert.deepEqual(observe(hold, 'fist', 750, 1250), [1200]);
});
test('a longer interruption resets partial progress', () => {
  const hold = new PoseHold();
  observe(hold, 'fist', 0, 500);
  observe(hold, 'none', 550, 750);
  assert.deepEqual(observe(hold, 'fist', 800, 1800), [1800]);
});
test('a latched pose needs a sustained release before it can trigger again', () => {
  const hold = new PoseHold();
  observe(hold, 'fist', 0, 1000);
  hold.update('rest', 1050, 'fist');
  assert.deepEqual(observe(hold, 'fist', 1100, 1500), []);
  observe(hold, 'rest', 1550, 1750);
  assert.deepEqual(observe(hold, 'fist', 1800, 2800), [2800]);
});
test('switching the requested pose starts a fresh timer', () => {
  const hold = new PoseHold();
  observe(hold, 'fist', 0, 1000);
  assert.deepEqual(observe(hold, 'palm', 1050, 2050, 'palm'), [2050]);
});
test('a camera stall or backwards timestamp cannot finish an old hold', () => {
  const hold = new PoseHold();
  observe(hold, 'fist', 0, 500);
  assert.equal(hold.update('fist', 1000, 'fist'), false);
  assert.deepEqual(observe(hold, 'fist', 1050, 2000), [2000]);
  assert.equal(hold.update('fist', 0, 'fist'), false);
  assert.deepEqual(observe(hold, 'fist', 50, 1000), [1000]);
});
test('reset and invalid timestamps discard hold progress', () => {
  const hold = new PoseHold();
  observe(hold, 'fist', 0, 500);
  hold.reset();
  observe(hold, 'fist', 550, 1050);
  assert.equal(hold.update('fist', NaN, 'fist'), false);
  assert.deepEqual(observe(hold, 'fist', 1100, 2100), [2100]);
});
