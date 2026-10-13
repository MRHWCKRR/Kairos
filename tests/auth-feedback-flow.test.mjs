import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createAuthFeedback} from '../auth-feedback.js';
async function login(code){
 const {document,window}=parseHTML('<html><head></head><body><div class="login-box"><form id="email-login-form"><input id="email" value="test@example.com"><input id="password" value="wrong"><input type="checkbox" id="remember-me"><button id="auth-submit">Sign In</button></form><div class="social-buttons"><button id="btn-google">Google</button></div></div></body></html>');let calls=[];
 const source=(await fs.readFile(new URL('../login.js',import.meta.url),'utf8')).replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g,'');
 const context={document,window,createAuthFeedback,auth:{},console:{error(){}},localStorage:{removeItem(){}},onAuthStateChanged(){},browserLocalPersistence:'local',browserSessionPersistence:'session',setPersistence:async(_,choice)=>calls.push(choice),signInWithEmailAndPassword:async()=>{throw {code};},GoogleAuthProvider:class{},signInWithPopup:async()=>{calls.push('popup');throw {code};}};vm.runInNewContext(source,context);return {document,window,calls};
}
test('incorrect password appears inline, marks fields, and restores submit',async()=>{
 const {document,window,calls}=await login('auth/invalid-credential');document.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));assert.match(document.querySelector('#auth-status').textContent,/incorrect/);assert.equal(document.querySelector('#password').getAttribute('aria-invalid'),'true');assert.equal(document.querySelector('#auth-submit').disabled,false);assert.deepEqual(calls,['session']);
});
test('Google failures are inline and popup invocation remains in click handler',async()=>{
 for(const code of ['auth/popup-closed-by-user','auth/popup-blocked','auth/network-request-failed']){const {document,calls}=await login(code);document.querySelector('#btn-google').click();assert.deepEqual(calls,['popup']);await new Promise(resolve=>setImmediate(resolve));assert.equal(document.querySelector('#btn-google').disabled,false);assert.equal(document.querySelector('#auth-status').hidden,false);assert.equal(document.querySelector('#password').hasAttribute('aria-invalid'),false);}
});
