import {createPageLoader} from '/page-loader.js?v=@@VERSION@@';
import {mountPageRouter} from '/page-router.js?v=@@VERSION@@';
import {mountSyncStatus,plannerSyncSources} from '/sync-status.js?v=@@VERSION@@';
import {createPackagedPlannerHost,createPackagedErrorLedger} from '/__planner-host.js';

const result=document.getElementById('packaged-smoke-result'),runtime=createPackagedErrorLedger(sessionStorage);
window.addEventListener('error',event=>{if(event.error)runtime.record(event.message)});
window.addEventListener('unhandledrejection',event=>runtime.record(event.reason));
const check=(value,message)=>{if(!value)throw Error(message)},wait=async(predicate,label)=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('Timed out: '+label)};
async function network(value){document.documentElement.dataset.networkRequest=value;await wait(()=>document.documentElement.dataset.networkApplied===value&&navigator.onLine===(value==='online'),'actual network '+value);}
const status=()=>document.getElementById('planner-sync-status').textContent;
let diagnostics=()=>({online:navigator.onLine,network:{...document.documentElement.dataset}});
const field=(selector,value)=>{const input=document.querySelector(selector);check(input,'Missing '+selector);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
async function run(){try{
 document.getElementById('app-loading-screen')?.remove();
 const host=await createPackagedPlannerHost();
 diagnostics=()=>({online:navigator.onLine,network:{...document.documentElement.dataset},session:host.session.state(),status:status(),capture:document.querySelector('[data-capture-status]')?.textContent});
 const loader=createPageLoader({taskDetailsEnabled:true,setupTaskDetails:host.setupTaskDetails,setupTaskWorkspace:host.setupTaskWorkspace});
 const router=mountPageRouter({preparePage:async page=>{await loader.prepare(page);if(page==='settings-page')host.form.enter();}});
 const persistence={state:()=>({ownerId:host.identity.ownerId,status:'idle'}),subscribe:()=>()=>{},retry:async()=>false};
 mountSyncStatus({root:document.getElementById('planner-sync-status'),window,getOwnerId:()=>host.identity.ownerId,sources:plannerSyncSources({mutations:host.session,settings:host.sync,persistence,navigate:page=>router.navigate(page)})});
 check(await router.navigate('tasks-page'),'Tasks route');await host.getWorkspace().openSection({boardId:'b',sectionId:'s'});
 const phase=sessionStorage.getItem('offline-phase');
 if(!phase){
  host.capture.open();field('.task-capture-dialog [name="title"]','Interrupted task');host.holdNextTask();
  document.documentElement.dataset.networkRequest='cut';document.querySelector('[data-capture-save]').click();
  await wait(()=>host.session.state().busy,'in-flight save');check(/Saving/.test(status()),'Missing saving status');
  await wait(()=>!host.session.state().busy&&host.session.state().pending,'interrupted acknowledgement');check(!navigator.onLine&&/Offline/.test(status()),'Missing offline state');
  sessionStorage.setItem('offline-operation',host.session.state().pendingIdentity.operationId);
  await network('online');check(/Not synced/.test(status()),'Reconnect falsely acknowledged the save');
  sessionStorage.setItem('offline-phase','task-retry');runtime.check();location.reload();return;
 }
 if(phase==='task-retry'){
  check(host.session.state().pendingIdentity?.operationId===sessionStorage.getItem('offline-operation'),'Reload changed operation identity');
  check(/Not synced/.test(status()),'Reload lost pending status');check(await host.session.retry(),'Explicit task retry');
  let stored=await host.request();check(stored.writes===1&&stored.receipts.length===1,'Retry duplicated committed task');check(stored.planner.boards[0].sections[0].tasks.filter(task=>task.title==='Interrupted task').length===1,'Task lost or duplicated');
  check(/Saved/.test(status()),'Missing confirmed status');check(await host.session.retry()===false,'Repeated retry must be inert');
  check(await router.navigate('settings-page'),'Settings route');const input=document.getElementById('settings-reschedule-completed');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));
  await network('offline');document.getElementById('settings-save-btn').click();check(await host.getSaving()===false,'Offline settings unexpectedly saved');check(host.sync.state().pending?.persisted,'Settings recovery not retained');
  await network('online');check(/Not synced/.test(status()),'Reconnect acknowledged settings');
  sessionStorage.setItem('offline-phase','settings-retry');runtime.check();location.reload();return;
 }
 check(phase==='settings-retry','Unexpected journey phase');check(host.sync.state().pending,'Reload lost settings');check(await router.navigate('settings-page'),'Restored settings route');check(document.getElementById('settings-reschedule-completed').checked,'Reload lost setting value');
 document.getElementById('settings-save-btn').click();check(await host.getSaving(),'Explicit settings retry');check((await host.request()).settings.planning.rescheduleCompleted,'Setting not confirmed');
 // A newer remote edit must survive a retained offline command's explicit retry.
 const command={type:'edit_task',target:{taskId:'t'},changes:{title:'Offline title'}},expected={boardId:'b',sectionId:'s',fields:{title:'Packaged smoke task'}};
 await network('offline');check(await host.session.run(command,expected)===false,'Offline task edit unexpectedly saved');
 await network('online');await host.request('/tasks',{command:{...command,changes:{title:'Newer remote title'}},expected,identity:{...host.identity,operationId:'remote-edit',createdAt:Date.now()}});
 check(await host.session.retry()===false,'Conflicting retry overwrote newer work');check(host.session.state().status==='conflict'&&/need review/.test(status()),'Conflict did not request review');
 const stored=await host.request();check(stored.writes===2&&stored.planner.boards[0].sections[0].tasks[0].title==='Newer remote title','Conflict changed remote data');
 const other=await(await fetch('/__fixture/other-fixture')).json();check(other.writes===0&&!other.settings.planning.rescheduleCompleted,'Another owner changed');
 runtime.check();result.dataset.result='passed';result.textContent='Passed real network interruption, reload, explicit task/settings retry, deduplication and conflict review.';
}catch(error){result.dataset.result='failed';result.textContent='Failed offline journey: '+error.message+' '+JSON.stringify(diagnostics());}}
void run();
