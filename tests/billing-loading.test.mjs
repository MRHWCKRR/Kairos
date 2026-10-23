
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createBillingRequester} from '../billing-request.js';
import {mountPlanUsage} from '../plan-usage.js';
import {createBillingHandlers} from '../server/billing.js';
const html=await readFile(new URL('../plans.html',import.meta.url),'utf8');
const status=()=>({access:{tier:'free',dailyLimit:10},usage:{used:0,remaining:10,bonusCredits:0},billing:{status:'none'},offers:[],codesEnabled:false,plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},trial:false});
test('failed initial status replaces Checking labels and provides a working retry beside feedback',async()=>{
  const {document}=parseHTML(html);let fail=true,calls=0;
  const module=mountPlanUsage({root:document.getElementById('plans-page'),auth:{currentUser:{uid:'a'}},request:async()=>{calls++;if(fail)throw Error('Plan service is temporarily unavailable.');return status();}});
  await module.refresh();
  for(const id of ['plan-free-cta','plan-plus-price','plan-plus-unavailable'])assert.doesNotMatch(document.getElementById(id).textContent,/checking/i);
  const retry=document.getElementById('plan-retry-btn');assert.ok(retry);assert.equal(retry.hidden,false);
  assert.ok(document.getElementById('plan-feedback').contains(document.getElementById('plan-message')));
  fail=false;retry.click();await new Promise(r=>setTimeout(r,0));
  assert.equal(calls,2);assert.equal(retry.hidden,true);assert.equal(document.getElementById('plan-tier').textContent,'Free');module.destroy();
});
test('a hung token request times out, releases the shared read and cannot send a late request',async()=>{
  let finish,calls=0;
  const user={uid:'a',emailVerified:true,getIdToken:()=>new Promise(r=>finish=r)};
  const request=createBillingRequester({getUser:()=>user,getAppToken:async()=>'app',fetchImpl:async()=>{calls++;return Response.json({ok:true});},timeoutMs:15});
  await assert.rejects(()=>request('status'),/took too long/i);
  user.getIdToken=async()=>'id';assert.deepEqual(await request('status'),{ok:true});
  finish('old');await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
});
test('timeout covers a stalled response body and never caches its late result',async()=>{
  let finish,calls=0;
  const user={uid:'a',emailVerified:true,getIdToken:async()=>'id'};
  const request=createBillingRequester({getUser:()=>user,getAppToken:async()=>'app',timeoutMs:15,fetchImpl:async()=>{
    calls++;return calls===1?{ok:true,json:()=>new Promise(r=>finish=r)}:Response.json({fresh:true});
  }});
  await assert.rejects(()=>request('status'),/took too long/i);finish({old:true});
  assert.deepEqual(await request('status'),{fresh:true});
});
test('Stripe price permission errors provide a useful message and safe stage-only diagnostics',async()=>{
  const diagnostics=[];
  const handlers=createBillingHandlers({env:{},store:{readAccount:async()=>({grants:[]})},stripe:{offers:async()=>{throw Object.assign(Error('SECRET credential and customer details'),{type:'StripePermissionError',statusCode:403,code:'secret_value'});}},usage:async()=>({used:0,remaining:100,bonusCredits:0}),adminAuth:{verifyIdToken:async()=>({uid:'a',email_verified:true})},appCheck:{verifyToken:async()=>({})},rateLimiter:{limit:async()=>({success:true})},reportDiagnostic:d=>diagnostics.push(d)});
  const r=await handlers.status(new Request('https://kairos.invalid/api/billing/status',{headers:{Authorization:'Bearer id','X-Firebase-AppCheck':'app'}}));
  assert.equal(r.status,503);const body=await r.json();assert.match(body.error,/pricing.*unavailable/i);assert.doesNotMatch(body.error,/API key|SECRET/);
  assert.equal(diagnostics[0].stage,'offers');assert.equal(diagnostics[0].type,'StripePermissionError');assert.doesNotMatch(JSON.stringify(diagnostics),/SECRET|secret_value|credential|customer details/);
});

test('timed-out App Check never starts a late purchase',async()=>{
  let finish,calls=0;
  const request=createBillingRequester({getUser:()=>({uid:'a',emailVerified:true,getIdToken:async()=>'id'}),getAppToken:()=>new Promise(r=>finish=r),fetchImpl:async()=>{calls++;return Response.json({});},timeoutMs:15});
  await assert.rejects(()=>request('checkout',{planId:'plus'}),/took too long/i);
  finish('late');await new Promise(r=>setTimeout(r,0));assert.equal(calls,0);
});
