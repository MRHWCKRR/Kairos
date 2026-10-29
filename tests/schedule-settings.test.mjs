import {createSettingsForm} from '../app-settings-form.js';
import {defaultSettings} from '../app-settings-model.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseHTML} from 'linkedom';import {createSettingsRecovery} from '../settings-recovery.js';
const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
test('planning controls live together once and Calendar has one navigation destination',()=>{
 const {document}=parseHTML(html),planning=document.getElementById('settings-planning');assert.ok(planning);
 for(const id of ['planning-preferences-editor','weekly-availability-editor','settings-reschedule-completed','settings-timezone','time-format-options']){assert.equal(document.querySelectorAll('#'+id).length,1);assert.ok(planning.contains(document.getElementById(id)));}
 assert.equal(document.querySelector('[data-target="calendar-page"]'),null);assert.ok(document.querySelector('[data-target="schedule-page"]'));assert.ok(document.getElementById('calendar-grid'));assert.ok(document.getElementById('day-detail-ai-content'));
});
test('completed rescheduling starts off and its real settings handler participates in save recovery',()=>{
 const {document,window}=parseHTML(html);const defaults=defaultSettings();assert.equal(defaults.planning.rescheduleCompleted,false);
 let changed=0;createSettingsForm({document,getDraft:()=>defaults,onDirty:()=>changed++});const input=document.getElementById('settings-reschedule-completed');input.checked=true;input.dispatchEvent(new window.Event('change'));assert.equal(defaults.planning.rescheduleCompleted,true);assert.equal(changed,1);
 const values=new Map(),recovery=createSettingsRecovery({getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}),base={planning:{rescheduleCompleted:false,gapMinutes:0}},local={planning:{rescheduleCompleted:true,gapMinutes:0}};recovery.stage('one',base,local);const restored=recovery.restore('one',{planning:{rescheduleCompleted:false,gapMinutes:10}});assert.equal(restored.settings.planning.rescheduleCompleted,true);assert.equal(restored.settings.planning.gapMinutes,10);assert.equal(recovery.read('other'),null);
});
