import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../app-settings-model.js';
import * as auth from '../app-auth-session.js';
import * as writes from '../app-planner-writes.js';
test('settings defaults and merged profiles are isolated between accounts',()=>{
 assert.equal(typeof model.defaultSettings,'function');
 const a=model.defaultSettings(),b=model.defaultSettings();a.profile.displayName='Private';a.accessibility.shortcuts.search='changed';
 assert.equal(b.profile.displayName,'');assert.notEqual(b.accessibility.shortcuts.search,'changed');
 const merged=model.deepMerge(b,{profile:{displayName:'Saved'},appearance:{mode:'light'}});
 assert.equal(merged.profile.timezone,b.profile.timezone);assert.equal(b.appearance.mode,'dark');assert.equal(model.cloneDeep(merged).profile.displayName,'Saved');
});
test('old auth reload cannot redirect or load the replacement session',async()=>{
 assert.equal(typeof auth.createAuthSession,'function');
 let release,current,loads=0,redirects=[],timers=[];const first={uid:'one',emailVerified:false,reload:()=>new Promise(r=>release=r)};current=first;
 const session=auth.createAuthSession({getUser:()=>current,redirect:url=>redirects.push(url),showDeleted(){},isDeletionPending:()=>false,hideLoading(){},onVerified(){loads++},loaders:[],setTimer:fn=>{timers.push(fn);return timers.length},clearTimer(){},onError(){}});
 const work=session.load(first);current={uid:'two',emailVerified:true};release();await work;
 assert.equal(loads,0);assert.deepEqual(redirects,[]);
});
test('verified auth starts independent loaders even when one fails',async()=>{
 assert.equal(typeof auth.createAuthSession,'function');let called=[],errors=[];const user={uid:'one',emailVerified:true,reload:async()=>{}};
 const session=auth.createAuthSession({getUser:()=>user,redirect(){assert.fail('redirect')},showDeleted(){},isDeletionPending:()=>false,hideLoading(){},onVerified(){called.push('verified')},loaders:[{name:'broken',load:async()=>{throw Error('offline')}},{name:'other',load:async()=>{called.push('other')}}],setTimer:()=>1,clearTimer(){},onError:(name)=>errors.push(name)});
 await session.load(user);await new Promise(setImmediate);assert.deepEqual(called,['verified','other']);assert.deepEqual(errors,['broken']);
});
test('auth preserves login, deletion and unverified-account destinations',async()=>{
 for(const [user,deleting,expected] of [[null,false,'login.html'],[null,true,'deleted'],[{uid:'one',email:'a+b@example.com',emailVerified:false,reload:async()=>{}},false,'verify-email.html?email=a%2Bb%40example.com']]){
  const destinations=[];
  const session=auth.createAuthSession({getUser:()=>user,redirect:url=>destinations.push(url),showDeleted:()=>destinations.push('deleted'),isDeletionPending:()=>deleting,hideLoading(){},onVerified(){assert.fail('unverified workspace')},loaders:[{name:'private',load(){assert.fail('private read')}}],setTimer:()=>1,clearTimer(){},onError(){}});
  await session.load(user);assert.deepEqual(destinations,[expected]);
 }
});
test('superseded reload and loading fallback cannot publish the old session',async()=>{
 let release,calls=[],callbacks=[];const user={uid:'one',emailVerified:true,reload:()=>new Promise(r=>release=r)};
 const session=auth.createAuthSession({getUser:()=>user,redirect:url=>calls.push(url),showDeleted(){},isDeletionPending:()=>false,hideLoading:()=>calls.push('hide'),onVerified:()=>calls.push('verified'),loaders:[],setTimer:fn=>{callbacks.push(fn);return callbacks.length},clearTimer(){},onError(){}});
 const pending=session.load(user);await session.load(null);callbacks[0]();release();await pending;assert.deepEqual(calls,['login.html']);
});
test('planner writes share serialization and a rejected write does not poison later work',async()=>{
 assert.equal(typeof writes.createPlannerWrites,'function');const coordinator=writes.createPlannerWrites();let release,order=[];
 const first=coordinator.enqueue(async()=>{order.push('first');await new Promise(r=>release=r);throw Error('offline')});
 const rejected=assert.rejects(first,/offline/);const second=coordinator.enqueue(async()=>{order.push('second');return 42});await new Promise(setImmediate);assert.deepEqual(order,['first']);release();await rejected;assert.equal(await second,42);assert.deepEqual(order,['first','second']);
 coordinator.markEdit(true);const ticket=coordinator.beginLoad();assert.equal(coordinator.isCurrentLoad(ticket),true);coordinator.markEdit();assert.equal(coordinator.isCurrentLoad(ticket),false);coordinator.snapshot={boards:[]};assert.deepEqual(coordinator.snapshot,{boards:[]});
});
