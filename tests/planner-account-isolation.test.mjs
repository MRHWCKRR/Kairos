import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPlannerWrites} from '../app-planner-writes.js';
import {planState,mergePlanEdits} from '../plan-merge.js';

test('switching planner owners clears baseline and load tickets while preserving queued work',async()=>{
 const coordinator=createPlannerWrites('one');coordinator.snapshot={private:'one'};
 const ticket=coordinator.beginLoad();let finish;
 const first=coordinator.enqueue(()=>new Promise(resolve=>finish=resolve));await new Promise(setImmediate);
 assert.equal(coordinator.setOwner('two'),true);assert.equal(coordinator.snapshot,null);assert.equal(coordinator.isCurrentLoad(ticket),false);
 let ran=false;const second=coordinator.enqueue(async()=>{ran=true;return 'new account'});
 await new Promise(setImmediate);assert.equal(ran,false,'switching must retain shared serialization');
 finish();await first;assert.equal(await second,'new account');
 coordinator.snapshot={current:'two'};assert.equal(coordinator.setOwner('two'),false);assert.deepEqual(coordinator.snapshot,{current:'two'});
});

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function fixture(){
 const renders=[],context=vm.createContext({auth:{currentUser:{uid:'one'}},plannerWrites:createPlannerWrites('one'),boardsData:[{id:'private',title:'A private board'}],scheduleData:[{id:'private-event',title:'A private event'}],dayInsights:{private:'A'},calendarSourcesData:[],currentPlanDocId:'plan-A',searchPlannerOwnerId:'one',focusData:{private:'A'},achievementsData:{private:'A'},userSettings:{profile:{displayName:'A private name'}},pendingSettings:{private:'A'},appReady:true,
  defaultSettings:()=>({profile:{displayName:''}}),defaultFocusData:()=>({}),defaultAchievementsData:()=>({}),cloneDeep:structuredClone,invalidateKairosContext(){},applyAllSettings(){},renderUserProfileMenu(){},renderStatisticsPage(){},
  renderApp(){renders.push(JSON.parse(JSON.stringify({owner:context.auth.currentUser.uid,boards:context.boardsData,events:context.scheduleData,plan:context.currentPlanDocId})));},
  console:{log(){},error(){}},db:{},collection(){},query(){},where(){},markInitialLoadComplete(){context.completions++;},completions:0});
 const resetStart=source.indexOf('    function resetPlannerForAccount(');
 if(resetStart>=0)vm.runInContext(source.slice(resetStart,source.indexOf('    async function savePlanToFirestore(',resetStart)),context);
 const loadStart=source.indexOf('    async function loadLatestPlanFromFirestore(');
 vm.runInContext(source.slice(loadStart,source.indexOf("    window.addEventListener('kairos-data-changed'",loadStart)),context);
 return {context,renders};
}
test('host clears old planner, profile and progress synchronously before replacement controllers sync',()=>{
 const {context,renders}=fixture();assert.equal(typeof context.resetPlannerForAccount,'function');
 context.auth.currentUser={uid:'two'};context.resetPlannerForAccount('two');
 assert.equal(context.currentPlanDocId,null);assert.equal(context.boardsData.length,0);assert.equal(context.scheduleData.length,0);
 assert.equal(context.userSettings.profile.displayName,'');assert.deepEqual(JSON.parse(JSON.stringify(context.focusData)),{});
 assert.ok(renders.every(row=>!JSON.stringify(row).includes('A private')));
 const authStart=source.indexOf('    onAuthStateChanged(auth, async (user) => {');
 assert.ok(source.indexOf('resetPlannerForAccount(',authStart)<source.indexOf('globalThis.window?.__kairosScheduleInteractions?.sync()',authStart));
});
test('rejected old read cannot render or settle the replacement account',async()=>{
 const {context,renders}=fixture();let reject;
 context.getDocs=()=>new Promise((_resolve,no)=>reject=no);
 const load=context.loadLatestPlanFromFirestore({uid:'one'});await new Promise(setImmediate);
 context.auth.currentUser={uid:'two'};reject(Error('old offline read'));await load;
 assert.equal(renders.length,0);assert.equal(context.completions,0);
});
test('empty replacement planner cannot retain or subsequently save the prior private arrays',async()=>{
 const {context,renders}=fixture();context.auth.currentUser={uid:'two'};context.getDocs=async()=>({empty:true});
 await context.loadLatestPlanFromFirestore({uid:'two'});
 assert.equal(context.currentPlanDocId,null);assert.equal(context.boardsData.length,0);assert.equal(context.scheduleData.length,0);assert.equal(context.dayInsights.private,undefined);
 assert.ok(renders.every(row=>!JSON.stringify(row).includes('A private')));
 let saved;
 Object.assign(context,{planState,mergePlanEdits,initializePlanner:async()=>{},savePlannerEdits:async(planId,ownerId,_before,local)=>{saved={planId,ownerId,local};return structuredClone(local);},globalSearchController:null,taskCaptureController:null,window:{},showNotice:message=>assert.fail(message)});
 const saveStart=source.indexOf('    async function updatePlanInFirestore(');
 vm.runInContext(source.slice(saveStart,source.indexOf('    async function loadLatestPlanFromFirestore(',saveStart)),context);
 assert.equal(await context.updatePlanInFirestore(),true);assert.equal(saved.ownerId,'two');assert.equal(saved.planId,'plan-two');
 assert.equal(saved.local.boards.length,0);assert.equal(saved.local.scheduleEvents.length,0);
});
