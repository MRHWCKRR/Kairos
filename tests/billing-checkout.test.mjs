import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './billing-store-fixture.mjs';
import { createStripeClient } from '../server/stripe-client.js';
import { createBillingHandlers } from '../server/billing.js';
const origin='https://kairos-web-preview.kirosapp.workers.dev';
function setup() {
  const f=fixture({BILLING_ENABLED:'true',BILLING_ORIGIN:origin,STRIPE_MODE:'test',STRIPE_SECRET_KEY:['rk','test','fixture'].join('_'),STRIPE_PLUS_PRICE_ID:'price_plus'});
  let customers=0,sessions=0,active=false;const payloads=[];
  const stripe=createStripeClient(f.env,{store:f.store,fetchImpl:async(url,options)=>{
    const route=new URL(url).pathname;
    if(route==='/v1/prices/price_plus')return Response.json({id:'price_plus',object:'price',active:true,livemode:false,currency:'aud',unit_amount:500,recurring:{interval:'month',interval_count:1},product:'prod_plus'});
    if(route==='/v1/customers') {customers++;return Response.json({id:'cus_owner',object:'customer',livemode:false});}
    if(route==='/v1/subscriptions')return Response.json({object:'list',has_more:false,data:active?[{id:'sub_1',status:'active',customer:'cus_owner'}]:[]});
    if(route==='/v1/checkout/sessions') {
      sessions++;const params=new URLSearchParams(options.body);payloads.push(params);
      return Response.json({id:'cs_1',url:'https://checkout.stripe.com/c/pay/cs_1',expires_at:Math.floor(f.now()/1000)+1800,status:'open',customer:'cus_owner',livemode:false});
    }
    if(route==='/v1/checkout/sessions/cs_1')return Response.json({id:'cs_1',url:'https://checkout.stripe.com/c/pay/cs_1',status:'open',customer:'cus_owner',livemode:false});
    if(route==='/v1/billing_portal/sessions')return Response.json({id:'bps_1',url:'https://billing.stripe.com/p/session/bps_1'});
    throw Error('Unexpected Stripe route '+route);
  },clock:f.now});
  const handlers=createBillingHandlers({env:f.env,store:f.store,stripe,clock:f.now,usage:async()=>({used:0,remaining:100,resetsAt:'2026-10-11T14:00:00Z',bonusCredits:0}),adminAuth:{verifyIdToken:async()=>({uid:'a',email_verified:true})},appCheck:{verifyToken:async()=>({})},rateLimiter:{limit:async()=>({success:true})}});
  return {...f,stripe,handlers,payloads,count:()=>({customers,sessions}),activate:()=>active=true};
}
const request=(body,path='checkout')=>new Request(origin+'/api/billing/'+path,{method:'POST',headers:{Authorization:'Bearer id','X-Firebase-AppCheck':'app','Content-Type':'application/json'},body:JSON.stringify(body)});
test('checkout verifies price and creates only one customer/session across repeated requests',async()=>{
  const f=setup();
  const first=await f.handlers.checkout(request({planId:'plus',requestId:'attempt-1'}));
  assert.equal(first.status,200);
  const second=await f.handlers.checkout(request({planId:'plus',requestId:'attempt-2'}));
  assert.deepEqual(await first.json(),await second.json());
  assert.deepEqual(f.count(),{customers:1,sessions:1});
  assert.equal(f.payloads[0].get('allow_promotion_codes'),'true');
  assert.equal(f.payloads[0].get('line_items[0][price]'),'price_plus');
  assert.equal(f.payloads[0].get('success_url'),origin+'/app.html?billing=return');
  assert.equal(f.payloads[0].has('payment_method_types[0]'),false);
});
test('client cannot choose Stripe identity, price, return destination or entitlement',async()=>{
  const f=setup();
  for(const fields of [{price:'price_evil'},{customer:'cus_evil'},{returnUrl:'https://evil.example'},{tier:'plus'},{planId:'admin'}]) {
    const response=await f.handlers.checkout(request({planId:'plus',requestId:'attempt',...fields}));
    assert.equal(response.status,400);
  }
  assert.deepEqual(f.count(),{customers:0,sessions:0});
  assert.equal((await f.handlers.checkout(new Request(origin+'/api/billing/checkout',{method:'POST'}))).status,401);
});
test('already subscribed customer receives their own portal and deleting account cannot buy',async()=>{
  const f=setup();await f.handlers.checkout(request({planId:'plus',requestId:'one'}));f.activate();
  const response=await f.handlers.checkout(request({planId:'plus',requestId:'two'}));
  assert.equal((await response.json()).kind,'portal');
  await f.store.markDeleting('a');
  assert.notEqual((await f.handlers.checkout(request({planId:'plus',requestId:'three'}))).status,200);
});
test('unconfigured billing exposes no invented price or purchase promise',async()=>{
  const f=fixture();
  const stripe=createStripeClient(f.env,{store:f.store});
  assert.equal(stripe.configured,false);
  assert.deepEqual(await stripe.offers(),[]);
});
test('missing App Check is rejected before any billing side effect',async()=>{
  const f=setup();
  const req=request({planId:'plus',requestId:'attempt'});
  req.headers.delete('X-Firebase-AppCheck');
  assert.equal((await f.handlers.checkout(req)).status,403);
  assert.deepEqual(f.count(),{customers:0,sessions:0});
});
test('parallel checkout attempts never create duplicate customers or sessions',async()=>{
  const f=setup();
  const results=await Promise.all([f.handlers.checkout(request({planId:'plus',requestId:'one'})),f.handlers.checkout(request({planId:'plus',requestId:'two'}))]);
  assert.equal(results.filter(result=>result.status===200).length,1);
  assert.deepEqual(f.count(),{customers:1,sessions:1});
});
