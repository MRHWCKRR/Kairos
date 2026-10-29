import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPlannerValue} from '../planner-value-contract.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';

test('planner writes reject undefined, unsupported values, sparse arrays and cycles with field paths',()=>{
 for(const value of [undefined,()=>{},Symbol('x'),1n,new Map(),new Date(NaN)])assert.throws(()=>assertPlannerValue({boards:[{notes:value}]}),/boards.*notes/);
 const cycle={};cycle.self=cycle;assert.throws(()=>assertPlannerValue(cycle),/cycle|cyclic/i);
 assert.throws(()=>assertPlannerValue({tasks:Array(1)}),/tasks.*0/);
});
test('valid legacy values, dates, shared objects and null remain unmodified',()=>{
 const shared={note:'unchanged'},date=new Date('2026-10-29T00:00Z');
 const value={boards:[shared,shared],legacy:date,optional:null,counters:[NaN,Infinity]};
 assertPlannerValue(value);assert.equal(value.legacy,date);assert.equal(value.boards[0],value.boards[1]);
});
test('ordinary planner save rejects unsupported fields before transaction writes',async()=>{
 const data={userID:'one',boards:[],scheduleEvents:[],dayInsights:{}};
 const f=await plannerFixture(data);
 await assert.rejects(f.context.savePlannerEdits('plan','one',data,{...data,boards:[{id:'bad',title:'Bad',notes:undefined,sections:[]}]}),/undefined|unsupported|invalid planner/i);
 assert.equal(f.writes.length,0);
});
test('reviewed mutations cannot write unsupported planner values or a partial receipt',async()=>{
 const f=await plannerFixture({userID:'one',boards:[],scheduleEvents:[],dayInsights:{}});
 await assert.rejects(f.context.persistAiPlanAction('plan','one',{type:'task_list',commandHash:'invalid-field'},'invalid-field',Date.now(),plan=>{plan.data.dayInsights.unsupported=undefined;return {type:'task_list'};}),/Invalid planner value/);
 assert.equal(f.writes.length,0);assert.equal(f.data().aiActionReceipts,undefined);
});
