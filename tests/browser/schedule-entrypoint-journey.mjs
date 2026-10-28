import {initScheduleWorkspace} from '../../schedule-workspace.js';
import {mountNativeEventEditor} from '../../native-event-editor.js';
import {createMutationSession} from '../../mutation-session.js';

let fixtureRoot;
export async function runScheduleEntrypointJourney({document,window,wait,check}){
 // The task creator owns an observer on this toolbar for the page lifetime.
 // Reuse that node when the interactive regression harness runs again.
 if(!fixtureRoot){
  fixtureRoot=document.createElement('section');fixtureRoot.id='schedule-page';fixtureRoot.className='page-view active';
  fixtureRoot.innerHTML='<div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><aside id="schedule-backlog"></aside><div id="schedule-calendar"></div><aside id="schedule-inspector"></aside></div><div id="schedule-ai-review"></div>';
 }
 const root=fixtureRoot;
 document.body.appendChild(root);
 const previousBridge=window.__kairosScheduleBridge,previousWorkspace=window.__kairosScheduleWorkspace;
 const identity={ownerId:'entrypoint-test',planId:'isolated'},memory=new Map(),data={boards:[],scheduleEvents:[]};
 const session=createMutationSession({getIdentity:()=>identity,storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},commit:async()=>{throw Error('This entrypoint journey must not save.')}});
 const editor=mountNativeEventEditor({document,window,getIdentity:()=>identity,getState:()=>data,getTimezone:()=> 'UTC',getToday:()=> '2026-10-28',session,commit:(...args)=>session.submit(...args),confirmDiscard:async()=>true});
 const options={getOwnerId:()=>identity.ownerId,getPlanId:()=>identity.planId,getBoards:()=>data.boards,getScheduleEvents:()=>data.scheduleEvents,getTimezone:()=> 'UTC',getScheduleDate:()=> '2026-10-28',getScheduleView:()=> 'day',openRecurringEventEditor:()=>void editor.open()};
 window.__kairosScheduleBridge=options;
 const workspace=initScheduleWorkspace(options);window.__kairosScheduleWorkspace=workspace;
 try{
  await import('../../schedule-task-create.js');
  for(let pass=0;pass<2;pass++){
   if(pass)workspace.render();
   await wait(()=>root.querySelector('[data-add-task]')&&root.querySelector('[data-event]'));
   check(root.querySelectorAll('[data-add-task]').length===1,'Schedule has exactly one task creator after rerender');
   root.querySelector('[data-event]').click();await wait(()=>document.querySelector('.native-event-editor[open]'));
   check(document.querySelector('.native-event-editor [name=reminderMinutes]'),'Event toolbar opens the production editor with reminders');
   document.querySelector('.native-event-editor [data-event-close]').click();await wait(()=>!document.querySelector('.native-event-editor[open]'));
   root.querySelector('[data-add-task]').click();await wait(()=>root.querySelector('[data-ks-create-task]'));
   check(root.querySelector('#schedule-inspector').hidden===false,'Task toolbar still opens its visible creator');
   root.querySelector('[data-create-cancel]').click();
  }
 }finally{editor.dispose();session.dispose();workspace.destroy();root.remove();window.__kairosScheduleBridge=previousBridge;window.__kairosScheduleWorkspace=previousWorkspace;}
}
