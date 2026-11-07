import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createBoardSectionHandlers} from '../app-board-section-handlers.js';
import {createPlannerPersistence} from '../app-planner-persistence.js';
import {createPlannerWrites} from '../app-planner-writes.js';
import {planState,mergePendingPlanEdits} from '../plan-merge.js';
import {memoryStorage} from './helpers/memory-storage.mjs';

const tick=()=>new Promise(setImmediate);
const initial=()=>planState({boards:[{id:'b',title:'Board',archived:false,sections:[{id:'s',title:'Section',archived:false,tasks:[{id:'t',title:'Task'}]}]}]});
function fixture({storage=memoryStorage(),remote={state:initial()},planId='plan'}={}) {
 let state=initial(),owner='one',renders=0,fail=false,updates=0,creates=0,dialog=async()=> '  New name  ';
 const restored=[],writes=createPlannerWrites(owner);writes.snapshot=initial();
 const persistence=createPlannerPersistence({storage,writes,getOwnerId:()=>owner,getPlanId:()=>planId,getState:()=>state,setState:value=>{state=value},setIdentity:(_owner,id)=>{planId=id},readPlans:async()=>[{docId:'plan',...structuredClone(remote.state)}],migrate:p=>p.boards,normalizeBoards:b=>b,
  saveEdits:async(_id,_owner,base,local,options)=>{if(fail)throw Error('offline');remote.state=mergePendingPlanEdits(base,local,remote.state,options.recoveryAttempt);return structuredClone(remote.state)}});
 // Exercise the actual shell guards with controllable dialogs and identities.
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const guards=runInNewContext(source.slice(source.indexOf('    async function confirmAction('),source.indexOf('    // Block the web workspace'))+';({confirmAction,requestName})',{
  get auth(){return {currentUser:{uid:owner}}},get currentPlanDocId(){return planId},confirmDialog:(...args)=>dialog(...args),promptDialog:(...args)=>dialog(...args)});
 const save=()=>{updates++;return persistence.save()};
 const adapters={getBoards:()=>state.boards,setBoards:b=>{state.boards=b},getPlanId:()=>planId,findBoard:id=>state.boards.find(b=>b.id===id),findSection:id=>{for(const board of state.boards){const section=board.sections.find(s=>s.id===id);if(section)return {board,section}}},...guards,tr:key=>key,restoreArchived:async target=>{restored.push(target)},updatePlanInFirestore:save,savePlanToFirestore:()=>{creates++;return save()},renderApp:()=>renders++};
 const click=createBoardSectionHandlers(adapters);
 function event(selector) {
  const container={getAttribute:name=>name==='data-board-id'?'b':'s'};
  const button={getAttribute:container.getAttribute,closest:()=>container};
  return {target:{closest:match=>match===selector?button:null}};
 }
 return {adapters,event,click:selector=>click(event(selector)),persistence,writes,remote,restored,storage,get state(){return state},get renders(){return renders},get updates(){return updates},get creates(){return creates},setFail:v=>{fail=v},setDialog:v=>{dialog=v},setOwner:v=>{owner=v;writes.setOwner(v)},setPlan:v=>{planId=v},replace:v=>{state=v}};
}

test('the shell delegates nested board clicks once and publishes the module as a public asset',async()=>{
 const f=fixture(),source=readFileSync(new URL('../app.js',import.meta.url),'utf8');let listener;
 runInNewContext(source.slice(source.indexOf('    const handleBoardSectionClick='),source.indexOf('    function updateRoutineStats()')),{
  ...f.adapters,createBoardSectionHandlers,get boardsData(){return f.state.boards},set boardsData(value){f.adapters.setBoards(value)},currentPlanDocId:'plan',document:{body:{addEventListener:(type,fn)=>{assert.equal(type,'click');listener=fn}},querySelector:()=>null}});
 await listener(f.event('.board-rename-btn'));await f.writes.idle();assert.equal(f.state.boards[0].title,'New name');assert.equal(f.updates,1);assert.equal(f.renders,1);
 const manifest=JSON.parse(readFileSync(new URL('../cloudflare/public-assets.json',import.meta.url),'utf8'));assert.ok(manifest.files.includes('app-board-section-handlers.js'));
});

