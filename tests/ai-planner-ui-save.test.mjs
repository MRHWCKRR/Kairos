import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {injectScheduleBridge} from '../build-transforms.js';

test('ordinary planner save preserves an AI task committed since the UI loaded',async()=>{
  const base={userID:'one',boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'one',title:'Essay'}]}]}],dayInsights:{},scheduleEvents:[]};
  const f=await plannerFixture(base);
  await f.execute({type:'create_task',args:{title:'Science revision'}},{operationId:'ui-race',ownerId:'one',planId:'plan'});
  f.context.seed=structuredClone(base);
  f.context.window.addEventListener=()=>{};
  f.context.renderApp=()=>{};
  f.context.markInitialLoadComplete=()=>{};
  f.context.showNotice=()=>{};
  f.context.updateDoc=async(_,patch)=>f.context.setDoc(_,patch);
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const functions=source.slice(source.indexOf('    // --- 6 Cloud Sync Data Actions ---'),source.indexOf('    // --- 7 AI Plan Generator ---'));
  vm.runInContext('let currentPlanDocId="plan",boardsData=seed.boards,dayInsights={},scheduleData=[];\n'+functions,f.context);
  vm.runInContext('planSnapshot=planState(seed);boardsData[0].sections[0].tasks[0].completed=true;',f.context);
  await f.context.updatePlanInFirestore();
  assert.equal(f.data().boards[0].sections[0].tasks.length,2);
  assert.equal(f.data().boards[0].sections[0].tasks[0].completed,true);
});
test('schedule bridge routes saves through the same safe planner save',()=>{
  const result=injectScheduleBridge('    // --- 14 Bedtime Reminder Engine ---');
  const persist=result.slice(result.indexOf('persistPlan: async'),result.indexOf('openRecurringEventEditor'));
  assert.match(persist,/await updatePlanInFirestore/);
  assert.doesNotMatch(persist,/await updateDoc/);
});
