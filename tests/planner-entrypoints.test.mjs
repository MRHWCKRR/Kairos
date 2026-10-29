import {createSettingsForm} from '../app-settings-form.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import * as recurrenceUi from '../schedule-recurrence-ui.js';
import * as model from '../task-list-model.js';
import * as utils from '../schedule-utils.js';
import {createDashboardController} from '../dashboard-controller.js';
import {mountPageRouter} from '../page-router.js';

const creatorSource=await readFile(new URL('../schedule-task-create.js',import.meta.url),'utf8');
const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8');

test('Schedule toolbar retains event creation alongside task creation after decoration and rerender',async()=>{
 const {document,window}=parseHTML('<html><body><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><div id="schedule-inspector" hidden></div></div></body></html>');
 Object.defineProperty(document,'readyState',{value:'loading'});
 Object.defineProperty(window.HTMLElement.prototype,'elements',{get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(e=>[e.name||e.getAttribute('name'),e]))},configurable:true});
 let eventOpens=0;
 window.__kairosScheduleBridge={getOwnerId:()=> 'one',getPlanId:()=> 'plan',getBoards:()=>[]};
 window.__kairosScheduleWorkspace={state:{selected:{}},inspectorSession:{requestLeave:async()=>true}};
 const context=vm.createContext({...recurrenceUi,...model,...utils,document,window,MutationObserver:window.MutationObserver,requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,console});
 vm.runInContext(creatorSource.replace(/^import[^\n]*\n/gm,''),context);
 for(let pass=0;pass<2;pass++){
  const toolbar=document.getElementById('schedule-toolbar');
  toolbar.innerHTML='<div class="ks-toolbar-actions"><button data-plan>Plan</button><button data-event>+ Event</button><button data-calendars>Calendars</button></div>';
  const eventButton=toolbar.querySelector('[data-event]');eventButton.onclick=()=>eventOpens++;
  context.decorateToolbar();context.decorateToolbar();
  assert.ok(toolbar.querySelector('[data-event]')===eventButton,'task decoration must retain the native event control and its handler');
  assert.equal(toolbar.querySelectorAll('[data-add-task]').length,1,'repeated decoration must not duplicate task creation');
  eventButton.click();assert.equal(eventOpens,pass+1);
  toolbar.querySelector('[data-add-task]').click();await new Promise(setImmediate);
  assert.ok(document.querySelector('[data-ks-create-task]'),'task action still opens the actual creator');
  assert.equal(document.getElementById('schedule-inspector').hidden,false);
  context.closeCreator();
 }
});

for(const scenario of [
 {name:'before authentication resolves',user:null,pending:null,want:'Applied'},
 {name:'with no recovery for a signed-in user',user:{uid:'one'},pending:null,want:'Applied'},
 {name:'with matching recovery',user:{uid:'one'},pending:{ownerId:'one',settings:{profile:{displayName:'Recovered'}}},want:'Recovered'},
 {name:'with recovery belonging to another account',user:{uid:'two'},pending:{ownerId:'one',settings:{profile:{displayName:'Private'}}},want:'Applied'}
])test('Settings entry opens safely '+scenario.name,()=>{
 let refreshed=0,saveBar;
 const {document}=parseHTML('<html><body><input id="settings-display-name"><div id="shortcut-settings-editor"></div><div id="planning-preferences-editor"></div><div id="weekly-availability-editor"></div></body></html>');
 let draft;const applied={profile:{displayName:'Applied'},accessibility:{},appearance:{},notifications:{}};
 if(scenario.pending)scenario.pending.settings={...applied,...scenario.pending.settings};
 const form=createSettingsForm({document,getUser:()=>scenario.user,settingsSync:{state:()=>({pending:scenario.pending})},getApplied:()=>applied,getDraft:()=>draft,setDraft:value=>{draft=value},onControlsRefresh:()=>refreshed++,onSaveBar:value=>saveBar=value,onDirty(){},tr:key=>key,getLocale:()=> 'en',updateBrowserPushHint(){}});
 form.enter();
 assert.equal(draft.profile.displayName,scenario.want);
 assert.equal(document.getElementById('settings-display-name').value,scenario.want);assert.equal(refreshed,1);assert.equal(saveBar,false);
 draft.profile.displayName='Edited';
 assert.equal(scenario.pending?.settings?.profile.displayName,scenario.want==='Recovered'?'Recovered':scenario.pending?'Private':undefined);
 assert.equal(applied.profile.displayName,'Applied');
});

