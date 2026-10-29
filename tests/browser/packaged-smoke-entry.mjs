// Native imports from the packaged HTTP output, without source bundling.
// Authentication/network services are outside this fixture; planner data is isolated.
import {createPageLoader,loadPageStyle} from '/page-loader.js?v=@@VERSION@@';
import {mountPageRouter} from '/page-router.js?v=@@VERSION@@';
import {defaultSettings} from '/app-settings-model.js?v=@@VERSION@@';

const result=document.getElementById('packaged-smoke-result'),errors=[],urls=[];
window.addEventListener('error',event=>{if(event.error)errors.push(event.message);});
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
document.getElementById('app-loading-screen')?.remove();
const check=(condition,message)=>{if(!condition)throw Error(message);};
const identity={ownerId:'packaged-fixture',planId:'fixture'},date=new Date().toISOString().slice(0,10);
const boards=[{id:'b',title:'Packaged smoke board',sections:[{id:'s',title:'Section',tasks:[{id:'t',title:'Packaged smoke task',date,startTime:'09:00',endTime:'10:00',completed:false}]}]}];
window.__kairosScheduleBridge={getOwnerId:()=>identity.ownerId,getPlanId:()=>identity.planId,getBoards:()=>boards,getScheduleEvents:()=>[],getCalendarSources:()=>[],getTimezone:()=> 'UTC',getLocale:()=> 'en',getTimeFormat:()=> '24',getScheduleDate:()=>date,getScheduleView:()=> 'three-day',getPlanningPreferences:()=>({dailyLimitMinutes:0,gapMinutes:0}),getWeeklyAvailability:()=>null,commitScheduleCommand:async()=>{throw Error('Smoke data is read-only');}};
let settingsForm,draft=defaultSettings();
const loader=createPageLoader({scheduleEnabled:true,taskDetailsEnabled:true,
 importModule:async url=>{urls.push(url);return import(url);},
 loadStyle:async url=>{urls.push(url);await loadPageStyle(url);},
 setupTaskDetails:module=>check(typeof module.mountTaskDetailPane==='function','Packaged task detail export missing')
});
const router=mountPageRouter({preparePage:async page=>{
 await loader.prepare(page);
 if(page==='settings-page'){
  if(!settingsForm){const {createSettingsForm}=await import('/app-settings-form.js?v=@@VERSION@@');settingsForm=createSettingsForm({document,getDraft:()=>draft,setDraft:value=>{draft=value},getApplied:defaultSettings,getUser:()=>({uid:'packaged-fixture',email:'fixture@example.invalid',providerData:[]}),settingsSync:{state:()=>({pending:null})},onDirty(){},onControlsRefresh(){},onSaveBar(){},tr:key=>key,getLocale:()=> 'en',updateBrowserPushHint(){}});}
  settingsForm.enter();
 }
}});
try {
 check(await router.navigate('tasks-page'),'Packaged Tasks navigation failed');
 check(document.getElementById('tasks-page').classList.contains('active'),'Tasks route did not activate');
 const ready=await router.navigate('schedule-page');
 if(new URL(location.href).searchParams.has('fail')){
  check(ready===false,'Missing module must fail navigation');
  check(document.querySelector('#schedule-page .page-load-status button'),'Missing module must offer recovery');
 }else{
  check(ready,'Packaged Schedule navigation failed');
  check(window.__kairosScheduleWorkspace,'Packaged Schedule did not boot');
  check(document.getElementById('schedule-calendar').textContent.includes('Packaged smoke task'),'Packaged Schedule did not render fixture work');
  check(await router.navigate('settings-page'),'Packaged Settings navigation failed');
  check(document.getElementById('settings-current-email').textContent==='fixture@example.invalid','Packaged settings form did not hydrate');
  check(await router.navigate('tasks-page'),'Returning to Tasks failed');
  for(const url of urls)check(new URL(url,location.href).searchParams.get('v')==='@@VERSION@@','Noncanonical runtime URL: '+url);
  check(!document.querySelector('.page-load-status'),'Successful navigation left a loading/error panel');
  check(errors.length===0,'Packaged runtime errors: '+errors.join('; '));
 }
 result.dataset.result='passed';result.textContent='Passed packaged '+(new URL(location.href).searchParams.has('fail')?'missing-module recovery':'Tasks, Schedule and Settings smoke')+'.';
}catch(error){result.dataset.result='failed';result.textContent='Failed packaged smoke: '+error.message;}
