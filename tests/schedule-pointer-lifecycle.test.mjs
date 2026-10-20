import test from 'node:test';
import assert from 'node:assert/strict';
import * as recurrence from '../recurrence-utils.js';
import {fixture} from './helpers/schedule-pointer-fixture.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('resize uses the final release position even when the last move was delayed',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:665});f.pointer('pointerup',f.document,{clientY:675});await tick();assert.equal(f.task.endTime,'11:15');assert.equal(f.saves(),1);
});
test('resizing follows the grid when the calendar is scrolled during the gesture',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.scroll(-30);f.pointer('pointermove',f.document,{clientY:665});f.pointer('pointerup',f.document,{clientY:665});await tick();assert.equal(f.task.endTime,'11:35');
});
test('horizontal grip movement does not create a redundant schedule save',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientX:50});f.pointer('pointerup',f.document,{clientX:50});await tick();assert.equal(f.saves(),0);assert.equal(f.task.endTime,'11:00');
});
test('an intervening schedule edit cancels the old resize rather than overwriting the new time',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:675});f.task.endTime='12:00';f.pointer('pointerup',f.document,{clientY:675});await tick();assert.equal(f.task.endTime,'12:00');assert.equal(f.saves(),0);
});
test('scope changes, focus loss and lost capture cancel schedule gestures without writing',async()=>{
 for(const change of [f=>f.setOwner('other'),f=>f.setPlan('new'),f=>f.root.classList.remove('active'),f=>f.window.dispatchEvent(new f.window.Event('blur')),f=>f.pointer('lostpointercapture',f.block)]){
  const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:680});change(f);f.pointer('pointerup',f.document,{clientY:680});await tick();assert.equal(f.saves(),0);assert.equal(f.task.endTime,'11:00');assert.equal(f.dragging(),false);
 }
});

test('recurring resize uses five-minute steps and updates only the selected occurrence',async()=>{
 const f=fixture({occurrence:true});f.task.endTime='10:30';f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:667});f.pointer('pointerup',f.document,{clientY:673});await tick();
 const series=f.boards[0].sections[0].tasks[0],today=recurrence.generateTaskOccurrences(series,'2026-10-16','2026-10-17',{today:'2026-10-16'});assert.equal(today[0].endTime,'10:45');assert.equal(today[0].durationMinutes,45);assert.equal(today[1].endTime,'10:30');assert.equal(f.saves(),1);
});
