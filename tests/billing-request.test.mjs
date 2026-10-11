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
