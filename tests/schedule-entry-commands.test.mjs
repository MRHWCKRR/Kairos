import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../task-list-model.js';
import {normalizeRecurrence,generateTaskOccurrences} from '../recurrence-utils.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const now=Date.parse('2026-10-18T06:00:00Z'),date='2026-10-18';
const state=()=>({userID:'one',boards:[{id:'b',title:'Board',sections:[{id:'s',title:'Section',tasks:[{id:'a',title:'A',date,startTime:'08:00',endTime:'09:00',priority:'low'},{id:'btask',title:'B',date,startTime:'09:00',endTime:'10:00'}]}]}]});
const tasks=s=>s.boards[0].sections[0].tasks;
const create=(s,task,target={boardId:'b',sectionId:'s'},defaultSectionId='general')=>{assert.equal(typeof model.buildScheduleCreate,'function');return model.buildScheduleCreate(s,target,task,{defaultSectionId})};
const options={availability:{timezone:'UTC',weeklyAvailability:null},currentDate:date,dayChange:null};
const proposal=(id,start,end,fromStart=id==='a'?'08:00':'09:00')=>({taskId:id,from:{date,startTime:fromStart,endTime:id==='a'?'09:00':'10:00'},to:{date,startTime:start,endTime:end},metadata:{priority:'high'}});
const batch=(s,items=[proposal('a','09:00','10:00'),proposal('btask','08:00','09:00')],o=options)=>{assert.equal(typeof model.buildReviewedSchedule,'function');return model.buildReviewedSchedule(s,items,o,{now})};
test('rich recurring create is atomic, pure and only accepts explicit metadata',()=>{
 const s=state(),task={id:'new',title:'Read',date,startTime:'23:00',endTime:'00:00',notes:'Notes',priority:'high',reminderMinutes:15,scheduleLocked:true,schedulingPreference:'evening',color:'#abcdef',estimatedMinutes:60,dueDate:date,recurrence:normalizeRecurrence({enabled:true,frequency:'daily',mode:'fixed',startDate:date,endType:'count',count:2})},p=create(s,task),out=model.applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(tasks(s).length,2);assert.equal(tasks(out.next)[2].recurrence.count,2);assert.equal(tasks(out.next)[2].endTime,'00:00');assert.equal(tasks(out.next)[2].notes,'Notes');assert.throws(()=>create(s,{...task,userID:'evil'}));assert.throws(()=>create(s,{...task,recurrence:{...task.recurrence,exceptions:{[date]:{status:'completed'}}}}));
});
test('default section is created only for an unchanged empty active destination; invalid input leaves no orphan',()=>{
 const s=state();s.boards[0].sections=[];const p=create(s,{id:'new',title:'Read'},{boardId:'b',sectionId:null});assert.equal(s.boards[0].sections.length,0);const out=model.applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(out.next.boards[0].sections[0].id,'general');assert.equal(out.next.boards[0].sections[0].tasks[0].id,'new');assert.throws(()=>create(s,{id:'invalid',title:''},{boardId:'b',sectionId:null}));s.boards[0].sections.push({id:'remote',tasks:[]});assert.throws(()=>model.applyTaskListCommand(s,p.command,p.expected,{now}),/changed|section/i);assert.throws(()=>create(state(),{id:'new',title:'Read'},{boardId:'b',sectionId:'missing'}));
});
test('creation rejects archived destination, duplicate IDs and malformed repeat metadata',()=>{
 const s=state(),p=create(s,{id:'new',title:'Read'});s.boards[0].sections[0].archived=true;assert.throws(()=>model.applyTaskListCommand(s,p.command,p.expected,{now}));s.boards[0].sections[0].archived=false;tasks(s).push({id:'new'});assert.throws(()=>model.applyTaskListCommand(s,p.command,p.expected,{now}),/ID/);assert.throws(()=>create(state(),{id:'new',title:'Read',recurrence:{enabled:true,frequency:'daily',mode:'fixed',startDate:date}}));
});
test('midnight and full-day creation preserve exact ranges and reject overnight ranges',()=>{
 for(const [startTime,endTime,estimate] of [['23:00','00:00',60],['00:00','00:00',1440]]){const s=state(),p=create(s,{id:'new',title:'Read',date,startTime,endTime,estimatedMinutes:estimate});assert.equal(tasks(model.applyTaskListCommand(s,p.command,p.expected,{now}).next)[2].endTime,'00:00')}
 assert.throws(()=>create(state(),{id:'new',title:'Read',date,startTime:'23:30',endTime:'00:30'}));
});
test('reviewed batch permits swaps atomically but rejects a dependent move alone',()=>{
 const s=state(),p=batch(s),out=model.applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(tasks(s)[0].startTime,'08:00');assert.equal(tasks(out.next)[0].startTime,'09:00');assert.equal(tasks(out.next)[1].startTime,'08:00');assert.equal(tasks(out.next)[0].priority,'high');assert.throws(()=>batch(s,[proposal('a','09:00','10:00')]));
});
test('reviewed batch rechecks changed metadata, completion, lock, archive, work windows and underway status',()=>{
 for(const change of [t=>t.priority='medium',t=>t.completed=true,t=>t.scheduleLocked=true,t=>t.archived=true,t=>t.startTime='08:15']){const s=state(),p=batch(s);change(tasks(s)[0]);assert.throws(()=>model.applyTaskListCommand(s,p.command,p.expected,{now}));assert.equal(tasks(s)[1].startTime,'09:00')}
 const s=state(),p=batch(s);assert.throws(()=>model.applyTaskListCommand(s,p.command,p.expected,{now:Date.parse(date+'T08:30:00Z')}),/underway|changed|available/i);assert.throws(()=>batch(s,undefined,{...options,availability:{timezone:'UTC',weeklyAvailability:Object.fromEntries(Array.from({length:7},(_,d)=>[d,[]]))}}));
});
test('logical occurrence moves retain identity and unrelated focus',()=>{
 const s=state();tasks(s)[0]={id:'series',title:'Read',estimatedMinutes:60,date,recurrence:normalizeRecurrence({enabled:true,frequency:'daily',startDate:date,mode:'flexible',endType:'count',count:2})};const item={taskId:'series::'+date,from:{date,startTime:null,endTime:null},to:{date:'2026-10-19',startTime:'12:00',endTime:'13:00'},metadata:{color:'#abcdef'}},p=batch(s,[item]);tasks(s)[0].recurrence.exceptions[date]={focusLoggedSeconds:120};const out=model.applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(tasks(out.next)[0].recurrence.exceptions[date].override.date,'2026-10-19');assert.equal(tasks(out.next)[0].recurrence.exceptions[date].focusLoggedSeconds,120);assert.equal(generateTaskOccurrences(tasks(out.next)[0],date,date)[0].occurrenceId,'series::'+date);
});
test('transaction checks saved availability and receipt retries preserve creation and reviewed batch once',async()=>{
 const realNow=Date.now(),current=new Date(realNow).toISOString().slice(0,10),s=state();for(const t of tasks(s))t.date=current;
 const items=[proposal('a','09:00','10:00'),proposal('btask','08:00','09:00')].map(p=>({...p,from:{...p.from,date:current},to:{...p.to,date:current}})),o={...options,currentDate:current},p=model.buildReviewedSchedule?.(s,items,o,{now:Date.parse(current+'T06:00:00Z')});assert.ok(p,'reviewed builder exists');const f=await plannerFixture(s,{failAfterCommit:true,userData:{settings:{profile:{timezone:'UTC'},planning:{rescheduleCompleted:true}}}});
 // Future date keeps clock validation independent of the test runner's UTC hour.
 const c=create(s,{id:'new',title:'Read'});await assert.rejects(f.context.persistTaskListCommand('plan','one',c.command,c.expected,'create-op',realNow),/lost/);await f.context.persistTaskListCommand('plan','one',c.command,c.expected,'create-op',realNow);assert.equal(f.writes.length,1);assert.equal(tasks(f.data()).filter(t=>t.id==='new').length,1);
 f.setUserData({settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:Object.fromEntries(Array.from({length:7},(_,d)=>[d,[]]))}}});await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'batch-op',realNow),/hours|availability|changed/i);assert.equal(f.writes.length,1);
});


