import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountPlanUsage} from '../plan-usage.js';
const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
const state=()=>({access:{tier:'free',dailyLimit:10,features:[],accessUntil:null},usage:{used:2,remaining:8,resetsAt:'2026-10-11T14:00:00Z',bonusCredits:0},billing:{status:'none',paidThrough:null,cancelAtPeriodEnd:false},offers:[],codesEnabled:true,trial:false});
function setup(request=async()=>state()) {
  const {document,window}=parseHTML(html),auth={currentUser:{uid:'a',emailVerified:true}};
  const root=document.querySelector('#settings-plan');
  const module=mountPlanUsage({root,auth,request,onStatus:()=>{},navigate:url=>{throw Error('unexpected redirect '+url);}});
  return {root,module,auth,window,find:id=>document.getElementById(id)};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('plan UI shows actual allowance and disables unavailable purchases',async()=>{
  const f=setup();await f.module.refresh();
  assert.equal(f.find('plan-daily-remaining').textContent,'8');
  assert.equal(f.find('plan-upgrade-btn').hidden,true);
  assert.equal(f.find('plan-tier').textContent,'Free');
  f.module.destroy();
});
test('paid code terms are visible before redemption and grants show expiry',async()=>{
  let calls=0,finish;
  const pending=new Promise(resolve=>finish=resolve);
  const status=state();status.billing={status:'active',paidThrough:Date.parse('2026-11-11T12:00:00Z'),cancelAtPeriodEnd:false};status.access.tier='plus';
  const f=setup(async(route)=>{if(route==='redeem'){calls++;await pending;return {grant:{expiresAt:Date.parse('2026-12-11T12:00:00Z')},billingContinues:true};}return status;});
  await f.module.refresh();
  assert.match(f.find('plan-code-hint').textContent,/do not change subscription billing/i);
  f.find('plan-code-input').value='ABCD-EFGH-1234-5678-ABCD-EFGH-1234-5678';
  f.find('plan-code-form').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  f.find('plan-code-form').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  assert.equal(calls,1);assert.equal(f.find('plan-code-btn').disabled,true);
  finish();await settle();
  assert.match(f.find('plan-message').textContent,/11 Dec 2026/);
  f.module.destroy();
});
test('stale account status never renders after account switch',async()=>{
  let finish;const pending=new Promise(resolve=>finish=resolve);
  const f=setup(()=>pending),refresh=f.module.refresh();
  f.auth.currentUser={uid:'b',emailVerified:true};finish(state());await refresh;
  assert.equal(f.find('plan-daily-remaining').textContent,'—');f.module.destroy();
});
test('signed-out, failed loading and invalid redemption states are visible',async()=>{
  const f=setup(async route=>{throw Error(route==='redeem'?'This code is invalid or unavailable.':'Plan service is temporarily unavailable.');});
  f.auth.currentUser=null;await f.module.refresh();assert.match(f.find('plan-message').textContent,/sign in/i);
  f.auth.currentUser={uid:'a',emailVerified:true};await f.module.refresh();assert.match(f.find('plan-message').textContent,/unavailable/i);
  f.module.destroy();
});
