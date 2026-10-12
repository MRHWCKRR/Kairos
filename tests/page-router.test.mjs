import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {mountPageRouter,pageFromUrl,pageUrl} from '../page-router.js';
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
  assert.equal(pageUrl('https://kairos.invalid/app.html?billing=return#existing','settings-page').hash,'#existing');
});

test('background warming respects data-saving connections',async()=>{
  const loaded=[],f=setup('https://kairos.invalid/app.html',async page=>loaded.push(page));
  Object.defineProperty(f.window.navigator,'connection',{value:{saveData:true}});
  await f.router.start();f.router.warm();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(loaded,['home-page']);
});
