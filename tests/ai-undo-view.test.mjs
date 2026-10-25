import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {mountAiUndo} from '../ai-undo-view.js';import {createMutationSession} from '../mutation-session.js';
const tick=()=>new Promise(setImmediate);
test('AI Undo requires a visible review before submitting and cancels on account change',async()=>{
 const {document,window}=parseHTML('<html><body><div id="root"></div></body></html>');let identity={ownerId:'one',planId:'p'},calls=0;const memory=new Map();
 const session=createMutationSession({getIdentity:()=>identity,storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},commit:async()=>{calls++;return {}}});
 const controller=mountAiUndo({root:document.querySelector('#root'),document,window,getIdentity:()=>identity,session,loadPreview:async()=>({command:{type:'action_undo',sourceOperationId:'x'},expected:{sourceOperationId:'x'},rows:[{title:'<script>x</script>',field:'date',before:'Today',after:'Not set'}]})});
 document.querySelector('[data-ai-undo-open]').click();await tick();assert.equal(calls,0);assert.equal(document.querySelectorAll('script').length,0);assert.equal(document.querySelector('dialog').hasAttribute('open'),true);
 identity={ownerId:'two',planId:'other'};controller.sync();assert.equal(document.querySelector('dialog').hasAttribute('open'),false);document.querySelector('[data-ai-undo-apply]').click();await tick();assert.equal(calls,0);controller.dispose();
});

