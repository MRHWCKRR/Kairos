import test from 'node:test';import assert from 'node:assert/strict';
import {previewSessions,previewCarryover,applyPlanningCommand} from '../planning-commands.js';
import {findPlanningSlot,planningPlacementOccupancy,planningIntervalsConflict} from '../planning-slots.js';
import {combinedPlanning} from '../combined-planning.js';
import {validateActionShape} from '../ai-action-schema.js';
const clock={date:'2026-10-18',time:'06:00'},now=Date.parse(clock.date+'T06:00:00Z'),options={from:clock.date,to:clock.date,dayStart:'07:00',dayEnd:'10:00',timezone:'UTC'};
const state=(tasks=[],scheduleEvents=[])=>({boards:[{id:'board',sections:[{id:'section',tasks:[{id:'p',title:'Essay',dueDate:clock.date},...tasks]}]}],scheduleEvents});
const preview=(s,extra={})=>previewSessions(s,{...options,taskId:'p',totalMinutes:90,sessionMinutes:30,...extra},clock);
test('session gaps preserve effort and exact reviewed writes without creating break tasks',()=>{
 const s=state(),p=preview(s,{gapMinutes:10});assert.deepEqual(p.rows.map(r=>r.startTime),['07:00','07:40','08:20']);assert.equal(p.command.options.gapMinutes,10);assert.equal(p.rows.reduce((n,r)=>n+r.minutes,0),90);const applied=applyPlanningCommand(s,p.command,p.expected,{now});assert.equal(applied.next.boards[0].sections[0].tasks.length,4);assert.equal(s.boards[0].sections[0].tasks.length,1);
});
test('default and explicit zero keep back-to-back sessions and old commands valid',()=>{
 for(const extra of [{},{gapMinutes:0}]){const s=state(),p=preview(s,extra);assert.deepEqual(p.rows.map(r=>r.startTime),['07:00','07:30','08:00']);assert.doesNotThrow(()=>applyPlanningCommand(s,p.command,p.expected,{now}))}
});
test('spacing applies before and after existing fixed, locked and recurring commitments',()=>{
 for(const s of [state([],[{id:'class',day:0,start:'08:00',end:'09:00'}]),state([{id:'locked',date:clock.date,startTime:'08:00',endTime:'09:00',scheduleLocked:true}]),state([{id:'series',date:clock.date,startTime:'08:00',endTime:'09:00',recurrence:{enabled:true,frequency:'daily',interval:1,startDate:clock.date,mode:'fixed'}}])]){const input={...options,gapMinutes:15};assert.equal(findPlanningSlot(60,input,planningPlacementOccupancy(s,input),clock),null);const longer={...input,dayEnd:'11:00'};assert.equal(findPlanningSlot(60,longer,planningPlacementOccupancy(s,longer),clock).startTime,'09:15')}
});
test('neighbouring days constrain gaps at either range boundary without extending the 31-day limit',()=>{
 const s=state([{id:'previous',date:'2026-10-17',startTime:'23:30',endTime:'23:55'}]),input={...options,dayStart:'00:00',dayEnd:'01:00',gapMinutes:10};assert.equal(findPlanningSlot(15,input,planningPlacementOccupancy(s,input),{date:'2026-10-17',time:'06:00'}).startTime,'00:05');
 const next=state([{id:'next',date:'2026-10-19',startTime:'00:00',endTime:'00:30'}]),late={...options,dayStart:'23:45',dayEnd:'23:59',gapMinutes:15};assert.equal(findPlanningSlot(10,late,planningPlacementOccupancy(next,late),clock),null);assert.doesNotThrow(()=>planningPlacementOccupancy(s,{...input,to:'2026-11-17'}));
});
test('gap length uses elapsed time across the spring DST jump',()=>{
 const date='2027-03-14',s=state([{id:'previous',date,startTime:'01:30',endTime:'01:55'}]),input={from:date,to:date,dayStart:'03:00',dayEnd:'04:00',timezone:'America/New_York',gapMinutes:15};assert.equal(findPlanningSlot(30,input,planningPlacementOccupancy(s,input),{date,time:'00:00'}).startTime,'03:10');
});
test('shared boundary calculations retain timezone-specific elapsed spacing',()=>{
 const cache=new Map(),a={date:'2027-03-14',startMin:180,endMin:210},b={date:'2027-03-14',startMin:90,endMin:115};assert.equal(planningIntervalsConflict(a,b,{gapMinutes:15,timezone:'UTC'},cache),false);assert.equal(planningIntervalsConflict(a,b,{gapMinutes:15,timezone:'America/New_York'},cache),true);
});
test('Apply rejects tampered adjacency and newly introduced spacing conflicts',()=>{
 const s=state(),p=preview(s,{gapMinutes:10});const forged=structuredClone(p.command);Object.assign(forged.rows[1],{startTime:'07:30',endTime:'08:00'});assert.throws(()=>applyPlanningCommand(s,forged,p.expected,{now}),/spacing|gap|conflict/i);assert.equal(s.boards[0].sections[0].tasks.length,1);
});
test('split windows and assignment ordering share spacing without adding edge padding',()=>{
 const weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,day===0?[{start:'07:00',end:'07:30'},{start:'07:40',end:'08:10'}]:[]])),s=state();assert.equal(preview(s,{totalMinutes:60,gapMinutes:10,weeklyAvailability,ordered:true}).rows[1].startTime,'07:40');assert.throws(()=>preview(s,{totalMinutes:60,gapMinutes:15,weeklyAvailability}),/fit|room/i);
});
test('combined planning and carry-over cannot silently drop requested spacing',()=>{
 const s=state([{id:'a',title:'Research',assignmentId:'p',estimatedMinutes:60},{id:'q',title:'Exam',dueDate:clock.date},{id:'b',title:'Revise',assignmentId:'q',estimatedMinutes:60}]),input={...options,dayEnd:'09:00',gapMinutes:15};const r=combinedPlanning(s,{...input,assignmentIds:['p','q']},clock);assert.equal(r.proposal.rows.length,1);assert.equal(r.assignments.filter(g=>g.status==='not-placed').length,1);assert.throws(()=>previewCarryover(s,{...input,taskIds:['a','b']},clock),/gap|spacing|safe time/i);
});
test('UI engine and AI schema reject unsupported or nonnumeric gaps',()=>{
 for(const gapMinutes of [-1,1,20,'10',null,NaN]){assert.throws(()=>preview(state(),{gapMinutes}));assert.throws(()=>validateActionShape({type:'plan_assignments',args:{assignmentIds:['p'],from:clock.date,to:clock.date,gapMinutes}}))}for(const gapMinutes of [0,5,10,15])assert.doesNotThrow(()=>validateActionShape({type:'plan_assignments',args:{assignmentIds:['p'],from:clock.date,to:clock.date,gapMinutes}}));
});
