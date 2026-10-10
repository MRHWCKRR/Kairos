import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ai = readFileSync(new URL('../schedule-ai.js', import.meta.url), 'utf8');

test('proposal Change editor exposes scheduling and task metadata controls', () => {
  assert.match(ai, /data-proposal-duration/);
  assert.match(ai, /data-proposal-color/);
  assert.match(ai, /data-proposal-priority/);
  assert.match(ai, /data-proposal-estimate/);
  assert.match(ai, /data-proposal-preference/);
});

test('proposal metadata stays in proposal draft until Apply', () => {
  assert.match(ai, /metadata:/);
  assert.match(ai, /proposal\.metadata/);
  assert.match(ai, /Object\.assign\(task,p\.to,p\.metadata/);
});

test('proposal apply snapshots metadata so rollback restores task details', () => {
  assert.match(ai, /priority:task\.priority/);
  assert.match(ai, /estimatedMinutes:task\.estimatedMinutes/);
  assert.match(ai, /schedulingPreference:task\.schedulingPreference/);
  assert.match(ai, /color:task\.color/);
  assert.match(ai, /Object\.assign\(s\.task,s\.before\)/);
});

test('proposal overlay previews draft color before Apply', () => {
  assert.match(ai, /proposal\.metadata\?\.color/);
});
