import {createSettingsSync} from '../settings-sync.js';
import {normalisePlanningPreferences} from '../planning-preferences.js';
import {normaliseShortcuts} from '../shortcut-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {normaliseWeeklyAvailability} from '../weekly-availability.js';

async function fixture({cache=new Map(),cloud={appearance:{mode:'dark'},profile:{displayName:'Original'}},fail=false,loadFail=false,blockedStorage=false}={}){
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 let helper={};try{helper=await import('../settings-recovery.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
 const {document,window}=parseHTML('<html><body><div id="settings-save-bar"><span></span><button id="settings-save-btn">Save</button><button id="settings-cancel-btn">Cancel</button></div></body></html>');
 const storage={getItem:key=>cache.get(key)||null,setItem:(key,value)=>{if(blockedStorage)throw Error('Quota exceeded');cache.set(key,value)},removeItem:key=>cache.delete(key)};
 let stored=structuredClone(cloud),offline=fail,gate=null,writes=0,owner='one',saveClick,cancelClick;
 const save=document.getElementById('settings-save-btn'),cancel=document.getElementById('settings-cancel-btn');save.addEventListener=(_event,fn)=>saveClick=fn;cancel.addEventListener=(_event,fn)=>cancelClick=fn;
 const defaults=()=>({appearance:{mode:'dark'},profile:{displayName:'Original'},accessibility:{shortcuts:normaliseShortcuts()}});
 const context=vm.createContext({...helper,createSettingsSync,normaliseShortcuts,normalisePlanningPreferences,normaliseWeeklyAvailability,document,window,Event:window.Event,localStorage:storage,auth:{get currentUser(){return owner?{uid:owner}:null}},db:{},doc:(_db,_collection,id)=>id,
  taskDetails:null,userSettings:defaults(),pendingSettings:defaults(),settingsCloudSnapshot:defaults(),settingsPendingRecord:null,settingsSaveTicket:null,settingsLoadRevision:0,
  settingsRecovery:helper.createSettingsRecovery?.(storage),defaultSettings:defaults,cloneDeep:structuredClone,deepMerge:(base,value)=>({...base,...value}),console:{error(){}},tr:key=>key,
  triggerMiscAchievement(){},applyAllSettings(){},previewLive(){},invalidateKairosContext(){},renderUserProfileMenu(){},populateSettingsForm(){},setupNotificationBell(){},markInitialLoadComplete(){},showNotice(){},
  getDoc:async()=>{if(loadFail)throw Error('Offline read');return {exists:()=>true,data:()=>({settings:structuredClone(stored)})}},
  setDoc:async(_ref,value)=>{if(gate)await gate;if(offline)throw Error('Offline');stored=structuredClone(value.settings);writes++},
  runTransaction:async(_db,fn)=>{if(gate)await gate;if(offline)throw Error('Offline');let next;const result=await fn({get:async()=>({exists:()=>true,data:()=>({settings:structuredClone(stored)})}),set:(_ref,value)=>next=value.settings});if(next){stored=structuredClone(next);writes++}return result}
 });
 const functions=app.slice(app.indexOf('    function loadUserSettingsFromFirestore('),app.indexOf('    function renderUserProfileMenu('));
 const dirty=app.slice(app.indexOf('    function checkDirty()'),app.indexOf('    function renderConfigOptions()'));
 const enter=app.slice(app.indexOf('    function enterSettingsPage()'),app.indexOf('    function setActiveTile('));
 const actions=app.slice(app.indexOf("    const settingsSaveBtn = document.getElementById('settings-save-btn');"),app.indexOf('    // Settings tab switching'));
 const setup=app.slice(app.indexOf('    const settingsSync=createSettingsSync('),app.indexOf('    let gettingStarted=null;'));
 vm.runInContext(setup+'\nglobalThis.settingsSync=settingsSync;\n'+functions+'\n'+dirty+'\n'+enter+'\n'+actions,context);
 for(const [key,field] of [['settingsCloudSnapshot','cloud'],['settingsPendingRecord','pending'],['settingsSaveTicket','saving']])Object.defineProperty(context,key,{get:()=>context.settingsSync.state()[field],configurable:true});
 await context.loadUserSettingsFromFirestore({uid:'one'});
 return {context,document,cache,save,cancel,clickSave:()=>saveClick(),clickCancel:()=>cancelClick(),stored:()=>stored,writes:()=>writes,setOffline:value=>offline=value,setOwner:value=>owner=value,setCloud:value=>stored=structuredClone(value),block:value=>gate=value};
}

test('failed settings save remains retryable and recovers over stale cloud values after reload',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.appearance.mode='light';await f.clickSave();assert.equal(f.document.getElementById('settings-save-bar').classList.contains('active'),true);assert.match(f.save.textContent,/Retry/i);
 const reloaded=await fixture({cache:f.cache});assert.equal(reloaded.context.pendingSettings.appearance.mode,'light');assert.equal(reloaded.writes(),0);assert.match(reloaded.save.textContent,/Retry/i);await reloaded.clickSave();assert.equal(reloaded.stored().appearance.mode,'light');assert.equal(reloaded.document.getElementById('settings-save-bar').classList.contains('active'),false);
});

test('custom shortcuts recover from a failed settings save and persist on Retry',async()=>{
 const cache=new Map(),f=await fixture({cache,fail:true});
 f.context.pendingSettings.accessibility.shortcuts.search='Alt+G';
 await f.clickSave();assert.equal(f.context.userSettings.accessibility.shortcuts.search,'Alt+G');
 const reload=await fixture({cache,fail:true});assert.equal(reload.context.pendingSettings.accessibility.shortcuts.search,'Alt+G');
 reload.setOffline(false);await reload.clickSave();assert.equal(reload.stored().accessibility.shortcuts.search,'Alt+G');
 assert.equal(reload.context.settingsPendingRecord,null);
 const confirmed=await fixture({cloud:reload.stored()});assert.equal(confirmed.context.userSettings.accessibility.shortcuts.search,'Alt+G');
});

test('weekly-hour settings recover after a failed save, merge unrelated cloud edits and persist on Retry',async()=>{
 const weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[]]));weeklyAvailability[1]=[{start:'15:30',end:'16:30'}];const f=await fixture({fail:true});f.context.pendingSettings.planning={weeklyAvailability};await f.clickSave();assert.equal(f.writes(),0);assert.equal(f.context.settingsCloudSnapshot.planning,undefined);const loaded=await fixture({cache:f.cache,cloud:{appearance:{mode:'dark'},profile:{displayName:'New name'}}});assert.equal(loaded.context.pendingSettings.planning.weeklyAvailability[1][0].start,'15:30');await loaded.clickSave();assert.deepEqual(loaded.stored().planning.weeklyAvailability,weeklyAvailability);assert.equal(loaded.stored().profile.displayName,'New name');
});

