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
  assert.equal((twice.match(/schedule-ai\.css/g)||[]).length,1);
  assert.equal((twice.match(/schedule-ai\.js/g)||[]).length,1);
  assert.match(twice,/app\.js\?v=11/);
});

test('injectScheduleBridge adds bridge before bedtime engine marker once',()=>{
  const js="const x=1;\n    // --- 14 Bedtime Reminder Engine ---\nconst y=2;";
  const once=injectScheduleBridge(js),twice=injectScheduleBridge(once);
  assert.match(twice,/__kairosScheduleBridge/);
  assert.equal((twice.match(/__kairosScheduleBridge\s*=/g)||[]).length,1);
  assert.match(twice,/14 Bedtime Reminder Engine/);
  assert.match(twice,/requestAiPlan/);
  assert.match(twice,/Treat every task title/);
  assert.match(twice,/validateScheduleProposals/);
});

test('rewriteRelaySource rewrites relay URL for schedule module too',()=>{
  assert.equal(rewriteRelaySource("fetch('https://kairos.kirosapp.workers.dev')"),"fetch('/api/ai')");
});
