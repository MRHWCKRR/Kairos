import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createMutationSession} from '../mutation-session.js';
import {mergePlanEdits} from '../plan-merge.js';
const modules=await Promise.all(['notification-center','settings-sync','dashboard-controller'].map(name=>import('../'+name+'.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;})));
const [notifications,settings,dashboard]=modules;
const tick=()=>new Promise(setImmediate);
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const storage=()=>{const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
function notificationFixture({persist}={}){
 assert.equal(typeof notifications.createNotificationCenter,'function','notification controller must own the real lifecycle');
 const {document,window}=parseHTML('<html><body><div id="notif-wrapper"><button id="notif-bell-btn"></button><span id="notif-badge"></span><div id="notif-panel" class="notif-panel"><div id="notif-panel-list"></div></div></div></body></html>');
 let owner='one',subscriptions=[],removed=0,writes=[],timers=new Map(),timerId=0,errors=[];
 const controller=notifications.createNotificationCenter({document,getOwnerId:()=>owner,subscribe:(id,next)=>{subscriptions.push({id,next});return ()=>removed++},persist:async(...args)=>{writes.push(args);return persist?persist(...args):args[2]},escapeText:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),setTimer:callback=>{timers.set(++timerId,callback);return timerId},clearTimer:id=>timers.delete(id),now:()=>1000,onError:(...args)=>errors.push(args)});
 return {controller,document,window,writes,timers,subscriptions,errors,removed:()=>removed,setOwner:id=>owner=id,flush:()=>{for(const fn of [...timers.values()])fn();timers.clear()}};
}
test('notification read delay captures visible IDs, preserving a later unread notification',async()=>{
 const f=notificationFixture();f.controller.setup('one');f.controller.bindBell();f.subscriptions[0].next({notifications:[{id:'first',title:'First',read:false,time:0}]});f.document.getElementById('notif-bell-btn').click();f.controller.push('Later','New');f.flush();await tick();
 assert.equal(f.controller.state().notifications.find(n=>n.id==='first').read,true);assert.equal(f.controller.state().notifications.find(n=>n.title==='Later').read,false);assert.equal(f.document.getElementById('notif-badge').textContent,'1');f.controller.dispose();
});
test('notification account switching cancels timers and ignores stale subscriptions',async()=>{
 const f=notificationFixture();f.controller.setup('one');f.controller.bindBell();f.subscriptions[0].next({notifications:[{id:'old',read:false}]});f.document.getElementById('notif-bell-btn').click();f.setOwner('two');f.controller.setup('two');f.subscriptions[1].next({notifications:[{id:'new',read:false}]});f.subscriptions[0].next({notifications:[{id:'leak',read:false}]});f.flush();await tick();
 assert.equal(f.timers.size,0);assert.equal(f.writes.length,0);assert.deepEqual(f.controller.state().notifications.map(n=>n.id),['new']);assert.equal(f.removed(),1);f.controller.dispose();
});
test('notification setup and disposal bind exactly one listener and escape rendered content',async()=>{
 const f=notificationFixture();f.controller.setup('one');f.controller.setup('one');f.controller.bindBell();f.controller.bindBell();f.subscriptions[0].next({notifications:[{id:'"><img src=x>',title:'<script>x</script>',message:'<img src=x>'}]});assert.equal(f.subscriptions.length,1);assert.equal(f.document.querySelectorAll('img,script').length,0);assert.match(f.document.getElementById('notif-panel-list').innerHTML,/&lt;script&gt;/);f.document.getElementById('notif-bell-btn').click();assert.equal(f.timers.size,1);f.controller.dispose();f.controller.dispose();assert.equal(f.removed(),1);assert.equal(f.timers.size,0);f.document.getElementById('notif-bell-btn').click();assert.equal(f.timers.size,0);
});
function settingsFixture(overrides={}){
 assert.equal(typeof settings.createSettingsSync,'function','settings controller must own load/save/recovery');let owner='one',draft,applied,remote={appearance:{mode:'dark'},profile:{displayName:'Original'},accessibility:{}},gate=null,events=[];const memory=storage();
 const defaults=()=>({appearance:{mode:'dark'},profile:{displayName:'Original'},accessibility:{}});applied=defaults();draft=defaults();
 const controller=settings.createSettingsSync({getOwnerId:()=>owner,getDraft:()=>draft,setDraft:v=>draft=v,getApplied:()=>applied,setApplied:v=>applied=v,defaults,mergeDefaults:value=>({...defaults(),...value}),storage:memory,readRemote:async id=>{const load=overrides.readRemote?.(id);return load||{settings:structuredClone(remote),confirmed:true}},writeRemote:async(id,merge)=>{if(gate)await gate;remote=merge(remote);return structuredClone(remote)},onApply:()=>events.push('apply'),onLoaded:()=>events.push('loaded'),onSaved:()=>events.push('saved'),onStatus:()=>events.push('status'),onError:()=>events.push('error'),...overrides});
 return {controller,memory,events,draft:()=>draft,applied:()=>applied,remote:()=>remote,setOwner:id=>owner=id,block:value=>gate=value,setRemote:v=>remote=v};
}
test('settings stale load cannot replace a newer account',async()=>{
 const old=defer();const f=settingsFixture({readRemote:id=>id==='one'?old.promise:Promise.resolve({settings:{profile:{displayName:'Second'}},confirmed:true})});const pending=f.controller.load('one');f.setOwner('two');await f.controller.load('two');old.resolve({settings:{profile:{displayName:'Private'}},confirmed:true});await pending;assert.equal(f.draft().profile.displayName,'Second');assert.equal(f.events.filter(e=>e==='loaded').length,1);
});
test('settings save preserves and stages newer edits over transaction-merged cloud fields',async()=>{
 const f=settingsFixture();await f.controller.load('one');const gate=defer();f.block(gate.promise);f.draft().appearance.mode='light';const pending=f.controller.save();f.draft().profile.displayName='Newer draft';f.controller.dirty();f.setRemote({...f.remote(),profile:{displayName:'Cloud name'},extra:'remote'});gate.resolve();await pending;assert.equal(f.remote().profile.displayName,'Cloud name');assert.equal(f.draft().profile.displayName,'Newer draft');assert.equal(f.draft().extra,'remote');assert.equal(f.controller.state().pending.settings.profile.displayName,'Newer draft');assert.equal(f.controller.state().saving,null);assert.equal(f.memory.getItem('kairos_settings_cache_uid'),'one');
});
test('settings account switch and disposal invalidate delayed save completion',async()=>{
 const f=settingsFixture();await f.controller.load('one');const gate=defer();f.block(gate.promise);f.draft().profile.displayName='Private';const pending=f.controller.save();f.setOwner('two');f.setRemote({profile:{displayName:'Second'}});await f.controller.load('two');gate.resolve();await pending;assert.equal(f.draft().profile.displayName,'Second');assert.equal(f.memory.getItem('kairos_settings_cache_uid'),'two');assert.equal(f.events.includes('saved'),false);f.controller.dispose();await f.controller.load('two');assert.equal(f.events.filter(e=>e==='loaded').length,2);
});
function dashboardFixture(){
 assert.equal(typeof dashboard.createDashboardController,'function','dashboard controller must own all three views');const {document,window}=parseHTML('<html><body><section id="dashboard-focus-container"></section><div id="planner-mutation-feedback"></div><div id="ai-mutation-tools"></div></body></html>');let identity={ownerId:'one',planId:'p'},navigations=0,selected=0,gate=null;const memory=storage(),session=createMutationSession({getIdentity:()=>identity,storage:memory,commit:async()=>true});let listeners=0;const subscribe=session.subscribe;session.subscribe=fn=>{listeners++;const unsubscribe=subscribe(fn);return ()=>{listeners--;unsubscribe();};};const controller=dashboard.createDashboardController({document,window,getIdentity:()=>identity,getState:()=>({boards:[]}),getToday:()=> '2026-10-26',session,loadUndoPreview:async()=>({rows:[]}),openTask:()=>true,requestClose:async()=>{if(gate)await gate;return true},navigate:async()=>navigations++,setScheduleDate(){},selectOccurrence:()=>selected++,selectItem:()=>selected++,onCapture(){},confirmClear:async()=>false});return {controller,document,window,setIdentity:v=>identity=v,block:p=>gate=p,navigations:()=>navigations,selected:()=>selected,listeners:()=>listeners};
}
test('dashboard mounts once, synchronizes identity and disposes all view resources',()=>{
 const f=dashboardFixture();f.controller.mount();f.controller.mount();assert.equal(f.listeners(),4);assert.equal(f.document.querySelectorAll('.ai-undo-dialog').length,1);assert.equal(f.document.querySelectorAll('[data-today-capture]').length,1);f.setIdentity({ownerId:null,planId:null});f.controller.sync();assert.equal(f.document.querySelector('[data-today-capture]').disabled,true);assert.equal(f.document.querySelector('[data-ai-undo-open]').disabled,true);f.controller.dispose();f.controller.dispose();assert.equal(f.listeners(),0);assert.equal(f.document.querySelectorAll('.ai-undo-dialog').length,0);f.controller.mount();assert.equal(f.document.querySelectorAll('.ai-undo-dialog').length,0);
});
test('dashboard navigation does not select a schedule item after the account switches while closing details',async()=>{
 const f=dashboardFixture(),gate=defer();f.controller.mount();f.block(gate.promise);const opening=f.controller.open({kind:'event',id:'e',date:'2026-10-26'},'schedule');f.setIdentity({ownerId:'two',planId:'q'});f.controller.sync();gate.resolve();assert.equal(await opening,false);assert.equal(f.navigations(),0);assert.equal(f.selected(),0);f.controller.dispose();
});


test('notification old-account write completion cannot replace the new baseline',async()=>{
 const gate=defer(),f=notificationFixture({persist:()=>gate.promise});f.controller.setup('one');f.subscriptions[0].next({notifications:[{id:'old',read:false}]});f.controller.push('Private','Old account');f.setOwner('two');f.controller.setup('two');f.subscriptions[1].next({notifications:[{id:'new',read:false}]});gate.resolve([{id:'old',read:true}]);await tick();assert.deepEqual(f.controller.state().snapshot,[{id:'new',read:false}]);assert.deepEqual(f.controller.state().notifications,[{id:'new',read:false}]);f.controller.dispose();
});
test('notification queued edits merge with a newer reminder snapshot while persistence is delayed',async()=>{
 const gate=defer();let remote=[{id:'first',read:false}],calls=0;
 const f=notificationFixture({persist:async(_id,base,local)=>{if(++calls===1)await gate.promise;remote=mergePlanEdits(base,local,remote);return remote;}});f.controller.setup('one');f.subscriptions[0].next({notifications:remote});f.controller.push('Local','First draft');const localId=f.controller.state().notifications.find(n=>n.title==='Local').id;f.controller.remove('first');remote=[{id:'reminder',title:'Remote reminder',read:false},...remote];f.subscriptions[0].next({notifications:remote});gate.resolve();await tick();assert.equal(calls,2);assert.equal(remote.some(n=>n.id==='first'),false);assert.equal(remote.some(n=>n.id===localId),true);assert.equal(remote.some(n=>n.id==='reminder'),true);assert.deepEqual(f.controller.state().notifications,remote);f.controller.dispose();
});
test('settings a delayed same-account load cannot erase a submitted save',async()=>{
 const gate=defer(),f=settingsFixture({readRemote:()=>gate.promise});const loading=f.controller.load('one');f.draft().profile.displayName='Saved while loading';await f.controller.save();gate.resolve({settings:{profile:{displayName:'Stale cloud'}},confirmed:true});assert.equal(await loading,false);assert.equal(f.draft().profile.displayName,'Saved while loading');assert.equal(f.controller.state().cloud.profile.displayName,'Saved while loading');assert.equal(f.events.filter(e=>e==='loaded').length,0);
});

test('settings disposal invalidates an outstanding load without touching applied settings',async()=>{
 const gate=defer(),f=settingsFixture({readRemote:()=>gate.promise});const pending=f.controller.load('one');f.controller.dispose();gate.resolve({settings:{profile:{displayName:'Late value'}},confirmed:true});assert.equal(await pending,false);assert.equal(f.applied().profile.displayName,'Original');assert.equal(f.memory.getItem('kairos_settings_cache_uid'),null);assert.equal(f.events.includes('loaded'),false);
});
test('settings cannot submit a previous account draft while the new account is still loading',async()=>{
 const f=settingsFixture();await f.controller.load('one');f.draft().profile.displayName='Private former account';f.setOwner('two');f.controller.reset();assert.equal(await f.controller.save(),false);assert.equal(f.remote().profile.displayName,'Original');assert.equal(f.memory.getItem('kairos-settings-pending:two'),null);
});

test('notification conflicting snapshot preserves the local draft without throwing from the listener',async()=>{
 const gate=defer();let remote=[{id:'first',title:'Original',read:false}];const f=notificationFixture({persist:async(_id,base,local)=>{await gate.promise;return mergePlanEdits(base,local,remote);}});f.controller.setup('one');f.subscriptions[0].next({notifications:remote});void f.controller.remove('first');remote=[{id:'first',title:'Changed remotely',read:false}];assert.doesNotThrow(()=>f.subscriptions[0].next({notifications:remote}));assert.equal(f.controller.state().notifications.length,0);gate.resolve();await tick();assert.ok(f.errors.length>0);f.controller.dispose();
});


test('notification bell rebinds after profile rendering replaces its DOM',async()=>{
 const f=notificationFixture();f.controller.setup('one');f.controller.bindBell();f.subscriptions[0].next({notifications:[{id:'first',title:'First',read:false,time:0}]});
 const oldBell=f.document.getElementById('notif-bell-btn');oldBell.click();assert.equal(f.timers.size,1);
 f.document.body.innerHTML='<div id="notif-wrapper"><button id="notif-bell-btn"></button><span id="notif-badge"></span><div id="notif-panel" class="notif-panel"><div id="notif-panel-list"></div></div></div>';
 f.controller.bindBell();f.controller.bindBell();
 assert.equal(f.document.getElementById('notif-badge').textContent,'1');assert.equal(f.document.querySelectorAll('.notif-item').length,1);assert.equal(f.timers.size,0);
 oldBell.click();assert.equal(f.timers.size,0);
 f.document.getElementById('notif-bell-btn').click();assert.equal(f.document.getElementById('notif-panel').classList.contains('active'),true);assert.equal(f.timers.size,1);
 f.flush();await tick();assert.equal(f.controller.state().notifications[0].read,true);f.controller.dispose();
});


test('settings same-account reset blocks cached drafts until its cloud baseline reloads',async()=>{
 let gate=null;const f=settingsFixture({readRemote:()=>gate?.promise});await f.controller.load('one');f.draft().appearance.mode='light';await f.controller.save();
 const changed={...f.remote(),appearance:{mode:'dark'},profile:{displayName:'Cloud name'}};f.setRemote(changed);gate=defer();f.controller.reset();const loading=f.controller.load('one');
 f.draft().profile.displayName='Only intended local edit';assert.equal(await f.controller.save(),false);assert.equal(f.remote().appearance.mode,'dark');assert.equal(f.remote().profile.displayName,'Cloud name');
 gate.resolve({settings:changed,confirmed:true});await loading;assert.equal(f.controller.state().ready,true);assert.equal(f.controller.state().cloud.appearance.mode,'dark');
});
