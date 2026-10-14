import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Science',checklist:[{id:'a',title:'Read',completed:false},{id:'b',title:'Write',completed:false}]}]}]}]});
const list=data=>data.boards[0].sections[0].tasks[0].checklist;
const expected=data=>({boardId:'b',sectionId:'s',fields:{checklist:structuredClone(list(data))}});
const apply=(data,changes,base=data)=>applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t'},changes:{checklist:changes}},expected(base));
test('checklist edits merge separate item changes and preserve parent state',()=>{
  const base=state(),remote=state(),local=structuredClone(list(base));list(remote)[1].completed=true;local[0].completed=true;
  const result=apply(remote,local,base).next;
  assert.deepEqual(list(result).map(item=>item.completed),[true,true]);
  assert.equal(result.boards[0].sections[0].tasks[0].completed,undefined);
});
test('same-step edits and competing order changes fail without losing remote progress',()=>{
  const base=state(),remote=state(),local=structuredClone(list(base));list(remote)[0].title='Other';local[0].title='Mine';
  assert.throws(()=>apply(remote,local,base),/changed|conflict/i);
  const three=state();list(three).push({id:'c',title:'Third',completed:false});
  const moved=structuredClone(three);list(moved).reverse();const reorder=[list(three)[1],list(three)[0],list(three)[2]];
  assert.throws(()=>apply(moved,reorder,three),/order|conflict/i);
});
test('checklist validation rejects duplicates, untrusted fields and product limit violations',()=>{
  for(const entries of [[{id:'a',title:'',completed:false}],[{id:'a',title:'X'.repeat(181),completed:false}],[{id:'a',title:'OK',completed:'yes'}],[{id:'a',title:'OK',completed:false,path:'users/other'}],[{id:'a',title:'OK',completed:false},{id:'a',title:'Again',completed:false}],Array.from({length:101},(_,i)=>({id:'i'+i,title:'OK',completed:false}))])assert.throws(()=>apply(state(),entries));
});
test('granular add/edit/remove/reorder commands use stable IDs',()=>{
  let data=state();
  const run=command=>{data=applyTaskListCommand(data,{target:{taskId:'t'},...command},expected(data)).next};
  run({type:'add_checklist_item',item:{id:'c',title:'Review',completed:false}});
  run({type:'edit_checklist_item',itemId:'c',changes:{completed:true}});
  run({type:'reorder_checklist',itemIds:['c','a','b']});
  assert.equal(list(data)[0].id,'c');assert.equal(list(data)[0].completed,true);
  run({type:'remove_checklist_item',itemId:'b'});assert.equal(list(data).length,2);
});
test('missing checklist is empty and newly added entries keep exact ID on retry',()=>{
  const data=state();delete data.boards[0].sections[0].tasks[0].checklist;
  const result=applyTaskListCommand(data,{type:'add_checklist_item',target:{taskId:'t'},item:{id:'new',title:'Read',completed:false}},{boardId:'b',sectionId:'s',fields:{checklist:[]}});
  assert.equal(list(result.next)[0].id,'new');
});
test('a new step reordered before saving keeps its chosen insertion position',()=>{
  const base=state(),local=[{id:'c',title:'New first',completed:false},...structuredClone(list(base))];
  assert.deepEqual(list(apply(base,local,base).next).map(item=>item.id),['c','a','b']);
  const remote=state();list(remote).reverse();
  assert.deepEqual(list(apply(remote,local,base).next).map(item=>item.id),['b','c','a']);
});
