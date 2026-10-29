import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPageLoader} from '../page-loader.js';
import {versionPublicAssets} from '../asset-versioning.js';
import vm from 'node:vm';

test('every declared local JS/CSS reference uses one content-derived release version',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../cloudflare/public-assets.json',import.meta.url),'utf8'));
 const source=new Map(await Promise.all(manifest.files.map(async name=>[name,await readFile(new URL('../'+name,import.meta.url),'utf8')])));
 const release=versionPublicAssets(source);let checked=0;
 for(const [name,text] of release.files){
  for(const match of text.matchAll(/(["'`])((?:\.\/|\/)?[a-z0-9-]+\.(?:js|css))(?:\?([^"'`<>\s]*))?\1/g)){
   const target=match[2].replace(/^(?:\.\/|\/)/,'');if(!source.has(target))continue;
   const query=new URLSearchParams((match[3]||'').replaceAll('&amp;','&'));
   assert.equal(query.get('v'),release.version,name+' imports '+target);checked++;
  }
 }
 assert.ok(checked>200,'check the full public module graph');
 const imports=[],loader=createPageLoader({scheduleEnabled:true,taskDetailsEnabled:true,loadStyle:async()=>{},importModule:async url=>{imports.push(url);return {}},setupTaskDetails(){},setupTaskWorkspace(){},setupTaskInteractions(){},waitForChat:async()=>{}});
 assert.equal(imports.length,0,'features stay deferred');
 await loader.prepare('schedule-page');await loader.prepare('tasks-page');await loader.prepare('ai-page');await loader.prepare('schedule-page');
 for(const name of ['schedule-inspector.js','schedule-ai.js','schedule-task-create.js','task-detail-pane.js','task-list-workspace.js','task-list-interactions.js','ai-workspace.js'])assert.equal(imports.filter(url=>url.startsWith('./'+name+'?')).length,1,name+' loads once');
});
test('executing the generated lazy loader requests canonical URLs across Tasks and Schedule',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../cloudflare/public-assets.json',import.meta.url),'utf8'));
 const source=new Map(await Promise.all(manifest.files.map(async name=>[name,await readFile(new URL('../'+name,import.meta.url),'utf8')])));
 const release=versionPublicAssets(source),context={console},styles=[],modules=[];
 vm.runInNewContext(release.files.get('page-loader.js').replace(/export /g,''),context);
 const loader=context.createPageLoader({scheduleEnabled:true,taskDetailsEnabled:true,loadStyle:async url=>styles.push(url),importModule:async url=>{modules.push(url);return {}},setupTaskDetails(){}});
 await loader.prepare('tasks-page');await loader.prepare('schedule-page');
 for(const url of [...styles,...modules])assert.equal(new URL(url,'https://kairos.invalid/').searchParams.get('v'),release.version,url);
 assert.equal(new Set(styles.filter(url=>url.startsWith('schedule-inspector.css'))).size,1,'shared stylesheet has one URL');
});
