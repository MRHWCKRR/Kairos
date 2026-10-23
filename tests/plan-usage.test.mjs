import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import * as planUsage from '../plan-usage.js';
const {mountPlanUsage}=planUsage;
const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
const state=()=>({access:{tier:'free',dailyLimit:10,features:[],accessUntil:null},usage:{used:2,remaining:8,resetsAt:'2026-10-11T14:00:00Z',bonusCredits:0},billing:{status:'none',paidThrough:null,cancelAtPeriodEnd:false},offers:[],codesEnabled:true,trial:false});
function setup(request=async()=>state(),options={}) {
  const {document,window}=parseHTML(html),auth={currentUser:{uid:'a',emailVerified:true}};
  const root=document.querySelector('#plans-page');
  const module=mountPlanUsage({root,auth,request,onStatus:()=>{},navigate:url=>{throw Error('unexpected redirect '+url);},...options});
  return {root,module,auth,window,find:id=>document.getElementById(id)};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
const paidState=()=>({...state(),access:{tier:'plus',dailyLimit:100,features:[],accessUntil:Date.now()+86400000},billing:{status:'active',paidThrough:Date.now()+86400000,cancelAtPeriodEnd:false}});
test('Personal Account shows the verified plan and clears it on sign out',async()=>{
  const f=setup(async()=>paidState());await f.module.refresh();
  assert.ok(f.find('settings-account-plan'),'Account has a plan summary');assert.equal(f.find('settings-account-plan').textContent,'Kairos Plus');
  assert.ok(f.find('settings-personal').contains(f.find('settings-account-plan')));
  f.auth.currentUser=null;await f.module.refresh();assert.equal(f.find('settings-account-plan').textContent,'—');f.module.destroy();
});
test('checkout return waits for paid coverage then welcomes once with a useful action',async()=>{
  const storage=memoryStorage();let destination,explored=0,status=state();status.offers=[{planId:'plus',currency:'aud',amount:500}];
  const purchase=setup(async route=>route==='checkout'?{url:'https://checkout.stripe.com/c/pay/cs_test_example'}:status,{storage,navigate:url=>destination=url});
  await purchase.module.refresh();purchase.find('plan-upgrade-btn').click();await settle();assert.match(destination,/checkout.stripe.com/);purchase.module.destroy();
  const returned=setup(async()=>status,{storage,returnUrl:'https://kairos.invalid/app.html?billing=return',onExplore:()=>explored++});
  await returned.module.refresh();assert.ok(returned.find('plan-welcome'),'Upgrade has a welcome dialog');assert.equal(returned.find('plan-welcome').hasAttribute('open'),false);assert.match(returned.find('plan-message').textContent,/confirming your upgrade/i);
  status=paidState();await returned.module.refresh();assert.equal(returned.find('plan-welcome').hasAttribute('open'),true);
  assert.match(returned.find('plan-welcome-benefit').textContent,/100/);
  returned.find('plan-welcome-start').click();assert.equal(explored,1);assert.equal(returned.find('plan-welcome').hasAttribute('open'),false);
  await returned.module.refresh();assert.equal(returned.find('plan-welcome').hasAttribute('open'),false);returned.module.destroy();
  const revisit=setup(async()=>status,{storage,returnUrl:'https://kairos.invalid/app.html?billing=return'});await revisit.module.refresh();assert.equal(revisit.find('plan-welcome').hasAttribute('open'),false);revisit.module.destroy();
});
test('a return URL alone or access code never celebrates an unconfirmed purchase',async()=>{
  for(const billing of [{status:'active',paidThrough:null},{status:'none',paidThrough:null}]){
    const status=paidState();status.billing=billing;
    const f=setup(async()=>status,{storage:memoryStorage(),returnUrl:'https://kairos.invalid/app.html?billing=return'});await f.module.refresh();
    assert.ok(f.find('plan-welcome'),'Welcome is available without granting access');assert.equal(f.find('plan-welcome').hasAttribute('open'),false);f.module.destroy();
  }
});
test('pending purchase and welcome stay bound to the purchasing account',async()=>{
  const storage=memoryStorage();const offer=state();offer.offers=[{planId:'plus',currency:'aud',amount:500}];
  const purchase=setup(async route=>route==='checkout'?{url:'https://checkout.stripe.com/c/pay/cs_test_example'}:offer,{storage,navigate:()=>{}});
  await purchase.module.refresh();purchase.find('plan-upgrade-btn').click();await settle();purchase.module.destroy();
  const other=setup(async()=>paidState(),{storage,returnUrl:'https://kairos.invalid/app.html?billing=return'});other.auth.currentUser={uid:'b'};
  await other.module.refresh();assert.equal(other.find('plan-welcome').hasAttribute('open'),false);other.module.destroy();
  const owner=setup(async()=>paidState(),{storage,returnUrl:'https://kairos.invalid/app.html?billing=return'});await owner.module.refresh();assert.equal(owner.find('plan-welcome').hasAttribute('open'),true);
  owner.auth.currentUser=null;await owner.module.refresh();assert.equal(owner.find('plan-welcome').hasAttribute('open'),false);owner.module.destroy();
});
test('JPY offers show the amount Stripe charges',async()=>{
  const status=state();status.offers=[{planId:'plus',currency:'jpy',amount:1000}];
  const f=setup(async()=>status);await f.module.refresh();
  assert.match(f.find('plan-upgrade-btn').textContent,/1,000/);f.module.destroy();
});
test('payment risk does not hide an active subscriptions renewal warning',async()=>{
  const status=state();status.billing={status:'active',paymentRisk:'refunded',paidThrough:null,cancelAtPeriodEnd:false};
  const f=setup(async()=>status);await f.module.refresh();
  assert.match(f.find('plan-code-hint').textContent,/renewal continues/);f.module.destroy();
});
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

test('only a meaningful Free account limit offers a contextual plan action',async()=>{
  const status={...state(),plans:{free:{dailyLimit:10},plus:{dailyLimit:100}}};
  const f=setup(async()=>status),messages=f.find('ai-chat-messages');await f.module.refresh();
  const renderNotice=reason=>{
    messages.innerHTML='<div class="ai-chat-bubble-row assistant"><div class="ai-chat-bubble">Limit reached</div></div>';
    planUsage.appendPlanLimitActions?.(messages,[{limit:{reason,resetsAt:new Date(Date.now()+86400000).toISOString()}}]);
    return messages.querySelector('[data-plan-limit-action]');
  };
  assert.equal(renderNotice('daily-account')?.hidden,false);assert.equal(renderNotice('daily-site'),null);
  status.access.tier='plus';await f.module.refresh();assert.equal(renderNotice('daily-account')?.hidden,true);
  status.access.tier='free';status.trial=true;await f.module.refresh();assert.equal(renderNotice('daily-account')?.hidden,true);f.module.destroy();
});
test('near-limit notice follows useful successful usage and stays dismissed for the day',async()=>{
  const status={...state(),plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},usage:{...state().usage,used:8,remaining:2}};
  const f=setup(async()=>status,{storage:memoryStorage()});await f.module.refresh();assert.equal(f.find('ai-plan-notice').hidden,true);
  f.module.usageChanged({success:true});await f.module.refresh();assert.equal(f.find('ai-plan-notice').hidden,false);
  f.find('ai-plan-notice-dismiss').click();await f.module.refresh();assert.equal(f.find('ai-plan-notice').hidden,true);f.module.destroy();
});
test('a temporary refresh failure preserves the same accounts verified plan',async()=>{
  let failed=false;
  const f=setup(async()=>{if(failed)throw Object.assign(Error('Please try again shortly.'),{status:429,retryAt:Date.now()+60000});return paidState();});
  await f.module.refresh();failed=true;await f.module.refresh();
  assert.equal(f.find('settings-account-plan').textContent,'Kairos Plus');assert.equal(f.find('plan-manage-btn').hidden,false);
  assert.match(f.find('plan-message').textContent,/last update/i);assert.equal(f.find('plan-upgrade-btn').disabled,true);f.module.destroy();
});
test('unavailable checkout explains Plus instead of hiding plan discovery',async()=>{
  const status={...state(),access:{...state().access,dailyLimit:100},trial:true,plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},billingMode:'test'};
  const f=setup(async()=>status);await f.module.refresh();
  assert.match(f.find('plan-offer-status')?.textContent||'',/coming soon/i);
  assert.equal(f.find('plan-comparison-note')?.textContent,'');
  assert.equal(f.find('plan-free-limit')?.textContent,'100');assert.equal(f.find('plan-plus-limit')?.textContent,'100');f.module.destroy();
});
test('sandbox purchase is labelled and uses a fresh verified offer',async()=>{
  const status={...state(),billingMode:'test',offers:[{planId:'plus',currency:'aud',amount:500}]};
  let fresh=false,navigated=false;
  const f=setup(async(route,body,options)=>{if(route==='status'){fresh ||= options?.fresh===true;return status;}return{url:'https://checkout.stripe.com/test'};},{navigate:()=>navigated=true});
  await f.module.refresh();assert.match(f.find('plan-upgrade-btn').textContent,/Test checkout/);
  f.find('plan-upgrade-btn').click();await settle();assert.equal(fresh,true);assert.equal(navigated,true);f.module.destroy();
});
test('successful AI usage during a slow status schedules a follow-up refresh',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  let finish,calls=0;
  const status={...state(),plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},usage:{...state().usage,used:7,remaining:3}};
  const f=setup(async()=>{calls++;return calls===1?new Promise(resolve=>finish=resolve):{...status,usage:{...status.usage,used:8,remaining:2}};},{storage:memoryStorage()});
  const initial=f.module.refresh();f.module.usageChanged({success:true});
  t.mock.timers.tick(400);finish(status);await initial;
  t.mock.timers.tick(10001);await Promise.resolve();await Promise.resolve();
  assert.equal(calls,2);assert.equal(f.find('plan-used').textContent,'8');assert.equal(f.find('ai-plan-notice').hidden,false);f.module.destroy();
});


test('weekly allowance and remaining usage render and clear on sign out',async()=>{
 const status=state();status.access.weeklyLimit=50;status.usage.weeklyUsed=42;status.usage.weeklyRemaining=8;status.usage.weeklyResetsAt='2026-10-26T00:00:00Z';status.plans={free:{dailyLimit:15,weeklyLimit:50},plus:{dailyLimit:50,weeklyLimit:350}};
 const f=setup(async()=>status);await f.module.refresh();assert.equal(f.find('plan-weekly-used')?.textContent,'42');assert.equal(f.find('plan-weekly-allowance')?.textContent,'50');assert.equal(f.find('plan-free-weekly-limit')?.textContent,'50');assert.equal(f.find('plan-plus-weekly-limit')?.textContent,'350');f.auth.currentUser=null;await f.module.refresh();assert.equal(f.find('plan-weekly-used').textContent,'—');f.module.destroy();
});
