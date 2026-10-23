
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountPlanUsage} from '../plan-usage.js';
import {createStripeClient} from '../server/stripe-client.js';
import {createBillingHandlers} from '../server/billing.js';
import {fixture} from './billing-store-fixture.mjs';
const html=await readFile(new URL('../plans.html',import.meta.url),'utf8');
const status=()=>({access:{tier:'free',dailyLimit:10},usage:{used:2,remaining:8,bonusCredits:0},billing:{status:'none',paidThrough:null},trial:false,codesEnabled:false,billingMode:'test',plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},offers:[{planId:'plus',interval:'month',amount:1200,currency:'aud'},{planId:'plus',interval:'year',amount:12000,currency:'aud'}]});
const settle=()=>new Promise(r=>setTimeout(r,0));
function ui(request,options={}){
  const {document,window}=parseHTML(html),auth={currentUser:{uid:'a',emailVerified:true}},calls=[];
  const module=mountPlanUsage({root:document.getElementById('plans-page'),auth,request:async(...args)=>{calls.push(args);return request(...args);},navigate:()=>{},...options});
  return {document,window,auth,calls,module,find:id=>document.getElementById(id)};
}
function memory(saved){const values=new Map(saved?[['kairos_upgrade_pending',JSON.stringify(saved)]]:[]);return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('yearly selection shows the full yearly charge and sends that verified interval',async()=>{
  const s=status();let destination;
  const f=ui(async route=>route==='status'?s:{url:'https://checkout.stripe.com/test'},{navigate:url=>destination=url});
  await f.module.refresh();f.find('plan-interval-year').click();
  assert.equal(f.find('plan-interval-year').getAttribute('aria-pressed'),'true');
  assert.equal(f.find('plan-plus-price').textContent,'$120.00');
  assert.match(f.find('plan-plus-period').textContent,/year/);
  assert.match(f.find('plan-price-detail').textContent,/billed yearly/i);
  f.find('plan-upgrade-btn').click();f.find('plan-upgrade-btn').click();await settle();
  assert.equal(f.calls.filter(c=>c[0]==='checkout').length,1);
  assert.equal(f.calls.find(c=>c[0]==='checkout')[1].interval,'year');
  assert.match(destination,/checkout.stripe.com/);f.module.destroy();
});
test('an unavailable interval never borrows the monthly price or enables checkout',async()=>{
  const s=status();s.offers=s.offers.slice(0,1);
  const f=ui(async()=>s);await f.module.refresh();f.find('plan-interval-year').click();
  assert.equal(f.find('plan-upgrade-btn').hidden,true);
  assert.match(f.find('plan-plus-price').textContent,/unavailable/i);
  assert.match(f.find('plan-offer-status').textContent,/yearly/i);
  f.module.destroy();
});
test('canceled checkout clears purchase intent and offers a fresh attempt',async()=>{
  const storage=memory({uid:'a',startedAt:Date.now()});
  const f=ui(async()=>status(),{storage,returnUrl:'https://kairos.invalid/plans.html?billing=canceled'});
  await f.module.refresh();assert.match(f.find('plan-message').textContent,/checkout canceled/i);
  assert.equal(storage.getItem('kairos_upgrade_pending'),null);
  assert.equal(f.find('plan-welcome').hasAttribute('open'),false);f.module.destroy();
});
test('payment attention and scheduled cancellation show distinct actionable account states',async()=>{
  const s=status();s.billing={status:'past_due',paidThrough:null,cancelAtPeriodEnd:false};
  const f=ui(async()=>s);await f.module.refresh();
  assert.match(f.find('plan-billing-notice').textContent,/payment/i);
  assert.equal(f.find('plan-manage-btn').hidden,false);
  assert.equal(f.find('plan-upgrade-btn').hidden,true);
  s.access.tier='plus';s.billing={status:'active',paidThrough:Date.now()+86400000,cancelAtPeriodEnd:true};
  await f.module.refresh();assert.match(f.find('plan-billing-notice').textContent,/will end/i);f.module.destroy();
});
test('interval changes cannot mutate an in-flight checkout and stale offers require refresh',async()=>{
  let finish;const s=status();
  const f=ui(async route=>route==='status'?s:new Promise(r=>finish=r));
  await f.module.refresh();f.find('plan-upgrade-btn').click();await settle();
  f.find('plan-interval-year').click();
  assert.equal(f.find('plan-interval-month').getAttribute('aria-pressed'),'true');
  finish({url:'https://checkout.stripe.com/test'});await settle();f.module.destroy();
});
test('confirmation polling stops with useful pending feedback and no unverified celebration',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  const storage=memory({uid:'a',startedAt:100000}),s=status();
  const f=ui(async()=>s,{storage,returnUrl:'https://kairos.invalid/plans.html?billing=return'});
  await f.module.refresh();
  for(let i=0;i<6;i++){t.mock.timers.tick(2100);await Promise.resolve();await Promise.resolve();await Promise.resolve();}
  assert.match(f.find('plan-message').textContent,/still.*confirm|taking.*longer/i);
  assert.equal(f.find('plan-welcome').hasAttribute('open'),false);f.module.destroy();
});
function stripeSetup(extra={}){
  const f=fixture({BILLING_ENABLED:'true',BILLING_ORIGIN:'https://kairos-web-preview.kirosapp.workers.dev',STRIPE_MODE:'test',STRIPE_SECRET_KEY:['rk','test','fixture'].join('_'),STRIPE_PLUS_PRICE_ID:'price_month',STRIPE_PLUS_YEARLY_PRICE_ID:'price_year'});
  const payloads=[],expirations=[],sessions=new Map();let n=0,subscribed=false;
  const stripe=createStripeClient(f.env,{store:f.store,clock:f.now,fetchImpl:async(url,options)=>{
    const u=new URL(url),path=u.pathname;
    if(path.startsWith('/v1/prices/')){const yearly=path.endsWith('price_year');return Response.json({id:yearly?'price_year':'price_month',active:true,livemode:false,currency:'aud',unit_amount:yearly?12000:1200,recurring:{interval:yearly?'year':'month',interval_count:1,usage_type:'licensed'},...extra.price});}
    if(path==='/v1/customers')return Response.json({id:'cus_owner',livemode:false});
    if(path==='/v1/subscriptions')return Response.json({has_more:false,data:subscribed?[{id:'sub_1',customer:'cus_owner',status:'active'}]:[]});
    if(path==='/v1/checkout/sessions'&&options.method==='GET')return Response.json({has_more:false,data:[...sessions.values()].filter(s=>s.status==='open')});
    if(path==='/v1/checkout/sessions'){const p=new URLSearchParams(options.body);payloads.push({params:p,key:options.headers['Idempotency-Key']||options.headers['idempotency-key']});const session={id:'cs_'+(++n),url:'https://checkout.stripe.com/test/'+n,customer:'cus_owner',livemode:false,status:'open',mode:'subscription',line_items:{has_more:false,data:[{price:p.get('line_items[0][price]'),quantity:1}]},expires_at:Math.floor(f.now()/1000)+1800};sessions.set(session.id,session);return Response.json(session);}
    if(/\/expire$/.test(path)){const id=path.split('/').at(-2);expirations.push(id);if(extra.expireFails)throw Error('Session already complete');sessions.get(id).status='expired';return Response.json(sessions.get(id));}
    if(path.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(path.split('/').at(-1)));
    if(path==='/v1/billing_portal/sessions'){const p=new URLSearchParams(options.body);assert.match(p.get('return_url'),/plans.html\?billing=portal$/);return Response.json({url:'https://billing.stripe.com/test'});}
    throw Error('Unexpected '+path);
  }});
  const handlers=createBillingHandlers({env:f.env,store:f.store,stripe,clock:f.now,usage:async()=>({used:0,remaining:10,bonusCredits:0}),adminAuth:{verifyIdToken:async()=>({uid:'a',email_verified:true})},appCheck:{verifyToken:async()=>({})},rateLimiter:{limit:async()=>({success:true})}});
  return {...f,stripe,handlers,payloads,expirations,subscribe:()=>subscribed=true};
}
test('server verifies both recurring prices and rejects arbitrary intervals before Stripe work',async()=>{
  const f=stripeSetup();assert.deepEqual((await f.stripe.offers()).map(o=>o.interval),['month','year']);
  const req=new Request('https://kairos.invalid/api/billing/checkout',{method:'POST',headers:{Authorization:'Bearer id','X-Firebase-AppCheck':'app'},body:JSON.stringify({planId:'plus',interval:'week',requestId:'a'})});
  assert.equal((await f.handlers.checkout(req)).status,400);assert.equal(f.payloads.length,0);
});
test('switching billing interval expires the old checkout and reuses only a matching new session',async()=>{
  const f=stripeSetup();await f.stripe.createCheckout('a','plus','attempt','month');
  await f.stripe.createCheckout('a','plus','attempt','year');
  await f.stripe.createCheckout('a','plus','retry','year');
  assert.equal(f.payloads.length,2);assert.deepEqual(f.expirations,['cs_1']);
  assert.equal(f.payloads[1].params.get('line_items[0][price]'),'price_year');
  assert.match(f.payloads[1].params.get('success_url'),/plans.html\?billing=return$/);
  assert.match(f.payloads[1].params.get('cancel_url'),/plans.html\?billing=canceled$/);
});
test('a checkout that cannot be expired never creates a competing subscription',async()=>{
  const f=stripeSetup({expireFails:true});await f.stripe.createCheckout('a','plus','first','month');
  await assert.rejects(()=>f.stripe.createCheckout('a','plus','second','year'));
  assert.equal(f.payloads.length,1);
});
test('yearly offers reject a mismatched, metered or live price',async()=>{
  for(const price of [{recurring:{interval:'month',interval_count:1}},{recurring:{interval:'year',interval_count:1,usage_type:'metered'}},{livemode:true}]){
    const f=stripeSetup({price});await assert.rejects(()=>f.stripe.verifyPrice('plus','year'));
  }
});

