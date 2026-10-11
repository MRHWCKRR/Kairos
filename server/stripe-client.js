import Stripe from 'stripe';
import { randomBytes, createHmac } from 'node:crypto';
import { flag } from './plans.js';
export const STRIPE_API_VERSION='2026-09-30.endive';
function objectId(value) { return typeof value==='string'?value:value?.id; }
export function createStripeClient(env,{store,fetchImpl=fetch,clock=Date.now}={}) {
  const mode=env.STRIPE_MODE||'test';
  if(!['test','live'].includes(mode)) throw Error('Invalid Stripe mode');
  const key=env.STRIPE_SECRET_KEY;
  if(key && !new RegExp('^[sr]k_'+mode+'_').test(key)) throw Error('Stripe key mode mismatch');
  const origin=env.BILLING_ORIGIN;
  if(origin && !['https://kairos-web-preview.kirosapp.workers.dev','https://kairos-web.kirosapp.workers.dev','http://localhost:8787'].includes(origin)) throw Error('Invalid billing origin');
  const sdk=key?new Stripe(key,{apiVersion:STRIPE_API_VERSION,httpClient:Stripe.createFetchHttpClient(fetchImpl),timeout:10000,maxNetworkRetries:0}):null;
  const configured=Boolean(flag(env.BILLING_ENABLED)&&sdk&&env.STRIPE_PLUS_PRICE_ID&&origin);
  function requireSdk() { if(!sdk) throw Error('Stripe unavailable');return sdk; }
  const idempotency=(uid,action)=>createHmac('sha256',env.ANALYTICS_HASH_SECRET).update((env.AI_BUDGET_SCOPE||'production')+'\0'+mode+'\0'+uid+'\0'+action).digest('hex');
  function checkMode(resource) { if(resource.livemode!==undefined && resource.livemode!==(mode==='live')) throw Error('Stripe resource mode mismatch'); }
  async function verifyPrice(planId) {
    if(planId!=='plus' || !env.STRIPE_PLUS_PRICE_ID) throw Error('Invalid plan');
    const price=await requireSdk().prices.retrieve(env.STRIPE_PLUS_PRICE_ID);
    checkMode(price);
    if(!price.active || price.recurring?.interval!=='month' || price.recurring.interval_count!==1 ||
       !Number.isSafeInteger(price.unit_amount) || price.unit_amount<1 || !/^[a-z]{3}$/.test(price.currency||'')) throw Error('Invalid subscription price');
    return {planId:'plus',priceId:price.id,currency:price.currency,amount:price.unit_amount,interval:'month'};
  }
  async function ensureCustomer(uid) {
    if((await store.readAccount(uid)).deleting) throw Error('Account deleting');
    const mapping=await store.readMapping(uid);
    if(mapping) return mapping.customerId;
    const customer=await requireSdk().customers.create({}, {idempotencyKey:idempotency(uid,'customer')});
    checkMode(customer);
    await store.saveMapping(uid,{customerId:customer.id});
    return customer.id;
  }
  async function subscriptions(customerId) {
    const list=await requireSdk().subscriptions.list({customer:customerId,status:'all',limit:100});
    if(list.has_more) throw Error('Too many subscriptions to reconcile');
    for(const subscription of list.data) {
      checkMode(subscription);
      if(objectId(subscription.customer)!==customerId) throw Error('Unexpected subscription customer');
    }
    return list.data;
  }
  async function createPortal(uid) {
    const mapping=await store.readMapping(uid);
    if(!mapping || (await store.readAccount(uid)).deleting) throw Error('Billing account unavailable');
    const session=await requireSdk().billingPortal.sessions.create({customer:mapping.customerId,return_url:origin+'/app.html'});
    if(new URL(session.url).origin!=='https://billing.stripe.com') throw Error('Invalid Stripe portal URL');
    return {kind:'portal',url:session.url};
  }
  async function createCheckout(uid,planId,requestId) {
    if(!configured) throw Error('Purchases unavailable');
    return store.withAccountLease(uid,async()=>{
      const price=await verifyPrice(planId),customerId=await ensureCustomer(uid);
      const current=await subscriptions(customerId);
      if(current.some(subscription=>!['canceled','incomplete_expired'].includes(subscription.status))) return createPortal(uid);
      const mapping=await store.readMapping(uid);
      if(mapping.checkoutId && mapping.checkoutExpires>clock()) {
        const session=await sdk.checkout.sessions.retrieve(mapping.checkoutId);
        checkMode(session);
        if(objectId(session.customer)!==customerId) throw Error('Invalid Checkout ownership');
        if(session.status==='open') return {kind:'checkout',url:session.url};
      }
      const suffix=Array.from(randomBytes(8),byte=>String.fromCharCode(97+byte%26)).join('');
      const session=await sdk.checkout.sessions.create({
        mode:'subscription',customer:customerId,line_items:[{price:price.priceId,quantity:1}],
        allow_promotion_codes:true,success_url:origin+'/app.html?billing=return',cancel_url:origin+'/app.html?billing=canceled',
        integration_identifier:'kairos-'+suffix
      },{idempotencyKey:idempotency(uid,'checkout:'+requestId)});
      checkMode(session);
      if(new URL(session.url).origin!=='https://checkout.stripe.com') throw Error('Invalid Checkout URL');
      await store.saveMapping(uid,{customerId,checkoutId:session.id,checkoutExpires:session.expires_at*1000});
      return {kind:'checkout',url:session.url};
    });
  }
  return {
    configured,mode,sdk,verifyPrice,ensureCustomer,createCheckout,createPortal,subscriptions,checkMode,
    async offers() { return configured?[await verifyPrice('plus')]:[]; },
    async verifyWebhook(raw,signature) {
      return requireSdk().webhooks.constructEventAsync(raw,signature,env.STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider(),Math.floor(clock()/1000));
    }
  };
}
