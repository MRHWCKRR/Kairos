import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
 const module=await import('../ui-context-menu.js').catch(()=>({}));assert.equal(typeof module.mountSiteContextMenu,'function');
 const {document,window}=parseHTML('<html><head></head><body><main><p id="text">Some text</p><textarea>hello world</textarea><input type="password" value="secret"><a href="/docs.html">Docs</a><a id="unsafe" href="javascript:alert(1)">Unsafe</a><div data-detail-row="a"><button data-task-menu>Task</button></div></main></body></html>');
 let active=document.body,selected='selected text',clipboard='paste',reject=false,resolveRead;const writes=[],opened=[],history=[];
 Object.defineProperty(document,'activeElement',{get:()=>active});window.HTMLElement.prototype.focus=function(){active=this};window.HTMLElement.prototype.getBoundingClientRect=()=>({left:30,top:30,bottom:60,width:260,height:400});
 window.innerWidth=800;window.innerHeight=600;window.location={href:'https://kairos.test/app.html?page=tasks',reload:()=>history.push('reload')};window.history={back:()=>history.push('back'),forward:()=>history.push('forward')};window.open=(...args)=>opened.push(args);window.print=()=>history.push('print');window.getSelection=()=>({toString:()=>selected});
 const field=document.querySelector('textarea');field.value='hello world';field.selectionStart=6;field.selectionEnd=11;field.setSelectionRange=(a,b)=>{field.selectionStart=a;field.selectionEnd=b};field.setRangeText=(value,a,b)=>{field.value=field.value.slice(0,a)+value+field.value.slice(b);field.setSelectionRange(a+value.length,a+value.length)};
 const menu=module.mountSiteContextMenu({document,window,clipboard:{writeText:async value=>{if(reject)throw Error('Denied');writes.push(value)},readText:()=>reject?Promise.reject(Error('Denied')):resolveRead?new Promise(r=>resolveRead(r)):Promise.resolve(clipboard)}});
 const event=(target,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);target.dispatchEvent(e);return e};
 const popup=()=>document.querySelector('[data-site-context-menu]'),action=id=>popup()?.querySelector('[data-context-action="'+id+'"]');
 return{document,window,field,menu,event,popup,action,writes,opened,history,setReject:v=>reject=v,setSelected:v=>selected=v,delayRead:fn=>resolveRead=fn};
}
test('Deselect checkbox menu items share the regular menu item appearance and focus styles',async()=>{
 const css=await readFile(new URL('../task-list.css',import.meta.url),'utf8');const rules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(m=>m[1].includes('[role="menuitem"]'));
 assert.ok(rules.some(m=>m[2].includes('display:flex')));for(const rule of rules)assert.ok(rule[1].includes('[role="menuitemcheckbox"]'),'Checkbox menu items must receive the same '+rule[1]+' rule');
});
test('sitewide context opens once, clamps to viewport, copies selection, and supports native escape',async()=>{
 const f=await fixture(),target=f.document.getElementById('text');assert.equal(f.event(target,'contextmenu',{clientX:799,clientY:599}).defaultPrevented,true);assert.ok(f.popup());assert.ok(parseInt(f.popup().style.left)<=532);f.event(target,'contextmenu');assert.equal(f.document.querySelectorAll('[data-site-context-menu]').length,1);f.event(f.action('copy'),'click');await tick();assert.deepEqual(f.writes,['selected text']);assert.equal(f.popup(),null);
 assert.equal(f.event(target,'contextmenu',{shiftKey:true}).defaultPrevented,false);assert.equal(f.popup(),null);f.menu.dispose();
});
test('field cut and paste preserve selection, emit input and never submit a form',async()=>{
 const f=await fixture();let inputs=0;f.field.addEventListener('input',()=>inputs++);f.event(f.field,'contextmenu');f.event(f.action('cut'),'click');await tick();assert.deepEqual(f.writes,['world']);assert.equal(f.field.value,'hello ');assert.equal(inputs,1);f.event(f.field,'contextmenu');f.event(f.action('paste'),'click');await tick();assert.equal(f.field.value,'hello paste');assert.equal(inputs,2);f.menu.dispose();
});
test('passwords, readonly fields, unsupported controls and stale asynchronous paste do not change values',async()=>{
 const f=await fixture();const password=f.document.querySelector('input');f.event(password,'contextmenu');assert.equal(f.action('copy').getAttribute('aria-disabled'),'true');assert.equal(f.action('cut').getAttribute('aria-disabled'),'true');f.menu.close();
 f.field.readOnly=true;f.event(f.field,'contextmenu');assert.equal(f.action('paste').getAttribute('aria-disabled'),'true');f.menu.close();f.field.readOnly=false;
 let finish;f.delayRead(resolve=>finish=resolve);f.event(f.field,'contextmenu');f.event(f.action('paste'),'click');f.field.value='changed elsewhere';finish('old clipboard');await tick();assert.equal(f.field.value,'changed elsewhere');assert.match(f.popup().textContent,/changed|again/i);f.menu.dispose();
});
test('clipboard denial reports keyboard fallback, never clears a cut selection',async()=>{
 const f=await fixture();f.setReject(true);f.event(f.field,'contextmenu');f.event(f.action('cut'),'click');await tick();assert.equal(f.field.value,'hello world');assert.match(f.popup().textContent,/Ctrl|Cmd/);f.menu.dispose();
});
test('specialized task menus retain priority and Shift right-click bypasses both menu owners',async()=>{
 const f=await fixture();const root=f.document.querySelector('[data-detail-row]');root.addEventListener('contextmenu',event=>{if(!event.shiftKey)event.preventDefault()});f.event(root,'contextmenu');assert.equal(f.popup(),null);assert.equal(f.event(root,'contextmenu',{shiftKey:true}).defaultPrevented,false);
 const m=await import('../task-action-menu.js');const actions=m.mountTaskActionMenu({root,getIdentity:()=>({ownerId:'u',planId:'p'}),resolveRow:()=>({taskId:'a',row:root}),actions:{items:()=>[{id:'x',label:'X',enabled:true}],invoke:()=>true}});root.classList.add('active');assert.equal(f.event(root,'contextmenu',{shiftKey:true}).defaultPrevented,false);assert.equal(actions.isOpen(),false);actions.dispose();f.menu.dispose();
});
test('keyboard context, Escape, outside click, scroll and dispose clean up; Inspect gives honest browser guidance',async()=>{
 const f=await fixture(),target=f.document.getElementById('text');target.focus();f.event(target,'keydown',{key:'ContextMenu'});assert.ok(f.popup());f.event(f.action('copy'),'keydown',{key:'ArrowDown'});assert.notEqual(f.document.activeElement,f.action('copy'));f.event(f.document.activeElement,'keydown',{key:'Escape'});assert.equal(f.popup(),null);assert.equal(f.document.activeElement,target);
 f.event(target,'contextmenu');f.event(f.action('inspect'),'click');assert.match(f.popup().textContent,/Ctrl.*Shift.*C|Cmd/);f.event(target,'pointerdown');assert.equal(f.popup(),null);f.event(target,'contextmenu');f.event(f.document,'scroll');assert.equal(f.popup(),null);f.menu.dispose();assert.equal(f.event(target,'contextmenu').defaultPrevented,false);
});
test('links open safely and navigation uses browser history; unsafe URLs never gain open/copy actions',async()=>{
 const f=await fixture();f.event(f.document.querySelector('a'),'contextmenu');f.event(f.action('open-link'),'click');assert.equal(f.opened[0][0],'https://kairos.test/docs.html');assert.match(f.opened[0][2],/noopener/);f.event(f.document.getElementById('unsafe'),'contextmenu');assert.equal(f.action('open-link'),null);f.event(f.action('back'),'click');assert.deepEqual(f.history,['back']);f.menu.dispose();
});
test('shared bootstrap upgrades an older UI stylesheet instead of leaving the menu unstyled',async()=>{
 const {ensureUiStyles}=await import('../ui-styles.js');const {document}=parseHTML('<html><head><link data-kairos-ui rel="stylesheet" href="ui-controls.css?v=1"></head><body></body></html>');ensureUiStyles(document);ensureUiStyles(document);assert.equal(document.querySelectorAll('[data-kairos-ui]').length,1);assert.equal(document.querySelector('[data-kairos-ui]').getAttribute('href'),'ui-controls.css?v=2');
});
test('unsupported input menus stay native; canceled beforeinput and canceled asynchronous paste cannot edit',async()=>{
 const f=await fixture(),number=f.document.createElement('input');number.type='number';f.document.body.appendChild(number);assert.equal(f.event(number,'contextmenu').defaultPrevented,false);assert.equal(f.popup(),null);
 f.field.addEventListener('beforeinput',event=>event.preventDefault());f.event(f.field,'contextmenu');f.event(f.action('paste'),'click');await tick();assert.equal(f.field.value,'hello world');
 let finish;f.delayRead(resolve=>finish=resolve);f.event(f.field,'contextmenu');f.event(f.action('paste'),'click');f.menu.close();finish('late');await tick();assert.equal(f.field.value,'hello world');f.menu.dispose();
});
