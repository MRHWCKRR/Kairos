import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeEventChange,applyNativeEventChange} from '../native-event-commands.js';

const now=Date.parse('2026-10-28T12:00Z');
const event={id:'private-event-id',title:'Private appointment',category:'other',date:'2026-10-28',start:'23:00',end:'23:05',allDay:false,transparent:false};
const seed=()=>({boards:[{id:'private-board',sections:[{id:'private-section',tasks:[{id:'private-task',title:'Private task',date:'2026-10-28',startTime:'09:00',endTime:'10:00'}]}]}],scheduleEvents:[]});

test('stale event reviews identify the failing boundary without logging planner contents',()=>{
 const oldWarn=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
 try{
  const data=seed(),preview=buildNativeEventChange(data,{eventId:event.id,event},'UTC',now);
  const changed=structuredClone(data);changed.boards[0].sections[0].tasks[0].startTime='10:00';
  assert.throws(()=>applyNativeEventChange(changed,preview.command,preview.expected,{now}),error=>{
   assert.equal(error.code,'native-event-review-stale');assert.deepEqual(error.reviewMismatch,{command:false,event:false,schedule:true});return true;
  });
  const tampered=structuredClone(preview.command);tampered.range.to='2026-10-29';
  assert.throws(()=>applyNativeEventChange(data,tampered,preview.expected,{now}),error=>{
   assert.deepEqual(error.reviewMismatch,{command:true,event:false,schedule:false});return true;
  });
  assert.equal(logs.length,2);
  assert.ok(logs.every(args=>typeof args[1]==='string'),'captured logs must preserve diagnostics without object expansion');
  assert.deepEqual(logs.map(args=>JSON.parse(args[1])),[
   {command:false,event:false,schedule:true,commandFields:[],scheduleFields:['tasks.startTime']},
   {command:true,event:false,schedule:false,commandFields:['range'],scheduleFields:[]}
  ]);
  assert.doesNotMatch(JSON.stringify(logs),/private|Private|23:00|2026-10-28/);
  assert.equal(applyNativeEventChange(data,preview.command,preview.expected,{now}).next.scheduleEvents.length,1);
  assert.equal(logs.length,2,'successful saves do not log rejection diagnostics');
 }finally{console.warn=oldWarn}
});
