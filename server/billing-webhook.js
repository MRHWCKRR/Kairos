import { readBoundedText } from './http-body.js';
import { STRIPE_API_VERSION, stripeSigningSecret } from './stripe-client.js';
const supported=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed',
  'invoice.paid','invoice.payment_failed','invoice.payment_action_required','charge.refunded','charge.dispute.created','charge.dispute.closed','charge.dispute.updated',
  'refund.created','refund.updated','refund.failed','radar.early_fraud_warning.created']);
function response(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
export async function handleStripeWebhook(request,{env,stripe,store}) {
  if(request.method!=='POST')return response({error:'Method Not Allowed'},405);
  if(!stripeSigningSecret(env))return response({error:'Webhook unavailable'},503);
  let event;
  try {
    const raw=await readBoundedText(request,256*1024);
    event=await stripe.verifyWebhook(raw,request.headers.get('Stripe-Signature'));
  } catch(error){return response({error:'Invalid webhook'},error.status===413?413:400);}
  if(event.livemode!==(stripe.mode==='live'))return response({error:'Webhook mode mismatch'},400);
  if(!supported.has(event.type))return response({received:true,ignored:true});
  if(event.api_version!==STRIPE_API_VERSION || !/^evt_[a-zA-Z0-9_]+$/.test(event.id||''))return response({error:'Webhook configuration mismatch'},503);
  try {
    const customer=await stripe.eventCustomer(event);
    if(!customer)return response({received:true,ignored:true});
    if(await store.isDeletedCustomer(customer)) {
      await stripe.cancelAccountSubscriptions(customer);
      return response({received:true});
    }
    const uid=await store.customerUid(customer);
    if(!uid){
      if(await store.isDeletedCustomer(customer))await stripe.cancelAccountSubscriptions(customer);
      return response({received:true,ignored:true});
    }
    await store.withAccountLease(uid,async(store)=>{
      if((await store.readAccount(uid)).deleting){await stripe.cancelAccountSubscriptions(customer);return;}
      const snapshot=await stripe.retrieveBillingSnapshot(customer);
      await store.applyBillingSnapshot({uid,snapshot,eventId:event.id});
    });
    return response({received:true});
  }catch {return response({error:'Webhook processing unavailable; retry delivery.'},503);}
}
