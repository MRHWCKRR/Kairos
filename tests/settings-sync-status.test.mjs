import test from 'node:test';import assert from 'node:assert/strict';
import {createSettingsSync} from '../settings-sync.js';import {defaultSettings,deepMerge} from '../app-settings-model.js';
test('settings observers expose actual recovery availability and reset for another account',async()=>{
 let owner='one',draft=defaultSettings(),applied=defaultSettings(),fail=true;
 const sync=createSettingsSync({getOwnerId:()=>owner,getDraft:()=>draft,setDraft:v=>draft=v,getApplied:()=>applied,setApplied:v=>applied=v,defaults:defaultSettings,mergeDefaults:v=>deepMerge(defaultSettings(),v),storage:{setItem(){throw Error('quota')},getItem(){return null}},readRemote:async()=>({confirmed:true,settings:applied}),writeRemote:async(_owner,merge)=>{if(fail)throw Error('offline');return merge(applied)}});
 const states=[];const off=sync.subscribe(state=>states.push({ownerId:state.ownerId,status:state.status}));
 draft.profile.displayName='Edited';assert.equal(await sync.save(),false);assert.equal(sync.state().pending.persisted,false);assert.equal(sync.state().status,'unconfirmed');
 fail=false;assert.equal(await sync.save(),true);assert.equal(sync.state().status,'saved');assert.deepEqual(states.map(s=>s.status),['saving','unconfirmed','saving','saved']);
 owner='two';sync.reset();assert.equal(states.at(-1).ownerId,'two');assert.equal(sync.state().pending,null);assert.equal(sync.state().status,'idle');
 off();sync.dispose();
});
