import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyTaskListCommand} from '../task-list-model.js';
let m={};try{m=await import('../planning-commands.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const now=Date.parse('2026-10-17T06:00:00Z');
const data=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'Essay',dueDate:'2026-10-19'}]}]}],scheduleEvents:[]});
function preview(s){assert.equal(typeof m.previewSessions,'function');let id=0;return m.previewSessions(s,{taskId:'a',totalMinutes:60,sessionMinutes:30,from:'2026-10-17',to:'2026-10-19',dayStart:'07:00',dayEnd:'22:00',timezone:'UTC',idFactory:()=> 'session-'+(++id)},{date:'2026-10-17',time:'06:00'})}
test('a lost session-plan response retries the exact operation without duplicating work sessions',async()=>{
 const input=data(),p=preview(input),f=await plannerFixture(input,{failAfterCommit:true});f.context.applyTaskListCommand=(s,c,e)=>applyTaskListCommand(s,c,e,{now});const createdAt=Date.now();await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'sessions',createdAt),/response lost/);const result=await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'sessions',createdAt);assert.equal(result.taskIds.length,2);assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks.length,3);
});
test('stale schedule and wrong-owner session plans produce no transactional write',async()=>{
 const input=data(),p=preview(input);input.boards[0].sections[0].tasks[0].dueDate='2026-10-16';const f=await plannerFixture(input);f.context.applyTaskListCommand=(s,c,e)=>applyTaskListCommand(s,c,e,{now});await assert.rejects(f.context.persistTaskListCommand('plan','other',p.command,p.expected,'owner',Date.now()),/another account/);await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'stale',Date.now()),/changed|preview/);assert.equal(f.writes.length,0);
});
