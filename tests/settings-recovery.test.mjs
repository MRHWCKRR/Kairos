import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

async function fixture({cache=new Map(),cloud={appearance:{mode:'dark'},profile:{displayName:'Original'}},fail=false,loadFail=false,blockedStorage=false}={}){
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 let helper={};try{helper=await import('../settings-recovery.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
 const {document,window}=parseHTML('<html><body><div id="settings-save-bar"><span></span><button id="settings-save-btn">Save</button><button id="settings-cancel-btn">Cancel</button></div></body></html>');
 const storage={getItem:key=>cache.get(key)||null,setItem:(key,value)=>{if(blockedStorage)throw Error('Quota exceeded');cache.set(key,value)},removeItem:key=>cache.delete(key)};
 let stored=structuredClone(cloud),offline=fail,gate=null,writes=0,owner='one',saveClick,cancelClick;
 const save=document.getElementById('settings-save-btn'),cancel=document.getElementById('settings-cancel-btn');save.addEventListener=(_event,fn)=>saveClick=fn;cancel.addEventListener=(_event,fn)=>cancelClick=fn;
 const defaults=()=>({appearance:{mode:'dark'},profile:{displayName:'Original'}});
 const context=vm.createContext({...helper,document,window,Event:window.Event,localStorage:storage,auth:{get currentUser(){return owner?{uid:owner}:null}},db:{},doc:(_db,_collection,id)=>id,
  userSettings:defaults(),pendingSettings:defaults(),settingsCloudSnapshot:defaults(),settingsPendingRecord:null,settingsSaveTicket:null,settingsLoadRevision:0,
  settingsRecovery:helper.createSettingsRecovery?.(storage),defaultSettings:defaults,cloneDeep:structuredClone,deepMerge:(base,value)=>({...base,...value}),console:{error(){}},tr:key=>key,
  triggerMiscAchievement(){},applyAllSettings(){},previewLive(){},invalidateKairosContext(){},renderUserProfileMenu(){},populateSettingsForm(){},setupNotificationBell(){},markInitialLoadComplete(){},showNotice(){},
  getDoc:async()=>{if(loadFail)throw Error('Offline read');return {exists:()=>true,data:()=>({settings:structuredClone(stored)})}},
  setDoc:async(_ref,value)=>{if(gate)await gate;if(offline)throw Error('Offline');stored=structuredClone(value.settings);writes++},
  runTransaction:async(_db,fn)=>{if(gate)await gate;if(offline)throw Error('Offline');let next;const result=await fn({get:async()=>({exists:()=>true,data:()=>({settings:structuredClone(stored)})}),set:(_ref,value)=>next=value.settings});if(next){stored=structuredClone(next);writes++}return result}
 });
 const functions=app.slice(app.indexOf('    function cacheAppliedSettings(')>=0?app.indexOf('    function cacheAppliedSettings('):app.indexOf('    async function loadUserSettingsFromFirestore('),app.indexOf('    function renderUserProfileMenu('));
 const dirty=app.slice(app.indexOf('    function checkDirty()'),app.indexOf('    function renderConfigOptions()'));
 const enter=app.slice(app.indexOf('    function enterSettingsPage()'),app.indexOf('    function setActiveTile('));
 const actions=app.slice(app.indexOf("    const settingsSaveBtn = document.getElementById('settings-save-btn');"),app.indexOf('    // Settings tab switching'));
 vm.runInContext(functions+'\n'+dirty+'\n'+enter+'\n'+actions,context);
 await context.loadUserSettingsFromFirestore({uid:'one'});
 return {context,document,cache,save,cancel,clickSave:()=>saveClick(),clickCancel:()=>cancelClick(),stored:()=>stored,writes:()=>writes,setOffline:value=>offline=value,setOwner:value=>owner=value,setCloud:value=>stored=structuredClone(value),block:value=>gate=value};
}

test('failed settings save remains retryable and recovers over stale cloud values after reload',async()=>{
 const f=await fixture({fail:true});f.context.pendingSettings.appearance.mode='light';await f.clickSave();assert.equal(f.document.getElementById('settings-save-bar').classList.contains('active'),true);assert.match(f.save.textContent,/Retry/i);
 const reloaded=await fixture({cache:f.cache});assert.equal(reloaded.context.pendingSettings.appearance.mode,'light');assert.equal(reloaded.writes(),0);assert.match(reloaded.save.textContent,/Retry/i);await reloaded.clickSave();assert.equal(reloaded.stored().appearance.mode,'light');assert.equal(reloaded.document.getElementById('settings-save-bar').classList.contains('active'),false);
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
