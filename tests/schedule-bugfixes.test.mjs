import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyResize, scheduleFieldsFromDuration, taskDurationMinutes } from '../schedule-utils.js';

const responsive = readFileSync(new URL('../schedule-responsive.js', import.meta.url), 'utf8');
const interactions = readFileSync(new URL('../schedule-interactions.js', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../schedule-inspector.js', import.meta.url), 'utf8');
const inspectorCss = readFileSync(new URL('../schedule-inspector.css', import.meta.url), 'utf8');

test('Schedule responsive logic never toggles the global sidebar', () => {
  assert.doesNotMatch(responsive, /sidebarAutoCollapsed/);
  assert.doesNotMatch(responsive, /classList\.(?:add|remove)\(['"]collapsed['"]\)/);
});

test('manual pointer scheduling uses one-minute snapping', () => {
  assert.match(interactions, /const SNAP_MINUTES=1;/);
  assert.match(interactions, /snapMinutes\([^;]+SNAP_MINUTES\)/);
  assert.match(interactions, /applyResize\([^;]+SNAP_MINUTES\)/);
  assert.match(interactions, /applyScheduledMove\([^;]+SNAP_MINUTES\)/);
});

test('inspector allows one-minute start, duration and estimate values', () => {
  assert.match(inspector, /type="time" step="60"/);
  assert.match(inspector, /name="duration" type="number" min="1" step="1"/);
  assert.match(inspector, /name="estimate" type="number" min="1" step="1"/);
  assert.match(inspector, /Math\.max\(1,Number\(form\.elements\.duration\.value\)/);
  assert.match(inspector, /Math\.max\(1,Number\(form\.elements\.estimate\.value\)/);
});

test('Move disclosure obeys the hidden state', () => {
  assert.match(inspectorCss, /\.ks-move-fields\[hidden\]\{display:none!important\}/);
});

test('manual schedule helpers preserve one-minute durations', () => {
  assert.equal(taskDurationMinutes({ estimatedMinutes: 5 }), 5);
  assert.deepEqual(applyResize({ startTime: '16:00', endTime: '17:00' }, 16 * 60 + 1, 1), { endTime: '16:01' });
  assert.deepEqual(scheduleFieldsFromDuration('2026-10-12', '16:10', 1), {
    date: '2026-10-12', startTime: '16:10', endTime: '16:11'
  });
});
