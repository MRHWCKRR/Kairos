import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../schedule-workspace.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../schedule-ai.js', import.meta.url), 'utf8');

test('calendar task blocks use shared pixel geometry', () => {
  assert.match(workspace, /blockGeometry/);
  assert.match(workspace, /top:\$\{geometry\.topPx\}px/);
  assert.match(workspace, /height:\$\{geometry\.heightPx\}px/);
  assert.doesNotMatch(workspace, /Math\.max\(20,\(item\.endMin-item\.startMin\)\/DAY_MINUTES\*100\)/);
});

test('AI proposal blocks use shared pixel geometry', () => {
  assert.match(ai, /blockGeometry/);
  assert.match(ai, /style\.top=`\$\{geometry\.topPx\}px`/);
  assert.match(ai, /style\.height=`\$\{geometry\.heightPx\}px`/);
  assert.doesNotMatch(ai, /Math\.max\(22,\(end-start\)\/1440\*100\)/);
});