test('invalid weekly hours stay editable and cannot be written with settings',async()=>{
 const f=await fixture();f.context.pendingSettings.planning={weeklyAvailability:Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'07:00'}]]))};await f.clickSave();assert.equal(f.writes(),0);assert.equal(f.context.pendingSettings.planning.weeklyAvailability[0][0].end,'07:00');assert.equal(f.context.settingsSaveTicket,null);
});

test('saving unsorted weekly windows settles the settings draft after canonical sorting',async()=>{
 const f=await fixture(),weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[]]));weeklyAvailability[1]=[{start:'18:00',end:'19:00'},{start:'15:30',end:'16:30'}];f.context.pendingSettings.planning={weeklyAvailability};await f.clickSave();assert.equal(f.writes(),1);assert.equal(f.context.settingsPendingRecord,null);assert.equal(f.context.pendingSettings.planning.weeklyAvailability[1][0].start,'15:30');
});

test('recovered settings preserve unrelated newer cloud changes and discard explicitly',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.appearance.mode='light';await f.clickSave();
 const loaded=await fixture({cache:f.cache,cloud:{appearance:{mode:'dark'},profile:{displayName:'Updated elsewhere'}}});assert.equal(loaded.context.pendingSettings.appearance.mode,'light');assert.equal(loaded.context.pendingSettings.profile.displayName,'Updated elsewhere');await loaded.clickCancel();
 const clean=await fixture({cache:f.cache,cloud:{appearance:{mode:'dark'},profile:{displayName:'Updated elsewhere'}}});assert.equal(clean.context.pendingSettings.appearance.mode,'dark');assert.equal(clean.writes(),0);
});

test('entering Settings retains the recovered merge rather than restoring stale fields',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.appearance.mode='light';await f.clickSave();const loaded=await fixture({cache:f.cache,cloud:{appearance:{mode:'dark'},profile:{displayName:'Updated elsewhere'}}});loaded.context.enterSettingsPage();assert.equal(loaded.context.pendingSettings.profile.displayName,'Updated elsewhere');await loaded.clickSave();assert.equal(loaded.stored().profile.displayName,'Updated elsewhere');assert.equal(loaded.stored().appearance.mode,'light');
});

