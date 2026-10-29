import {attachPlannerPersistence} from './helpers/planner-persistence-host.mjs';
import {createPlannerWrites} from '../app-planner-writes.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function fixture(){
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),source=app.slice(app.indexOf('    async function checkTaskReminders()'),app.indexOf('    window.__kairosTaskReminders ='));
 const calls=[],shown=[],waiting=[];
 const delivery=async(planId,uid,candidate)=>{calls.push({planId,uid,id:candidate.id});return new Promise((resolve,reject)=>waiting.push({resolve,reject}))};
 const context=vm.createContext({globalSearchController:null,taskCaptureController:null,searchPlannerOwnerId:null,auth:{currentUser:{uid:'one'}},currentPlanDocId:'first',boardsData:[],scheduleData:[],userSettings:{profile:{timezone:'Australia/Brisbane'},notifications:{enabled:true,bedtimeReminders:true}},taskReminderChecking:false,taskReminderQueued:false,Date,Intl,console:{warn(){}},dueEventReminders:()=>[],deliverEventReminder:(...args)=>delivery(...args),dueTaskReminders:()=>[{id:'t'},{id:'u'}],dueBedtimeReminders:()=>[{id:'sleep'}],deliverTaskReminder:(...args)=>delivery(...args),deliverBedtimeReminder:(...args)=>delivery(...args),showBrowserNotification:(title,message)=>shown.push({title,message})});
 vm.runInContext(source,context);return {context,calls,shown,waiting};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('runner delivers custom event candidates independently of bedtime setting and suppresses late account popups',async()=>{
 for(const switched of [false,true]){const f=await fixture();f.context.dueTaskReminders=()=>[];f.context.dueBedtimeReminders=()=>[];f.context.dueEventReminders=()=>[{id:'event'}];f.context.userSettings.notifications.bedtimeReminders=false;const checking=f.context.checkTaskReminders();await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].id,'event');if(switched)f.context.auth.currentUser={uid:'two'};f.waiting[0].resolve({delivered:true,title:'Event reminder'});await checking;assert.equal(f.shown.length,switched?0:1);}
});

test('a late delivery cannot notify or continue scanning the previous planner',async()=>{
 const f=await fixture(),checking=f.context.checkTaskReminders();await tick();f.context.currentPlanDocId='second';f.waiting[0].resolve({delivered:true,title:'Old planner'});await tick();assert.equal(f.shown.length,0);assert.equal(f.calls.length,1);await checking;
});

test('checks requested during a pending delivery are coalesced and run for the current planner',async()=>{
 const f=await fixture(),checking=f.context.checkTaskReminders();await tick();f.context.currentPlanDocId='second';await f.context.checkTaskReminders();f.waiting[0].resolve({delivered:false});await tick();assert.equal(f.calls[1]?.planId,'second');await checking;
 // Stop the queued scan without leaving pending work behind.
 f.context.auth.currentUser=null;f.waiting[1].resolve({delivered:false});await tick();
});

test('the reminder runner includes bedtime checks and respects the bedtime setting',async()=>{
 for(const enabled of [true,false]){const f=await fixture();f.context.userSettings.notifications.bedtimeReminders=enabled;const checking=f.context.checkTaskReminders();await tick();f.waiting[0].resolve({delivered:false});await tick();f.waiting[1].resolve({delivered:false});await tick();assert.equal(f.calls.length,enabled?3:2);if(enabled){assert.equal(f.calls[2].id,'sleep');f.waiting[2].resolve({delivered:false})}await checking;}
});

test('saving a plan checks reminders immediately after persistence, with no check on failure',async()=>{
 for(const fail of [false,true]){
  let resolveSave,rejectSave,checks=0;const stored=new Promise((resolve,reject)=>{resolveSave=resolve;rejectSave=reject});
  const context=vm.createContext({plannerWrites:createPlannerWrites(),globalSearchController:null,taskCaptureController:null,searchPlannerOwnerId:null,auth:{currentUser:{uid:'one'}},currentPlanDocId:'plan',plannerWrites:createPlannerWrites(),boardsData:[],dayInsights:{},scheduleData:[],calendarSourcesData:[],planState:value=>value,savePlannerEdits:()=>stored,mergePlanEdits:(_base,_local,saved)=>saved,invalidateKairosContext(){},renderApp(){},showNotice(){},console:{error(){}},window:{__kairosTaskReminders:{check:()=>{checks++}}}});
  attachPlannerPersistence(context);const saving=context.updatePlanInFirestore();await tick();assert.equal(checks,0);if(fail)rejectSave(Error('Offline'));else resolveSave({boards:[],dayInsights:{},scheduleEvents:[]});await saving;assert.equal(checks,fail?0:1);
 }
});

test('disabling bedtime reminders during delivery suppresses its late browser popup',async()=>{
 const f=await fixture();f.context.dueTaskReminders=()=>[];const checking=f.context.checkTaskReminders();await tick();assert.equal(f.calls[0].id,'sleep');f.context.userSettings.notifications.bedtimeReminders=false;f.waiting[0].resolve({delivered:true,title:'Bedtime coming up'});await checking;assert.equal(f.shown.length,0);
});