test('reviewed batch lost acknowledgement reuses a bounded receipt even after saved hours and task metadata change',async()=>{
 const realNow=Date.now(),current=new Date(realNow).toISOString().slice(0,10),tomorrow=new Date(realNow+86400000).toISOString().slice(0,10),s=state();
 for(const task of tasks(s)){task.date=null;task.startTime=null;task.endTime=null}
 const items=tasks(s).map((task,i)=>({taskId:task.id,from:{date:null,startTime:null,endTime:null},to:{date:tomorrow,startTime:i?'10:00':'09:00',endTime:i?'11:00':'10:00'},metadata:{priority:'high'}})),p=model.buildReviewedSchedule(s,items,{...options,currentDate:current}),f=await plannerFixture(s,{failAfterCommit:true,userData:{settings:{profile:{timezone:'UTC'}}}});
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'reviewed-lost',realNow),/lost/);
 const live=f.data();tasks(live)[0].notes='Unrelated remote edit';f.setData(live);f.setUserData({settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:Object.fromEntries(Array.from({length:7},(_,d)=>[d,[]]))}}});
 const result=await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'reviewed-lost',realNow);
 assert.equal(f.writes.length,1);assert.equal(result.affectedCount,2);assert.deepEqual(Array.from(result.taskIds),['a','btask']);assert.equal(tasks(f.data())[0].notes,'Unrelated remote edit');assert.equal(f.data().aiActionReceipts.length,1);assert.ok(JSON.stringify(result).length<1000);
});
