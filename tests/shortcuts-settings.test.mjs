import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountShortcutSettings} from '../shortcut-settings.js';
import {DEFAULT_SHORTCUTS} from '../shortcut-model.js';
import {mountGlobalSearch} from '../global-search.js';
import {mountTaskKeyboardShortcuts} from '../task-keyboard-shortcuts.js';
const send=(window,target,key,props={})=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{key,...props});target.dispatchEvent(event);return event;};
test('editor records validates cancels resets and refreshes without storing settings',()=>{
 const {document,window}=parseHTML('<html><body><div id="editor"></div></body></html>');let value={...DEFAULT_SHORTCUTS},changes=0;const root=document.getElementById('editor');
 const editor=mountShortcutSettings({root,getValue:()=>value,onChange:next=>{value=next;changes++;}});
 const row=root.querySelector('.shortcut-settings-row'),input=row.querySelector('input'),[edit,reset]=row.querySelectorAll('button');
 edit.click();assert.equal(send(window,input,'w',{ctrlKey:true}).defaultPrevented,true);assert.equal(changes,0);assert.match(root.querySelector('[role="status"]').textContent,/reserved/);
 send(window,input,'n');assert.equal(changes,0);assert.match(root.querySelector('[role="status"]').textContent,/Already/);
 send(window,input,'g',{altKey:true});assert.equal(value.search,'Alt+G');assert.equal(input.value,'Alt+G');assert.equal(changes,1);
 edit.click();send(window,input,'Escape');send(window,input,'h',{altKey:true});assert.equal(changes,1);
 reset.click();assert.equal(value.search,'Mod+K');assert.equal(reset.disabled,true);
 value={...value,search:'Alt+J'};editor.refresh();assert.equal(input.value,'Alt+J');editor.dispose();assert.equal(root.children.length,0);
});
test('changed search shortcut follows getter and unmodified search preserves text editing',()=>{
 const {document,window}=parseHTML('<html><body><input id="typing"></body></html>');let shortcuts={search:'Alt+G'};
 const search=mountGlobalSearch({document,window,getIdentity:()=>({ownerId:'u',planId:'p'}),getState:()=>({boards:[]}),getToday:()=> '2026-10-20',onNavigate:async()=>true,getShortcuts:()=>shortcuts});
 assert.equal(send(window,document.body,'k',{ctrlKey:true}).defaultPrevented,false);
 assert.equal(send(window,document.body,'g',{altKey:true}).defaultPrevented,true);search.close();shortcuts={search:'G'};
 assert.equal(send(window,document.querySelector('#typing'),'g').defaultPrevented,false);
 assert.equal(send(window,document.body,'g').defaultPrevented,true);search.dispose();
});
test('Tasks consumes modified custom actions and displays their current labels',async()=>{
 const {document,window}=parseHTML('<html><body><section class="active"><h2>Tasks</h2></section></body></html>');const root=document.querySelector('section');let added=0;
 const shortcuts={addTask:'Alt+G',showTaskShortcuts:'Alt+H',saveTaskDetails:'Alt+Enter'};
 const controller=mountTaskKeyboardShortcuts({root,document,window,getIdentity:()=>({ownerId:'u',planId:'p'}),getShortcuts:()=>shortcuts,workspace:{getViewKey:()=> 'all',getCurrentSection:()=>({boardId:'b',sectionId:'s'}),hasPendingCapture:()=>false,addTask:async()=>{added++;}}});
 assert.equal(send(window,document.body,'n').defaultPrevented,false);assert.equal(send(window,document.body,'g',{altKey:true}).defaultPrevented,true);await Promise.resolve();assert.equal(added,1);
 assert.equal(send(window,document.body,'h',{altKey:true}).defaultPrevented,true);const guide=root.querySelector('dialog');assert.match(guide.textContent,/Alt\+G/);assert.match(guide.textContent,/Alt\+H/);assert.match(guide.textContent,/Alt\+Enter/);controller.dispose();
});
