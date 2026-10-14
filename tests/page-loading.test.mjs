import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPageLoader } from '../page-loader.js';

test('page assets load once across hover, navigation and repeated visits', async () => {
  const imports=[], styles=[];
  const loader=createPageLoader({importModule:async url=>imports.push(url),loadStyle:async url=>styles.push(url),scheduleEnabled:true});
  await Promise.all([loader.prepare('ai-page'),loader.prepare('ai-page')]);
  await loader.prepare('ai-page');
  assert.equal(imports.filter(url=>url.startsWith('./ai-workspace.js')).length,1);
  assert.equal(styles.filter(url=>url.startsWith('ai-workspace.css')).length,1);
  assert.ok(!imports.some(url=>url.includes('schedule-workspace')));
});

test('task detail editor mounts once and does not load Schedule workspace',async()=>{
  const imports=[],styles=[];let mounts=0;
  const loader=createPageLoader({taskDetailsEnabled:true,setupTaskDetails:()=>mounts++,loadStyle:async url=>styles.push(url),importModule:async url=>{imports.push(url);return {}}});
  await Promise.all([loader.prepare('tasks-page'),loader.prepare('tasks-page')]);await loader.prepare('tasks-page');
  assert.equal(mounts,1);assert.equal(imports.length,1);assert.match(imports[0],/task-detail-pane/);
  assert.ok(styles.some(url=>url.startsWith('task-list.css')));assert.ok(!imports.some(url=>url.includes('schedule-workspace')));
});

test('schedule core initializes before its dependent feature modules', async () => {
  const imports=[];
  const loader=createPageLoader({scheduleEnabled:true,loadStyle:async()=>{},importModule:async url=>imports.push(url)});
  await loader.prepare('schedule-page');
  assert.ok(imports.findIndex(url=>url.includes('schedule-workspace'))<imports.findIndex(url=>url.includes('schedule-ai.js')));
  assert.ok(imports.some(url=>url.includes('schedule-task-create')));
  assert.ok(imports.some(url=>url.includes('schedule-inspector')));
});

test('plain-text chat remains usable when optional markdown CDN is unavailable', async () => {
  const imports=[];
  const loader=createPageLoader({loadStyle:async()=>{},warn:()=>{},importModule:async url=>{imports.push(url);if(url.includes('ai-markdown'))throw Error('offline CDN');}});
  await loader.prepare('ai-page');
  assert.ok(imports.some(url=>url.includes('ai-workspace')));
});

test('a slow optional markdown CDN does not block chat readiness', async () => {
  let finishMarkdown;
  const markdown=new Promise(resolve=>finishMarkdown=resolve);
  const loader=createPageLoader({loadStyle:async()=>{},importModule:url=>url.includes('ai-markdown')?markdown:Promise.resolve()});
  const result=await Promise.race([loader.prepare('ai-page').then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),25))]);
  finishMarkdown();
  assert.equal(result,true);
});

test('ordinary pages and legacy schedule do not pull in heavy workspaces', async () => {
  const imports=[];
  const loader=createPageLoader({scheduleEnabled:false,loadStyle:async()=>{},importModule:async url=>imports.push(url)});
  for(const page of ['home-page','tasks-page','settings-page','calendar-page','achievements-page','schedule-page'])await loader.prepare(page);
  assert.deepEqual(imports,[]);
});

test('Firebase authentication is independent of markdown and its external CDN graph', async () => {
  const firebase=await readFile(new URL('../firebase.js',import.meta.url),'utf8');
  assert.doesNotMatch(firebase,/import\s+["']\.\/ai-markdown/);
});

test('deployed entry defers feature assets and retains billing markup', async () => {
  const {injectScheduleAssets}=await import('../build-transforms.js');
  const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
  const output=injectScheduleAssets(html);
  assert.match(output,/app-bootstrap\.js/);
  assert.doesNotMatch(output,/<script[^>]+src="(?:ai-workspace|ai-markdown|schedule-[^"?]+)\.js/);
  assert.doesNotMatch(output,/<link[^>]+rel="stylesheet"[^>]+href="(?:ai-workspace|schedule-[^"?]+)\.css/);
  assert.match(output,/id="plans-page"/);
  assert.match(output,/id="plan-welcome"/);
  assert.equal(injectScheduleAssets(output),output);
});
