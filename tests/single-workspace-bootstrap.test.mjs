import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createWorkspaceTabGuard,createWorkspaceTabView} from '../app-single-tab.js';
const tick=()=>new Promise(setImmediate);
const source=(await readFile(new URL('../app-bootstrap.js',import.meta.url),'utf8')).replace(/^import .*;\s*/gm,'').replace(/import\('\.\/app\.js\?v=\d+'\)/g,'importApp()');
async function boot({available=false,locks,mobile=false,denied=false,url='https://test.invalid/app.html'}={}){
 const {document}=parseHTML('<html><body><div id="app-loading-screen"></div><main id="private" inert><input></main><aside id="other"></aside></body></html>');
 let imports=0,reloads=0,redirect;const listeners=new Map();
 const window={__kairosMobileDevice:mobile,addEventListener:(name,fn)=>listeners.set(name,fn)};
 const manager=locks||{request:async(_name,_options,callback)=>callback(available?{}:null)};
 vm.runInNewContext(source,{window,document,navigator:denied?{get locks(){throw Error('Storage denied')}}:{locks:manager},URL,location:{href:url,replace:value=>redirect=value,reload:()=>reloads++},console:{error(){}},importApp:async()=>imports++,
  createWorkspaceTabGuard:options=>createWorkspaceTabGuard({...options,graceMs:0}),createWorkspaceTabView});
 await tick();await tick();return {document,listeners,get imports(){return imports},get reloads(){return reloads},get redirect(){return redirect}};
}
test('a denied workspace does not import app/Firebase and exposes a keyboard retry',async()=>{
 const f=await boot();assert.equal(f.imports,0);const gate=f.document.getElementById('workspace-tab-gate');assert.ok(gate);assert.match(gate.textContent,/already open|other.*tab/i);assert.equal(gate.querySelector('button').textContent,'Use Kairos here');assert.equal(f.document.getElementById('other').hasAttribute('inert'),true);
});
test('retry acquires ownership before import and restores previous inert state',async()=>{
 let available=false;const f=await boot({locks:{request:async(_n,_o,callback)=>callback(available?{}:null)}});available=true;
 await f.document.querySelector('[data-tab-retry]').onclick();await tick();assert.equal(f.imports,1);assert.equal(f.document.getElementById('workspace-tab-gate'),null);assert.equal(f.document.getElementById('private').hasAttribute('inert'),true);assert.equal(f.document.getElementById('other').hasAttribute('inert'),false);
});
test('mobile block and billing redirect do not acquire workspace locks',async()=>{
 let requests=0;const locks={request:()=>{requests++;throw Error('must not lock')}};
 const mobile=await boot({locks,mobile:true});const billing=await boot({locks,url:'https://test.invalid/app.html?page=plans'});
 assert.equal(mobile.imports+billing.imports,0);assert.equal(requests,0);assert.match(billing.redirect,/plans\.html/);
});
test('a BFCache restore becomes inert and reloads through fresh ownership',async()=>{
 const f=await boot();const restore=f.listeners.get('pageshow');assert.equal(typeof restore,'function');restore({persisted:true});assert.equal(f.reloads,1);assert.equal(f.document.documentElement.hasAttribute('inert'),true);
});
test('a denied Web Locks getter shows recovery without importing the app',async()=>{
 const f=await boot({denied:true});assert.equal(f.imports,0);assert.match(f.document.getElementById('workspace-tab-gate')?.textContent||'',/browser cannot|Reload/i);
});
