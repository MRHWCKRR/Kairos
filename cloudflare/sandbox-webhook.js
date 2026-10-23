
import {readBoundedText} from '../server/http-body.js';
const target='https://kairos-web-preview.kirosapp.workers.dev/api/billing/webhook';
const error=(message,status)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
// Public Stripe ingress; only the existing signed webhook handler is reachable.
// Firebase/account routes and the preview UI remain behind Cloudflare Access.
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname!=='/api/billing/webhook'||url.search)return error('Not Found',404);
    if(request.method!=='POST')return error('Method Not Allowed',405);
    if(env.STRIPE_MODE!=='test'||env.AI_BUDGET_SCOPE!=='preview'||!env.BILLING_PREVIEW?.fetch)return error('Webhook unavailable',503);
    const signature=request.headers.get('Stripe-Signature');
    if(!signature||signature.length>4096)return error('Invalid webhook',400);
    try {
      const raw=await readBoundedText(request,256*1024);
      return await env.BILLING_PREVIEW.fetch(new Request(target,{
        method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature},body:raw,redirect:'manual'
      }));
    } catch(cause) {
      return error(cause.status===413?'Payload too large':'Webhook unavailable',cause.status===413?413:503);
    }
  }
};
