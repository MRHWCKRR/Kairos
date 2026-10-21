import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {parseHTML} from 'linkedom';
import * as utils from '../schedule-utils.js';import * as recurrence from '../recurrence-utils.js';import {pageFromUrl,pageUrl} from '../page-router.js';
const source=(await readFile(new URL('../schedule-workspace.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
function fixture(){const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><aside id="schedule-backlog"></aside><div id="schedule-calendar"></div><aside id="schedule-inspector" hidden></aside></div><div id="schedule-ai-review"></div></section><div id="calendar-page" class="page-view"><div class="calendar-header-bar"><button id="old-prev">Previous month</button></div><div id="calendar-grid"></div></div><div id="day-detail-overlay"><button id="insights">Daily insights</button></div></body></html>');let months=0;const context=vm.createContext({...utils,...recurrence,document,window,Date,CSS:{escape:String},requestAnimationFrame:()=>1,setInterval:()=>1,clearInterval(){}});vm.runInContext(source,context);const ws=context.initScheduleWorkspace({getBoards:()=>[],getScheduleEvents:()=>[],renderMonthCalendar:()=>months++});return {ws,document,months:()=>months}}
test('Month reuses the old calendar DOM, day insights and handlers inside Schedule',async()=>{
 const f=fixture(),month=f.document.getElementById('calendar-page'),button=f.document.getElementById('old-prev');let clicks=0;button.onclick=()=>clicks++;
 assert.equal(typeof f.ws.setView,'function');assert.equal(await f.ws.setView('month'),true);assert.ok(month.closest('#schedule-page'));assert.equal(month.hidden,false);button.click();assert.equal(clicks,1);assert.ok(f.document.getElementById('insights'));assert.ok(f.months()>0);
 await f.ws.setView('day');assert.equal(month.hidden,true);assert.equal(f.ws.state.view,'day');
});
test('switching to Month waits for inspector draft protection',async()=>{
 const f=fixture();assert.equal(typeof f.ws.setView,'function');f.ws.setInspectorSession({requestLeave:async()=>false,preserve:()=>false});assert.equal(await f.ws.setView('month'),false);assert.equal(f.document.getElementById('calendar-page').hidden,true);
});
test('opening an occurrence from Month reveals its timeline inspector',async()=>{
 const f=fixture();await f.ws.setView('month');await f.ws.selectOccurrence({seriesId:'series',occurrenceId:'series::2026-10-21',occurrenceDate:'2026-10-21'});assert.equal(f.ws.state.monthView,false);assert.equal(f.document.querySelector('.schedule-workspace-shell').hidden,false);assert.equal(f.ws.state.selected.type,'occurrence');
});
test('old Calendar links resolve to the monthly Schedule view while preserving billing parameters',()=>{
 const url='https://example.test/app.html?page=calendar&checkout=success';assert.equal(pageFromUrl(url),'schedule-page');const next=pageUrl(url,'schedule-page');assert.equal(next.searchParams.get('scheduleView'),'month');assert.equal(next.searchParams.get('checkout'),'success');
});
