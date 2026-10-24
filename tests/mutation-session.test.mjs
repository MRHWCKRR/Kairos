import test from 'node:test';import assert from 'node:assert/strict';
import {createMutationSession} from '../mutation-session.js';
function setup(memory=new Map(),commit=async()=>({})){let identity={ownerId:'one',planId:'p'},n=0,calls=[];const controller=createMutationSession({getIdentity:()=>identity,storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},uuid:()=>String(++n),now:()=>1000,commit:async(...args)=>{calls.push(structuredClone(args));return commit(...args)}});return {controller,calls,memory,switch:()=>{identity={ownerId:'two',planId:'p'};controller.sync()}}}
test('unconfirmed mutation survives reload and retry uses the same command and identity',async()=>{
 const first=setup(undefined,async()=>{throw Error('Offline')});assert.equal(await first.controller.run({type:'complete_task'},{value:false}),false);assert.equal(first.controller.state().pending,true);
 const next=setup(first.memory);await next.controller.retry();assert.deepEqual(next.calls[0],first.calls[0]);assert.equal(first.memory.size,0);
});
test('overlapping submissions and stale account responses cannot clear another pending record',async()=>{
 let release;const f=setup(undefined,()=>new Promise(r=>release=r));const pending=f.controller.run({type:'one'},{});assert.equal(await f.controller.run({type:'two'},{}),false);assert.equal(f.calls.length,1);f.switch();release({});assert.equal(await pending,false);assert.equal(f.memory.size,1);assert.equal(f.controller.state().pending,false);
});
test('storage failure prevents submission',async()=>{
 const c=createMutationSession({getIdentity:()=>({ownerId:'x',planId:'p'}),storage:{getItem:()=>null,setItem:()=>{throw Error('Denied')}},commit:()=>assert.fail('Must not submit')});
 assert.equal(await c.run({type:'one'},{}),false);assert.match(c.state().message,/recovery/i);
});

