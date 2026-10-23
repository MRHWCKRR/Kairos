import test from 'node:test';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {fixture} from './billing-store-fixture.mjs';
import {createBillingStore} from '../cloudflare/billing-store.js';
import {createStripeClient} from '../server/stripe-client.js';
import {createFirestore} from '../cloudflare/firebase-firestore.js';
import {handleStripeWebhook} from '../server/billing-webhook.js';
test('live billing cannot inherit sandbox customers, paid coverage or event deduplication',async()=>{
 const f=fixture({AI_BUDGET_SCOPE:'production',STRIPE_MODE:'test'});await f.store.saveMapping('a',{customerId:'cus_test'});await f.store.applyBillingSnapshot({uid:'a',snapshot:{status:'active',paidThrough:f.now()+86400000},eventId:'evt_same'});
 const live=createBillingStore({env:{...f.env,STRIPE_MODE:'live'},transport:f.transport,clock:f.now});assert.equal(await live.readMapping('a'),null);assert.equal((await live.readAccount('a')).billing,null);await live.saveMapping('a',{customerId:'cus_live'});await live.applyBillingSnapshot({uid:'a',snapshot:{status:'active',paidThrough:f.now()+86400000},eventId:'evt_same'});assert.equal((await f.store.readMapping('a')).customerId,'cus_test');assert.equal((await live.readMapping('a')).customerId,'cus_live');assert.notEqual(live.accountPath('a'),f.store.accountPath('a'));
});
test('staged live prices and key never affect test offers, and live mode uses only staged live bindings',async()=>{
 const env={BILLING_ENABLED:'true',BILLING_ORIGIN:'https://kairos-web.kirosapp.workers.dev',STRIPE_SECRET_KEY:['rk','test','fixture'].join('_'),STRIPE_PLUS_PRICE_ID:'price_test',STRIPE_LIVE_SECRET_KEY:['rk','live','fixture'].join('_'),STRIPE_LIVE_PLUS_PRICE_ID:'price_live'};
 const seen=[];const fetchImpl=async(url,options)=>{seen.push({url,authorization:new Headers(options.headers).get('Authorization')});const live=url.includes('price_live');return Response.json({id:live?'price_live':'price_test',active:true,livemode:live,currency:'aud',unit_amount:799,recurring:{interval:'month',interval_count:1}});};
 assert.equal((await createStripeClient({...env,STRIPE_MODE:'test'},{fetchImpl}).offers())[0].priceId,'price_test');assert.equal((await createStripeClient({...env,STRIPE_MODE:'live'},{fetchImpl}).offers())[0].priceId,'price_live');assert.match(seen[1].authorization,/rk_live_/);
 const missing={...env,STRIPE_MODE:'live'};delete missing.STRIPE_LIVE_SECRET_KEY;assert.equal(createStripeClient(missing).configured,false);
});
test('REST billing transport rejects documents belonging to the other Stripe mode before network access',async()=>{
 for(const mode of ['test','live']){let calls=0;const db=createFirestore({env:{FIREBASE_PROJECT_ID:'fixture',FIREBASE_CLIENT_EMAIL:'fixture@example.com',FIREBASE_PRIVATE_KEY:'fixture',AI_BUDGET_SCOPE:'production',STRIPE_MODE:mode},fetchImpl:async()=>{calls++;throw Error('Unexpected network');}});await assert.rejects(()=>db.billingTransport().get('kairosBillingAccounts/'+(mode==='test'?'production-live-x':'production-x')),/Invalid billing document path/);assert.equal(calls,0);}
});
test('live webhook can use the staged signing binding without requiring the sandbox secret',async()=>{
 const r=await handleStripeWebhook(new Request('https://kairos-web.kirosapp.workers.dev/api/billing/webhook',{method:'POST',body:'{}'}),{env:{STRIPE_MODE:'live',STRIPE_LIVE_WEBHOOK_SECRET:'fixture'},stripe:{mode:'live',verifyWebhook:async()=>({livemode:true,type:'ignored.test'})},store:{}});assert.equal(r.status,200);
});

test('live signatures use the staged live secret and reject signatures made with the sandbox secret',async()=>{
 const time=Date.now(),raw=JSON.stringify({id:'evt_live_fixture',livemode:true,type:'ignored.test'}),t=Math.floor(time/1000),env={STRIPE_MODE:'live',STRIPE_LIVE_SECRET_KEY:['rk','live','fixture'].join('_'),STRIPE_LIVE_WEBHOOK_SECRET:'live-signing-fixture',STRIPE_WEBHOOK_SECRET:'sandbox-signing-fixture'};const stripe=createStripeClient(env,{clock:()=>time});const sign=secret=>'t='+t+',v1='+createHmac('sha256',secret).update(t+'.'+raw).digest('hex');assert.equal((await stripe.verifyWebhook(raw,sign(env.STRIPE_LIVE_WEBHOOK_SECRET))).id,'evt_live_fixture');await assert.rejects(()=>stripe.verifyWebhook(raw,sign(env.STRIPE_WEBHOOK_SECRET)));
});
