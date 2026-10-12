import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountPrototype} from '../prototypes/today/today.js';

async function setup(t, storage = {getItem:()=>null, setItem:()=>{}}) {
  const {document, window} = parseHTML(await fs.readFile(new URL('../prototypes/today/index.html',import.meta.url),'utf8'));
  // linkedom has no browser dialog implementation; real browser QA covers focus.
  for (const d of document.querySelectorAll('dialog')) { d.showModal = () => d.setAttribute('open',''); d.close = () => {d.removeAttribute('open'); d.dispatchEvent(new window.Event('close'));}; }
  const app = mountPrototype({document, storage, now:()=>1000, tick:false});
  t.after(()=>app.destroy());
  return {document, window, app};
}
const click = (document, action) => document.querySelector(`[data-action="${action}"]`).click();

test('Today recommends real work and navigation exposes all tasks', async t => {
  const {document} = await setup(t);
  assert.match(document.querySelector('main').textContent, /Review meeting notes/);
  click(document,'lists');
  assert.match(document.querySelector('main').textContent, /Find a weekend walking route/);
  click(document,'plan');
  assert.match(document.querySelector('main').textContent, /Client call/);
});

test('completion removes recommended work and undo restores it', async t => {
  const {document,app} = await setup(t);
  click(document,'complete');
  assert.equal(app.getState().tasks.find(t=>t.id==='notes').done,true);
  click(document,'undo');
  assert.equal(app.getState().tasks.find(t=>t.id==='notes').done,false);
});

test('capture creates a real unscheduled task and safely renders literal HTML text', async t => {
  const {document,window,app} = await setup(t);
  click(document,'add');
  document.querySelector('[name="title"]').value = '<img src=x onerror=alert(1)>';
  document.querySelector('[name="remaining"]').value = '20';
  const select=document.querySelector('[name="plannedDay"]');
  for(const option of select.querySelectorAll('option')) option.removeAttribute('selected');
  select.querySelector('[value="none"]').selected=true;
  document.querySelector('#task-form').dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));
  assert.equal(app.getState().tasks.length,7);
  assert.equal(app.getState().tasks.at(-1).plannedDay,null);
  click(document,'lists');
  assert.match(document.querySelector('main').textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(document.querySelector('main img'),null);
});

test('Make room previews without mutation and applies a feasible reversible option', async t => {
  const {document,app} = await setup(t);
  click(document,'change');
  assert.equal(app.getState().now,840);
  click(document,'review-change');
  assert.equal(app.getState().now,840);
  click(document,'apply-proposal');
  assert.equal(app.getState().now,870);
  assert.equal(app.getState().tasks.find(t=>t.id==='expenses').plannedDay,1);
  click(document,'undo');
  assert.equal(app.getState().now,840);
});

test('storage failure leaves a visible notice and usable interactive app', async t => {
  const {document,app} = await setup(t,{getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}});
  assert.match(document.querySelector('#storage-notice').textContent,/this tab/i);
  click(document,'complete');
  assert.equal(app.getState().tasks.find(t=>t.id==='notes').done,true);
});

test('all-done state offers capture rather than another artificial recommendation', async t => {
  const {document,app} = await setup(t);
  for (const task of app.getState().tasks.filter(t=>t.plannedDay===0)) {
    document.querySelector(`[data-action="complete"][data-id="${task.id}"]`).click();
  }
  assert.match(document.querySelector('main').textContent,/planned work is done/i);
});

test('task-linked pause notes and running sessions survive reload', async t => {
  let stored=null;
  const storage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;}};
  const {document,window,app}=await setup(t,storage);
  click(document,'begin');
  assert.equal(app.getState().session.taskId,'notes');
  const resumed=await setup(t,storage);
  assert.equal(resumed.app.getState().session.taskId,'notes');
  click(document,'pause');
  document.querySelector('#resume-note').value='Check the third example';
  document.querySelector('#pause-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(app.getState().session,null);
  const reloaded=await setup(t,storage);
  assert.match(reloaded.document.querySelector('main').textContent,/Check the third example/);
});

test('task editing persists and the tomorrow plan has its own window', async t => {
  const {document,window,app}=await setup(t);
  click(document,'edit');
  document.querySelector('[name="title"]').value='A clearer next step';
  document.querySelector('#task-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(app.getState().tasks.find(t=>t.id==='notes').title,'A clearer next step');
  click(document,'plan');
  document.querySelector('[data-action="plan-day"][data-day="1"]').click();
  click(document,'window');
  document.querySelector('#window-start').value='15:00';
  document.querySelector('#window-end').value='18:00';
  document.querySelector('#window-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(app.getState().tomorrow.end,1080);
  assert.equal(app.getState().end,960);
});

test('corrupt stored data starts a labelled usable sample', async t => {
  const {document,app}=await setup(t,{getItem:()=>'{broken',setItem:()=>{}});
  assert.equal(app.getState().tasks.length,6);
  assert.equal(document.querySelector('#storage-notice').hidden,false);
});

test('a rapid repeated completion click does not reopen a just-completed task', async t => {
  const {document,app}=await setup(t);
  click(document,'lists');
  document.querySelector('[data-action="complete"][data-id="notes"]').click();
  document.querySelector('[data-action="complete"][data-id="notes"]').click();
  assert.equal(app.getState().tasks.find(t=>t.id==='notes').done,true);
});

test('filter and plan-day activation focus their replacement controls', async t => {
  const {document,window}=await setup(t);
  let focused=null;
  const original=window.HTMLElement.prototype.focus;
  window.HTMLElement.prototype.focus=function(){focused=this;};
  Object.defineProperty(document,'activeElement',{get:()=>focused,configurable:true});
  t.after(()=>{window.HTMLElement.prototype.focus=original;});
  click(document,'lists');
  const filter=document.querySelector('[data-action="filter"][data-filter="today"]');
  filter.focus();filter.click();
  assert.equal(focused.isConnected,true);
  assert.equal(focused.dataset.filter,'today');
  click(document,'plan');
  const tomorrow=document.querySelector('[data-action="plan-day"][data-day="1"]');
  tomorrow.focus();tomorrow.click();
  assert.equal(focused.isConnected,true);
  assert.equal(focused.dataset.day,'1');
});
