import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('App Check reports token freshness without leaking its JWT or identifiers',async()=>{
 const source=(await readFile(new URL('../firebase.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'').replace(/^export default .+;\s*$/gm,'').replace(/^export /gm,'');
 const logs=[],now=Date.parse('2026-10-29T06:00:00Z');let next,error,subscriptions=0;
 const context={Date:class extends Date{static now(){return now}},JSON,Number,Math,atob:value=>Buffer.from(value,'base64').toString('utf8'),
  initializeApp:()=>({name:'[DEFAULT]'}),getAuth:()=>({}),initializeRecaptchaConfig:async()=>{},initializeFirestore:()=>({}),
  initializeAppCheck:()=>({}),ReCaptchaEnterpriseProvider:class{},
  onTokenChanged:(_check,onNext,onError)=>{subscriptions++;next=onNext;error=onError;return()=>{}},
  console:{debug:(...args)=>logs.push(args),warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args)}};
 vm.runInNewContext(source,context);
 assert.equal(subscriptions,1,'renewal diagnostics must subscribe to the real SDK token event');
 const payload=Buffer.from(JSON.stringify({iat:now/1000-600,exp:now/1000+3000,sub:'private-app-id',secret:'private-token-contents'})).toString('base64url');
 next({token:'private-header.'+payload+'.private-signature'});
 assert.deepEqual(JSON.parse(logs[0][1]),{ageSeconds:600,expiresInSeconds:3000});
 next({token:'malformed-private-token'});
 assert.deepEqual(JSON.parse(logs[1][1]),{ageSeconds:null,expiresInSeconds:null});
 error(Object.assign(Error('private-token-contents'),{code:'appCheck/recaptcha-error'}));
 assert.equal(logs[2][1],'appCheck/recaptcha-error');
 error({code:'private-secret-code',message:'private'});
 assert.equal(logs[3][1],'appCheck/unknown');
 assert.doesNotMatch(JSON.stringify(logs),/private|eyJ|signature/);
});
