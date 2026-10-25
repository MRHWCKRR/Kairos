import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/ai-workspace-fixture.mjs';
const turn=()=>new Promise(setImmediate);
test('concurrent chat changes queue their reviews instead of cancelling another pending preview',async()=>{
 const f=await fixture({autoApprove:false});
 const one=f.context.requestActionConfirmation('chat-one',{type:'create_task',args:{title:'First'}},{ownerId:'one',planId:'plan',operationId:'first-preview',createdAt:1000});
 const two=f.context.requestActionConfirmation('chat-one',{type:'create_task',args:{title:'Second'}},{ownerId:'one',planId:'plan',operationId:'second-preview',createdAt:1001});
 for(let i=0;i<20&&!f.context.document.querySelector('[data-ok]');i++)await turn();
 assert.equal(f.context.document.querySelectorAll('[role="dialog"]').length,1);assert.equal(f.writes.length,0);
 assert.match(f.context.document.body.textContent,/First/);assert.doesNotMatch(f.context.document.body.textContent,/Second/);
 f.context.document.querySelector('[data-ok]').click();assert.ok(await one);
 for(let i=0;i<20&&!f.context.document.querySelector('[data-ok]');i++)await turn();
 assert.match(f.context.document.body.textContent,/Second/);
 f.context.closeDialog();assert.equal(await two,false);assert.equal(f.data().boards[0].sections[0].tasks.length,1);
});

