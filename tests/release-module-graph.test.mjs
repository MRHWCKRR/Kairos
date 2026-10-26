import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPageLoader} from '../page-loader.js';

// These floors are the deployed URLs from before the workflow refactor. Each
// changed child and its importing parents must request a genuinely fresh URL.
const oldVersions={'plan-store.js':19,'task-list-model.js':19,'mutation-session.js':2,'recurrence-edit.js':1,'schedule-inspector-session.js':2,'schedule-entry-commands.js':1,'schedule-inspector-commands.js':1,'ai-task-commands.js':1,'ai-actions.js':21,'ai-workspace.js':51,'task-capture.js':5,'task-checklist-editor.js':7,'task-detail-pane.js':18,'task-list-workspace.js':15,'task-list-interactions.js':13,'today-model.js':2,'today-view.js':2,'page-loader.js':70,'app.js':100,'app-bootstrap.js':61};
test('release module imports use fresh and consistent workflow URLs throughout the public graph',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../cloudflare/public-assets.json',import.meta.url),'utf8'));
 const versions=new Map();
 for(const file of manifest.files.filter(file=>/\.(js|html)$/.test(file))){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/([a-z0-9-]+\.js)\?v=(\d+)/g)){
   const [,name,value]=match;if(!(name in oldVersions))continue;
   const version=Number(value);assert.ok(version>oldVersions[name],file+' must load fresh '+name);
   const seen=versions.get(name);if(seen!==undefined)assert.equal(version,seen,'all consumers must agree on '+name);versions.set(name,version);
  }
 }
 for(const name of Object.keys(oldVersions))assert.ok(versions.has(name),'release graph must reference '+name);
 const imported=[],loader=createPageLoader({scheduleEnabled:true,taskDetailsEnabled:true,loadStyle:async()=>{},importModule:async url=>{imported.push(url);return {}},setupTaskDetails(){},setupTaskWorkspace(){},setupTaskInteractions(){},waitForChat:async()=>{}});
 await loader.prepare('schedule-page');await loader.prepare('tasks-page');await loader.prepare('ai-page');
 for(const [name,old] of Object.entries({'schedule-inspector.js':21,'schedule-ai.js':14,'schedule-task-create.js':13,'task-detail-pane.js':18,'task-list-workspace.js':15,'task-list-interactions.js':13,'ai-workspace.js':51})){
  const urls=imported.filter(url=>url.startsWith('./'+name+'?v='));assert.equal(urls.length,1,name+' must load once');assert.ok(Number(urls[0].split('?v=')[1])>old,name+' must bypass the previous cache');
 }
});
