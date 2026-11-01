import test from 'node:test';
import assert from 'node:assert/strict';
let factory;
try{({createWorkspaceTabGuard:factory}=await import('../app-single-tab.js'));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const tick=()=>new Promise(setImmediate);
function lockManager(){
 const held=new Set();
 return {calls:[],async request(name,options,callback){this.calls.push({name,options});if(held.has(name))return callback(null);held.add(name);try{return await callback({name})}finally{held.delete(name)}}};
}
function fixture(locks=lockManager(),extra={}){
 assert.equal(typeof factory,'function','workspace guard must exist');let starts=0,blocked=0,errors=0;
 const guard=factory({locks,graceMs:0,onStart:async()=>{starts++},onBlocked:()=>blocked++,onError:()=>errors++,...extra});
 return {guard,locks,get starts(){return starts},get blocked(){return blocked},get errors(){return errors}};
}
test('only one document starts and retry works after the owner is destroyed',async()=>{
 const locks=lockManager(),one=fixture(locks),two=fixture(locks);assert.equal(await one.guard.enter(),true);assert.equal(await two.guard.enter(),false);
 assert.equal(one.starts,1);assert.equal(two.starts,0);assert.equal(two.blocked,1);
 one.guard.dispose();await tick();assert.equal(await two.guard.enter(),true);assert.equal(two.starts,1);two.guard.dispose();
});
test('simultaneous starts and duplicate enter calls never initialize two workspaces',async()=>{
 const locks=lockManager(),one=fixture(locks),two=fixture(locks);const results=await Promise.all([one.guard.enter(),one.guard.enter(),two.guard.enter()]);
 assert.deepEqual(results,[true,true,false]);assert.equal(one.starts+two.starts,1);assert.equal(locks.calls.length,2);one.guard.dispose();two.guard.dispose();
});
test('an active owner holds its lock until disposal and never requests steal',async()=>{
 const one=fixture(),two=fixture(one.locks);await one.guard.enter();await tick();assert.equal(await one.guard.enter(),true);assert.equal(await two.guard.enter(),false);
 assert.equal(one.guard.state(),'active');assert.equal(one.locks.calls.every(c=>c.options.mode==='exclusive'&&c.options.ifAvailable===true&&!c.options.steal),true);one.guard.dispose();two.guard.dispose();
});
test('unsupported or rejected locking fails closed without starting the application',async()=>{
 for(const locks of [null,{request:async()=>{throw Error('SecurityError')}}]){const f=fixture(locks);assert.equal(await f.guard.enter(),false);assert.equal(f.starts,0);assert.equal(f.errors,1);f.guard.dispose();}
});
test('startup errors keep ownership because partial application listeners may exist',async()=>{
 const f=fixture(undefined,{onStart:async()=>{throw Error('Module failed')}}),other=fixture(f.locks);
 assert.equal(await f.guard.enter(),false);assert.equal(f.errors,1);assert.equal(f.guard.state(),'failed');assert.equal(await other.guard.enter(),false);f.guard.dispose();other.guard.dispose();
});
test('a disposed guard cannot initialize when a delayed lock callback arrives',async()=>{
 let release;const f=fixture({request:async(_name,_options,callback)=>new Promise(resolve=>{release=()=>resolve(callback({name:'late'}))})});
 const work=f.guard.enter();await tick();f.guard.dispose();release();assert.equal(await work,false);assert.equal(f.starts,0);
});
