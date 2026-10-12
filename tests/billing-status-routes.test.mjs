
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingHandlers} from '../server/billing.js';
function setup(){
  const keys=[],counts=new Map();
  const h=createBillingHandlers({env:{},store:{readAccount:async()=>({grants:[]})},
    stripe:{offers:async()=>[],createPortal:async()=>({url:'https://billing.stripe.com/test'})},
    adminAuth:{verifyIdToken:async()=>({uid:'a',email_verified:true,auth_time:Math.floor(Date.now()/1000)})},appCheck:{verifyToken:async()=>({})},
    usage:async()=>({used:0,remaining:100,bonusCredits:0}),
    rateLimiter:{limit:async({key})=>{keys.push(key);const count=(counts.get(key)||0)+1;counts.set(key,count);return {success:count<=1};}}});
  const req=route=>new Request('https://kairos.invalid/api/billing/'+route,{method:route==='status'?'GET':'POST',headers:{Authorization:'Bearer id','X-Firebase-AppCheck':'app'},...(route==='status'?{}:{body:'{}'})});
  return {h,req,keys};
}
test('status throttling supplies cooldown and leaves Portal allowance independent',async()=>{
  const {h,req,keys}=setup();assert.equal((await h.status(req('status'))).status,200);
  const status=await h.status(req('status'));assert.equal(status.status,429);assert.equal(status.headers.get('Retry-After'),'60');
  assert.equal((await h.portal(req('portal'))).status,200);assert.notEqual(keys[0],keys[2]);
  assert.equal((await h.portal(req('portal'))).status,429);
});
test('disabled purchases still expose trusted plan comparison and trial policy',async()=>{
  const {h,req}=setup(),status=await (await h.status(req('status'))).json();
  assert.equal(status.plans.free.dailyLimit,10);assert.equal(status.plans.plus.dailyLimit,100);
  assert.equal(status.trial,true);assert.deepEqual(status.offers,[]);assert.equal(status.billingMode,'test');
});
