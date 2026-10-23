import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createAuthFeedback} from '../auth-feedback.js';

const flush=()=>new Promise(setImmediate);
const stripImports=source=>source.replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g,'');
async function loginFixture(send=async()=>{}) {
  const html=await readFile(new URL('../login.html',import.meta.url),'utf8');
  const {document,window}=parseHTML(html),calls=[];
  for(const form of document.querySelectorAll('form')){form.checkValidity=()=>true;form.reportValidity=()=>{};}
  vm.runInNewContext(stripImports(await readFile(new URL('../login.js',import.meta.url),'utf8')),{
    document,window,createAuthFeedback,auth:{},console:{error(){}},localStorage:{removeItem(){}},
    onAuthStateChanged(){},sendPasswordResetEmail:async(_auth,email)=>{calls.push(email);return send();}
  });
  return {document,window,calls,submit(){document.getElementById('password-reset-form').dispatchEvent(new window.Event('submit',{cancelable:true}));}};
}

test('password recovery opens from login, prefills email, and returns without losing the login draft',async()=>{
  const f=await loginFixture(),d=f.document;
  d.getElementById('email').value='person@example.com';d.getElementById('password').value='draft';
  assert.ok(d.getElementById('forgot-password'),'login provides a recovery entry point');
  d.getElementById('forgot-password').click();
  assert.equal(d.getElementById('email-login-form').hidden,true);
  assert.equal(d.getElementById('password-reset-form').hidden,false);
  assert.equal(d.getElementById('reset-email').value,'person@example.com');
  assert.match(d.getElementById('password-reset-form').textContent,/Continue with Google/);
  d.getElementById('reset-back').click();
  assert.equal(d.getElementById('email-login-form').hidden,false);
  assert.equal(d.getElementById('password').value,'draft');assert.deepEqual(f.calls,[]);
});

test('reset success and unknown email give the same private confirmation',async()=>{
  const messages=[];
  for(const send of [async()=>{},async()=>{throw {code:'auth/user-not-found'};}]){
    const f=await loginFixture(send);assert.ok(f.document.getElementById('forgot-password'));
    f.document.getElementById('forgot-password').click();f.document.getElementById('reset-email').value='  person@example.com  ';
    f.submit();await flush();assert.deepEqual(f.calls,['person@example.com']);
    const notice=f.document.getElementById('auth-status');messages.push(notice.textContent);
    assert.match(notice.textContent,/If .*password.*account/i);assert.equal(notice.dataset.type,'success');
  }
  assert.equal(messages[0],messages[1]);
});

test('in-flight reset cannot send twice and network failures allow retry',async()=>{
  let reject;const f=await loginFixture(()=>new Promise((_,r)=>reject=r)),d=f.document;
  assert.ok(d.getElementById('forgot-password'));d.getElementById('forgot-password').click();d.getElementById('reset-email').value='person@example.com';
  f.submit();f.submit();assert.equal(f.calls.length,1);assert.equal(d.getElementById('reset-submit').disabled,true);
  reject({code:'auth/network-request-failed'});await flush();
  assert.match(d.getElementById('auth-status').textContent,/connection/i);assert.equal(d.getElementById('reset-submit').disabled,false);
});

async function onboardingFixture() {
  const {document,window}=parseHTML('<html><head></head><body><div id="app-loading-screen"></div></body></html>');
  const auth={currentUser:{uid:'one',emailVerified:true}},reads=[],events=[];let listener;
  window.addEventListener('kairos:onboarding-complete',()=>events.push('complete'));
  vm.runInNewContext(stripImports(await readFile(new URL('../onboarding-force.js',import.meta.url),'utf8')),{
    document,window,CustomEvent:window.CustomEvent,auth,db:{},LANGUAGES:[{id:'en',name:'English'}],getLocale:()=> 'en',
    ct:{getAllCountries:()=>({}),getTimezonesForCountry:()=>[]},
    console:{error(){}},doc:(_db,_collection,id)=>id,
    getDoc:id=>new Promise((resolve,reject)=>reads.push({id,resolve,reject})),
    onAuthStateChanged:(_auth,cb)=>{listener=cb;cb(auth.currentUser);}
  });
  return {document,auth,reads,events,changeUser(user){auth.currentUser=user;listener(user);}};
}

test('failed onboarding read shows Retry and only a confirmed completion releases the gate',async()=>{
  const f=await onboardingFixture();f.reads[0].reject(Error('offline'));await flush();
  const retry=f.document.getElementById('ko-retry');assert.ok(retry,'a read error must not leave an indefinite spinner');
  assert.match(f.document.body.textContent,/couldn.t load/i);assert.deepEqual(f.events,[]);
  retry.click();assert.equal(f.reads.length,2);
  assert.ok(f.document.getElementById('kairos-onboarding'),'keep setup covered while retry is pending');
  assert.equal(retry.disabled,true);retry.click();assert.equal(f.reads.length,2);
  f.reads[1].resolve({exists:()=>true,data:()=>({onboardingCompleted:true})});await flush();
  assert.deepEqual(f.events,['complete']);assert.equal(f.document.getElementById('kairos-onboarding'),null);
});

test('late onboarding errors from a previous account cannot replace the current account UI',async()=>{
  const f=await onboardingFixture();f.changeUser({uid:'two',emailVerified:true});
  f.reads[1].resolve({exists:()=>false});await flush();
  assert.match(f.document.body.textContent,/What should we call you/);
  f.reads[0].reject(Error('old failure'));await flush();
  assert.equal(f.document.getElementById('ko-retry'),null);assert.match(f.document.body.textContent,/What should we call you/);
});
