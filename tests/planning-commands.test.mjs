import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
let m={};try{m=await import('../planning-commands.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const now=Date.parse('2026-10-17T06:00:00Z'),clock={date:'2026-10-17',time:'06:00'};
const config={from:'2026-10-17',to:'2026-10-19',dayStart:'07:00',dayEnd:'22:00',timezone:'UTC'};
const data=(extra={})=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'Essay',dueDate:'2026-10-19',notes:'Keep',checklist:[{id:'step',title:'Read',completed:false}],...extra}]}]}],scheduleEvents:[]});
const tasks=s=>s.boards[0].sections[0].tasks;
function sessions(s,input={}){assert.equal(typeof m.previewSessions,'function');let id=0;return m.previewSessions(s,{...config,taskId:'a',totalMinutes:90,sessionMinutes:30,idFactory:()=> 'session-'+(++id),...input},clock)}

test('assignment preview creates bounded reviewed sessions while retaining the assignment and checklist',()=>{
 const s=data(),p=sessions(s,{labels:['Research','Outline','Draft']});assert.equal(tasks(s).length,1);assert.deepEqual(p.rows.map(x=>x.title),['Research','Outline','Draft']);const out=applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(tasks(out.next).length,4);assert.deepEqual(tasks(out.next)[0],tasks(s)[0]);assert.equal(tasks(out.next)[1].assignmentId,'a');assert.equal(tasks(out.next)[1].dueDate,'2026-10-19');assert.equal(tasks(out.next)[1].completed,false);
});

test('partial last session preserves the full effort estimate and unrelated current notes',()=>{
 const s=data(),p=sessions(s,{totalMinutes:65,labels:[]});assert.deepEqual(p.rows.map(x=>x.minutes),[30,30,5]);tasks(s)[0].notes='Edited elsewhere';tasks(s)[0].checklist[0].completed=true;const out=applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(tasks(out.next)[0].notes,'Edited elsewhere');assert.equal(tasks(out.next)[0].checklist[0].completed,true);
});

test('existing sessions, scheduled assignments, locks, invalid labels and oversized effort are rejected',()=>{
 assert.throws(()=>sessions(data({scheduleLocked:true})),/lock/i);assert.throws(()=>sessions(data({date:config.from,startTime:'08:00',endTime:'09:00'})),/scheduled/i);assert.throws(()=>sessions(data(),{totalMinutes:2401}),/2400|effort/i);assert.throws(()=>sessions(data(),{labels:['Only one']}),/title|label/i);const s=data();tasks(s).push({id:'old',assignmentId:'a'});assert.throws(()=>sessions(s),/already|session/i);
});

test('insufficient room before the deadline returns no partial assignment plan',()=>{
 assert.throws(()=>sessions(data({dueDate:'2026-10-17'}),{to:'2026-10-17',dayStart:'07:00',dayEnd:'08:00'}),/room|fit|capacity/i);
});

test('current schedule changes, newly locked tasks, occupied destinations and elapsed preview times fail atomically',()=>{
 const s=data(),p=sessions(s);tasks(s).push({id:'other',date:p.rows[0].date,startTime:p.rows[0].startTime,endTime:p.rows[0].endTime});assert.throws(()=>applyTaskListCommand(s,p.command,p.expected,{now}),/changed|preview/i);assert.equal(tasks(s).length,2);
 const clean=data(),preview=sessions(clean);tasks(clean)[0].scheduleLocked=true;assert.throws(()=>applyTaskListCommand(clean,preview.command,preview.expected,{now}),/changed|lock/i);const q=sessions(data());assert.throws(()=>applyTaskListCommand(data(),q.command,q.expected,{now:Date.parse('2026-10-18T23:00:00Z')}),/past|time|preview/i);
});

test('duplicate session IDs and malformed destination payloads never modify the original plan',()=>{
 const s=data(),p=sessions(s);p.command.rows[1].taskId=p.command.rows[0].taskId;assert.throws(()=>applyTaskListCommand(s,p.command,p.expected,{now}),/ID|duplicate/i);assert.equal(tasks(s).length,1);const q=sessions(s);q.command.rows[0].endTime='04:00';assert.throws(()=>applyTaskListCommand(s,q.command,q.expected,{now}),/duration|schedule|time/i);
});

test('carry-over preserves duration, avoids fixed commitments, and keeps the source deadline',()=>{
 assert.equal(typeof m.previewCarryover,'function');const s=data({date:'2026-10-13',startTime:'08:00',endTime:'08:45'});s.scheduleEvents=[{id:'lesson',day:6,start:'07:00',end:'08:00'}];const p=m.previewCarryover(s,{...config,taskIds:['a']},clock);assert.equal(p.rows[0].startTime,'08:00');assert.equal(p.rows[0].endTime,'08:45');const out=applyTaskListCommand(s,p.command,p.expected,{now});assert.equal(tasks(out.next)[0].dueDate,'2026-10-19');assert.equal(tasks(s)[0].date,'2026-10-13');
});
