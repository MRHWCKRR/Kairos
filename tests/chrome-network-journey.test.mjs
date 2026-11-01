import test from 'node:test';import assert from 'node:assert/strict';
import {createNetworkJourneyDriver} from '../scripts/chrome-network-journey.mjs';
test('network cut waits for a committed held write and applies real transport emulation before release',async()=>{
 let held=false,request='cut',released=false;const calls=[];
 const driver=createNetworkJourneyDriver({hasHeldWrite:()=>held,releaseHeldWrite(){released=true;calls.push('release')}});
 const send=async(method,params)=>{calls.push(method);return method==='Runtime.evaluate'?{result:{value:params.expression==='document.documentElement.dataset.networkRequest'?request:undefined}}:{}};
 await driver({send,sessionId:'session'});assert.equal(released,false);assert.deepEqual(calls,['Runtime.evaluate']);calls.length=0;held=true;
 await driver({send,sessionId:'session'});assert.deepEqual(calls,['Runtime.evaluate','Network.enable','Network.emulateNetworkConditions','release','Runtime.evaluate']);
 request='online';calls.length=0;await driver({send:async(method,params)=>{if(method==='Network.emulateNetworkConditions')assert.equal(params.offline,false);return send(method,params)},sessionId:'session'});assert.ok(calls.includes('Network.emulateNetworkConditions'));
});