test('Today opens task details only after Tasks navigation completes',async()=>{
 let page='dashboard',release,opened=0;
 const gate=new Promise(resolve=>release=resolve);
 const controller=createDashboardController({getIdentity:()=>({ownerId:'one',planId:'plan'}),requestClose:async()=>true,navigate:async destination=>{assert.equal(destination,'tasks-page');await gate;page='tasks'},openTask:(id,source)=>{assert.equal(page,'tasks');assert.equal(id,'task');assert.equal(source,'opener');opened++;return true}});
 const pending=controller.open({kind:'task',taskId:'task'},'open','opener');
 await new Promise(setImmediate);assert.equal(opened,0);
 release();assert.equal(await pending,true);assert.equal(opened,1);
});

test('Today task opening respects cancelled draft close and account switches during navigation',async()=>{
 for(const cancelled of [true,false]){
  let owner='one',release,navigated=0,opened=0;
  const gate=new Promise(resolve=>release=resolve);
  const controller=createDashboardController({getIdentity:()=>({ownerId:owner,planId:'plan'}),requestClose:async()=>!cancelled,navigate:async()=>{navigated++;await gate},openTask:()=>opened++});
  const pending=controller.open({kind:'task',taskId:'private'},'open');await new Promise(setImmediate);
  if(!cancelled)owner='two';release();assert.equal(await pending,false);assert.equal(opened,0);assert.equal(navigated,cancelled?0:1);
 }
});

function routedToday(preparePage){
 const {document,window}=parseHTML('<html><body><section id="home-page" class="page-view active"></section><section id="tasks-page" class="page-view"></section><section id="schedule-page" class="page-view"></section></body></html>');
 window.location={href:'https://kairos.invalid/app.html?page=dashboard'};
 window.history={state:null,pushState(_state,_title,url){window.location.href=url}};
 const router=mountPageRouter({document,window,preparePage});let opened=0;
 const controller=createDashboardController({document,window,getIdentity:()=>({ownerId:'one',planId:'plan'}),requestClose:async()=>true,navigate:page=>router.navigate(page),openTask:()=>{opened++;return true}});
 return {router,controller,document,opened:()=>opened};
}

test('Today cannot open hidden task details after real router navigation is superseded',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=routedToday(page=>page==='tasks-page'?gate:Promise.resolve());
 const pending=f.controller.open({kind:'task',taskId:'task'},'open');await new Promise(setImmediate);
 await f.router.navigate('schedule-page');release();
 assert.equal(await pending,false);assert.equal(f.opened(),0);
 assert.equal(f.document.getElementById('tasks-page').classList.contains('active'),false);
});

test('Today cannot open task details when real router preparation fails',async()=>{
 const f=routedToday(async()=>{throw Error('Task module unavailable')});
 const warn=console.warn;console.warn=()=>{};
 try{assert.equal(await f.controller.open({kind:'task',taskId:'task'},'open'),false);assert.equal(f.opened(),0)}finally{console.warn=warn}
});

test('Today does not treat an already-loading Tasks route as ready',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=routedToday(()=>gate),loading=f.router.navigate('tasks-page');
 try{assert.equal(await f.controller.open({kind:'task',taskId:'task'},'open'),false);assert.equal(f.opened(),0)}finally{release();await loading}
 assert.equal(await f.controller.open({kind:'task',taskId:'task'},'open'),true);assert.equal(f.opened(),1);
});
