import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {mountPageRouter} from '../page-router.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture(){
 const m=await import('../task-action-menu.js').catch(()=>({}));assert.equal(typeof m.mountTaskActionMenu,'function');
 const {document,window}=parseHTML('<html><body><main><section id="tasks" class="active"><div data-detail-row="a" tabindex="0"><input><textarea></textarea><span contenteditable="true">Edit</span><a href="/x">Link</a><button data-task-menu="a"><svg><path/></svg></button></div><div data-detail-row="b" tabindex="0"><button data-task-menu="b">Menu</button></div></section><button id="outside">Outside</button></main></body></html>');
 let active=document.body,owner='u',plan='p',available=true;const calls=[],errors=[];let items=[{id:'details',label:'<Details>',group:'open',enabled:true,disabledReason:''},{id:'complete',label:'Complete',group:'status',enabled:false,disabledReason:'Wait for save'},{id:'copy-title',label:'Copy title',group:'copy',enabled:true,disabledReason:''}];
 Object.defineProperty(document,'activeElement',{get:()=>active?.isConnected?active:document.body});window.HTMLElement.prototype.focus=function(){active=this};window.innerWidth=800;window.innerHeight=600;
 const root=document.getElementById('tasks'),resolveRow=el=>{const row=el?.closest?.('[data-detail-row]');return row&&root.contains(row)&&available?{taskId:row.dataset.detailRow,row}:null};
 const menu=m.mountTaskActionMenu({root,document,window,resolveRow,getIdentity:()=>({ownerId:owner,planId:plan}),actions:{items:()=>available?items:[],invoke:async(...args)=>{calls.push(args);return true}},onError:e=>errors.push(e)});
 const event=(target,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);target.dispatchEvent(e);return e};
 return {menu,root,document,window,calls,errors,event,button:root.querySelector('[data-task-menu]'),popup:()=>document.querySelector('[data-task-action-menu]'),setOwner:v=>owner=v,setPlan:v=>plan=v,setAvailable:v=>available=v,setItems:v=>items=v};
}
test('button and nested SVG open one accessible menu with escaped labels',async()=>{
 const f=await fixture();f.event(f.button.querySelector('path'),'click');let popup=f.popup();assert.ok(popup);assert.equal(popup.getAttribute('role'),'menu');assert.equal(popup.querySelector('details'),null);assert.equal(popup.querySelector('[role="menuitem"]').textContent,'<Details>');assert.equal(f.button.getAttribute('aria-expanded'),'true');assert.equal(f.document.activeElement,popup.querySelector('[role="menuitem"]'));
 f.event(f.root.querySelector('[data-task-menu="b"]'),'click');assert.equal(f.document.querySelectorAll('[data-task-action-menu]').length,1);assert.equal(f.button.getAttribute('aria-expanded'),'false');f.menu.dispose();assert.equal(f.popup(),null);
});
test('context menu opens on task space while native editing and links remain untouched',async()=>{
 const f=await fixture();for(const selector of ['input','textarea','[contenteditable]','a'])assert.equal(f.event(f.root.querySelector(selector),'contextmenu',{clientX:50,clientY:70}).defaultPrevented,false);
 assert.equal(f.popup(),null);assert.equal(f.event(f.root.querySelector('[data-detail-row]'),'contextmenu',{clientX:790,clientY:590}).defaultPrevented,true);assert.ok(f.popup());f.menu.dispose();
});
test('keyboard navigation includes disabled reasons and activation never bubbles or executes disabled actions',async()=>{
 const f=await fixture();f.event(f.button,'keydown',{key:'F10',shiftKey:true});const popup=f.popup(),items=popup.querySelectorAll('[role="menuitem"]');let leaked=0;f.document.body.addEventListener('click',()=>leaked++);
 f.event(items[0],'keydown',{key:'ArrowDown'});assert.equal(f.document.activeElement,items[1]);assert.equal(items[1].getAttribute('aria-disabled'),'true');assert.match(items[1].getAttribute('aria-label'),/Wait for save/);f.event(items[1],'click');assert.equal(f.calls.length,0);assert.equal(leaked,0);
 f.event(items[1],'keydown',{key:'End'});assert.equal(f.document.activeElement,items[2]);f.event(items[2],'keydown',{key:'Home'});assert.equal(f.document.activeElement,items[0]);f.event(items[0],'keydown',{key:'Enter'});await tick();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0][1].taskIds,['a']);assert.equal(f.popup(),null);f.menu.dispose();
});
test('Escape restores invoker; Tab exits; editor shortcuts remain native',async()=>{
 const f=await fixture();assert.equal(f.event(f.root.querySelector('input'),'keydown',{key:'F10',shiftKey:true}).defaultPrevented,false);f.event(f.button,'click');f.event(f.document.activeElement,'keydown',{key:'Escape'});assert.equal(f.document.activeElement,f.button);assert.equal(f.popup(),null);f.event(f.button,'click');const e=f.event(f.document.activeElement,'keydown',{key:'Tab'});assert.equal(e.defaultPrevented,false);assert.equal(f.popup(),null);f.menu.dispose();
});
test('outside pointer, scroll, resize, stale identity and removed targets dismiss without stale focus',async()=>{
 const f=await fixture();const open=()=>f.event(f.button,'click');open();f.event(f.popup(),'scroll');assert.ok(f.popup());f.event(f.root,'scroll');assert.equal(f.popup(),null);open();f.event(f.document.getElementById('outside'),'pointerdown');assert.equal(f.popup(),null);open();f.window.dispatchEvent(new f.window.Event('resize'));assert.equal(f.popup(),null);open();f.setOwner('other');f.menu.sync();assert.equal(f.popup(),null);open();f.setAvailable(false);f.menu.sync();assert.equal(f.popup(),null);f.menu.dispose();open();assert.equal(f.popup(),null);
});
test('live refresh updates labels and preserves the focused action',async()=>{
 const f=await fixture();f.event(f.button,'click');f.setItems([{id:'details',label:'Details',group:'open',enabled:true},{id:'complete',label:'Mark incomplete',group:'status',enabled:true}]);f.menu.sync();assert.equal(f.popup().querySelectorAll('[role="menuitem"]')[1].textContent,'Mark incomplete');assert.equal(f.document.activeElement.dataset.taskMenuAction,'details');f.menu.dispose();
});
test('geometry stays within viewport edges and restricts height',async()=>{
 const m=await import('../task-action-menu.js').catch(()=>({}));assert.equal(typeof m.positionTaskMenu,'function');for(const point of [{x:0,y:0},{x:799,y:0},{x:0,y:599},{x:799,y:599}]){const p=m.positionTaskMenu({point,menuSize:{width:260,height:900},viewport:{width:800,height:600,left:0,top:0},padding:8});assert.ok(p.left>=8&&p.left+260<=792);assert.ok(p.top>=8);assert.ok(p.maxHeight<=584)}
});
test('keyboard focus reveals overflowing actions without moving the document',async()=>{
 const f=await fixture();f.event(f.button,'click');const popup=f.popup(),items=popup.querySelectorAll('[role="menuitem"]');popup.scrollTop=0;
 popup.getBoundingClientRect=()=>({top:8,bottom:108});items[2].getBoundingClientRect=()=>({top:148,bottom:184});f.event(items[0],'keydown',{key:'End'});
 assert.equal(f.document.activeElement,items[2]);assert.equal(popup.scrollTop,76);items[0].getBoundingClientRect=()=>({top:-68,bottom:-32});f.event(items[2],'keydown',{key:'Home'});assert.equal(popup.scrollTop,0);f.menu.dispose();
});
test('activation rejects a menu after the Tasks surface becomes inactive',async()=>{
 const f=await fixture();f.event(f.button,'click');const item=f.popup().querySelector('[role="menuitem"]');f.root.classList.remove('active');f.event(item,'click');await tick();assert.equal(f.calls.length,0);assert.equal(f.popup(),null);f.menu.dispose();
});
test('real host navigation closes the popup before another page loads',async()=>{
 const f=await fixture(),source=await readFile(new URL('../app.js',import.meta.url),'utf8');f.root.classList.add('page-view');const home=f.document.createElement('section');home.id='home-page';home.className='page-view';f.document.body.append(home);
 f.window.location={href:'https://example.test/app.html?page=tasks'};f.window.history={state:null,pushState(){},replaceState(){}};f.window.setTimeout=setTimeout;f.window.clearTimeout=clearTimeout;
 const context=vm.createContext({mountPageRouter:options=>mountPageRouter({...options,document:f.document,window:f.window}),pageLoader:{prepare:async()=>{}},taskMenus:f.menu,taskSelection:null,taskInteractions:null,pageRenders:{activate(){}},aiPageAutoCollapsed:false,sidebarManuallyToggledOnAI:false,sidebar:null});
 vm.runInContext(source.slice(source.indexOf('    const pageRouter = mountPageRouter('),source.indexOf('    function updateClock()'))+';globalThis.router=pageRouter;',context);
 f.event(f.button,'click');assert.ok(f.popup());await context.router.navigate('home-page');assert.ok(!f.popup(),'navigation must remove the popup');f.menu.dispose();
});
test('section space shares one menu with exact section identity while editors keep native context menus',async()=>{
 const {mountTaskActionMenu}=await import('../task-action-menu.js'),{document,window}=parseHTML('<html><body><section id="tasks" class="active"><div data-board-id="b" data-section-id="s"><h3 tabindex="0">Section</h3><input><button>Control</button></div></section></body></html>');let active=document.body,available=true;window.HTMLElement.prototype.focus=function(){active=this};Object.defineProperty(document,'activeElement',{get:()=>active});const calls=[],root=document.getElementById('tasks'),block=root.firstElementChild;
 const menu=mountTaskActionMenu({root,document,window,getIdentity:()=>({ownerId:'u',planId:'p'}),resolveRow:()=>null,resolveSection:element=>{const block=element.closest?.('[data-section-id]');return available&&block?{element:block,section:{boardId:block.dataset.boardId,sectionId:block.dataset.sectionId}}:null},sectionActions:{items:()=>[{id:'add',label:'Add task',group:'section',enabled:true},{id:'select-section',label:'Select tasks in section',group:'section',enabled:true},{id:'collapse-section',label:'Collapse section',group:'section',enabled:true}],invoke:async(...args)=>calls.push(args)},actions:{items:()=>[],invoke:()=>assert.fail('Wrong scope')}});
 const event=(el,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);el.dispatchEvent(e);return e};block.querySelector('button').setAttribute('aria-expanded','true');assert.equal(event(block.querySelector('input'),'contextmenu').defaultPrevented,false);assert.equal(event(block.querySelector('button'),'contextmenu').defaultPrevented,false);assert.equal(event(block,'contextmenu',{clientX:20,clientY:20}).defaultPrevented,true);assert.equal(document.querySelectorAll('[data-task-action-menu]').length,1);document.querySelector('[data-task-menu-action="add"]').click();await tick();assert.equal(calls[0][1].scope,'section');assert.deepEqual(calls[0][1].section,{boardId:'b',sectionId:'s'});assert.equal(block.querySelector('button').getAttribute('aria-expanded'),'true');
 event(block.querySelector('h3'),'keydown',{key:'F10',shiftKey:true});assert.ok(document.querySelector('[data-task-action-menu]'));available=false;menu.sync();assert.ok(!document.querySelector('[data-task-action-menu]'));menu.dispose();
});
