
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import relay from '../cloudflare/sandbox-webhook.js';
const url='https://kairos-billing-sandbox-webhook.kirosapp.workers.dev/api/billing/webhook';
function setup(){const calls=[];return {calls,env:{STRIPE_MODE:'test',AI_BUDGET_SCOPE:'preview',BILLING_PREVIEW:{fetch:async req=>{calls.push(req);return Response.json({received:true});}}}};}
const request=(body='{}',headers={})=>new Request(url,{method:'POST',headers:{'Stripe-Signature':'t=123,v1=test','Content-Type':'application/json',...headers},body});
test('only the webhook POST route can reach the protected preview',async()=>{
  for(const [path,method] of [['/api/billing/status','POST'],['/app.html','POST'],['/api/billing/webhook','GET'],['/api/billing/webhook?path=/app.html','POST']]){
    const f=setup();const r=await relay.fetch(new Request(new URL(path,url),{method}),f.env);
    assert.ok([404,405].includes(r.status));assert.equal(f.calls.length,0);
  }
});
test('missing signatures and unsafe configuration fail before forwarding',async()=>{
  const f=setup(),missing=request();missing.headers.delete('Stripe-Signature');
  assert.equal((await relay.fetch(missing,f.env)).status,400);
  assert.equal((await relay.fetch(request(),{...f.env,STRIPE_MODE:'live'})).status,503);
  assert.equal((await relay.fetch(request(),{...f.env,AI_BUDGET_SCOPE:'production'})).status,503);
  assert.equal(f.calls.length,0);
});
test('the raw payload and signature survive, while browser credentials are stripped',async()=>{
  const f=setup(),body=' { "message": "café — test", "n": 1 }\\n';
  const r=await relay.fetch(request(body,{Cookie:'private',Authorization:'Bearer private','Cf-Access-Jwt-Assertion':'private'}),f.env);
  assert.equal(r.status,200);assert.equal(f.calls.length,1);
  const forwarded=f.calls[0];assert.equal(forwarded.url,'https://kairos-web-preview.kirosapp.workers.dev/api/billing/webhook');
  assert.equal(await forwarded.text(),body);assert.equal(forwarded.headers.get('Stripe-Signature'),'t=123,v1=test');
  for(const name of ['Cookie','Authorization','Cf-Access-Jwt-Assertion'])assert.equal(forwarded.headers.get(name),null);
});
test('oversized streamed payloads are rejected without trusting Content-Length',async()=>{
  const f=setup();assert.equal((await relay.fetch(request('x'.repeat(262145),{'Content-Length':'1'}),f.env)).status,413);assert.equal(f.calls.length,0);
});
test('the protected handler retains signature rejection and retryable failures',async()=>{
  const f=setup();f.env.BILLING_PREVIEW.fetch=async()=>Response.json({error:'Invalid webhook'},{status:400});
  assert.equal((await relay.fetch(request(),f.env)).status,400);
  f.env.BILLING_PREVIEW.fetch=async()=>{throw Error('private upstream detail');};
  const r=await relay.fetch(request(),f.env);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private/);
});
test('preview relay stays isolated while the main site uses sandbox billing',async()=>{
  const config=JSON.parse(await fs.readFile(new URL('../wrangler.sandbox-webhook.jsonc',import.meta.url),'utf8'));
  assert.equal(config.services[0].service,'kairos-web-preview');assert.equal(config.vars.STRIPE_MODE,'test');assert.equal(config.vars.AI_BUDGET_SCOPE,'preview');
  const app=JSON.parse(await fs.readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(app.vars.BILLING_ENABLED,'true');assert.equal(app.vars.STRIPE_MODE,'test');assert.equal(app.vars.AI_TIER_ENFORCEMENT,'true');
  assert.equal(app.vars.BILLING_ORIGIN,'https://kairos-web.kirosapp.workers.dev');
  assert.equal(app.vars.STRIPE_PLUS_PRICE_ID,'price_1U77RyPX3ScSvSEmRHfq8vUQ');
  assert.equal(app.vars.STRIPE_PLUS_YEARLY_PRICE_ID,'price_1UTdu1PX3ScSvSEmLQ08zosd');
  assert.equal(app.env.preview.vars.STRIPE_PLUS_YEARLY_PRICE_ID,'price_1UTdu1PX3ScSvSEmLQ08zosd');
});
