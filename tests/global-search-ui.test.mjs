import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
let m={};try{m=await import('../global-search.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
function fixture(onNavigate=async()=>true){assert.equal(typeof m.mountGlobalSearch,'function');const {document,window}=parseHTML('<html><body><button data-global-search-open>Search</button><input id="other"></body></html>');let uid='one',plan='plan',state={boards:[{id:'b',title:'School',sections:[{id:'s',title:'Study',tasks:[{id:'a',title:'<Essay>',dueDate:'2026-10-19'},{id:'c',title:'Completed task',completed:true}]}]}]};const calls=[];const controller=m.mountGlobalSearch({document,window,getIdentity:()=>({ownerId:uid,planId:plan}),getState:()=>state,getToday:()=> '2026-10-20',onNavigate:async(...args)=>{calls.push(args[0]);return onNavigate(...args)}});const send=(target,key,extra={})=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{key,...extra});target.dispatchEvent(event);return event};return {controller,document,window,calls,send,input(value){const el=document.querySelector('[data-search-query]');el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}))},setOwner(value){uid=value;controller.sync()},setPlan(value){plan=value;controller.sync()},setState(value){state=value},click(selector){document.querySelector(selector).click()}}}

test('arrow navigation keeps the query editable and Enter opens the selected result',async()=>{
 const f=fixture();f.controller.open();const input=f.document.querySelector('[data-search-query]');
 assert.equal(input.getAttribute('role'),'combobox');
 const current=()=>f.document.getElementById(input.getAttribute('aria-activedescendant'));
 assert.equal(current().textContent.includes('School'),true);
 f.send(input,'ArrowDown');assert.match(current().textContent,/<Essay>/);
 f.send(input,'Enter');await new Promise(r=>setImmediate(r));assert.deepEqual(f.calls,[{kind:'task',taskId:'a'}]);f.controller.dispose();
});

test('results show readable location, labelled date and status without broken characters',()=>{
 const f=fixture();f.controller.open();f.input('Essay');const row=f.document.querySelector('[data-search-result]');
 assert.match(row.textContent,/School \/ Study/);assert.match(row.textContent,/Due/);assert.match(row.textContent,/Overdue/);
 assert.equal(row.querySelector('time').getAttribute('datetime'),'2026-10-19');
 assert.doesNotMatch(f.document.querySelector('dialog').textContent,/[\u0000-\u0008\u000e-\u001f\ufffd]/);f.controller.dispose();
});

test('filtered empty results let users search all work without losing their query',()=>{
 const f=fixture();f.controller.open();f.input('Completed');f.click('[data-search-filter="unfinished"]');
 assert.match(f.document.querySelector('[data-search-empty]').textContent,/Unfinished/);
 f.click('[data-search-reset-filter]');assert.equal(f.document.querySelector('[data-search-query]').value,'Completed');
 assert.equal(f.document.querySelectorAll('[data-search-result]').length,1);
 f.input('Missing <title>');assert.match(f.document.querySelector('[data-search-empty]').textContent,/Missing <title>/);
 assert.equal(f.document.querySelector('title'),null);f.click('[data-search-clear-query]');assert.equal(f.document.querySelectorAll('[data-search-result]').length,3);
 f.setState({boards:[]});f.controller.sync();assert.match(f.document.querySelector('[data-search-empty]').textContent,/No active work yet/);f.controller.dispose();
});

