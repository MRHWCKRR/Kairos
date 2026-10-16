import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as reminderUtils from '../task-reminders.js';
const {dueTaskReminders,dueBedtimeReminders}=reminderUtils;
import {mergePlanEdits,planState} from '../plan-merge.js';

async function fixture({failBeforeCommit=false,loseResponse=false,retryTransaction=false}={}){
  const now=Date.parse('2026-10-14T02:30:00Z');
  const plan={userID:'one',boards:[{sections:[{tasks:[{id:'t',title:'Science',date:'2026-10-14',startTime:'13:00',reminderMinutes:30}]}]}]};
  const user={settings:{profile:{timezone:'Australia/Brisbane'},notifications:{enabled:true}},notifications:[]};
  const records=new Map([['study_plans/plan',plan],['users/one',user]]);
  let source='';try{source=await readFile(new URL('../reminder-notifications.js',import.meta.url),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  let queue=Promise.resolve();
  const runTransaction=(_,fn)=>{
    const work=queue.catch(()=>{}).then(async()=>{
      let staged=new Map();const tx={get:async ref=>({exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))}),set:(ref,data)=>staged.set(ref,structuredClone(data))};
      if(retryTransaction){retryTransaction=false;await fn(tx);staged=new Map()}
      const result=await fn(tx);
      if(failBeforeCommit){failBeforeCommit=false;throw Error('Offline before commit')}
      for(const [ref,data] of staged)records.set(ref,{...records.get(ref),...data});
      if(loseResponse){loseResponse=false;throw Error('Response lost after commit')}
      return result;
    });queue=work;return work;
  };
  const reload=()=>{const context=vm.createContext({db:{},dueTaskReminders,dueBedtimeReminders,mergePlanEdits,planState,Date,structuredClone,doc:(_,collection,id)=>collection+'/'+id,runTransaction});vm.runInContext(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,''),context);return context};
  const context=reload();
  assert.equal(typeof context.deliverTaskReminder,'function','notification delivery uses a durable transaction');
  return {context,reload,now,plan,user,records,candidate:dueTaskReminders(plan.boards,now,'Australia/Brisbane')[0]};
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

test('different planners with the same task ID and start receive separate reminders',async()=>{
 const f=await fixture();f.records.set('study_plans/other',structuredClone(f.plan));
 assert.equal((await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,true);
 assert.equal((await f.context.deliverTaskReminder('other','one',f.candidate,{now:f.now})).delivered,true);
 const notifications=f.records.get('users/one').notifications;assert.equal(notifications.length,2);assert.notEqual(notifications[0].id,notifications[1].id);
});

test('rescheduled task candidates are revalidated before delivery',async()=>{
 const f=await fixture(),task=f.plan.boards[0].sections[0].tasks[0];task.startTime='14:00';
 assert.equal((await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,false);
 const later=f.now+3600000,candidate=dueTaskReminders(f.plan.boards,later,'Australia/Brisbane')[0];assert.equal((await f.context.deliverTaskReminder('plan','one',candidate,{now:later})).delivered,true);
});

test('bedtime delivery has durable receipts and rechecks the current event and settings',async()=>{
 for(const mode of ['normal','removed','moved','disabled','bedtimeDisabled']){
  const f=await fixture(),now=f.now+15*60000;f.plan.scheduleEvents=[{id:'sleep',title:'Bedtime',category:'sleep',day:3,start:'13:00'}];
  assert.equal(typeof f.context.deliverBedtimeReminder,'function');
  const candidate=dueBedtimeReminders(f.plan.scheduleEvents,now,'Australia/Brisbane')[0];assert.ok(candidate);
  if(mode==='removed')f.plan.scheduleEvents=[];
  if(mode==='moved')f.plan.scheduleEvents[0].start='14:00';
  if(mode==='disabled')f.user.settings.notifications.enabled=false;
  if(mode==='bedtimeDisabled')f.user.settings.notifications.bedtimeReminders=false;
  const first=await f.context.deliverBedtimeReminder('plan','one',candidate,{now});assert.equal(first.delivered,mode==='normal');
  assert.equal((await f.context.deliverBedtimeReminder('plan','one',candidate,{now})).delivered,false);
  assert.equal(f.records.get('users/one').notifications.length,mode==='normal'?1:0);
 }
});

test('legacy task receipts still suppress replay after the scoped receipt upgrade',async()=>{
 const f=await fixture();f.user.taskReminderReceipts=[{id:f.candidate.id,dueAt:f.candidate.dueAt,startsAt:f.candidate.startsAt}];
 assert.equal((await f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,false);
});

test('independent tabs and a reloaded client share durable delivery receipts',async()=>{
 const f=await fixture({retryTransaction:true}),other=f.reload();
 const results=await Promise.all([f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now}),other.deliverTaskReminder('plan','one',f.candidate,{now:f.now})]);
 assert.equal(results.filter(item=>item.delivered).length,1);assert.equal(f.records.get('users/one').notifications.length,1);
 assert.equal((await f.reload().deliverTaskReminder('plan','one',f.candidate,{now:f.now})).delivered,false);
});

test('a failed reminder transaction can retry and a lost commit response cannot duplicate delivery',async()=>{
 for(const option of ['failBeforeCommit','loseResponse']){
  const f=await fixture({[option]:true});await assert.rejects(f.context.deliverTaskReminder('plan','one',f.candidate,{now:f.now}),/Offline|Response lost/);
  const retried=await f.reload().deliverTaskReminder('plan','one',f.candidate,{now:f.now});assert.equal(retried.delivered,option==='failBeforeCommit');assert.equal(f.records.get('users/one').notifications.length,1);
 }
});

test('bedtime delivery also survives reload and lost transaction responses without duplicates',async()=>{
 const f=await fixture({loseResponse:true}),now=f.now+15*60000;f.plan.scheduleEvents=[{id:'sleep',title:'Bedtime',category:'sleep',day:3,start:'13:00'}];
 const candidate=dueBedtimeReminders(f.plan.scheduleEvents,now,'Australia/Brisbane')[0];
 await assert.rejects(f.context.deliverBedtimeReminder('plan','one',candidate,{now}),/Response lost/);assert.equal((await f.reload().deliverBedtimeReminder('plan','one',candidate,{now})).delivered,false);assert.equal(f.records.get('users/one').notifications.length,1);
});
