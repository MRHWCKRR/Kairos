import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/schedule-pointer-fixture.mjs';
import {generateTaskOccurrences} from '../recurrence-utils.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('moving keeps the grabbed offset and previews both times and duration on a five-minute boundary',async()=>{
 const f=fixture();f.pointer('pointerdown',f.block,{clientY:620});f.pointer('pointermove',f.document,{clientY:647});
 assert.match(f.document.querySelector('.ks-drag-ghost').textContent,/10:25.*11:25.*60 min/);
 f.pointer('pointerup',f.document,{clientY:647});await tick();assert.equal(f.task.startTime,'10:25');assert.equal(f.task.endTime,'11:25');assert.equal(f.saves(),1);
});
test('a grabbed block does not move on a click',async()=>{
 const f=fixture();f.pointer('pointerdown',f.block,{clientY:620});f.pointer('pointerup',f.document,{clientY:620});await tick();assert.equal(f.saves(),0);
});
test('day-end clamping keeps five-minute start snapping without shortening the task',async()=>{
 const f=fixture();f.task.endTime='10:31';f.pointer('pointerdown',f.block,{clientY:620});f.pointer('pointerup',f.document,{clientY:1439});await tick();assert.equal(f.task.startTime,'23:25');assert.equal(f.task.endTime,'23:56');
});
test('recurring drag previews its scope and preserves the next occurrence',async()=>{
 const f=fixture({occurrence:true});f.pointer('pointerdown',f.block,{clientY:620});f.pointer('pointermove',f.document,{clientY:647});assert.match(f.document.querySelector('.ks-drag-ghost').textContent,/This occurrence/);f.pointer('pointerup',f.document,{clientY:647});await tick();const occurrences=generateTaskOccurrences(f.boards[0].sections[0].tasks[0],'2026-10-16','2026-10-17');assert.equal(occurrences[0].startTime,'10:25');assert.equal(occurrences[1].startTime,'10:00');
});
test('an intervening completion cancels the gesture',async()=>{
 const f=fixture();f.pointer('pointerdown',f.block,{clientY:620});f.pointer('pointermove',f.document,{clientY:647});f.task.completed=true;f.pointer('pointerup',f.document,{clientY:647});await tick();assert.equal(f.saves(),0);assert.equal(f.task.startTime,'10:00');
});
test('a task starting at midnight can be resized to the end of the day',async()=>{
 const f=fixture();f.task.startTime='00:00';f.task.endTime='23:00';f.pointer('pointerdown',f.grip,{clientY:1380});f.pointer('pointerup',f.document,{clientY:1440});await tick();assert.equal(f.task.endTime,'00:00');assert.equal(f.saves(),1);
});
test('a backlog round trip retains the previous scheduled duration over its estimate',async()=>{
 const f=fixture();f.task.endTime='11:30';f.task.estimatedMinutes=30;
 const backlog=f.document.createElement('aside');backlog.id='schedule-backlog';f.root.appendChild(backlog);f.document.elementFromPoint=()=>backlog;
 f.pointer('pointerdown',f.block,{clientY:620});f.pointer('pointerup',f.document,{clientY:680});await tick();assert.equal(f.task.lastScheduledMinutes,90);
 const row=f.document.createElement('button');row.className='ks-backlog-row';row.dataset.taskId='t';backlog.appendChild(row);f.context.decorate();f.document.elementFromPoint=()=>f.grid;
 f.pointer('pointerdown',row,{clientY:0});f.pointer('pointerup',f.document,{clientY:700});await tick();assert.equal(f.task.startTime,'11:40');assert.equal(f.task.endTime,'13:10');assert.equal(f.task.estimatedMinutes,30);
});
