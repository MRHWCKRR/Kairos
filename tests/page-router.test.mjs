import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {mountPageRouter,pageFromUrl,pageUrl} from '../page-router.js';
import {mountPlanUsage} from '../plan-usage.js';
const html=await readFile(new URL('../app.html',import.meta.url),'utf8');

function setup(href='https://kairos.invalid/app.html?billing=return&page=schedule',preparePage=async()=>{}) {
  const {document,window}=parseHTML(html),visits=[],writes=[];
  window.location={href,reload:()=>{}};window.history={state:{checkout:'preserved'},pushState(state,_,url){writes.push(['push',state,url]);window.location.href=url;},replaceState(state,_,url){writes.push(['replace',state,url]);window.location.href=url;}};
  window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;window.requestAnimationFrame=fn=>fn();
  return {document,window,visits,writes,router:mountPageRouter({document,window,preparePage,onNavigate:page=>visits.push(page)})};
}

test('routes keep billing return query and existing history state', async()=>{
  const f=setup();await f.router.start();await f.router.navigate('ai-page');
  assert.equal(f.document.querySelector('.page-view.active').id,'ai-page');
  assert.equal(new URL(f.window.location.href).searchParams.get('billing'),'return');
  assert.deepEqual(f.writes.at(-1)[1],{checkout:'preserved'});
  assert.equal(pageFromUrl(f.window.location.href),'ai-page');
  assert.equal(f.document.querySelector('[data-target="ai-page"]').getAttribute('aria-current'),'page');
});

test('Back and Forward restore the selected page without creating history entries',async()=>{
  const f=setup();await f.router.start();await f.router.navigate('tasks-page');const count=f.writes.length;
  f.window.location.href='https://kairos.invalid/app.html?billing=return&page=schedule';
  f.window.dispatchEvent(new f.window.Event('popstate'));await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.document.querySelector('.page-view.active').id,'schedule-page');assert.equal(f.writes.length,count);
});

test('an older slow navigation never replaces the latest page',async()=>{
  let finish;const pending=new Promise(resolve=>finish=resolve);
  const f=setup('https://kairos.invalid/app.html',page=>page==='ai-page'?pending:Promise.resolve());await f.router.start();
  const navigation=f.router.navigate('ai-page');await f.router.navigate('tasks-page');finish();await navigation;
  assert.equal(f.document.querySelector('.page-view.active').id,'tasks-page');
  assert.equal(f.document.querySelector('.page-view.active').getAttribute('aria-busy'),null);
});

test('unknown routes fall back to dashboard and URLs preserve unrelated state',()=>{
  assert.equal(pageFromUrl('https://kairos.invalid/app.html?page=unknown'),'home-page');
  assert.equal(pageFromUrl('https://kairos.invalid/app.html?page=constructor'),'home-page');
  assert.equal(pageUrl('https://kairos.invalid/app.html?billing=return#existing','settings-page').hash,'#existing');
});

test('page switching retains drafts and a failed workspace leaves other pages usable',async()=>{
  const f=setup('https://kairos.invalid/app.html',async page=>{if(page==='schedule-page')throw Error('offline');});
  const input=f.document.getElementById('ai-chat-input');input.value='Unsent draft';
  await f.router.start();
  const warn=console.warn;console.warn=()=>{};
  try {await f.router.navigate('schedule-page');}finally{console.warn=warn;}
  const schedule=f.document.getElementById('schedule-page');
  assert.match(schedule.textContent,/could not load/);assert.equal(schedule.inert,false);
  await f.router.navigate('ai-page');
  assert.equal(f.document.getElementById('ai-chat-input'),input);assert.equal(input.value,'Unsent draft');
  assert.equal(f.document.querySelector('.page-view.active').inert,false);
});

test('checkout confirmation continues through page switching and keeps the current route',async()=>{
  const f=setup('https://kairos.invalid/app.html?billing=return&page=settings');
  const values=new Map([['kairos_upgrade_pending',JSON.stringify({uid:'fixture',startedAt:Date.now()})]]);
  let tier='free';
  const plan=mountPlanUsage({root:f.document.getElementById('settings-plan'),auth:{currentUser:{uid:'fixture',emailVerified:true}},
    storage:{getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)},
    request:async()=>({access:{tier,dailyLimit:tier==='plus'?100:10},usage:{used:0,remaining:10,bonusCredits:0},billing:{status:tier==='plus'?'active':'none',paidThrough:tier==='plus'?Date.now()+86400000:null},offers:[]})});
  try {
    await f.router.start();await plan.refresh();
    assert.equal(f.document.getElementById('plan-welcome').hasAttribute('open'),false);
    await f.router.navigate('ai-page');tier='plus';await plan.refresh();
    assert.equal(f.document.getElementById('plan-welcome').hasAttribute('open'),true);
    assert.equal(pageFromUrl(f.window.location.href),'ai-page');
    assert.equal(new URL(f.window.location.href).searchParams.has('billing'),false);
    assert.equal(values.has('kairos_upgrade_pending'),false);
  } finally {plan.destroy();}
});

test('background warming respects data-saving connections',async()=>{
  const loaded=[],f=setup('https://kairos.invalid/app.html',async page=>loaded.push(page));
  Object.defineProperty(f.window.navigator,'connection',{value:{saveData:true}});
  await f.router.start();f.router.warm();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(loaded,['home-page']);
});
