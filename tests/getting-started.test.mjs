import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function fixture({store=new Map(),owner='one',navigate=async()=>true}={}){
 const {document,window}=parseHTML('<html><body><button id="getting-started-open">Getting started</button><input id="work"></body></html>');
 let module={};try{module=await import('../getting-started.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
 assert.equal(typeof module.mountGettingStarted,'function','the practical guide can be mounted');
 const guide=module.mountGettingStarted({document,window,getOwner:()=>owner,navigate,storage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}});
 return {document,window,guide,store,setOwner:value=>{owner=value;guide.sync()},click:action=>document.querySelector('[data-guide="'+action+'"]').click(),text:()=>document.body.textContent};
}

test('existing users see no automatic guide; Help opens it and Escape collapses it',async()=>{
 const f=await fixture();assert.equal(f.document.querySelector('[data-getting-started]'),null);
 f.document.getElementById('getting-started-open').click();assert.match(f.text(),/Create a board and task/);
 const event=new f.window.Event('keydown',{bubbles:true});event.key='Escape';f.document.querySelector('[data-guide-panel] h2').dispatchEvent(event);
 assert.equal(f.document.querySelector('[data-guide-panel]'),null);assert.ok(f.document.querySelector('[data-guide="expand"]'));
});

test('only fresh onboarding for this account opens a guide and skip survives reload',async()=>{
 const f=await fixture();f.window.dispatchEvent(new f.window.CustomEvent('kairos:onboarding-complete',{detail:{ownerId:'two',guide:true}}));assert.equal(f.document.querySelector('[data-getting-started]'),null);
 f.window.dispatchEvent(new f.window.CustomEvent('kairos:onboarding-complete',{detail:{ownerId:'one',guide:true}}));assert.match(f.text(),/Create a board and task/);
 f.click('skip');assert.equal(f.document.querySelector('[data-getting-started]'),null);
 const next=await fixture({store:f.store});assert.equal(next.document.querySelector('[data-getting-started]'),null);next.document.getElementById('getting-started-open').click();assert.match(next.text(),/Create a board and task/);
});

test('steps open existing pages and the AI example is a separate explicit action',async()=>{
 const calls=[],f=await fixture({navigate:async request=>{calls.push(request);return true}});f.guide.open();
 f.click('action');await Promise.resolve();assert.equal(calls[0].page,'tasks-page');assert.equal(calls[0].prompt,undefined);
 f.click('expand');f.click('next');assert.match(f.text(),/Schedule your task/);f.click('next');assert.match(f.text(),/Try AI Helper/);
 assert.equal(calls.length,1);f.click('example');await Promise.resolve();assert.match(calls[1].prompt,/tomorrow/i);assert.equal(calls[1].page,'ai-page');
});

test('guide progress is account scoped and an old navigation result cannot reopen it',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=await fixture({navigate:()=>gate});f.guide.open();f.click('next');f.click('action');f.setOwner('two');assert.equal(f.document.querySelector('[data-getting-started]'),null);release(false);await gate;await Promise.resolve();assert.equal(f.document.querySelector('[data-getting-started]'),null);
 f.setOwner('one');assert.match(f.text(),/Schedule your task/);
});

test('last step explains reminder limits and Finish does not request permission',async()=>{
 const f=await fixture();f.guide.open();f.click('next');f.click('next');f.click('next');assert.match(f.text(),/Kairos must remain open/);assert.match(f.text(),/Save changes/);f.click('next');assert.equal(f.document.querySelector('[data-getting-started]'),null);
 const reload=await fixture({store:f.store});assert.equal(reload.document.querySelector('[data-getting-started]'),null);
});

test('navigation failures stay visible and blocked storage never prevents Skip',async()=>{
 const f=await fixture({navigate:async()=>false});f.guide.open();f.click('action');await Promise.resolve();assert.match(f.text(),/could not open/i);assert.ok(f.document.querySelector('[data-guide-panel]'));f.click('skip');assert.equal(f.document.querySelector('[data-getting-started]'),null);
 const blocked=await fixture({store:{get(){throw Error('blocked')},set(){throw Error('blocked')}}});blocked.guide.open();blocked.click('skip');assert.equal(blocked.document.querySelector('[data-getting-started]'),null);
});

