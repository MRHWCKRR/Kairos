import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {dueTaskReminders} from '../task-reminders.js';
import {mergePlanEdits,planState} from '../plan-merge.js';

async function fixture(){
  const now=Date.parse('2026-10-14T02:30:00Z');
  const plan={userID:'one',boards:[{sections:[{tasks:[{id:'t',title:'Science',date:'2026-10-14',startTime:'13:00',reminderMinutes:30}]}]}]};
  const user={settings:{profile:{timezone:'Australia/Brisbane'},notifications:{enabled:true}},notifications:[]};
  const records=new Map([['study_plans/plan',plan],['users/one',user]]);
  let source='';try{source=await readFile(new URL('../reminder-notifications.js',import.meta.url),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  const context=vm.createContext({db:{},dueTaskReminders,mergePlanEdits,planState,Date,structuredClone,
    doc:(_,collection,id)=>collection+'/'+id,
    runTransaction:async(_,fn)=>fn({get:async ref=>({exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))}),set:(ref,data)=>records.set(ref,{...records.get(ref),...structuredClone(data)})})});
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,''),context);
  assert.equal(typeof context.deliverTaskReminder,'function','notification delivery uses a durable transaction');
  return {context,now,plan,user,records,candidate:dueTaskReminders(plan.boards,now,'Australia/Brisbane')[0]};
}
test('a reminder is delivered once across repeated checks and receipt persistence',async()=>{
  const f=await fixture();
  const first=await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now});
  const again=await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now});
  assert.equal(first.delivered,true);assert.equal(again.delivered,false);
  assert.equal(f.records.get('users/one').notifications.length,1);
});
test('disabled notifications and removed/deleted tasks are rechecked before delivery',async()=>{
  for(const mode of ['disabled','removed','deleted','boardArchived','sectionArchived']){
    const f=await fixture();
    if(mode==='disabled')f.user.settings.notifications.enabled=false;
    if(mode==='removed')f.plan.boards[0].sections[0].tasks[0].reminderMinutes=null;
    if(mode==='deleted')f.plan.boards[0].sections[0].tasks=[];
    if(mode==='boardArchived')f.plan.boards[0].archived=true;
    if(mode==='sectionArchived')f.plan.boards[0].sections[0].archived=true;
    assert.equal((await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,false);
    assert.equal(f.records.get('users/one').notifications.length,0);
  }
});

test('receipt cleanup never blocks fresh reminders or replays an active delivery',async()=>{
  const f=await fixture(),tasks=f.plan.boards[0].sections[0].tasks;
  f.user.taskReminderReceiptFloor=f.now;
  for(let i=1;i<202;i++)tasks.push({...tasks[0],id:'t'+i});
  for(const candidate of dueTaskReminders(f.plan.boards,f.now,'Australia/Brisbane')){
    assert.equal((await f.context.deliverTaskReminder('plan','one',candidate,{now:f.now})).delivered,true);
  }
  assert.equal(f.records.get('users/one').taskReminderReceipts.length,202);
  assert.equal((await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,false);
  const later=f.now+86400000;
  tasks.push({...tasks[0],id:'tomorrow',date:'2026-10-15'});
  const candidate=dueTaskReminders(f.plan.boards,later,'Australia/Brisbane')[0];
  assert.equal((await f.context.deliverTaskReminder('plan','one',candidate,{now:later})).delivered,true);
  assert.equal(f.records.get('users/one').taskReminderReceipts.length,1);
});

test('legacy sections-only plans can deliver existing reminders',async()=>{
  const f=await fixture();f.plan.sections=f.plan.boards[0].sections;delete f.plan.boards;
  assert.equal((await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,true);
});
test('notifications save merges an unrelated reminder rather than overwriting it',async()=>{
  const f=await fixture();
  await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now});
  await f.context.saveNotificationEdits('one',[],[{id:'other',title:'Completed',read:false}]);
  assert.equal(f.records.get('users/one').notifications.length,2);
});
