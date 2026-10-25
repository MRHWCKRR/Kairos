import test from 'node:test';import assert from 'node:assert/strict';import {plannerFixture} from './helpers/planner-fixture.mjs';
const state=()=>({userID:'one',boards:[{id:'b',title:'School',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'Read',date:'2026-10-25',startTime:'09:00',endTime:'10:00',completed:true}]}]}]});
test('AI date moves and resizes enforce the saved completed-task policy and ignore caller overrides',async()=>{
 for(const action of [{type:'update_task',args:{taskId:'t',date:'2026-10-26'}},{type:'resize_task',args:{taskId:'t',durationMinutes:90}}]){
  const denied=await plannerFixture(state());await assert.rejects(denied.execute(action,{allowCompleted:true,allowDurationChange:true}),/completed/i);assert.equal(denied.writes.length,0);
  const allowed=await plannerFixture(state(),{userData:{settings:{planning:{rescheduleCompleted:true}}}});await allowed.execute(action,{allowDurationChange:true});assert.equal(allowed.writes.length,1);
 }
});
test('a completed-task preference revoked after preview is enforced inside the save transaction',async()=>{
 const f=await plannerFixture(state(),{userData:{settings:{planning:{rescheduleCompleted:true}}}}),action={type:'update_task',args:{taskId:'t',date:'2026-10-26'}};
 const preview=await f.context.previewKairosAction(action,{planId:'plan'});f.setUserData({settings:{planning:{rescheduleCompleted:false}}});
 await assert.rejects(f.execute(preview.action,{planId:'plan',confirmation:preview.approval}),/completed/i);assert.equal(f.writes.length,0);
});
test('AI cannot rename or set reminders inside an archived parent',async()=>{
 for(const type of ['update_task','set_task_reminder']){
  const data=state();data.boards[0].archived=true;const f=await plannerFixture(data);
  await assert.rejects(f.execute({type,args:{taskId:'t',...(type==='update_task'?{newTitle:'Hidden'}:{minutesBefore:10})}}),/archived/i);assert.equal(f.writes.length,0);
 }
});

