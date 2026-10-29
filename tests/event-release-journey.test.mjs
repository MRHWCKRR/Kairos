import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {runEventReleaseJourney} from './browser/event-release-journey.mjs';
test('native event, reload, reviewed AI reminder and Undo survive failed saves and account changes',async()=>{
 const {document,window}=parseHTML('<html><body><dialog class="ai-undo-dialog"><button data-ai-undo-apply>Older closed review</button></dialog></body></html>');
 await runEventReleaseJourney({document,window,check:(value,message)=>assert.ok(value,message),wait:async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(setImmediate);}throw Error('Timed out waiting for event release workflow');}});
});