test('live updates retain the selected task by identity and clear a selection that disappeared',async()=>{
 const f=fixture();f.controller.open();const input=f.document.querySelector('[data-search-query]');f.send(input,'ArrowDown');
 f.setState({boards:[{id:'b',title:'School',sections:[{id:'s',title:'Study',tasks:[{id:'z',title:'!New task'},{id:'a',title:'<Essay>'}]}]}]});f.controller.sync();
 f.send(input,'Enter');await new Promise(r=>setImmediate(r));assert.deepEqual(f.calls,[{kind:'task',taskId:'a'}]);
 f.controller.open();f.setState({boards:[]});f.controller.sync();assert.equal(input.hasAttribute('aria-activedescendant'),false);f.send(input,'Enter');assert.equal(f.calls.length,1);f.controller.dispose();
});
test('Ctrl/Cmd K opens scoped search, typing escapes titles and Enter navigates a real task',async()=>{const f=fixture();const e=f.send(f.document.getElementById('other'),'k',{ctrlKey:true});assert.equal(e.defaultPrevented,true);assert.equal(f.document.querySelector('dialog').hasAttribute('open'),true);f.input('Essay');assert.equal(f.document.querySelector('Essay'),null);assert.match(f.document.querySelector('[data-search-results]').textContent,/<Essay>/);f.send(f.document.querySelector('[data-search-query]'),'Enter');await new Promise(r=>setImmediate(r));assert.deepEqual(f.calls,[{kind:'task',taskId:'a'}]);assert.equal(f.document.querySelector('dialog').hasAttribute('open'),false);f.controller.dispose()});
test('filters and keyboard navigation support empty results without overwriting query focus',()=>{const f=fixture();f.controller.open();f.input('Completed');f.click('[data-search-filter="unfinished"]');assert.match(f.document.querySelector('[data-search-empty]').textContent,/No matching/);f.click('[data-search-filter="completed"]');assert.equal(f.document.querySelectorAll('[data-search-result]').length,1);f.send(f.document.querySelector('[data-search-query]'),'ArrowDown');f.send(f.document.querySelector('[data-search-result]'),'Escape');assert.equal(f.document.querySelector('dialog').hasAttribute('open'),false);f.controller.dispose()});
test('foreign dialogs, composition, repeat and alternate shortcuts retain their keyboard behaviour',()=>{const f=fixture(),foreign=f.document.createElement('dialog');foreign.setAttribute('open','');f.document.body.append(foreign);assert.equal(f.send(f.document,'k',{metaKey:true}).defaultPrevented,false);foreign.remove();for(const extra of [{ctrlKey:true,isComposing:true},{ctrlKey:true,repeat:true},{ctrlKey:true,altKey:true},{ctrlKey:true,shiftKey:true}])assert.equal(f.send(f.document,'k',extra).defaultPrevented,false);assert.equal(f.send(f.document,'k',{metaKey:true}).defaultPrevented,true);f.controller.dispose()});
test('account/planner changes clear private search and late navigation cannot reopen it',async()=>{let release;const f=fixture(()=>new Promise(r=>release=r));f.controller.open();f.input('Essay');f.click('[data-search-result]');await new Promise(r=>setImmediate(r));f.setOwner('two');release(false);await new Promise(r=>setImmediate(r));assert.equal(f.document.querySelector('dialog').hasAttribute('open'),false);assert.equal(f.document.querySelector('[data-search-query]').value,'');assert.doesNotMatch(f.document.querySelector('[data-search-results]').textContent,/Essay/);f.controller.open();f.input('School');f.setPlan('other');assert.equal(f.document.querySelector('dialog').hasAttribute('open'),false);f.controller.dispose()});
test('failed navigation preserves search and a stale target rejects before navigation',async()=>{const f=fixture(async()=>false);f.controller.open();f.input('Essay');f.click('[data-search-result]');await new Promise(r=>setImmediate(r));assert.equal(f.document.querySelector('dialog').hasAttribute('open'),true);assert.equal(f.document.querySelector('[data-search-query]').value,'Essay');assert.match(f.document.querySelector('[data-search-status]').textContent,/not opened/i);f.setState({boards:[]});f.click('[data-search-result]');await new Promise(r=>setImmediate(r));assert.equal(f.calls.length,1);assert.match(f.document.querySelector('[data-search-status]').textContent,/changed|unavailable/i);f.controller.dispose()});
