import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {defaultSettings} from '../app-settings-model.js';
let factory;try{({createSettingsForm:factory}=await import('../app-settings-form.js'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
test('form entry restores only owner recovery and editors always read the current shell draft',()=>{
 assert.equal(typeof factory,'function','settings form needs a real focused export');
 const {document,window}=parseHTML('<html><body><input id="settings-reschedule-completed"><div id="planning-preferences-editor"></div><div id="weekly-availability-editor"></div><div id="shortcut-settings-editor"></div></body></html>');
 let draft=defaultSettings(),applied=defaultSettings(),pending={ownerId:'one',settings:defaultSettings()},dirty=0;pending.settings.profile.displayName='Recovered';
 const form=factory({document,getDraft:()=>draft,setDraft:value=>{draft=value},getApplied:()=>applied,getUser:()=>({uid:'one'}),settingsSync:{state:()=>({pending})},onDirty:()=>dirty++,onControlsRefresh(){},onSaveBar(){},tr:key=>key,getLocale:()=> 'en',updateBrowserPushHint(){}});
 form.enter();assert.equal(draft.profile.displayName,'Recovered');assert.notEqual(draft,pending.settings);
 const input=document.getElementById('settings-reschedule-completed');input.checked=true;input.dispatchEvent(new window.Event('change'));assert.equal(draft.planning.rescheduleCompleted,true);assert.equal(dirty,1);
 draft=defaultSettings();form.populate();input.checked=true;input.dispatchEvent(new window.Event('change'));assert.equal(draft.planning.rescheduleCompleted,true);assert.equal(dirty,2);
 pending={ownerId:'other',settings:pending.settings};form.enter();assert.equal(draft.profile.displayName,applied.profile.displayName);
});
