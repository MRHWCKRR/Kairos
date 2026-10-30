import test from 'node:test';
import assert from 'node:assert/strict';
let createStore;
try { ({createPackagedFixtureStore:createStore}=await import('../scripts/packaged-fixture-store.mjs')); }
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const owner='packaged-fixture';
const request=()=>({command:{type:'create_task',target:{boardId:'b',sectionId:'s'},task:{id:'created',title:'Created through capture'}},expected:{boardId:'b',sectionId:'s'},identity:{ownerId:owner,planId:'fixture',operationId:'capture-test',createdAt:1}});
function fixture(){assert.equal(typeof createStore,'function','isolated packaged persistence boundary must exist');return createStore({date:'2026-10-30'});}

test('packaged fixture persists commands and returns detached reads',()=>{
 const store=fixture(),r=request();store.commit(owner,r);
 const read=store.read(owner);assert.equal(read.planner.boards[0].sections[0].tasks.at(-1).title,r.command.task.title);
 read.planner.boards.length=0;assert.equal(store.read(owner).planner.boards.length,1);
 assert.equal(store.read('other-fixture').planner.boards[0].sections[0].tasks.length,1);
});
test('packaged fixture replays the same operation once and rejects a changed retry',()=>{
 const store=fixture(),r=request(),first=store.commit(owner,r);assert.deepEqual(store.commit(owner,r),first);
 assert.equal(store.read(owner).writes,1);r.command.task.title='Changed retry';assert.throws(()=>store.commit(owner,r),/operation/i);
 assert.equal(store.read(owner).writes,1);
});
test('packaged fixture rejects owner and planner mismatches before writing',()=>{
 const store=fixture(),r=request();assert.throws(()=>store.commit('other-fixture',r),/identity/i);
 r.identity.planId='other-plan';assert.throws(()=>store.commit(owner,r),/identity/i);
 assert.throws(()=>store.read('unknown'),/owner/i);assert.equal(store.read(owner).writes,0);
});
test('packaged fixture settings are detached and retained for the same owner',()=>{
 const store=fixture(),settings=store.read(owner).settings;settings.planning.rescheduleCompleted=true;store.saveSettings(owner,settings);
 settings.planning.rescheduleCompleted=false;assert.equal(store.read(owner).settings.planning.rescheduleCompleted,true);
 assert.equal(store.read('other-fixture').settings.planning.rescheduleCompleted,false);
});
