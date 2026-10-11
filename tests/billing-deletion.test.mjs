import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './billing-store-fixture.mjs';
import { prepareBillingDeletion } from '../server/billing-account-deletion.js';
import Stripe from 'stripe';
import { createStripeClient,STRIPE_API_VERSION } from '../server/stripe-client.js';
import { handleStripeWebhook } from '../server/billing-webhook.js';
test('deletion expires open checkout and cancels completion racing expiration',async()=>{
  const f=fixture({STRIPE_SECRET_KEY:['rk','test','fixture'].join('_'),STRIPE_WEBHOOK_SECRET:'fixture-signing-secret'});
  await f.store.saveMapping('a',{customerId:'cus_1',checkoutId:'cs_open'});
  let open=true,active=false;const calls=[];
  const stripe=createStripeClient(f.env,{store:f.store,clock:f.now,fetchImpl:async(url,options)=>{
    const path=new URL(url).pathname;calls.push(path);
    if(path==='/v1/checkout/sessions')return Response.json({has_more:false,data:open?[{id:'cs_open',status:'open',customer:'cus_1',livemode:false}]:[]});
    if(path==='/v1/checkout/sessions/cs_open/expire'){open=false;active=true;return Response.json({error:{message:'Session completed',type:'invalid_request_error'}},{status:400});}
    if(path==='/v1/checkout/sessions/cs_open')return Response.json({id:'cs_open',status:'complete',customer:'cus_1',livemode:false});
    if(path==='/v1/subscriptions')return Response.json({has_more:false,data:active?[{id:'sub_late',customer:'cus_1',status:'active'}]:[]});
    if(path==='/v1/subscriptions/sub_late' && options.method==='DELETE'){active=false;return Response.json({id:'sub_late',status:'canceled'});}
    throw Error('Unexpected Stripe path '+path);
  }});
  assert.equal((await prepareBillingDeletion('a',{store:f.store,stripe})).safeToDelete,true);
  assert.ok(calls.includes('/v1/checkout/sessions/cs_open/expire'));assert.equal(active,false);
  assert.equal(await f.store.isDeletedCustomer('cus_1'),true);
  assert.equal(await f.store.customerUid('cus_1'),null);
  const retained=[...f.docs.values()].find(d=>d.data.deleted===true);
  assert.equal(retained.data.uid,undefined);
  active=true; // An asynchronous completion delivered after identity cleanup.
  const payload=JSON.stringify({id:'evt_late',type:'customer.subscription.created',api_version:STRIPE_API_VERSION,livemode:false,data:{object:{customer:'cus_1'}}});
  const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:f.env.STRIPE_WEBHOOK_SECRET,timestamp:Math.floor(f.now()/1000)});
  const response=await handleStripeWebhook(new Request('https://kairos-web-preview.kirosapp.workers.dev/api/billing/webhook',{method:'POST',headers:{'Stripe-Signature':signature},body:payload}),{env:f.env,stripe,store:f.store});
  assert.equal(response.status,200);assert.equal(active,false);
});
test('account cancellation completes before billing ownership is removed',async()=>{
  const f=fixture();await f.store.saveMapping('a',{customerId:'cus_1'});
  let canceled=false;
  const result=await prepareBillingDeletion('a',{store:f.store,stripe:{cancelAccountSubscriptions:async id=>{
    assert.equal(id,'cus_1');
    assert.equal((await f.store.readAccount('a')).deleting,true);
    canceled=true;
  }}});
  assert.equal(result.safeToDelete,true);assert.equal(canceled,true);
  assert.equal(await f.store.readMapping('a'),null);
  assert.equal((await f.store.readAccount('a')).deleting,true);
});
test('failed billing cancellation prevents identity deletion and can be retried',async()=>{
  const f=fixture();await f.store.saveMapping('a',{customerId:'cus_1'});
  await assert.rejects(()=>prepareBillingDeletion('a',{store:f.store,stripe:{cancelAccountSubscriptions:async()=>{throw Error('provider down');}}}));
  assert.equal((await f.store.readMapping('a')).customerId,'cus_1');
  assert.equal((await prepareBillingDeletion('a',{store:f.store,stripe:{cancelAccountSubscriptions:async()=>{}}})).safeToDelete,true);
});
test('account without a payment customer can delete without Stripe credentials',async()=>{
  const f=fixture();
  assert.equal((await prepareBillingDeletion('a',{store:f.store,stripe:{}})).safeToDelete,true);
});
