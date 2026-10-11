import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { fixture } from './billing-store-fixture.mjs';
import { createStripeClient, STRIPE_API_VERSION } from '../server/stripe-client.js';
import { handleStripeWebhook } from '../server/billing-webhook.js';
const origin='https://kairos-web-preview.kirosapp.workers.dev';
function setup() {
  const f=fixture({STRIPE_SECRET_KEY:['rk','test','fixture'].join('_'),STRIPE_MODE:'test',STRIPE_PLUS_PRICE_ID:'price_plus',STRIPE_WEBHOOK_SECRET:'fixture-signing-secret'});
  let status='active',refunded=false,disputed=false,failed=false,disputeWon=false,clean=false;
  const customer='cus_1',end=Math.floor(f.now()/1000)+86400,invoice={id:'in_1',object:'invoice',status:'paid',customer,livemode:false,amount_paid:500,parent:{type:'subscription_details',subscription_details:{subscription:'sub_1'}},lines:{has_more:false,data:[{id:'il_1',period:{start:end-2592000,end},pricing:{type:'price_details',price_details:{price:'price_plus'}},parent:{type:'subscription_item_details',subscription_item_details:{subscription:'sub_1',proration:false}}}]}};
  const stripe=createStripeClient(f.env,{store:f.store,clock:f.now,fetchImpl:async(url,options)=>{
    if(failed)throw Error('Stripe unavailable');
    const path=new URL(url).pathname;
    if(path==='/v1/subscriptions')return Response.json({object:'list',has_more:false,data:[{id:'sub_1',customer,status,cancel_at_period_end:true,ended_at:status==='canceled'?Math.floor(f.now()/1000):null,livemode:false,items:{data:[{price:{id:'price_plus'},quantity:1}]}}]});
    if(path==='/v1/invoices')return Response.json({object:'list',has_more:false,data:clean?[invoice,{...invoice,id:'in_2'}]:[invoice]});
    if(path==='/v1/invoice_payments' && new URL(url).searchParams.get('invoice')==='in_2')return Response.json({object:'list',has_more:false,data:[{id:'inpay_2',invoice:'in_2',status:'paid',livemode:false,payment:{type:'charge',charge:'ch_2'}}]});
    if(path==='/v1/charges/ch_2')return Response.json({id:'ch_2',customer,amount:500,amount_refunded:0,refunded:false,disputed:false,livemode:false});
    if(path==='/v1/invoice_payments')return Response.json({object:'list',has_more:false,data:[{id:'inpay_1',invoice:'in_1',status:'paid',livemode:false,payment:{type:'payment_intent',payment_intent:'pi_1'}}]});
    if(path==='/v1/payment_intents/pi_1')return Response.json({id:'pi_1',customer,latest_charge:'ch_1',livemode:false});
    if(path==='/v1/charges/ch_1')return Response.json({id:'ch_1',customer,payment_intent:'pi_1',amount:500,amount_refunded:refunded?500:0,refunded,disputed,livemode:false});
    if(path==='/v1/disputes')return Response.json({object:'list',has_more:false,data:disputed?[{id:'dp_1',charge:'ch_1',status:disputeWon?'won':'needs_response',livemode:false}]:[]});
    throw Error('Unexpected route '+path);
  }});
  return {...f,stripe,setStatus:v=>status=v,refund:()=>refunded=true,dispute:()=>disputed=true,winDispute:()=>disputeWon=true,fail:()=>failed=true,cleanCoverage:()=>clean=true,customer};
}
function request(f,type='invoice.paid',id='evt_1',alter=false,time=Math.floor(f.now()/1000)) {
  const payload=JSON.stringify({id,object:'event',api_version:STRIPE_API_VERSION,type,livemode:false,created:time,data:{object:{id:'in_1',object:'invoice',customer:f.customer}}});
  const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:f.env.STRIPE_WEBHOOK_SECRET,timestamp:time});
  return new Request(origin+'/api/billing/webhook',{method:'POST',headers:{'Stripe-Signature':signature},body:alter?payload+' ':payload});
}
test('webhook verifies original raw bytes and rejects altered/expired signatures without grants',async()=>{
  const f=setup();await f.store.saveMapping('a',{customerId:f.customer});
  assert.equal((await handleStripeWebhook(request(f,'invoice.paid','evt_bad',true),f)).status,400);
  assert.equal((await handleStripeWebhook(request(f,'invoice.paid','evt_old',false,Math.floor(f.now()/1000)-301),f)).status,400);
  assert.equal((await f.store.readAccount('a')).billing,null);
});
test('duplicate and old events reconcile authoritative current state without restoring canceled access',async()=>{
  const f=setup();await f.store.saveMapping('a',{customerId:f.customer});
  assert.equal((await handleStripeWebhook(request(f),f)).status,200);
  assert.equal((await f.store.readAccount('a')).billing.paidThrough,f.now()+86400000);
  assert.equal((await handleStripeWebhook(request(f),f)).status,200);
  f.setStatus('canceled');
  assert.equal((await handleStripeWebhook(request(f,'customer.subscription.deleted','evt_2'),f)).status,200);
  assert.ok((await f.store.readAccount('a')).billing.paidThrough<=f.now());
  assert.equal((await handleStripeWebhook(request(f,'invoice.paid','evt_delayed'),f)).status,200);
  assert.ok((await f.store.readAccount('a')).billing.paidThrough<=f.now());
});
test('covering refunded or disputed payments suspend paid coverage',async()=>{
  for(const type of ['refund','dispute']) {
    const f=setup();await f.store.saveMapping('a',{customerId:f.customer});
    if(type==='refund')f.refund();else f.dispute();
    assert.equal((await handleStripeWebhook(request(f),f)).status,200);
    const billing=(await f.store.readAccount('a')).billing;
    assert.equal(billing.status,'active');
    assert.equal(billing.paymentRisk,type==='refund'?'refunded':'disputed');
    assert.equal(billing.paidThrough,null);
  }
});
test('refunded old invoice does not invalidate independent clean paid coverage',async()=>{
  const f=setup();f.refund();f.cleanCoverage();
  const billing=await f.stripe.retrieveBillingSnapshot(f.customer);
  assert.equal(billing.status,'active');assert.equal(billing.paidThrough,f.now()+86400000);
});
test('Stripe or durable storage failure returns retryable failure',async()=>{
  const f=setup();await f.store.saveMapping('a',{customerId:f.customer});f.fail();
  assert.equal((await handleStripeWebhook(request(f),f)).status,503);
  assert.equal((await f.store.readAccount('a')).billing,null);
});
test('a won dispute restores only currently paid coverage',async()=>{
  const f=setup();await f.store.saveMapping('a',{customerId:f.customer});f.dispute();f.winDispute();
  assert.equal((await handleStripeWebhook(request(f,'charge.dispute.closed'),f)).status,200);
  assert.equal((await f.store.readAccount('a')).billing.status,'active');
});
