// Native imports from the packaged HTTP output, without source bundling.
// Authentication/network services are outside this fixture; planner data is isolated.
import {createPageLoader,loadPageStyle} from '/page-loader.js?v=@@VERSION@@';
import {mountPageRouter} from '/page-router.js?v=@@VERSION@@';
import {createPackagedPlannerHost,createPackagedErrorLedger} from '/__planner-host.js';

const result=document.getElementById('packaged-smoke-result'),runtime=createPackagedErrorLedger(sessionStorage),urls=[];
window.addEventListener('error',event=>{if(event.error)runtime.record(event.message);});
window.addEventListener('unhandledrejection',event=>runtime.record(event.reason));
document.getElementById('app-loading-screen')?.remove();
const check=(condition,message)=>{if(!condition)throw Error(message);};
const host=await createPackagedPlannerHost(),date=host.date;
window.__kairosScheduleBridge={getOwnerId:()=>host.identity.ownerId,getPlanId:()=>host.identity.planId,getBoards:()=>host.getState().boards,getScheduleEvents:()=>host.getState().scheduleEvents,getCalendarSources:()=>[],getTimezone:()=> 'UTC',getLocale:()=> 'en',getTimeFormat:()=> '24',getScheduleDate:()=>date,getScheduleView:()=> 'three-day',getPlanningPreferences:()=>({dailyLimitMinutes:0,gapMinutes:0}),getWeeklyAvailability:()=>null,commitScheduleCommand:async()=>{throw Error('Schedule smoke data is read-only');}};
const loader=createPageLoader({scheduleEnabled:true,taskDetailsEnabled:true,
 importModule:async url=>{urls.push(url);return import(url);},
 loadStyle:async url=>{urls.push(url);await loadPageStyle(url);},
 setupTaskDetails:host.setupTaskDetails,setupTaskWorkspace:host.setupTaskWorkspace
});
const router=mountPageRouter({preparePage:async page=>{
 await loader.prepare(page);
 if(page==='settings-page')host.form.enter();
}});
async function run(){
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
  await runPersistenceJourney();
  if(sessionStorage.getItem('packaged-phase')==='reload'){runtime.check();location.reload();return;}
  if(sessionStorage.getItem('packaged-phase')==='verify-settings')return;
  check(await router.navigate('tasks-page'),'Returning to Tasks failed');
  for(const url of urls)check(new URL(url,location.href).searchParams.get('v')==='@@VERSION@@','Noncanonical runtime URL: '+url);
  check(!document.querySelector('.page-load-status'),'Successful navigation left a loading/error panel');
  runtime.check();
 }
 result.dataset.result='passed';result.textContent='Passed packaged '+(new URL(location.href).searchParams.has('fail')?'missing-module recovery':'task create/edit/retry, settings recovery, reload, Tasks, Schedule and Settings journeys')+'.';
}catch(error){result.dataset.result='failed';result.textContent='Failed packaged smoke: '+error.message;}

}
void run();

