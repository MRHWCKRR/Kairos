import Stripe from 'stripe';
import { createHmac } from 'node:crypto';
import { flag } from './plans.js';
export const STRIPE_API_VERSION='2026-09-30.endive';
function objectId(value) { return typeof value==='string'?value:value?.id; }
export function stripeSigningSecret(env) {return env.STRIPE_MODE==='live'?env.STRIPE_LIVE_WEBHOOK_SECRET:env.STRIPE_WEBHOOK_SECRET;}
export function createStripeClient(env,{store,fetchImpl=fetch,clock=Date.now}={}) {
  const mode=env.STRIPE_MODE||'test';
  if(!['test','live'].includes(mode)) throw Error('Invalid Stripe mode');
  const key=mode==='live'?env.STRIPE_LIVE_SECRET_KEY:env.STRIPE_SECRET_KEY;
  if(key && !new RegExp('^[sr]k_'+mode+'_').test(key)) throw Error('Stripe key mode mismatch');
  const origin=env.BILLING_ORIGIN;
  if(origin && !['https://kairos-web-preview.kirosapp.workers.dev','https://kairos-web.kirosapp.workers.dev','http://localhost:8787'].includes(origin)) throw Error('Invalid billing origin');
  const sdk=key?new Stripe(key,{apiVersion:STRIPE_API_VERSION,httpClient:Stripe.createFetchHttpClient(fetchImpl),timeout:10000,maxNetworkRetries:0}):null;
  const priceIds=mode==='live'?{month:env.STRIPE_LIVE_PLUS_PRICE_ID,year:env.STRIPE_LIVE_PLUS_YEARLY_PRICE_ID}:{month:env.STRIPE_PLUS_PRICE_ID,year:env.STRIPE_PLUS_YEARLY_PRICE_ID};
  const configured=Boolean(flag(env.BILLING_ENABLED)&&sdk&&(priceIds.month||priceIds.year)&&origin);
  function requireSdk() { if(!sdk) throw Error('Stripe unavailable');return sdk; }
  const idempotency=(uid,action)=>createHmac('sha256',env.ANALYTICS_HASH_SECRET).update((env.AI_BUDGET_SCOPE||'production')+'\0'+mode+'\0'+uid+'\0'+action).digest('hex');
  function checkMode(resource) { if(resource.livemode!==undefined && resource.livemode!==(mode==='live')) throw Error('Stripe resource mode mismatch'); }
  const knownPrices=new Set(Object.values(priceIds).filter(Boolean));
  async function verifyPrice(planId,interval='month') {
    if(planId!=='plus' || !Object.hasOwn(priceIds,interval) || !priceIds[interval]) throw Error('Invalid plan');
    const price=await requireSdk().prices.retrieve(priceIds[interval]);
    checkMode(price);
    if(!price.active || price.recurring?.interval!==interval || price.recurring.interval_count!==1 ||
       (price.recurring.usage_type && price.recurring.usage_type!=='licensed') ||
       !Number.isSafeInteger(price.unit_amount) || price.unit_amount<1 || !/^[a-z]{3}$/.test(price.currency||'')) throw Error('Invalid subscription price');
    return {planId:'plus',priceId:price.id,currency:price.currency,amount:price.unit_amount,interval};
  }
  async function ensureCustomer(uid,accountStore=store) {
    const store=accountStore;
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
    const session=await requireSdk().billingPortal.sessions.create({customer:mapping.customerId,return_url:origin+'/plans.html?billing=portal'});
    if(new URL(session.url).origin!=='https://billing.stripe.com') throw Error('Invalid Stripe portal URL');
    return {kind:'portal',url:session.url};
  }
  async function createCheckout(uid,planId,requestId,interval='month') {
    if(!configured) throw Error('Purchases unavailable');
    return store.withAccountLease(uid,async(store)=>{
      const price=await verifyPrice(planId,interval),customerId=await ensureCustomer(uid,store);
      const current=await subscriptions(customerId);
      if(current.some(subscription=>!['canceled','incomplete_expired'].includes(subscription.status))) return createPortal(uid);

      const mapping=await store.readMapping(uid);
      // Recover Stripe-side sessions even if a previous mapping write failed.
      const open=await sdk.checkout.sessions.list({customer:customerId,status:'open',limit:100,expand:['data.line_items']});
      if(open.has_more)throw Error('Too many open Checkout sessions');
      let reusable=null;
      for(const session of open.data) {
        checkMode(session);
        const lines=session.line_items;
        if(objectId(session.customer)!==customerId || session.status!=='open' || session.mode!=='subscription' ||
           lines?.has_more!==false || lines.data?.length!==1 || lines.data[0].quantity!==1 ||
           !knownPrices.has(objectId(lines.data[0].price)))throw Error('Unexpected Checkout session');
        if(objectId(lines.data[0].price)===price.priceId && !reusable)reusable=session;
        else {
          // A concurrent completion cannot be expired: stop before a new buy.
          const expired=await sdk.checkout.sessions.expire(session.id);
          checkMode(expired);
          if(expired.status!=='expired' || objectId(expired.customer)!==customerId)throw Error('Could not replace Checkout');
        }
      }
      if(reusable) {
        if(new URL(reusable.url).origin!=='https://checkout.stripe.com')throw Error('Invalid Checkout URL');
        await store.saveMapping(uid,{customerId,checkoutId:reusable.id,checkoutExpires:reusable.expires_at*1000,checkoutInterval:interval});
        return {kind:'checkout',url:reusable.url};
      }
      if(mapping.checkoutId && mapping.checkoutExpires>clock()) {
        const prior=await sdk.checkout.sessions.retrieve(mapping.checkoutId);
        checkMode(prior);
        if(objectId(prior.customer)!==customerId)throw Error('Invalid Checkout ownership');
        if(prior.status==='complete')return createPortal(uid);
        if(prior.status!=='expired')throw Error('Checkout state changed; retry shortly');
      }
      const suffix=Array.from(Buffer.from(idempotency(uid,'checkout:'+interval+':'+requestId),'hex').subarray(0,8),byte=>String.fromCharCode(97+byte%26)).join('');
      const session=await sdk.checkout.sessions.create({
        mode:'subscription',customer:customerId,line_items:[{price:price.priceId,quantity:1}],
        allow_promotion_codes:true,success_url:origin+'/plans.html?billing=return',cancel_url:origin+'/plans.html?billing=canceled',
        integration_identifier:'kairos-'+suffix
      },{idempotencyKey:idempotency(uid,'checkout:'+interval+':'+requestId)});
      checkMode(session);
      if(new URL(session.url).origin!=='https://checkout.stripe.com') throw Error('Invalid Checkout URL');
      await store.saveMapping(uid,{customerId,checkoutId:session.id,checkoutExpires:session.expires_at*1000,checkoutInterval:interval});
      return {kind:'checkout',url:session.url};
    });
  }
  return {
    configured,mode,sdk,verifyPrice,ensureCustomer,createCheckout,createPortal,subscriptions,checkMode,
    async offers() { return configured?Promise.all(Object.keys(priceIds).filter(interval=>priceIds[interval]).map(interval=>verifyPrice('plus',interval))):[]; },
    async retrieveBillingSnapshot(customerId) {
      const list=await subscriptions(customerId);
      const candidates=list.filter(subscription=>subscription.items?.data?.length===1 &&
        knownPrices.has(objectId(subscription.items.data[0].price)) && subscription.items.data[0].quantity===1);
      const ongoing=candidates.filter(subscription=>!['canceled','incomplete_expired'].includes(subscription.status));
      if(ongoing.length>1) throw Error('Duplicate subscriptions need operator attention');
      const selected=ongoing[0]||candidates.sort((a,b)=>(b.created||0)-(a.created||0))[0];
      if(!selected)return {status:'none',paidThrough:null,cancelAtPeriodEnd:false};
      const invoices=await sdk.invoices.list({customer:customerId,subscription:selected.id,status:'paid',created:{gte:Math.floor((clock()-400*86400000)/1000)},limit:100});
      if(invoices.has_more)throw Error('Too many invoices to reconcile');
      let paidThrough=0,risk=null;
      for(const invoice of invoices.data) {
        let invoiceRisk=null;
        checkMode(invoice);
        if(objectId(invoice.customer)!==customerId || objectId(invoice.parent?.subscription_details?.subscription)!==selected.id || invoice.status!=='paid')throw Error('Invalid invoice ownership');
        if(invoice.lines?.has_more || !Array.isArray(invoice.lines?.data))throw Error('Incomplete invoice lines');
        const covering=invoice.lines.data.filter(line=>
          knownPrices.has(objectId(line.pricing?.price_details?.price)) &&
          line.parent?.subscription_item_details?.subscription===selected.id &&
          line.parent.subscription_item_details.proration===false && Number.isSafeInteger(line.period?.end));
        const end=Math.max(0,...covering.map(line=>line.period.end*1000));
        if(end<=clock())continue;
        const payments=await sdk.invoicePayments.list({invoice:invoice.id,status:'paid',limit:100});
        if(payments.has_more)throw Error('Too many invoice payments');
        for(const payment of payments.data) {
          checkMode(payment);
          let charge;
          if(payment.payment?.type==='payment_intent') {
            const intent=await sdk.paymentIntents.retrieve(objectId(payment.payment.payment_intent));
            checkMode(intent);
            if(objectId(intent.customer)!==customerId)throw Error('Invalid payment customer');
            if(intent.latest_charge)charge=await sdk.charges.retrieve(objectId(intent.latest_charge));
          } else if(payment.payment?.type==='charge')charge=await sdk.charges.retrieve(objectId(payment.payment.charge));
          else throw Error('Unsupported invoice payment');
          if(charge) {
            checkMode(charge);
            if(objectId(charge.customer)!==customerId)throw Error('Invalid charge customer');
            if(charge.disputed) {
              const disputes=await sdk.disputes.list({charge:charge.id,limit:100});
              if(disputes.has_more || !disputes.data.length)throw Error('Incomplete dispute state');
              if(disputes.data.some(dispute=>dispute.status!=='won'))invoiceRisk='disputed';
            }
            if(charge.refunded || (charge.amount>0 && charge.amount_refunded>=charge.amount))invoiceRisk=invoiceRisk||'refunded';
          }
        }
        if(invoiceRisk)risk=risk||invoiceRisk;
        else paidThrough=Math.max(paidThrough,end);
      }
      if(selected.status==='canceled')paidThrough=Math.min(paidThrough,Number.isSafeInteger(selected.ended_at)?selected.ended_at*1000:clock());
      // Flexible portal cancellations use cancel_at while the classic flag stays false.
      const cancellationScheduled=selected.cancel_at_period_end===true || (Number.isSafeInteger(selected.cancel_at) && selected.cancel_at>0);
      return {status:selected.status,paymentRisk:risk,paidThrough:paidThrough||null,cancelAtPeriodEnd:cancellationScheduled,subscriptionId:selected.id,interval:selected.items.data[0].price?.recurring?.interval||
        (objectId(selected.items.data[0].price)===priceIds.year?'year':'month')};
    },
    async cancelAccountSubscriptions(customerId) {
      const open=await requireSdk().checkout.sessions.list({customer:customerId,status:'open',limit:100});
      if(open.has_more)throw Error('Too many open Checkout sessions');
      for(const session of open.data) {
        checkMode(session);
        if(objectId(session.customer)!==customerId)throw Error('Invalid Checkout ownership');
        try {await sdk.checkout.sessions.expire(session.id);}
        catch(error) {
          const latest=await sdk.checkout.sessions.retrieve(session.id);
          checkMode(latest);
          if(objectId(latest.customer)!==customerId || !['complete','expired'].includes(latest.status))throw error;
        }
      }
      const remaining=await sdk.checkout.sessions.list({customer:customerId,status:'open',limit:1});
      if(remaining.data.length || remaining.has_more)throw Error('Checkout still open');
      const list=await subscriptions(customerId);
      for(const subscription of list) {
        if(['canceled','incomplete_expired'].includes(subscription.status))continue;
        const result=await requireSdk().subscriptions.cancel(subscription.id,{invoice_now:false,prorate:false});
        if(result.status!=='canceled')throw Error('Subscription cancellation incomplete');
      }
      if((await subscriptions(customerId)).some(subscription=>!['canceled','incomplete_expired'].includes(subscription.status)))throw Error('Subscription still renewing');
    },
    async eventCustomer(event) {
      const object=event.data?.object;
      if(object?.customer)return objectId(object.customer);
      if(object?.charge) {
        const charge=await requireSdk().charges.retrieve(objectId(object.charge));checkMode(charge);
        return objectId(charge.customer);
      }
      if(object?.payment_intent) {
        const intent=await requireSdk().paymentIntents.retrieve(objectId(object.payment_intent));checkMode(intent);
        return objectId(intent.customer);
      }
      return null;
    },
    async verifyWebhook(raw,signature) {
      return requireSdk().webhooks.constructEventAsync(raw,signature,stripeSigningSecret(env),300,Stripe.createSubtleCryptoProvider(),clock());
    }
  };
}
