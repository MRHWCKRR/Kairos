import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {mountTaskCapture} from '../task-capture.js';
test('contextual capture selects the current board/date without replacing an existing draft',()=>{
 const {document,window}=parseHTML('<html><body></body></html>');
 const data={boards:[{id:'first',title:'First',sections:[{id:'s',title:'General',tasks:[]}]},{id:'current',title:'Current',sections:[{id:'next',title:'Next',tasks:[]}]}]};
 const c=mountTaskCapture({document,window,getIdentity:()=>({ownerId:'one',planId:'p'}),getState:()=>data,getDefaults:()=>({boardId:'current',sectionId:'next',date:'2026-10-25'})});
 c.open();assert.equal(document.querySelector('[name="boardId"]').value,'current');assert.equal(document.querySelector('[name="date"]').value,'2026-10-25');
 const title=document.querySelector('[name="title"]');title.value='Keep';title.dispatchEvent(new window.Event('input',{bubbles:true}));c.close();c.open({boardId:'first',date:'2026-10-26'});assert.equal(title.value,'Keep');assert.equal(document.querySelector('[name="date"]').value,'2026-10-25');c.dispose();
});