async function runPersistenceJourney(){
 const wait=async(predicate,label)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+label);};
 const saveSettings=async()=>{
  const bar=document.getElementById('settings-save-bar'),button=document.getElementById('settings-save-btn');bar.scrollIntoView({block:'nearest'});
  await wait(()=>getComputedStyle(bar).opacity==='1'&&getComputedStyle(bar).pointerEvents!=='none','visible settings Save/Retry');
  check(button.getBoundingClientRect().width>0&&!button.disabled,'Settings Save/Retry must be interactable');button.focus();check(document.activeElement===button,'Settings save must be keyboard accessible');button.click();return await host.getSaving();
 };
 const field=(selector,value)=>{const el=document.querySelector(selector);check(el,'Missing control: '+selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
 const savedId=sessionStorage.getItem('packaged-created');
 const phase=sessionStorage.getItem('packaged-phase');
 if(phase==='reload'){
  check(savedId,'Reload lost expected task identity');
  check(await router.navigate('tasks-page'),'Reloaded Tasks route failed');
  await host.getWorkspace().openSection({boardId:'b',sectionId:'s'});
  const matching=host.getState().boards[0].sections[0].tasks.filter(task=>task.id===savedId);
  check(matching.length===1,'Reload must retain exactly one created task');
  check(matching[0].title==='Edited packaged task'&&matching[0].notes==='Saved from the packaged inspector','Reload lost inspector edits');
  check(document.querySelector('[data-detail-row="'+savedId+'"] .task-text').value==='Edited packaged task','Reloaded task row must render the saved title');
  check(await host.getDetails().open({taskId:savedId}),'Reloaded inspector failed');
  check(document.querySelector('.task-detail-pane [name="notes"]').value==='Saved from the packaged inspector','Reloaded inspector lost notes');
  await host.getDetails().requestClose();
  check(await router.navigate('settings-page'),'Reloaded Settings route failed');
  check(host.sync.state().pending,'Failed settings save must recover after reload');
  check(document.getElementById('settings-reschedule-completed').checked,'Recovered settings draft did not hydrate');
  check(host.sync.state().cloud.planning.rescheduleCompleted===false,'Failed setting must not be reported as confirmed');
  check(await saveSettings(),'Recovered settings retry failed');
  check(!host.sync.state().pending,'Successful settings retry left recovery pending');
  sessionStorage.setItem('packaged-phase','verify-settings');runtime.check();location.reload();return;
 }
 if(phase==='verify-settings'){
  check(document.getElementById('settings-reschedule-completed').checked,'Confirmed setting did not survive a second reload');
  check(host.sync.state().cloud.planning.rescheduleCompleted===true&&!host.sync.state().pending,'Reloaded settings must be confirmed');
  const record=await host.request();check(record.writes===2&&record.receipts.length===2,'Create and edit retries must write exactly once each');
  const other=await (await fetch('/__fixture/other-fixture')).json();
  check(other.writes===0&&other.planner.boards[0].sections[0].tasks.length===1&&!other.settings.planning.rescheduleCompleted,'Journey changed another account');
  sessionStorage.setItem('packaged-phase','done');return;
 }
 check(await router.navigate('tasks-page'),'Task mutation route failed');
 await host.getWorkspace().openSection({boardId:'b',sectionId:'s'});
 host.capture.open();field('.task-capture-dialog [name="title"]','Created packaged task');
 document.querySelector('.task-capture-dialog [data-capture-save]').click();
 await wait(()=>document.querySelector('[data-capture-status]').textContent==='Task created.','Quick Add confirmation');
 document.querySelector('[data-capture-close]').click();
 const created=host.getState().boards[0].sections[0].tasks.find(task=>task.title==='Created packaged task');check(created,'Quick Add did not persist');
 sessionStorage.setItem('packaged-created',created.id);
 check(await host.getDetails().open({taskId:created.id}),'Packaged inspector did not open');
 const preset=document.querySelector('[data-recurrence-preset]');preset.value='custom';preset.dispatchEvent(new Event('change',{bubbles:true}));
 field('[data-recurrence-interval]','0');document.querySelector('.task-detail-pane [type="submit"]').click();
 await wait(()=>document.querySelector('.task-detail-pane').dataset.saveState==='error','invalid repeat field error');
 check(document.querySelector('[data-recurrence-interval]').value==='0','Invalid repeat draft was replaced');
 check((await host.request()).writes===1&&!host.session.state().pending,'Invalid repeat input reached persistence');
 preset.value='never';preset.dispatchEvent(new Event('change',{bubbles:true}));
 field('.task-detail-pane [name="title"]','Edited packaged task');field('.task-detail-pane [name="notes"]','Saved from the packaged inspector');
 host.failNextTask();document.querySelector('.task-detail-pane [type="submit"]').click();
 await wait(()=>host.session.state().pending&&!host.session.state().busy,'lost acknowledgement recovery');
 await wait(()=>document.querySelector('.task-detail-pane').dataset.saveState==='retry','inspector retry button');
 const operation=host.session.state().pendingIdentity.operationId;
 document.querySelector('.task-detail-pane [type="submit"]').click();
 await wait(()=>!host.session.state().pending&&document.querySelector('.task-detail-pane').dataset.saveState==='saved','inspector retry confirmation');
 check((await host.request()).receipts.filter(r=>r.id===operation).length===1,'Retry duplicated the inspector operation');
 await host.getDetails().requestClose();
 check(await router.navigate('settings-page'),'Settings mutation route failed');
 const toggle=document.getElementById('settings-reschedule-completed');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
 check(host.getDraft().planning.rescheduleCompleted,'Setting control did not update the real draft');
 host.failNextSettings();check(await saveSettings()===false,'Simulated settings outage must fail');
 check(host.sync.state().pending,'Settings failure lost recovery');
 sessionStorage.setItem('packaged-phase','reload');
}
