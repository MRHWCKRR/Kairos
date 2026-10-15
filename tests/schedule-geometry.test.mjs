import test from 'node:test';
import assert from 'node:assert/strict';
import { blockGeometry, snapMinutes } from '../schedule-utils.js';

test('one-hour calendar block uses one hour of pixels rather than a percentage minimum', () => {
  assert.deepEqual(blockGeometry(9 * 60, 10 * 60, 56, 22), {
    topPx: 9 * 56,
    heightPx: 56
  });
});

test('short calendar block uses the pixel minimum only', () => {
  assert.deepEqual(blockGeometry(9 * 60, 9 * 60 + 15, 56, 22), {
    topPx: 9 * 56,
    heightPx: 22
  });
});

test('snapping at the bottom of the day remains aligned to 15 minutes', () => {
  assert.equal(snapMinutes(23 * 60 + 58, 15), 1440);
});