test('board and section names preserve trimming, one save and immediate rendering',async()=>{
 for(const [selector,read] of [['#add-board-btn',f=>f.state.boards.at(-1).title],['.board-rename-btn',f=>f.state.boards[0].title],['.add-section-btn',f=>f.state.boards[0].sections.at(-1).title],['.section-rename-btn',f=>f.state.boards[0].sections[0].title]]){
  const f=fixture();assert.equal(await f.click(selector),true);await f.writes.idle();assert.equal(read(f),'New name');assert.equal(f.updates,1);assert.equal(f.renders,1);assert.equal(f.persistence.state().status,'saved');
 }
 const f=fixture({planId:null});await f.click('#add-board-btn');assert.equal(f.creates,1);await f.writes.idle();
});
test('archive retains children; permanent deletion removes only its target',async()=>{
 for(const selector of ['.board-delete-btn','.section-delete-btn','.archive-delete-board-btn','.archive-delete-section-btn']){
  const f=fixture();f.setDialog(async()=>true);await f.click(selector);await f.writes.idle();assert.equal(f.updates,1);assert.equal(f.renders,1);
  if(selector==='.board-delete-btn'){assert.equal(f.state.boards[0].archived,true);assert.equal(f.state.boards[0].sections[0].tasks[0].id,'t')}
  if(selector==='.section-delete-btn'){assert.equal(f.state.boards[0].sections[0].archived,true);assert.equal(f.state.boards[0].sections[0].tasks[0].id,'t')}
  if(selector==='.archive-delete-board-btn')assert.equal(f.state.boards.length,0);
  if(selector==='.archive-delete-section-btn')assert.equal(f.state.boards[0].sections.length,0);
 }
});
test('restore delegates to the existing mutation controller and ignores unrelated clicks',async()=>{
 const f=fixture();await f.click('.archive-restore-board-btn');await f.click('.archive-restore-section-btn');assert.deepEqual(f.restored,[{kind:'board',boardId:'b'},{kind:'section',boardId:'b',sectionId:'s'}]);assert.equal(f.updates,0);assert.equal(await f.click('.task-delete-btn'),false);
});
test('cancelled and blank dialogs never mutate or submit',async()=>{
 for(const answer of [null,false,'  '])for(const selector of ['#add-board-btn','.add-section-btn','.board-rename-btn','.section-rename-btn',...(answer==='  '?[]:['.board-delete-btn','.section-delete-btn','.archive-delete-board-btn','.archive-delete-section-btn'])]){
  const f=fixture();f.setDialog(async()=>answer);await f.click(selector);assert.deepEqual(f.state,initial());assert.equal(f.updates,0);assert.equal(f.renders,0);
 }
});
test('account and planner changes during a dialog reject stale creates, renames and deletions',async()=>{
 for(const change of [f=>f.setOwner('two'),f=>f.setPlan('other')])for(const selector of ['#add-board-btn','.add-section-btn','.board-rename-btn','.section-rename-btn','.board-delete-btn','.section-delete-btn','.archive-delete-board-btn','.archive-delete-section-btn']){
  const f=fixture();let release;f.setDialog(()=>new Promise(resolve=>release=resolve));const work=f.click(selector);change(f);release(selector.includes('delete')?true:'Rename');await work;assert.deepEqual(f.state,initial());assert.equal(f.updates,0);
 }
});
test('rename re-resolves live state after its dialog and safely consumes a removed target',async()=>{
 const f=fixture();let release;f.setDialog(()=>new Promise(resolve=>release=resolve));const work=f.click('.section-rename-btn');f.replace(planState({}));release('Rename');assert.equal(await work,true);assert.equal(f.updates,0);
});
test('board edits wait behind the shared queue and retain both queued intents',async()=>{
 const f=fixture();let release;const earlier=f.writes.enqueue(()=>new Promise(resolve=>release=resolve));await tick();
 await f.click('.board-rename-btn');await f.click('.section-rename-btn');assert.equal(f.remote.state.boards[0].title,'Board');assert.equal(f.persistence.state().busy,true);assert.equal(f.renders,2);
 release();await earlier;await f.writes.idle();assert.equal(f.remote.state.boards[0].title,'New name');assert.equal(f.remote.state.boards[0].sections[0].title,'New name');assert.equal(f.persistence.state().pending,false);
});
test('failed board save survives reopening, merges remote edits and retries explicitly',async()=>{
 const f=fixture();f.setFail(true);await f.click('.board-rename-btn');await f.writes.idle();assert.equal(f.persistence.state().retained,true);assert.equal(f.state.boards[0].title,'New name');
 f.remote.state.dayInsights={remote:'Unrelated'};const reopened=fixture({storage:f.storage,remote:f.remote});await reopened.persistence.load({uid:'one'});
 assert.equal(reopened.state.boards[0].title,'New name');assert.equal(reopened.state.dayInsights.remote,'Unrelated');assert.equal(f.remote.state.boards[0].title,'Board');assert.equal(await reopened.persistence.retry(),true);assert.equal(f.remote.state.boards[0].title,'New name');assert.equal(reopened.persistence.state().pending,false);
});
