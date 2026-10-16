import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTaskListWorkspace} from '../task-list-workspace.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture(){
 const module=await import('../task-keyboard-shortcuts.js').catch(()=>({}));assert.equal(typeof module.mountTaskKeyboardShortcuts,'function','shortcuts module exists');
 const {document,window}=parseHTML('<html><body><main><section id="tasks" class="active"><h2>Tasks</h2><div id="overview"><div class="board-section-block" data-board-id="b" data-section-id="s"><div class="section-title-row"></div><ul class="task-list"></ul><button class="add-task-btn">Add</button></div><div class="board-section-block" data-board-id="b" data-section-id="q"><div class="section-title-row"></div><ul class="task-list"></ul><button class="add-task-btn">Add</button></div></div></section><input id="outside"><div id="editable" contenteditable="true"><span>Rich text</span></div><textarea></textarea></main></body></html>');
 const root=document.getElementById('tasks'),overview=document.getElementById('overview');let owner='one',plan='plan',busy=false,focused=null,blocked=false,wait=null;
 window.HTMLElement.prototype.focus=function(){focused=this;this.dispatchEvent(new window.Event('focusin',{bubbles:true}))};Object.defineProperty(document,'activeElement',{get:()=>focused?.isConnected?focused:document.body});
 const data={boards:[{id:'b',title:'Board',sections:[{id:'s',title:'One',tasks:[]},{id:'q',title:'Two',tasks:[]}]}]};
 const workspace=mountTaskListWorkspace({root,overview,document,window,getState:()=>data,getOwnerId:()=>owner,getPlanId:()=>plan,storage:{getItem:()=>null,setItem(){}},ensurePlan:async()=>wait?await wait:true});workspace.decorateOverview();
 const shortcuts=module.mountTaskKeyboardShortcuts({root,document,window,workspace,getIdentity:()=>({ownerId:owner,planId:plan}),getViewKey:()=>workspace.getViewKey(),isBusy:()=>busy,isBlocked:()=>blocked});
 const key=(value,target=document.body,props={})=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{key:value,...props});target.dispatchEvent(event);return event};
 return {document,window,root,overview,workspace,shortcuts,key,data,focused:()=>focused,setOwner:v=>owner=v,setPlan:v=>plan=v,setBusy:v=>busy=v,setBlocked:v=>blocked=v,setWait:v=>wait=v,dispose(){shortcuts.dispose();workspace.dispose()}};
}
test('N opens inline capture in the focused section and Escape cancels without saving',async()=>{
 const f=await fixture();try{f.root.querySelector('[data-section-id="q"] [data-open-section]').focus();assert.equal(f.key('n').defaultPrevented,true);await tick();const input=f.overview.querySelector('[data-quick-title]');assert.ok(input);assert.equal(input.closest('.board-section-block').dataset.sectionId,'q');input.value='Draft';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.key('Escape',input);assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);assert.equal(f.data.boards[0].sections[1].tasks.length,0)}finally{f.dispose()}
});
test('shortcuts preserve native editing, modifiers, IME and held keys',async()=>{
 const f=await fixture();try{f.root.querySelector('[data-open-section]').focus();for(const target of [f.document.querySelector('#outside'),f.document.querySelector('textarea'),f.document.querySelector('#editable span')])for(const key of ['n','?'])assert.equal(f.key(key,target).defaultPrevented,false);
 for(const props of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{keyCode:229},{repeat:true}])assert.equal(f.key('n',f.document.body,props).defaultPrevented,false);await tick();assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);assert.equal(f.document.querySelector('[data-task-shortcut-guide]'),null)}finally{f.dispose()}
});
test('an expanded custom select keeps letter keys and question mark',async()=>{
 const f=await fixture();try{const select=f.document.createElement('button');select.setAttribute('role','combobox');select.setAttribute('aria-expanded','true');f.root.appendChild(select);select.focus();assert.equal(f.key('n',select).defaultPrevented,false);assert.equal(f.key('?',select).defaultPrevented,false)}finally{f.dispose()}
});
test('guide supports button, question mark, Escape and focus restoration',async()=>{
 const f=await fixture();try{const opener=f.root.querySelector('[data-task-shortcuts]');assert.ok(opener);opener.focus();f.key('?');const guide=f.document.querySelector('[data-task-shortcut-guide]');assert.ok(guide);assert.equal(guide.getAttribute('aria-labelledby'),'task-shortcut-title');assert.match(guide.textContent,/Alt/);f.key('Escape',guide.querySelector('button'));assert.equal(f.document.querySelector('[data-task-shortcut-guide]'),null);assert.equal(f.focused(),opener);opener.click();assert.ok(f.document.querySelector('[data-task-shortcut-guide]'))}finally{f.dispose()}
});
test('inactive page, menu, pending saves and identity changes cannot create tasks',async()=>{
 const f=await fixture();try{f.root.querySelector('[data-open-section]').focus();f.setBusy(true);f.key('n');await tick();assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);f.setBusy(false);f.setBlocked(true);assert.equal(f.key('n').defaultPrevented,false);f.setBlocked(false);f.setOwner('other');f.shortcuts.sync();f.key('n');await tick();assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);f.root.classList.remove('active');assert.equal(f.key('?').defaultPrevented,false)}finally{f.dispose()}
});
test('N in overview asks for a section instead of choosing an arbitrary destination',async()=>{
 const f=await fixture();try{f.key('n');await tick();assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);assert.match(f.root.querySelector('[data-task-shortcut-status]').textContent,/section/i)}finally{f.dispose()}
});
test('focusing another section changes the N destination without losing the first draft',async()=>{
 const f=await fixture();try{f.root.querySelector('[data-section-id="s"] [data-open-section]').focus();f.key('n');await tick();const input=f.overview.querySelector('[data-quick-title]');input.value='Keep me';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.root.querySelector('[data-section-id="q"] [data-open-section]').focus();f.key('n');await tick();assert.equal(f.overview.querySelector('[data-quick-title]').closest('.board-section-block').dataset.sectionId,'q')}finally{f.dispose()}
});
test('guide closes on view and account changes without restoring stale focus; dispose removes handlers',async()=>{
 const f=await fixture();f.key('?');assert.ok(f.document.querySelector('[data-task-shortcut-guide]'));f.setPlan('new');f.shortcuts.sync();assert.equal(f.document.querySelector('[data-task-shortcut-guide]'),null);f.shortcuts.dispose();assert.equal(f.key('?').defaultPrevented,false);f.workspace.dispose();
});
test('a slow N action cannot open capture or steal focus after leaving Tasks',async()=>{
 const f=await fixture();try{let release;f.setWait(new Promise(resolve=>release=resolve));f.root.querySelector('[data-open-section]').focus();f.key('n');await tick();f.root.classList.remove('active');f.document.querySelector('#outside').focus();release(true);await tick();assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);assert.equal(f.focused().id,'outside')}finally{f.dispose()}
});
test('leaving Tasks and returning invalidates an earlier delayed N action',async()=>{
 const f=await fixture();try{let release;f.setWait(new Promise(resolve=>release=resolve));f.root.querySelector('[data-open-section]').focus();f.key('n');await tick();f.root.classList.remove('active');f.shortcuts.sync();f.root.classList.add('active');f.shortcuts.sync();f.document.querySelector('#outside').focus();release(true);await tick();assert.equal(f.overview.querySelector('[data-quick-title]')===null,true);assert.equal(f.focused().id,'outside')}finally{f.dispose()}
});
