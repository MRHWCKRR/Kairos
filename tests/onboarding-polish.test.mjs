import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mountGettingStarted} from '../getting-started.js';
const flush=()=>new Promise(setImmediate);
test('guide remains inside the active modal and returns to the page after it closes',async()=>{
 const {document,window}=parseHTML('<html><body><button id="getting-started-open"></button></body></html>');
 const guide=mountGettingStarted({document,window,getOwner:()=> 'one',save:async()=>{},navigate:async()=>true});
 guide.hydrate({onboardingCompleted:true,gettingStarted:{version:2,status:'active',step:0}});
 const dialog=document.createElement('dialog');dialog.setAttribute('open','');document.body.appendChild(dialog);await flush();
 assert.ok(document.querySelector('.getting-started').parentElement===dialog,'guide should be inside active modal');
 dialog.remove();await flush();assert.ok(document.querySelector('.getting-started').parentElement===document.body);guide.dispose();
});
test('onboarding light mode is previewed and saved with the rest of setup',async()=>{
 const {document,window}=parseHTML('<html><head></head><body><div id="app-loading-screen"></div></body></html>');const writes=[];
 const context=vm.createContext({document,window,CustomEvent:window.CustomEvent,auth:{currentUser:{uid:'one',emailVerified:true}},db:{},LANGUAGES:[{id:'en',name:'English'}],getLocale:()=> 'en',ct:{getAllCountries:()=>({}),getTimezonesForCountry:()=>[]},console:{error(){}},doc:(_db,_collection,id)=>id,getDoc:async()=>({exists:()=>true,data:()=>({settings:{profile:{displayName:'User',country:'AU',timezone:'Australia/Brisbane'},accessibility:{language:'en'}}})}),setDoc:async(_ref,data)=>writes.push(data),onAuthStateChanged:(_auth,callback)=>callback({uid:'one',emailVerified:true}),showNotice(){}});
 let source=(await readFile(new URL('../onboarding-force.js',import.meta.url),'utf8')).replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g,'');
 source=source.replace('onAuthStateChanged(auth,user=>{start(user)});','window.testAppearance=()=>{page=3;render()};onAuthStateChanged(auth,user=>{start(user)});');vm.runInContext(source,context);await flush();window.testAppearance();
 const choice=document.getElementById('ko-mode-light');assert.ok(choice,'appearance choice must precede the final guide step');
 choice.checked=true;choice.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(document.body.classList.contains('mode-light'),true);
 document.getElementById('ko-next').click();document.getElementById('ko-guide-skip').click();await flush();
 assert.equal(writes[0].settings.appearance.mode,'light');assert.equal(writes[0].settings.profile.displayName,'User');assert.equal(writes[0].onboardingCompleted,true);
});