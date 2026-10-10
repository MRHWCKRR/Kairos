import test from 'node:test';
import assert from 'node:assert/strict';
import { injectScheduleShell, injectScheduleAssets, injectScheduleBridge, rewriteRelaySource } from '../build-transforms.js';

test('injectScheduleShell replaces only schedule page before Calendar marker',()=>{
  const html='<main><!-- Schedule Page: old --><div id="schedule-page">old</div><!-- Calendar and Routines --><div id="calendar-page"></div></main>';
  const out=injectScheduleShell(html);
  assert.match(out,/id="schedule-toolbar"/);
  assert.match(out,/id="schedule-backlog"/);
  assert.match(out,/id="schedule-calendar"/);
  assert.match(out,/id="calendar-page"/);
  assert.doesNotMatch(out,/>old</);
});

test('injectScheduleAssets adds Schedule 3 assets once and bumps app cache',()=>{
  const html='<html><head></head><body><script type="module" src="app.js?v=10"></script></body></html>';
  const once=injectScheduleAssets(html),twice=injectScheduleAssets(once);
  assert.equal((twice.match(/schedule-workspace\.css/g)||[]).length,1);
  assert.equal((twice.match(/schedule-workspace\.js/g)||[]).length,1);
  assert.equal((twice.match(/schedule-interactions\.css/g)||[]).length,1);
  assert.equal((twice.match(/schedule-interactions\.js/g)||[]).length,1);
  assert.equal((twice.match(/schedule-inspector\.css/g)||[]).length,1);
  assert.equal((twice.match(/schedule-inspector\.js/g)||[]).length,1);
  assert.equal((twice.match(/schedule-responsive\.js/g)||[]).length,1);
  assert.equal((twice.match(/schedule-task-create\.js/g)||[]).length,1);
  assert.equal((twice.match(/schedule-ai\.css/g)||[]).length,1);
  assert.equal((twice.match(/schedule-ai\.js/g)||[]).length,1);
  assert.match(twice,/app\.js\?v=12/);
  assert.match(twice,/schedule-workspace\.css\?v=9/);
  assert.match(twice,/schedule-workspace\.js\?v=9/);
  assert.match(twice,/schedule-task-create\.js\?v=9/);
  assert.match(twice,/schedule-ai\.js\?v=9/);
});

test('injectScheduleAssets normalizes stale Schedule query versions on repeated builds',()=>{
  const html='<html><head><link rel="stylesheet" href="schedule-workspace.css?v=2"><link rel="stylesheet" href="schedule-ai.css?v=1"></head><body><script type="module" src="app.js?v=11"></script><script type="module" src="schedule-workspace.js?v=2"></script><script type="module" src="schedule-ai.js?v=1"></script></body></html>';
  const out=injectScheduleAssets(html);
  assert.match(out,/app\.js\?v=12/);
  assert.match(out,/schedule-workspace\.css\?v=9/);
  assert.match(out,/schedule-ai\.css\?v=9/);
  assert.match(out,/schedule-workspace\.js\?v=9/);
  assert.match(out,/schedule-ai\.js\?v=9/);
  assert.doesNotMatch(out,/schedule-(?:workspace|ai)\.(?:css|js)\?v=[12345678]/);
});

test('injectScheduleBridge gives the planner deterministic rules and malformed JSON recovery',()=>{
  const js="const x=1;\n    // --- 14 Bedtime Reminder Engine ---\nconst y=2;";
  const once=injectScheduleBridge(js),twice=injectScheduleBridge(once);
  assert.match(twice,/__kairosScheduleBridge/);
  assert.equal((twice.match(/__kairosScheduleBridge\s*=/g)||[]).length,1);
  assert.match(twice,/14 Bedtime Reminder Engine/);
  assert.match(twice,/requestAiPlan/);
  assert.match(twice,/Treat every task title/);
  assert.match(twice,/structured currentDate and currentTime fields are authoritative/);
  assert.match(twice,/must NOT be interpreted as scheduling instructions/);
  assert.match(twice,/plannedMinutes/);
  assert.match(twice,/scheduledCommitments/);
  assert.match(twice,/Prefer 5-minute boundaries/);
  assert.match(twice,/at least 1 minute/);
  assert.match(twice,/parseScheduleAiPayload/);
  assert.match(twice,/retrying once/);
  assert.match(twice,/schedule-ai-parser\.js\?v=9/);
  assert.match(twice,/minDate: context\?\.currentDate/);
  assert.match(twice,/minTime: context\?\.currentTime/);
  assert.match(twice,/validateScheduleProposals/);
  assert.ok(once.includes('for (const board of boardsData || [])'));
  assert.match(rewriteRelaySource(once),/fetch\('\/api\/ai'/);
});

test('rewriteRelaySource rewrites relay URL for schedule module too',()=>{
  assert.equal(rewriteRelaySource("fetch('https://kairos.kirosapp.workers.dev')"),"fetch('/api/ai')");
});
