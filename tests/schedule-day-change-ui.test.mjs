import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountDayChange} from '../schedule-day-change-ui.js';

function setup(onSubmit=async()=>({ok:true}),tasks=[{id:'a',title:'Revision',date:'2026-10-13',startTime:'15:00',endTime:'16:00'}]) {
  const {document,window}=parseHTML('<div id="schedule-toolbar"><button data-plan>Plan</button></div>');
  const boards=[{sections:[{tasks}]}];let reviewed=0;
  const controller=mountDayChange({document,window,getBoards:()=>boards,onSubmit,now:()=>new Date('2026-10-13T10:00:00'),onPreviewReady:()=>reviewed++});
  controller.open();return {document,window,controller,tasks,reviewed:()=>reviewed};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('the compact day-change form collects an explicit blocked window and previews without changing tasks',async()=>{
  let request;const f=setup(async value=>{request=value;return {ok:true};});
  assert.equal(f.document.querySelectorAll('[data-day-change]').length,1);
  f.document.querySelector('[name="description"]').value='My appointment moved';
  f.document.querySelector('[name="blockedFrom"]').value='15:00';f.document.querySelector('[name="blockedUntil"]').value='16:00';
  f.document.querySelector('form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.deepEqual(request.taskIds,['a']);assert.equal(request.blockedWindows[0].startTime,'15:00');
  assert.equal(f.tasks[0].startTime,'15:00');assert.equal(f.reviewed(),1);assert.equal(f.document.querySelector('dialog'),null);f.controller.destroy();
});
test('invalid inputs do not spend an AI request and pending preview cannot be submitted twice',async()=>{
  let calls=0,finish;const pending=new Promise(resolve=>finish=resolve),f=setup(()=>{calls++;return pending;});
  const form=f.document.querySelector('form');form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));await settle();
  assert.equal(calls,0);assert.match(f.document.querySelector('[data-status]').textContent,/Describe/);
  f.document.querySelector('[name="description"]').value='Change';form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));f.document.querySelector('[data-cancel]').click();
  assert.equal(calls,1);assert.ok(f.document.querySelector('dialog'));assert.equal(f.document.querySelector('[type="submit"]').disabled,true);
  finish({ok:false,message:'No safe changes.'});await settle();assert.match(f.document.querySelector('[data-status]').textContent,/No safe changes/);
  assert.equal(f.document.querySelector('[type="submit"]').disabled,false);f.controller.destroy();
});
test('empty days explain the alternative and disable preview instead of making an AI call',()=>{
  const f=setup(async()=>{throw Error('Must not call');},[]);
  assert.equal(f.document.querySelector('[type="submit"]').disabled,true);assert.match(f.document.querySelector('[data-status]').textContent,/Use Plan/);
  f.controller.destroy();
});

test('day-change candidates and submitted date use profile time and reject settings changes while open',async()=>{
 const {document,window}=parseHTML('<div id="schedule-toolbar"><button data-plan>Plan</button></div>');let calls=0;const availability={timezone:'Pacific/Honolulu',weeklyAvailability:null},tasks=[{id:'profile-day',title:'Essay',date:'2026-10-12',startTime:'20:00',endTime:'20:30'}];let planning={date:'2026-10-12',time:'18:00',scope:{owner:'one',plan:'plan'},availability,description:'Times use Pacific/Honolulu.'};const controller=mountDayChange({document,window,getBoards:()=>[{sections:[{tasks}]}],now:()=>new Date('2026-10-13T10:00:00'),getPlanningContext:()=>planning,onSubmit:async()=>{calls++;return {ok:true}}});controller.open();assert.equal(document.querySelector('[name="taskId"]').value,'profile-day');assert.match(document.body.textContent,/Pacific\/Honolulu/);document.querySelector('[name="description"]').value='Appointment moved';planning={...planning,availability:{...availability,timezone:'UTC'}};document.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();assert.equal(calls,0);assert.match(document.querySelector('[data-status]').textContent,/changed|Reopen/);controller.destroy();
});
