import {attachPlannerPersistence} from './helpers/planner-persistence-host.mjs';
import {createPlannerWrites} from '../app-planner-writes.js';
import test from 'node:test';
import assert from 'node:assert/strict';
async function fixture({status=200,errorStatus,waitToken}={}) {
 let current={uid:'one',emailVerified:true,getIdToken:async()=>{if(waitToken)await waitToken;return 'test-id-token';}},calls=[];
 let module={};try{module=await import('../planner-bootstrap.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
 assert.equal(typeof module.createPlannerBootstrap,'function','first planner needs create-only initialization');
 const init=module.createPlannerBootstrap({getUser:()=>current,projectId:'kairos-1a',getAppToken:async()=> 'test-app-token',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:status===200,status,json:async()=>({error:{status:errorStatus}})};}});
 return {init,calls,setUser:value=>current=value};
}
test('bootstrap creates only the signed-in owners empty planner with authentication and App Check',async()=>{
 const f=await fixture();await f.init('one');assert.equal(f.calls.length,1);
 const {url,options}=f.calls[0];assert.ok(url.endsWith('study_plans?documentId=plan-one'));assert.equal(options.method,'POST');
 assert.equal(options.headers.Authorization,'Bearer test-id-token');assert.equal(options.headers['X-Firebase-AppCheck'],'test-app-token');
 const fields=JSON.parse(options.body).fields;assert.equal(fields.userID.stringValue,'one');assert.deepEqual(fields.boards.arrayValue.values,[]);
 assert.deepEqual(Object.keys(fields).sort(),['boards','createdAt','dayInsights','scheduleEvents','userID']);
});
test('a concurrent initializer cannot overwrite an existing planner',async()=>{
 const f=await fixture({status:409,errorStatus:'ALREADY_EXISTS'});await f.init('one');assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'POST');
});
test('permission and quota failures are preserved',async()=>{
 for(const [status,errorStatus] of [[403,'PERMISSION_DENIED'],[429,'RESOURCE_EXHAUSTED']]){const f=await fixture({status,errorStatus});await assert.rejects(f.init('one'),/initialize/i);}
});
test('account changes during credentials cannot initialize the previous users planner',async()=>{
 let release;const f=await fixture({waitToken:new Promise(resolve=>release=resolve)});const work=f.init('one');f.setUser({uid:'two'});release();await assert.rejects(work,/account changed/i);assert.equal(f.calls.length,0);
});
test('the first board save succeeds even when rules deny reading a missing planner',async()=>{
 const {plannerFixture}=await import('./helpers/planner-fixture.mjs');
 const vm=await import('node:vm');
 const f=await plannerFixture(null,{denyMissingReads:true});
 f.context.plannerWrites=createPlannerWrites();f.context.renderApp=()=>{};f.context.showNotice=message=>assert.fail(message);
 vm.runInContext('let currentPlanDocId=null,boardsData=[{id:"new-board",title:"Launch",sections:[]}],dayInsights={},scheduleData=[];',f.context);
 attachPlannerPersistence(f.context);
 assert.equal(await f.context.updatePlanInFirestore(),true);
 assert.equal(f.data().boards[0].title,'Launch');assert.equal(f.data().userID,'one');
});
