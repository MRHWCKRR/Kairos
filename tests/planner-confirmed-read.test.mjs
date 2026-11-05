import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('ordinary recovery reads never accept populated or empty Firestore caches as confirmation',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('    const plannerPersistence=createPlannerPersistence('),end=source.indexOf('    async function updatePlanInFirestore(',start);
 for(const cached of [[],[{id:'plan',data:()=>({boards:[]})}]]){
  let online=false,cacheReads=0,serverReads=0;
  const noop=()=>{},context=vm.createContext({createPlannerPersistence:options=>options,plannerWrites:{},auth:{currentUser:{uid:'one'}},db:{},currentPlanDocId:'plan',initializePlanner:noop,savePlannerEdits:noop,migrateToBoards:noop,normalizeArchiveFields:noop,invalidateKairosContext:noop,renderApp:noop,markInitialLoadComplete:noop,query:(...args)=>args,collection:()=>({}),where:()=>({}),getDocs:async()=>{cacheReads++;return {docs:cached,metadata:{fromCache:true}}},getDocsFromServer:async()=>{serverReads++;if(!online)throw Error('server unavailable');return {docs:[{id:'plan',data:()=>({boards:[],confirmed:true})}],metadata:{fromCache:false}}}});
  vm.runInContext(source.slice(start,end)+'globalThis.reader=plannerPersistence.readPlans',context);
  await assert.rejects(context.reader('one'),/server unavailable/);online=true;const plans=await context.reader('one');assert.equal(plans[0].confirmed,true);assert.equal(cacheReads,0);assert.equal(serverReads,2);
 }
});
