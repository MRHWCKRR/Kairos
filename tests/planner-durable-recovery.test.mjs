import test from 'node:test';import assert from 'node:assert/strict';
import {createPlannerPersistence} from '../app-planner-persistence.js';
import {createPlannerWrites} from '../app-planner-writes.js';
import {planState,mergePlanEdits} from '../plan-merge.js';
const seed=()=>planState({boards:[{id:'b',title:'Original',sections:[{id:'s',title:'Section',tasks:[]}]}]});
const memory=()=>{const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
function fixture({storage=memory(),backend={plan:seed(),id:'plan',exists:true,attempts:0,writes:0},owner='one'}={}){
 let user=owner,id=backend.id,live=structuredClone(backend.plan),readFailure=false,initializes=0;
 const writes=createPlannerWrites(user);writes.snapshot=structuredClone(backend.plan);
 const controller=createPlannerPersistence({storage,writes,getOwnerId:()=>user,getPlanId:()=>id,getState:()=>live,setState:value=>live=value,setIdentity:(_owner,plan)=>id=plan,
  readPlans:async()=>{if(readFailure)throw Error('offline read');return backend.exists?[{docId:backend.id,...structuredClone(backend.plan)}]:[]},
  initialize:async()=>{initializes++;backend.exists=true;backend.id='plan-'+user;backend.plan=planState({})},migrate:plan=>plan.boards,normalizeBoards:value=>value,
  saveEdits:async(plan,_owner,base,local,options)=>{backend.attempts++;backend.options=options;if(backend.pause)await backend.pause();if(backend.fail)throw Error('offline');assert.equal(plan,backend.id);if(!backend.exists)throw Error('Planner missing');backend.plan=mergePlanEdits(base,local,backend.plan);backend.writes++;if(backend.failAfter)throw Error('Lost acknowledgement');return structuredClone(backend.plan)}
 });
 return {controller,writes,storage,backend,get live(){return live},get initializes(){return initializes},setOwner(next){user=next;writes.setOwner(next)},setReadFailure(value){readFailure=value},setPlan(next){id=next}};
}

test('ordinary failed edits restore after reopening without automatically writing',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';assert.equal(await f.controller.save(),false);
 assert.equal(f.controller.state().retained,true);const reopened=fixture(f);await reopened.controller.load({uid:'one'});
 assert.equal(reopened.live.boards[0].title,'Pending');assert.equal(reopened.controller.state().pending,true);assert.equal(f.backend.attempts,1);
 f.backend.fail=false;assert.equal(await reopened.controller.retry(),true);assert.equal(f.backend.plan.boards[0].title,'Pending');assert.equal(f.storage.data.size,0);assert.equal(reopened.controller.state().status,'saved');
});
test('recovery is durable before a queued write starts',async()=>{
 const f=fixture();let release;const first=f.writes.enqueue(()=>new Promise(resolve=>release=resolve));await new Promise(setImmediate);
 f.live.boards[0].title='Queued';const work=f.controller.save();assert.equal(f.storage.data.size,1);assert.equal(f.backend.attempts,0);release();await first;assert.equal(await work,true);
});
test('reopening merges unrelated remote changes and retry preserves newer work',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save();f.backend.plan.boards[0].sections[0].title='Remote section';
 const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.live.boards[0].sections[0].title,'Remote section');f.backend.fail=false;assert.equal(await reopened.controller.retry(),true);assert.equal(f.backend.plan.boards[0].sections[0].title,'Remote section');
});
test('a lost acknowledgement is confirmed after reopening without a duplicate create',async()=>{
 const f=fixture();f.backend.failAfter=true;f.live.boards.push({id:'new',title:'New board',sections:[]});await f.controller.save();assert.equal(f.backend.writes,1);
 const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.controller.state().pending,false);assert.equal(f.storage.data.size,0);assert.equal(f.backend.writes,1);assert.equal(await reopened.controller.retry(),false);assert.equal(reopened.live.boards.filter(b=>b.id==='new').length,1);
});
test('conflicting recovered edits remain available until explicit discard loads confirmed data',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save();f.backend.plan.boards[0].title='Remote';f.backend.fail=false;
 const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.controller.state().conflict,true);assert.equal(reopened.controller.recovery().local.boards[0].title,'Pending');assert.equal(await reopened.controller.retry(),false);assert.equal(f.backend.plan.boards[0].title,'Remote');
 reopened.setReadFailure(true);assert.equal(await reopened.controller.discard(),false);assert.equal(f.storage.data.size,1);
 reopened.setReadFailure(false);assert.equal(await reopened.controller.discard(),true);assert.equal(reopened.live.boards[0].title,'Remote');assert.equal(f.storage.data.size,0);
});
test('a missing or replaced planner is never recreated or overwritten by recovery',async()=>{
 for(const replaced of [false,true]){const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save();if(replaced)f.backend.id='replacement';else f.backend.exists=false;
 const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.controller.state().conflict,true);assert.equal(await reopened.controller.retry(),false);assert.equal(reopened.initializes,0);assert.equal(f.backend.attempts,1);assert.equal(f.storage.data.size,1);}
});
test('an offline startup restores pending state but does not treat cached state as confirmation',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save();const reopened=fixture(f);reopened.setReadFailure(true);await reopened.controller.load({uid:'one'});assert.equal(reopened.live.boards[0].title,'Pending');assert.equal(reopened.controller.state().pending,true);assert.equal(f.backend.attempts,1);
});
test('storage quota failure keeps live edits and never sends an unretained write',async()=>{
 const f=fixture(),set=f.storage.setItem;f.storage.setItem=()=>{throw Error('quota')};f.live.boards[0].title='Pending';assert.equal(await f.controller.save(),false);assert.equal(f.backend.attempts,0);assert.equal(f.controller.state().retained,false);assert.equal(f.live.boards[0].title,'Pending');
 f.storage.setItem=set;assert.equal(await f.controller.retry(),true);assert.equal(f.backend.plan.boards[0].title,'Pending');
});
test('account and planner scope changes never replay retained data into a new scope',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Private';await f.controller.save();const other=fixture({...f,owner:'two'});await other.controller.load({uid:'two'});assert.equal(other.live.boards[0].title,'Original');assert.equal(other.controller.state().pending,false);assert.equal(await other.controller.retry(),false);assert.equal(f.storage.data.size,1);
 f.setPlan('replacement');f.backend.fail=false;assert.equal(await f.controller.retry(),false);assert.equal(f.backend.attempts,1);
});
test('edits during an in-flight save remain durable across reopening',async()=>{
 const f=fixture();let release;f.backend.pause=()=>new Promise(resolve=>release=resolve);f.live.boards[0].title='First';const work=f.controller.save();await new Promise(setImmediate);
 f.live.boards[0].title='Second';const queued=f.controller.save();f.backend.pause=null;release();assert.equal(await work,true);assert.equal(await queued,true);assert.equal(f.backend.plan.boards[0].title,'Second');assert.equal(f.storage.data.size,0);
});
test('save policy options survive a failed save and reopening',async()=>{
 const f=fixture(),options={scheduleAvailability:{timezone:'UTC',weeklyAvailability:null}};f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save(options);const reopened=fixture(f);await reopened.controller.load({uid:'one'});f.backend.fail=false;await reopened.controller.retry();assert.deepEqual(f.backend.options,{...options,requireExisting:true});
});
test('invalid and externally replaced recovery records fail closed',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save();const key=[...f.storage.data.keys()][0];f.storage.data.set(key,'invalid');f.backend.fail=false;assert.equal(await f.controller.retry(),false);assert.equal(f.backend.attempts,1);assert.equal(f.storage.data.get(key),'invalid');
 const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.controller.state().conflict,true);assert.equal(await reopened.controller.retry(),false);assert.equal(f.backend.attempts,1);
});

