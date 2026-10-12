import test from 'node:test';
import assert from 'node:assert/strict';
import {dayChangeCandidates,prepareDayChange,proposalStillMatches} from '../schedule-day-change.js';

const date='2026-10-13',time='10:00';
const tasks=[
  {id:'future',title:'Revision',date,startTime:'15:00',endTime:'16:00'},
  {id:'missed',title:'Reading',date,startTime:'08:00',endTime:'09:00'},
  {id:'ongoing',date,startTime:'09:30',endTime:'10:30'},
  {id:'starting-now',date,startTime:'10:00',endTime:'10:30'},
  {id:'locked',date,startTime:'12:00',endTime:'13:00',scheduleLocked:true},
  {id:'complete',date,startTime:'11:00',endTime:'12:00',completed:true},
  {id:'tomorrow',date:'2026-10-14',startTime:'11:00',endTime:'12:00'},
  {id:'backlog',estimatedMinutes:30}
];
const boards=[{title:'Study',sections:[{tasks}]}];
test('day changes target today’s unfinished flexible work, protecting underway, fixed and other days',()=>{
  assert.deepEqual(dayChangeCandidates(boards,date,time).map(t=>t.id),['missed','future']);
});
test('the day-change request keeps user-selected tasks and explicit unavailable time',()=>{
  const result=prepareDayChange({description:'Appointment moved',taskIds:['future'],blockedFrom:'15:00',blockedUntil:'16:00'},dayChangeCandidates(boards,date,time),date);
  assert.deepEqual(result.blockedWindows,[{date,startTime:'15:00',endTime:'16:00'}]);
  assert.deepEqual(result.taskIds,['future']);
  assert.throws(()=>prepareDayChange({description:'Change',taskIds:['locked']},dayChangeCandidates(boards,date,time),date),/no longer/);
  assert.throws(()=>prepareDayChange({description:'Change',taskIds:['future'],blockedFrom:'16:00',blockedUntil:'15:00'},dayChangeCandidates(boards,date,time),date),/end time/);
});
test('Apply rejects a changed, completed, or newly locked task',()=>{
  const proposal={from:{date,startTime:'15:00',endTime:'16:00'}};
  assert.equal(proposalStillMatches(proposal,tasks[0]),true);
  assert.equal(proposalStillMatches(proposal,{...tasks[0],scheduleLocked:true}),false);
  assert.equal(proposalStillMatches(proposal,{...tasks[0],completed:true}),false);
  assert.equal(proposalStillMatches(proposal,{...tasks[0],startTime:'16:00'}),false);
});
