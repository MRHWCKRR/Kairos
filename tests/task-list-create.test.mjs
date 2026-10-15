import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const data=()=>({userID:'one',boards:[{id:'b',title:'School',extra:42,sections:[{id:'s',title:'Work',tasks:[]},{id:'other',tasks:[]}]}]});
const command={type:'create_task',target:{boardId:'b',sectionId:'s'},task:{id:'new',title:'  Science  '}};
const expected={boardId:'b',sectionId:'s'};
test('quick creation appends a bounded ordinary task without changing unrelated planner state',()=>{
  const input=data();input.boards[0].sections[0].tasks.push({id:'remote',title:'Remote',unknown:true});
  const next=applyTaskListCommand(input,command,expected).next;
  assert.deepEqual(next.boards[0].sections[0].tasks.map(t=>t.id),['remote','new']);
  assert.deepEqual(next.boards[0].sections[0].tasks[1],{id:'new',title:'Science',completed:false,date:null,archived:false});
  assert.equal(next.boards[0].extra,42);assert.equal(input.boards[0].sections[0].tasks.length,1);
});
test('creation rejects absent, archived, ambiguous or changed destinations',()=>{
  for(const mutate of [d=>d.boards[0].sections.splice(0,1),d=>d.boards[0].archived=true,d=>d.boards[0].sections[0].archived=true,d=>d.boards[0].sections.push({...d.boards[0].sections[0]})]){
    const input=data();mutate(input);assert.throws(()=>applyTaskListCommand(input,command,expected));
  }
  assert.throws(()=>applyTaskListCommand(data(),command,{...expected,sectionId:'other'}));
});
test('creation validates global task identity, titles and permitted fields',()=>{
  const input=data();input.boards[0].sections[1].tasks.push({id:'new',title:'Existing',archived:true});assert.throws(()=>applyTaskListCommand(input,command,expected),/ID/i);
  for(const task of [{id:'new',title:' '},{id:'new',title:'x'.repeat(181)},{id:'',title:'Okay'},{id:'new',title:'Okay',completed:true}])assert.throws(()=>applyTaskListCommand(data(),{...command,task},expected));
});
test('lost create responses replay a receipt without duplicating the task',async()=>{
  const f=await plannerFixture(data(),{failAfterCommit:true});f.context.applyTaskListCommand=applyTaskListCommand;
  const timestamp=Date.now();await assert.rejects(f.context.persistTaskListCommand('plan','one',command,expected,'create',timestamp),/response lost/);
  const result=await f.context.persistTaskListCommand('plan','one',command,expected,'create',timestamp);
  assert.equal(result.task.id,'new');assert.equal(f.data().boards[0].sections[0].tasks.length,1);assert.equal(f.writes.length,1);
});
