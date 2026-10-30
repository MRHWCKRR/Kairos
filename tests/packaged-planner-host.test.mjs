import test,{after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import {createPackagedFixtureStore} from '../scripts/packaged-fixture-store.mjs';

// Exercise the fixture's composition with real application modules and a fake HTTP boundary.
const root=path.resolve(import.meta.dirname,'..');
const bundle=await build({entryPoints:[path.join(root,'tests/browser/packaged-planner-host.mjs')],bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'packaged-imports',setup(api){api.onResolve({filter:/^\/.*\.js\?v=/},args=>({path:path.join(root,args.path.slice(1).split('?')[0])}));api.onResolve({filter:/\.js\?v=/},args=>({path:path.resolve(args.resolveDir,args.path.split('?')[0])}));}}]});
const temporary=await mkdtemp(path.join(os.tmpdir(),'kairos-packaged-host-'));after(()=>rm(temporary,{recursive:true,force:true}));
const compiled=path.join(temporary,'host.mjs');await writeFile(compiled,bundle.outputFiles[0].text);const module=await import(pathToFileURL(compiled));
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}

test('packaged settings save/retry control becomes usable when dirty and pending',async t=>{
 const {document,window}=parseHTML('<html><body><section id="tasks-page"></section><div id="tasks-manager-container"></div><div id="shortcut-settings-editor"></div><div id="planning-preferences-editor"></div><div id="weekly-availability-editor"></div><input id="settings-reschedule-completed"><div id="settings-save-bar"><span></span><button id="settings-save-btn"></button></div></body></html>');
 const store=createPackagedFixtureStore(),memory=storage();let fail=true;
 const globals={document,window,localStorage:memory,fetch:async(url,options)=>{
  const body=options.body&&JSON.parse(options.body);
  if(url.endsWith('/settings')&&fail){fail=false;return {ok:false,json:async()=>({error:'Offline'})};}
  return {ok:true,json:async()=>url.endsWith('/settings')?{result:store.saveSettings('packaged-fixture',body)}:store.read('packaged-fixture')};
 }};
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 t.after(()=>{for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 const host=await module.createPackagedPlannerHost();host.form.enter();
 const bar=document.getElementById('settings-save-bar'),button=document.getElementById('settings-save-btn');assert.equal(bar.classList.contains('active'),false);
 const toggle=document.getElementById('settings-reschedule-completed');toggle.checked=true;toggle.dispatchEvent(new window.Event('change'));
 assert.equal(bar.classList.contains('active'),true,'dirty settings must expose the actual save bar');assert.equal(button.disabled,false);
 button.click();assert.equal(await host.getSaving(),false);assert.equal(bar.classList.contains('active'),true);assert.equal(button.textContent,'Retry save');
 button.click();assert.equal(await host.getSaving(),true);assert.equal(bar.classList.contains('active'),false);host.session.dispose();host.capture.dispose();host.sync.dispose();
});

test('packaged runtime errors survive document reload and fail the next phase',()=>{
 assert.equal(typeof module.createPackagedErrorLedger,'function','reload must preserve runtime errors');
 const memory=storage(),first=module.createPackagedErrorLedger(memory);first.record('Task handler failed');
 const reloaded=module.createPackagedErrorLedger(memory);assert.throws(()=>reloaded.check(),/Task handler failed/);
});
