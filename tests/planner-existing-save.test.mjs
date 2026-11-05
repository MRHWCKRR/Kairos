import test from 'node:test';import assert from 'node:assert/strict';import {plannerFixture} from './helpers/planner-fixture.mjs';import {planState} from '../plan-merge.js';
test('recovery save cannot recreate a planner deleted after the preflight read',async()=>{const f=await plannerFixture(null),base=planState({boards:[{id:'b',sections:[]}]}),local=planState({});await assert.rejects(f.context.savePlannerEdits('plan','one',base,local,{requireExisting:true}),/no longer|missing/i);assert.equal(f.writes.length,0)});
test('an inverse edit still applies when the uncertain write commits after the recovery preflight',async()=>{
 const base=planState({boards:[{id:'b',title:'Original',sections:[]}]}),submitted=structuredClone(base);submitted.boards.push({id:'uncertain',title:'Temporary',sections:[],archived:false});const f=await plannerFixture({userID:'one',...submitted});
 await f.context.savePlannerEdits('plan','one',base,base,{requireExisting:true,recoveryAttempt:{base,local:submitted}});assert.equal(f.data().boards.some(b=>b.id==='uncertain'),false);assert.equal(f.data().boards[0].title,'Original');
});