test('pending settings never load into another account',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.profile.displayName='Private draft';await f.clickSave();f.setOwner('two');await f.context.loadUserSettingsFromFirestore({uid:'two'});assert.equal(f.context.pendingSettings.profile.displayName,'Original');
});

test('an offline reload never mistakes the local cache for a cloud acknowledgement',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.appearance.mode='light';await f.clickSave();const offline=await fixture({cache:f.cache,loadFail:true});assert.match(offline.save.textContent,/Retry/i);assert.equal(offline.context.pendingSettings.appearance.mode,'light');await offline.clickSave();assert.equal(offline.stored().appearance.mode,'light');
});

test('new edits made while saving remain recoverable after the submitted version succeeds',async()=>{
 const f=await fixture();let release;f.block(new Promise(resolve=>release=resolve));f.context.pendingSettings.appearance.mode='light';const saving=f.clickSave();f.context.pendingSettings.profile.displayName='Newer draft';release();await saving;assert.equal(f.stored().profile.displayName,'Original');const reload=await fixture({cache:f.cache,cloud:f.stored()});assert.equal(reload.context.pendingSettings.profile.displayName,'Newer draft');
});

test('edits typed during a pending save survive re-entry and reload before it completes',async()=>{
 const f=await fixture();let release;f.block(new Promise(resolve=>release=resolve));f.context.pendingSettings.appearance.mode='light';const saving=f.clickSave();f.context.pendingSettings.profile.displayName='Typed while saving';f.context.checkDirty();f.context.enterSettingsPage();assert.equal(f.context.pendingSettings.profile.displayName,'Typed while saving');const reloaded=await fixture({cache:f.cache});assert.equal(reloaded.context.pendingSettings.profile.displayName,'Typed while saving');release();await saving;
});

test('quota failure keeps Retry visible without claiming local recovery is available',async()=>{
 const f=await fixture({fail:true,blockedStorage:true});f.context.pendingSettings.appearance.mode='light';await f.clickSave();assert.match(f.document.querySelector('#settings-save-bar span').textContent,/not synced or stored locally/i);assert.equal(f.save.disabled,false);
});

test('an old-account save completion cannot overwrite the current account settings',async()=>{
 const f=await fixture();let release;f.block(new Promise(resolve=>release=resolve));f.context.pendingSettings.profile.displayName='Old account draft';const saving=f.clickSave();f.setOwner('two');f.setCloud({appearance:{mode:'dark'},profile:{displayName:'Second account'}});await f.context.loadUserSettingsFromFirestore({uid:'two'});release();await saving;assert.equal(f.context.pendingSettings.profile.displayName,'Second account');
});


test('planning defaults save, recover from failed sync and preserve newer unrelated edits',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.planning={dailyLimitMinutes:120,gapMinutes:10};await f.clickSave();assert.equal(f.writes(),0);const reload=await fixture({cache:f.cache,cloud:{appearance:{mode:'light'},profile:{displayName:'Updated'}}});assert.equal(reload.context.pendingSettings.planning.dailyLimitMinutes,120);assert.equal(reload.context.pendingSettings.planning.gapMinutes,10);await reload.clickSave();assert.equal(reload.writes(),1);assert.equal(reload.stored().planning.dailyLimitMinutes,120);assert.equal(reload.stored().planning.gapMinutes,10);assert.equal(reload.stored().profile.displayName,'Updated');assert.equal(reload.stored().appearance.mode,'light');
});
test('invalid planning-default drafts never write or stage a save',async()=>{
 for(const planning of [{dailyLimitMinutes:14,gapMinutes:0},{dailyLimitMinutes:60,gapMinutes:2},{dailyLimitMinutes:NaN,gapMinutes:0}]){const f=await fixture();f.context.pendingSettings.planning=planning;await f.clickSave();assert.equal(f.writes(),0);assert.equal(f.context.settingsSaveTicket,null);assert.equal(f.context.settingsPendingRecord,null)}
});

test('completed scheduling opt-in becomes effective only after saved settings are confirmed and reloads',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.planning={dailyLimitMinutes:480,gapMinutes:0,rescheduleCompleted:true};await f.clickSave();assert.notEqual(f.context.settingsCloudSnapshot.planning?.rescheduleCompleted,true);f.setOffline(false);await f.clickSave();assert.equal(f.context.settingsCloudSnapshot.planning.rescheduleCompleted,true);const reload=await fixture({cloud:f.stored()});assert.equal(reload.context.settingsCloudSnapshot.planning.rescheduleCompleted,true);reload.context.pendingSettings.planning.rescheduleCompleted=false;await reload.clickSave();assert.equal(reload.stored().planning.rescheduleCompleted,false);
});
