import test from 'node:test';import assert from 'node:assert/strict';
import * as model from '../task-list-model.js';
const data=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'A',completed:false,custom:42},{id:'hidden',completed:true},{id:'c',title:'C',completed:true}]},{id:'d',tasks:[{id:'z',title:'Z'},{id:'q',title:'Q'}]}]},{id:'other',sections:[{id:'s',tasks:[{id:'e',title:'E',completed:false}]}]}]});
const task=(state,id)=>state.boards.flatMap(b=>b.sections.flatMap(s=>s.tasks)).find(t=>t.id===id);
const order=(state,board,section)=>state.boards.find(b=>b.id===board).sections.find(s=>s.id===section).tasks.map(t=>t.id);
const build=(state,action,ids,dest)=>{assert.equal(typeof model.buildTaskBatch,'function');return model.buildTaskBatch(state,action,ids,dest)};
const apply=(state,operation)=>model.applyTaskListCommand(state,operation.command,operation.expected);
const undo=(state,inverse,now=5000)=>model.applyTaskListCommand(state,{type:'undo_task_list',inverse,expiresAt:10000},{},{now});
test('explicit batch completion sets mixed states atomically and records only newly completed IDs',()=>{
 const input=data(),op=build(input,'complete',['a','c','e']);assert.deepEqual(op.command,{type:'task_batch',action:'complete',taskIds:['a','c','e']});assert.deepEqual(op.expected.tasks,[{taskId:'a',boardId:'b',sectionId:'s',value:false},{taskId:'c',boardId:'b',sectionId:'s',value:true},{taskId:'e',boardId:'other',sectionId:'s',value:false}]);
 const out=apply(input,op);assert.deepEqual(out.result.completedTaskIds,['a','e']);assert.deepEqual(out.result.taskIds,['a','c','e']);assert.equal(task(input,'a').completed,false);assert.ok(['a','c','e'].every(id=>task(out.next,id).completed));
 const incomplete=apply(out.next,build(out.next,'incomplete',['a','c','e']));assert.ok(['a','c','e'].every(id=>task(incomplete.next,id).completed===false));assert.deepEqual(incomplete.result.completedTaskIds,[]);
});
test('one conflicting affected flag, location or missing target rejects every batch member',()=>{
 for(const mutate of [s=>task(s,'c').completed=false,s=>s.boards[0].sections[0].tasks.pop(),s=>s.boards[0].sections[1].tasks.push(s.boards[0].sections[0].tasks.pop()),s=>task(s,'c').archived=true]){
  const input=data(),op=build(input,'complete',['a','c']);mutate(input);const before=structuredClone(input);assert.throws(()=>apply(input,op));assert.deepEqual(input,before);assert.equal(task(input,'a').completed,false);
 }
});
test('batch IDs and recurrence scope are bounded and validated before any mutation',()=>{
 for(const ids of [[],['a','a'],['a','missing'],[null],['']])assert.throws(()=>build(data(),'complete',ids));
 const input=data();task(input,'c').recurrence={enabled:true};for(const action of ['complete','incomplete'])assert.throws(()=>apply(input,build(input,action,['a','c'])),/Schedule|recurr/i);
 const fifty={boards:[{id:'b',sections:[{id:'s',tasks:Array.from({length:51},(_,i)=>({id:'t'+i}))}]}]};assert.equal(apply(fifty,build(fifty,'complete',Array.from({length:50},(_,i)=>'t'+i))).result.affectedCount,50);assert.throws(()=>build(fifty,'complete',Array.from({length:51},(_,i)=>'t'+i)),/50/);
 const duplicate=data();duplicate.boards[1].sections[0].tasks.push({id:'a'});assert.throws(()=>build(duplicate,'archive',['a','c']),/duplicate|ambiguous/i);assert.throws(()=>build(data(),'delete',['a','c']));
});
test('batch move preserves traversal order, hidden tasks and members already in destination',()=>{
 const input=data(),out=apply(input,build(input,'move',['e','a','z'],{boardId:'b',sectionId:'d'}));
 assert.deepEqual(order(out.next,'b','s'),['hidden','c']);assert.deepEqual(order(out.next,'b','d'),['q','e','a','z']);assert.deepEqual(order(out.next,'other','s'),[]);assert.equal(task(out.next,'a').custom,42);assert.deepEqual(order(input,'b','d'),['z','q']);
 task(out.next,'a').title='Remote title';const restored=undo(out.next,out.result.inverse);assert.deepEqual(order(restored.next,'b','s'),['a','hidden','c']);assert.deepEqual(order(restored.next,'b','d'),['z','q']);assert.deepEqual(order(restored.next,'other','s'),['e']);assert.equal(task(restored.next,'a').title,'Remote title');
});
test('move checks every source and destination order and Undo rejects a newer order',()=>{
 for(const section of ['s','d']){const input=data(),op=build(input,'move',['a','e'],{boardId:'b',sectionId:'d'});input.boards[0].sections.find(s=>s.id===section).tasks.reverse();assert.throws(()=>apply(input,op),/order/i);assert.equal(order(input,'other','s')[0],'e');}
 const out=apply(data(),build(data(),'move',['a','e'],{boardId:'b',sectionId:'d'}));out.next.boards[0].sections[1].tasks.reverse();assert.throws(()=>undo(out.next,out.result.inverse),/order/i);
});
test('field Undo restores mixed values, preserves unrelated edits and rejects changed fields or expiry',()=>{
 for(const action of ['complete','archive']){
  const input=data(),out=apply(input,build(input,action,['a','c']));task(out.next,'a').notes='New notes';const restored=undo(out.next,out.result.inverse);assert.equal(task(restored.next,'a').notes,'New notes');assert.equal(task(restored.next,'a')[action==='archive'?'archived':'completed'],false);if(action==='complete')assert.equal(task(restored.next,'c').completed,true);
  assert.throws(()=>undo(out.next,out.result.inverse,10000),/expired/i);task(out.next,'a')[action==='archive'?'archived':'completed']=false;assert.throws(()=>undo(out.next,out.result.inverse),/changed/i);
 }
});
test('restore commands are private to expiring Undo and cannot move unrelated tasks',()=>{
 const out=apply(data(),build(data(),'move',['a','e'],{boardId:'b',sectionId:'d'}));assert.throws(()=>model.applyTaskListCommand(out.next,out.result.inverse.command,out.result.inverse.expected),/Unsupported/i);
 const bad=structuredClone(out.result.inverse);bad.command.sections.find(s=>s.boardId==='b'&&s.sectionId==='s').order.push('q');bad.command.sections.find(s=>s.boardId==='b'&&s.sectionId==='d').order=[];assert.throws(()=>undo(out.next,bad));
});
test('group Move inserts around an unselected anchor and Undo preserves original hidden order',()=>{
 const input=data(),op=build(input,'move',['a','c'],{boardId:'b',sectionId:'s',anchorTaskId:'hidden',after:false}),out=apply(input,op);assert.deepEqual(order(out.next,'b','s'),['a','c','hidden']);assert.deepEqual(order(undo(out.next,out.result.inverse).next,'b','s'),['a','hidden','c']);assert.throws(()=>apply(input,build(input,'move',['a','c'],{boardId:'b',sectionId:'s',anchorTaskId:'c'})),/anchor|selected/i);
});
