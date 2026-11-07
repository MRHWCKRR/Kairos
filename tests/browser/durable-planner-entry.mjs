import {mountPlannerSaveFeedback} from '/planner-save-feedback.js?v=@@VERSION@@';
import {mountSyncStatus,plannerSyncSources} from '/sync-status.js?v=@@VERSION@@';
import {createPackagedPlannerHost,createPackagedErrorLedger} from '/__planner-host.js';
const result=document.getElementById('packaged-smoke-result'),runtime=createPackagedErrorLedger(localStorage),check=(value,message)=>{if(!value)throw Error(message)};
window.addEventListener('error',event=>{if(event.error)runtime.record(event.message)});window.addEventListener('unhandledrejection',event=>runtime.record(event.reason));
const wait=async(predicate,label)=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('Timed out: '+label)};
async function network(value){document.documentElement.dataset.networkRequest=value;await wait(()=>document.documentElement.dataset.networkApplied===value&&navigator.onLine===(value==='online'),'network '+value);}
function reopen(phase){localStorage.setItem('durable-phase',phase);runtime.check();document.documentElement.dataset.reopen='true';}
async function run(){try{
 document.getElementById('app-loading-screen')?.remove();const host=await createPackagedPlannerHost({ordinary:true}),p=host.persistence;
 const feedback=mountPlannerSaveFeedback({root:document.getElementById('planner-save-feedback'),window,controller:p,getOwnerId:()=>host.identity.ownerId,confirmDiscard:async()=>true});
 mountSyncStatus({root:document.getElementById('planner-sync-status'),window,getOwnerId:()=>host.identity.ownerId,sources:plannerSyncSources({mutations:host.session,settings:host.sync,persistence:p,navigate(){},reviewPlanner:()=>feedback.open()})});
 const status=()=>document.getElementById('planner-sync-status').textContent;
 async function remoteTitle(value,section=false){const before=(await host.request()).planner,local=structuredClone(before);if(section)local.boards[0].sections[0].title=value;else local.boards[0].title=value;await host.request('/planner',{base:before,local});}
 const phase=localStorage.getItem('durable-phase');
 if(!phase){
  await network('offline');host.getState().boards[0].title='Retained board';check(await p.save()===false,'Offline ordinary save succeeded');check(p.state().retained&&/Offline/.test(status()),'Offline edit was not retained');
  await network('online');await remoteTitle('Remote section',true);reopen('restore');return;
 }
 if(phase==='restore'){
  check(p.state().pending&&host.getState().boards[0].title==='Retained board','Reopening lost the board edit');check(host.getState().boards[0].sections[0].title==='Remote section','Restore lost unrelated remote edit');check((await host.request()).plannerWrites===1,'Reopening replayed automatically');
  const review=document.querySelector('#planner-sync-status button');check(review?.textContent==='Review','Global recovery Review missing');review.click();
  const retry=document.querySelector('[data-planner-retry]');check(!retry.disabled&&!document.getElementById('planner-save-feedback').hidden,'Recovery panel unavailable');retry.focus();check(document.activeElement===retry,'Recovery Retry cannot receive keyboard focus');retry.click();
  await wait(()=>!p.state().busy,'ordinary retry');check(!p.state().pending,'Ordinary retry did not settle');let stored=await host.request();check(stored.plannerWrites===2&&stored.planner.boards[0].title==='Retained board'&&stored.planner.boards[0].sections[0].title==='Remote section','Ordinary retry lost data');
  host.getState().boards.push({id:'durable-new',title:'One new board',sections:[]});host.failNextPlannerAfter();check(await p.save()===false&&p.state().retained,'Lost acknowledgement was not retained');reopen('acknowledgement');return;
 }
 if(phase==='acknowledgement'){
  const stored=await host.request();check(!p.state().pending&&stored.plannerWrites===3,'Acknowledged state was replayed on reopening');check(stored.planner.boards.filter(b=>b.id==='durable-new').length===1,'Reopening duplicated a board');
  await network('offline');host.getState().boards[0].title='Pending conflict';check(await p.save()===false,'Conflict setup save');await network('online');await remoteTitle('Newer remote board');reopen('conflict');return;
 }
 check(phase==='conflict','Unexpected recovery phase');check(p.state().conflict&&p.state().pending,'Conflict not retained');check(p.recovery().local.boards[0].title==='Pending conflict','Conflict lost local edits');
 check(/need review/.test(status()),'Conflict status missing');document.querySelector('[data-planner-retry]').click();await wait(()=>!p.state().busy,'conflict retry');check((await host.request()).planner.boards[0].title==='Newer remote board','Conflict overwrote saved data');
 document.querySelector('[data-planner-discard]').click();await wait(()=>!p.state().pending,'confirmed discard');check(host.getState().boards[0].title==='Newer remote board','Discard did not load confirmed planner');check((await host.request()).plannerWrites===4,'Conflict or discard unexpectedly wrote');
 const other=await(await fetch('/__fixture/other-fixture')).json();check(!other.plannerWrites,'Recovery changed another owner');runtime.check();result.dataset.result='passed';result.textContent='Passed ordinary planner recovery after three real tab closures: explicit retry, remote merge, acknowledgement confirmation and conflict discard.';
}catch(error){result.dataset.result='failed';result.textContent='Failed durable recovery: '+error.message+' '+JSON.stringify({phase:localStorage.getItem('durable-phase'),network:{...document.documentElement.dataset}});}}
void run();
