import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {PAGE_ROUTES,pageFromUrl} from '../page-router.js';
import {mountPlanUsage} from '../plan-usage.js';

const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
const status={access:{tier:'free',dailyLimit:100,accessUntil:null},usage:{used:2,remaining:98,bonusCredits:0,resetsAt:'2026-10-13T14:00:00Z'},billing:{status:'none'},plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},offers:[],codesEnabled:false,trial:true};

test('Plans has its own deep-linkable page outside Settings',()=>{
  const {document}=parseHTML(html);
  assert.equal(PAGE_ROUTES.plans,'plans-page');
  assert.equal(pageFromUrl('https://kairos.invalid/app.html?page=plans'),'plans-page');
  const root=document.getElementById('plans-page');
  assert.ok(root?.classList.contains('page-view'));
  assert.equal(document.getElementById('settings-page').contains(root),false);
  assert.equal(document.querySelector('[data-settings-tab="plan"]'),null);
  assert.equal(root.querySelectorAll('.plan-choice').length,2);
});

test('plan links and page close use workspace navigation callbacks without a reload',async()=>{
  const {document}=parseHTML(html);let opened=0,closed=0;
  const module=mountPlanUsage({root:document.getElementById('plans-page'),auth:{currentUser:{uid:'a'}},request:async()=>status,onOpenPlans:()=>opened++,onClosePlans:()=>closed++});
  document.querySelector('[data-view-plans]').click();
  document.getElementById('plan-back-btn').click();
  assert.equal(opened,1);assert.equal(closed,1);
  module.destroy();
});

test('the current plan and unavailable Plus state are clear without inventing a price',async()=>{
  const {document}=parseHTML(html),root=document.getElementById('plans-page');
  const module=mountPlanUsage({root,auth:{currentUser:{uid:'a'}},request:async()=>status});
  await module.refresh();
  assert.equal(document.getElementById('plan-free-current').hidden,false);
  assert.equal(document.getElementById('plan-plus-current').hidden,true);
  assert.equal(document.getElementById('plan-plus-price').textContent,'Coming soon');
  assert.equal(document.getElementById('plan-upgrade-btn').hidden,true);
  assert.equal(document.getElementById('plan-plus-unavailable').disabled,true);
  assert.equal(document.getElementById('plan-comparison-note').textContent,'');
  assert.equal(document.getElementById('plan-free-limit').textContent,'100');
  module.destroy();
});

test('paid Plus uses the verified currency price and clears account details on reset',async()=>{
  const {document}=parseHTML(html),root=document.getElementById('plans-page');
  const paid={...status,trial:false,access:{tier:'plus',dailyLimit:100},billing:{status:'active'},offers:[{planId:'plus',amount:1200,currency:'aud'}]};
  const module=mountPlanUsage({root,auth:{currentUser:{uid:'a'}},request:async()=>paid});
  await module.refresh();
  assert.equal(document.getElementById('plan-plus-current').hidden,false);
  assert.equal(document.getElementById('plan-free-current').hidden,true);
  assert.equal(document.getElementById('plan-plus-price').textContent,'$12.00');
  assert.equal(document.getElementById('plan-upgrade-btn').hidden,true);
  assert.equal(document.getElementById('plan-manage-btn').hidden,false);
  module.reset();
  assert.equal(document.getElementById('plan-plus-current').hidden,true);
  assert.equal(document.getElementById('plan-manage-btn').hidden,true);
  assert.equal(document.getElementById('plan-plus-price').textContent,'Checking availability…');
  module.destroy();
});