test('changing intervals after a refresh failure keeps checkout disabled',async()=>{
  let fail=false;const f=ui(async()=>{if(fail)throw Error('Offline');return status();});
  await f.module.refresh();fail=true;await f.module.refresh();f.find('plan-interval-year').click();
  assert.equal(f.find('plan-upgrade-btn').disabled,true);assert.match(f.find('plan-message').textContent,/last update/i);f.module.destroy();
});
test('a withdrawn yearly offer never starts checkout from stale displayed pricing',async()=>{
  const s=status();const f=ui(async()=>s);await f.module.refresh();f.find('plan-interval-year').click();s.offers=s.offers.slice(0,1);
  f.find('plan-upgrade-btn').click();await settle();
  assert.equal(f.calls.filter(c=>c[0]==='checkout').length,0);assert.match(f.find('plan-message').textContent,/unavailable/i);f.module.destroy();
});
test('an active monthly subscriber is sent to their portal when choosing yearly',async()=>{
  const f=stripeSetup();await f.stripe.createCheckout('a','plus','month','month');f.subscribe();
  assert.equal((await f.stripe.createCheckout('a','plus','year','year')).kind,'portal');assert.equal(f.payloads.length,1);
});
test('annual invoices older than two months retain coverage and refunds remove it',async()=>{
  const f=fixture({STRIPE_MODE:'test',STRIPE_SECRET_KEY:['rk','test','fixture'].join('_'),STRIPE_PLUS_PRICE_ID:'price_month',STRIPE_PLUS_YEARLY_PRICE_ID:'price_year'});
  const customer='cus_annual',created=Math.floor(f.now()/1000)-200*86400,end=created+365*86400;let refunded=false;
  const stripe=createStripeClient(f.env,{store:f.store,clock:f.now,fetchImpl:async url=>{
    const u=new URL(url);
    if(u.pathname==='/v1/subscriptions')return Response.json({has_more:false,data:[{id:'sub_year',customer,status:'active',livemode:false,items:{data:[{price:{id:'price_year',recurring:{interval:'year'}},quantity:1}]}}]});
    if(u.pathname==='/v1/invoices'){
      assert.ok(Number(u.searchParams.get('created[gte]'))<=created,'annual invoice remains inside reconciliation window');
      return Response.json({has_more:false,data:[{id:'in_year',status:'paid',customer,livemode:false,parent:{subscription_details:{subscription:'sub_year'}},lines:{has_more:false,data:[{pricing:{price_details:{price:'price_year'}},parent:{subscription_item_details:{subscription:'sub_year',proration:false}},period:{end}}]}}]});
    }
    if(u.pathname==='/v1/invoice_payments')return Response.json({has_more:false,data:[{payment:{type:'charge',charge:'ch_year'},livemode:false}]});
    if(u.pathname==='/v1/charges/ch_year')return Response.json({customer,livemode:false,amount:12000,amount_refunded:refunded?12000:0,refunded,disputed:false});
    throw Error('Unexpected '+u.pathname);
  }});
  const paid=await stripe.retrieveBillingSnapshot(customer);assert.equal(paid.interval,'year');assert.equal(paid.paidThrough,end*1000);
  refunded=true;const refund=await stripe.retrieveBillingSnapshot(customer);assert.equal(refund.paidThrough,null);assert.equal(refund.paymentRisk,'refunded');
});

test('a saved customer with a lost checkout mapping cannot keep two intervals open',async()=>{
  const f=stripeSetup(),commit=f.transport.commit;let failed=false;
  f.transport.commit=async writes=>{if(!failed&&writes.some(w=>w.data?.checkoutId)){failed=true;throw Error('Mapping response lost');}return commit(writes);};
  await assert.rejects(()=>f.stripe.createCheckout('a','plus','first','month'));
  await f.stripe.createCheckout('a','plus','second','year');
  assert.deepEqual(f.expirations,['cs_1'],'recover and expire the unmapped open session before yearly checkout');
});