test('new edits submitted while retry reads remote data are retained',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='First';await f.controller.save();f.backend.fail=false;
 const read=f.controller.retry();f.live.boards[0].title='During retry';await f.controller.save();await read;
 const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.live.boards[0].title,'During retry');
});
test('discard confirmation cannot discard a newer submitted recovery record',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='First';await f.controller.save();const id=f.controller.recovery().id;f.live.boards[0].title='Second';await f.controller.save();assert.equal(await f.controller.discard(id),false);assert.equal(f.controller.recovery().local.boards[0].title,'Second');
});
test('account transition immediately notifies recovery subscribers',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Private';await f.controller.save();const owners=[];f.controller.subscribe(s=>owners.push(s.ownerId));f.setOwner('two');f.controller.state();assert.equal(owners.at(-1),'two');
});
test('malformed nested recovery cannot publish invalid planner collections',async()=>{
 const f=fixture();f.backend.fail=true;f.live.boards[0].title='Pending';await f.controller.save();const key=[...f.storage.data.keys()][0],record=JSON.parse(f.storage.data.get(key));record.local.boards=[null];f.storage.data.set(key,JSON.stringify(record));const reopened=fixture(f);await reopened.controller.load({uid:'one'});assert.equal(reopened.controller.recovery(),null);assert.equal(reopened.controller.state().conflict,true);assert.equal(reopened.live.boards[0].title,'Original');
});
