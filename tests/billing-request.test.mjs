import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingRequester } from '../billing-request.js';
test('billing request binds identity and permits recently reauthenticated account deletion',async()=>{
  const user={uid:'a',emailVerified:false,getIdToken:async force=>{assert.equal(force,true);return 'id';}};
  const request=createBillingRequester({getUser:()=>user,getAppToken:async()=>'app',fetchImpl:async(url,options)=>{
    assert.equal(url,'/api/billing/delete-account');
    assert.equal(options.headers.Authorization,'Bearer id');
    return Response.json({safeToDelete:true});
  }});
  assert.equal((await request('delete-account',{})).safeToDelete,true);
  await assert.rejects(()=>request('checkout',{planId:'plus'}));
});
test('billing request stops if identity switches before transport',async()=>{
  let user={uid:'a',emailVerified:true,getIdToken:async()=>'id'};
  const request=createBillingRequester({getUser:()=>user,getAppToken:async()=>{user={uid:'b'};return 'app';},fetchImpl:()=>{throw Error('should not fetch');}});
  await assert.rejects(()=>request('status'));
});

function transport(fetchImpl, clock=()=>0) {
  let user={uid:'a',emailVerified:true,getIdToken:async()=>'id'};
  const request=createBillingRequester({getUser:()=>user,getAppToken:async()=>'app',fetchImpl,clock});
  return {request,setUser:value=>user=value};
}
test('concurrent status and repeated navigation share one cached read',async()=>{
  let calls=0;
  const {request}=transport(async()=>{calls++;return Response.json({value:calls});});
  const results=await Promise.all([request('status'),request('status'),request('status')]);
  assert.equal(calls,1);assert.deepEqual(results,[{value:1},{value:1},{value:1}]);
  await request('status');assert.equal(calls,1);
  await request('status',null,{fresh:true});assert.equal(calls,2);
});
test('status expires and redemption invalidates it without caching mutations',async()=>{
  let now=0,calls=0;
  const {request}=transport(async()=>Response.json({value:++calls}),()=>now);
  await request('status');now=30001;await request('status');assert.equal(calls,2);
  await request('redeem',{code:'test'});await request('status');assert.equal(calls,4);
});
test('429 enforces route cooldown including forced refresh and recovers after expiry',async()=>{
  let now=0,calls=0;
  const {request}=transport(async url=>{
    calls++;return url.endsWith('status')&&now===0?Response.json({error:'Slow down'},{status:429,headers:{'Retry-After':'60'}}):Response.json({ok:true});
  },()=>now);
  await assert.rejects(()=>request('status'),e=>e.status===429&&e.retryAt===60000);
  await assert.rejects(()=>request('status',null,{fresh:true}),e=>e.status===429);
  assert.equal(calls,1);await request('portal');assert.equal(calls,2);
  now=60001;await request('status');assert.equal(calls,3);
});
test('cache and pending responses cannot cross sign-out and UID changes',async()=>{
  let finish,calls=0;
  const {request,setUser}=transport(async()=>{calls++;return new Promise(resolve=>finish=()=>resolve(Response.json({value:'old'})));});
  const pending=request('status');await new Promise(r=>setTimeout(r,0));
  setUser({uid:'b',emailVerified:true,getIdToken:async()=>'b'});request.clear();
  finish();await assert.rejects(pending,/sign-in changed/);assert.equal(calls,1);
});