test('AI example fills the real composer without submitting or replacing a draft',async()=>{
 const {openGettingStartedDestination:open}=await import('../getting-started.js');
 const {document}=parseHTML('<html><body><section id="ai-page" class="active"><textarea id="ai-chat-input"></textarea><button id="ai-chat-send-btn">Send</button></section></body></html>');
 let sends=0,inputs=0;document.querySelector('button').onclick=()=>sends++;document.querySelector('textarea').oninput=()=>inputs++;
 const options={document,owner:'one',getOwner:()=> 'one',navigate:async()=>{},request:{page:'ai-page',focus:'#ai-chat-input',prompt:'Plan tomorrow'}};
 assert.equal(await open(options),true);assert.equal(document.querySelector('textarea').value,'Plan tomorrow');assert.equal(inputs,1);assert.equal(sends,0);
 document.querySelector('textarea').value='My own draft';assert.match(await open(options),/existing AI draft/);assert.equal(document.querySelector('textarea').value,'My own draft');assert.equal(sends,0);
});

test('destination loading cannot fill a composer after the account changes',async()=>{
 const {openGettingStartedDestination:open}=await import('../getting-started.js');
 const {document}=parseHTML('<html><body><section id="ai-page" class="active"><textarea id="ai-chat-input"></textarea></section></body></html>');let owner='one';
 assert.equal(await open({document,owner,getOwner:()=>owner,navigate:async()=>{owner='two'},request:{page:'ai-page',focus:'#ai-chat-input',prompt:'Private example'}}),false);assert.equal(document.querySelector('textarea').value,'');
});

test('AI project and All chats views never receive an invisible example draft',async()=>{
 const {openGettingStartedDestination:open}=await import('../getting-started.js');
 const {document}=parseHTML('<html><body><section id="ai-page" class="active"><div id="ai-chat-composer-wrap" hidden><textarea id="ai-chat-input"></textarea></div></section></body></html>');
 const result=await open({document,owner:'one',getOwner:()=> 'one',navigate:async()=>{},request:{page:'ai-page',focus:'#ai-chat-input',prompt:'Plan tomorrow'}});
 assert.match(result,/open a chat/i);assert.equal(document.querySelector('textarea').value,'');
});

test('reminder destination reveals the Appearance panel without changing notification settings',async()=>{
 const {openGettingStartedDestination:open}=await import('../getting-started.js');
 const {document}=parseHTML('<html><body><section id="settings-page" class="active"><button data-settings-tab="accessibility">Accessibility</button><button data-settings-tab="appearance">Appearance</button><div id="settings-appearance" hidden><input id="settings-notif-enabled" type="checkbox"></div></section></body></html>');let changes=0;
 document.querySelector('[data-settings-tab="appearance"]').onclick=()=>document.getElementById('settings-appearance').hidden=false;document.querySelector('input').onchange=()=>changes++;
 assert.equal(await open({document,owner:'one',getOwner:()=> 'one',navigate:async()=>{},request:{page:'settings-page',focus:'#settings-notif-enabled'}}),true);assert.equal(document.getElementById('settings-appearance').hidden,false);assert.equal(changes,0);
});

test('profile setup hands the real guide off only after a successful account-scoped save',async()=>{
 const source=await readFile(new URL('../onboarding-force.js',import.meta.url),'utf8');
 const {document,window}=parseHTML('<html><body><div id="kairos-onboarding"><button id="ko-start">Start guide</button><button id="ko-guide-skip">Skip guide</button></div></body></html>');
 const root=document.getElementById('kairos-onboarding'),writes=[],events=[];let offline=true;
 window.addEventListener('kairos:onboarding-complete',event=>events.push(event.detail));
 const context=vm.createContext({document,window,CustomEvent:window.CustomEvent,root,state:{name:'Student',birthDate:'',country:'AU',timezone:'Australia/Brisbane',language:'en'},auth:{currentUser:{uid:'one'}},db:{},captureInputs(){},doc:(_db,_collection,id)=>id,setDoc:async(id,data)=>{if(offline)throw Error('Offline');writes.push({id,data})},showNotice(){},console:{error(){}}});
 vm.runInContext(source.slice(source.indexOf('async function save('),source.indexOf('async function start(')),context);
 await context.save();assert.ok(root.isConnected);assert.equal(events.length,0);
 offline=false;await context.save();assert.equal(events[0]?.guide,true);assert.equal(events[0]?.ownerId,'one');assert.equal(root.isConnected,false);
 assert.equal(writes[0].data.settings?.profile?.timezone,'Australia/Brisbane');assert.equal(writes[0].data['settings.profile.timezone'],undefined);
});
