import test from 'node:test';
import assert from 'node:assert/strict';
let m={};try{m=await import('../planning-slots.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const state=(tasks=[],events=[])=>({boards:[{id:'b',sections:[{id:'s',tasks}]}],scheduleEvents:events});
const clock={date:'2026-10-17',time:'06:00'};
const input={from:'2026-10-17',to:'2026-10-19',dayStart:'07:00',dayEnd:'22:00',timezone:'UTC'};

test('occupancy splits overnight work and weekly events across their actual days',()=>{
 assert.equal(typeof m.planningOccupancy,'function');const items=m.planningOccupancy(state([{id:'t',date:'2026-10-16',startTime:'23:00',endTime:'01:00'}],[{id:'e',day:5,start:'22:00',end:'02:00'}]),'2026-10-17','2026-10-17');assert.deepEqual(items.map(x=>[x.id,x.date,x.startMin,x.endMin]).sort(),[['e','2026-10-17',0,120],['t','2026-10-17',0,60]]);
});

test('conflicts include task/task and recurring/fixed overlap, never touching endpoints',()=>{
 assert.equal(typeof m.planningConflicts,'function');const s=state([{id:'a',date:'2026-10-17',startTime:'08:00',endTime:'09:00'},{id:'b',date:'2026-10-17',startTime:'08:30',endTime:'09:30'},{id:'touch',date:'2026-10-17',startTime:'09:30',endTime:'10:00'}]);assert.deepEqual(m.planningConflicts(s,'2026-10-17','2026-10-17').map(x=>[x.a.id,x.b.id]),[['a','b']]);
});

test('available slot respects occupied time, five-minute starts, duration and inclusive deadline day',()=>{
 assert.equal(typeof m.findPlanningSlot,'function');const busy=[{date:'2026-10-17',startMin:420,endMin:483}],slot=m.findPlanningSlot(30,{...input,to:'2026-10-17',dueDate:'2026-10-17'},busy,clock);assert.deepEqual(slot,{date:'2026-10-17',startTime:'08:05',endTime:'08:35'});
 assert.equal(m.findPlanningSlot(30,{...input,dueDate:'2026-10-16'},[],clock),null);
});

test('past minutes and impossible capacity do not receive forced placements',()=>{
 assert.equal(typeof m.findPlanningSlot,'function');assert.equal(m.findPlanningSlot(60,{...input,to:input.from,dayStart:'07:00',dayEnd:'08:00'},[],{date:input.from,time:'08:00'}),null);assert.throws(()=>m.findPlanningSlot(30,{...input,to:'2027-01-01'},[],clock),/31|range/i);assert.throws(()=>m.findPlanningSlot(30,{...input,dayStart:'22:00',dayEnd:'07:00'},[],clock),/availability|after/i);
});

test('preferences constrain the selected daily availability',()=>{
 assert.equal(typeof m.findPlanningSlot,'function');assert.deepEqual(m.findPlanningSlot(30,{...input,preference:'afternoon'},[],clock),{date:'2026-10-17',startTime:'12:00',endTime:'12:30'});
});

test('DST gaps and transition-spanning elapsed durations are not proposed',()=>{
 assert.equal(typeof m.findPlanningSlot,'function');const spring={from:'2027-03-14',to:'2027-03-14',dayStart:'02:00',dayEnd:'04:00',timezone:'America/New_York'};assert.deepEqual(m.findPlanningSlot(30,spring,[],{date:'2027-03-13',time:'12:00'}),{date:'2027-03-14',startTime:'03:00',endTime:'03:30'});const fall={...spring,from:'2026-11-01',to:'2026-11-01',dayStart:'01:30',dayEnd:'03:00'};assert.deepEqual(m.findPlanningSlot(60,fall,[],{date:'2026-10-31',time:'12:00'}),{date:'2026-11-01',startTime:'02:00',endTime:'03:00'});
});

test('moved recurring occurrences occupy their destination; skipped occurrences do not block it',()=>{
 assert.equal(typeof m.planningOccupancy,'function');const task={id:'r',date:'2026-10-12',startTime:'08:00',endTime:'09:00',recurrence:{enabled:true,frequency:'daily',interval:1,startDate:'2026-10-12',endType:'count',count:2,mode:'fixed',exceptions:{'2026-10-12':{override:{date:'2026-10-17'}},'2026-10-13':{status:'skipped',override:{date:'2026-10-17'}}}}};assert.equal(m.planningOccupancy(state([task]),'2026-10-17','2026-10-17').length,1);
});

test('overnight recurring work blocks the following day even without an effort estimate',()=>{
 const task={id:'r',date:'2026-10-16',startTime:'23:00',endTime:'02:00',recurrence:{enabled:true,frequency:'daily',interval:1,startDate:'2026-10-16',endType:'count',count:1,mode:'fixed'}};
 const busy=m.planningOccupancy(state([task]),'2026-10-17','2026-10-17');assert.deepEqual(busy.map(x=>[x.date,x.startMin,x.endMin]),[['2026-10-17',0,120]]);
 assert.deepEqual(m.findPlanningSlot(60,{...input,to:input.from,dayStart:'00:00',dayEnd:'04:00'},busy,{date:'2026-10-16',time:'12:00'}),{date:'2026-10-17',startTime:'02:00',endTime:'03:00'});
});
