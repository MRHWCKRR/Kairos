import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyTaskListCommand} from '../task-list-model.js';

async function fixture(empty=false){
  const data={userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Science',notes:'Old'}]}]}]};
  const f=await plannerFixture(empty?null:data);f.context.applyTaskListCommand=applyTaskListCommand;
  vm.runInContext(`let boardsData=${JSON.stringify(data.boards)},dayInsights={},scheduleData=[],planSnapshot=planState({boards:boardsData}),planEditRevision=0,planLoadRevision=0,currentPlanDocId='plan',planSaveQueue=Promise.resolve();function renderApp(){}`,f.context);
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
  vm.runInContext(source.slice(source.indexOf('    async function commitTaskDetails('),source.indexOf('    const pageLoader =')),f.context);
  vm.runInContext(source.slice(source.indexOf('    async function updatePlanInFirestore('),source.indexOf('    async function loadLatestPlanFromFirestore(')),f.context);
  vm.runInContext('let taskDetails={open:async target=>({planId:currentPlanDocId,target})};const pageLoader={prepare:async()=>{}};const pageRouter={navigate:async()=>{}};',f.context);
  const opening=source.indexOf('    async function openTaskDetailsFromList(');
  if(opening>=0)vm.runInContext(source.slice(opening,source.indexOf("    document.getElementById('tasks-page')?.addEventListener('click'",opening)),f.context);
  return f;
}
const command={type:'edit_task',target:{taskId:'t'},changes:{notes:'New'}};
const expected={boardId:'b',sectionId:'s',fields:{notes:'Old'}};
const identity=()=>({ownerId:'one',planId:'plan',operationId:'detail-host',createdAt:Date.now()});
test('host refresh keeps remote unrelated fields and retries after an uncertain response',async()=>{
  const f=await fixture();await f.execute({type:'set_task_reminder',args:{taskId:'t',minutesBefore:15}});
  const get=f.context.getDoc;let fail=true;f.context.getDoc=async ref=>{if(fail){fail=false;throw new Error('Response lost')}return get(ref)};
  const id=identity();await assert.rejects(f.context.commitTaskDetails(command,expected,id),/Response lost/);
  await f.context.commitTaskDetails(command,expected,id);
  const live=vm.runInContext('boardsData[0].sections[0].tasks[0]',f.context);
  assert.equal(live.notes,'New');assert.equal(live.reminderMinutes,15);
  assert.equal(f.data().aiActionReceipts.filter(r=>r.id==='detail-host').length,1);
});
test('More actions navigation retains the exact recurring occurrence target',async()=>{
  const f=await fixture();let selected;
  f.context.window.__kairosScheduleWorkspace={selectItem:()=>{throw new Error('Must not select the entire series')},selectOccurrence:value=>selected=value};
  assert.equal(typeof f.context.openTaskDetailsInSchedule,'function');
  await f.context.openTaskDetailsInSchedule({taskId:'t',occurrenceDate:'2026-10-15'});
  assert.equal(selected.seriesId,'t');assert.equal(selected.occurrenceId,'t::2026-10-15');assert.equal(selected.occurrenceDate,'2026-10-15');
});
test('host reconciles normalized legacy metadata after a saved detail edit',async()=>{
  const f=await fixture();
  vm.runInContext('delete planSnapshot.boards[0].sections[0].tasks[0].notes;boardsData[0].sections[0].tasks[0].notes="";',f.context);
  await f.context.commitTaskDetails(command,expected,identity());
  assert.equal(vm.runInContext('boardsData[0].sections[0].tasks[0].notes',f.context),'New');
});
test('opening default task details creates the plan before capturing edit identity',async()=>{
  const f=await fixture(true);vm.runInContext('currentPlanDocId=null;planSnapshot=null;',f.context);
  assert.equal(typeof f.context.openTaskDetailsFromList,'function');
  const opened=await f.context.openTaskDetailsFromList('t',null);
  assert.equal(opened.planId,'plan-one');assert.equal(f.data().boards[0].sections[0].tasks[0].id,'t');
});
test('account changes during refresh never publish the previous owners plan to the UI',async()=>{
  const f=await fixture(),get=f.context.getDoc;
  f.context.getDoc=async ref=>{const out=await get(ref);f.context.auth.currentUser={uid:'two'};return out};
  await assert.rejects(f.context.commitTaskDetails(command,expected,identity()),/account/);
  assert.equal(vm.runInContext('boardsData[0].sections[0].tasks[0].notes',f.context),'Old');
});
