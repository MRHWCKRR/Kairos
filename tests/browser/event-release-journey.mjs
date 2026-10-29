import {mountNativeEventEditor} from '../../native-event-editor.js';
import {createMutationSession} from '../../mutation-session.js';
import {applyNativeEventChange,applyNativeEventUndo,buildNativeEventUndo} from '../../native-event-commands.js';
import {previewAiEventChange} from '../../ai-event-actions.js';
import {mountAiUndo} from '../../ai-undo-view.js';
import {plannerChangeRows} from '../../planner-changes.js';
import {normalizeTaskMetadata} from '../../schedule-utils.js';

export async function runEventReleaseJourney({document,window,wait,check}) {
 const now=Date.parse('2026-10-27T08:00:00Z'),memory=new Map(),receipts=new Map();
 let identity={ownerId:'release-one',planId:'release-plan'},writes=0,offline=true,lost=false,session,editor,undo;
 let saved=JSON.stringify({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'legacy',title:'Existing work',date:'2026-10-27',startTime:'08:00',endTime:'08:30'}]}]}],scheduleEvents:[],calendarSources:[]});
 const state=()=>JSON.parse(saved),display=()=>{const data=state();normalizeTaskMetadata(data.boards[0].sections[0].tasks[0]);return data;};
 const storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
 const commit=async(command,expected,actor)=>{
  if(offline){offline=false;throw Error('Simulated offline save');}
  if(actor.ownerId!==identity.ownerId||actor.planId!==identity.planId)throw Error('Account changed');
  if(receipts.has(actor.operationId))return receipts.get(actor.operationId);
  const result=command.type==='native_event_undo'
   ?applyNativeEventUndo(state(),receipts.get(command.sourceOperationId).nativeEventUndo,command,expected,{now})
   :applyNativeEventChange(state(),command,expected,{now});
  saved=JSON.stringify(result.next);writes++;receipts.set(actor.operationId,result.result);
  if(lost){lost=false;throw Error('Simulated lost acknowledgement');}
  return result.result;
 };
 const mount=()=>{
  session=createMutationSession({getIdentity:()=>identity,storage,commit});
  editor=mountNativeEventEditor({document,window,getIdentity:()=>identity,getState:display,getTimezone:()=> 'UTC',getToday:()=> '2026-10-27',commit:(...args)=>session.submit(...args),session,confirmDiscard:async()=>true,now:()=>now});
 };
 const reload=()=>{editor.dispose();session.dispose();mount();};
 const find=selector=>document.querySelector('.native-event-editor '+selector);
 const field=(name,value)=>{
  const element=find('[name="'+name+'"]');
  if(element.type==='checkbox')element.checked=value;
  else if(element.tagName==='SELECT'){for(const option of element.options)option.selected=false;[...element.options].find(option=>option.value===value).selected=true;}
  else element.value=value;
  element.dispatchEvent(new window.Event('input',{bubbles:true}));
 };
 mount();
 try {
  await editor.open();field('title','Release reminder');field('start','09:00');field('end','09:10');field('reminderMinutes','30');field('busy',false);
  find('[data-event-preview]').click();await wait(()=>!find('[data-event-apply]').disabled);
  check(state().scheduleEvents.length===0,'Event review must not write');find('[data-event-apply]').click();
  await wait(()=>session.state().pending&&!session.state().busy);
  check(writes===0&&state().scheduleEvents.length===0,'Failed save must not claim persistence');
  reload();await session.retry();check(writes===1&&state().scheduleEvents.length===1,'Reload recovery saves exactly one event against legacy task metadata');
  const id=state().scheduleEvents[0].id;await editor.open(id);check(find('[name=reminderMinutes]').value==='30','Native reminder survives reload');
  const preview=previewAiEventChange(display(),{type:'update_schedule_event',args:{eventId:id,reminderMinutes:null}},'UTC',{now});
  check(state().scheduleEvents[0].reminderMinutes===30,'AI preview must not apply automatically');
  lost=true;await session.run(preview.approval.command,preview.approval.expected);
  check(session.state().pending&&state().scheduleEvents[0].reminderMinutes===null,'Lost AI reply retains recovery after commit');
  const source=[...receipts].at(-1);reload();await session.retry();
  check(writes===2&&!session.state().pending,'AI retry reconciles receipt without another write');
  await editor.open(id);check(find('[name=reminderMinutes]').value==='off','AI reminder removal survives remount');
  const root=document.createElement('section');document.body.appendChild(root);
  undo=mountAiUndo({root,document,window,getIdentity:()=>identity,session,loadPreview:async()=>{
   const proposal=buildNativeEventUndo(display(),source[0],source[1].nativeEventUndo,'UTC',now);
   const after=applyNativeEventUndo(state(),source[1].nativeEventUndo,proposal.command,proposal.expected,{now});
   return {...proposal,rows:plannerChangeRows(state(),after.next),eventSummary:{kind:'native-event',title:'Undo reminder change',timezone:'UTC',range:proposal.range,before:source[1].nativeEventUndo.after,event:source[1].nativeEventUndo.before,conflicts:proposal.conflicts}};
  }});
  find('[data-event-close]').click();root.querySelector('[data-ai-undo-open]').click();await wait(()=>document.querySelector('.ai-undo-dialog[open]'));
  check(state().scheduleEvents[0].reminderMinutes===null,'Undo waits for approval');
  document.querySelector('.ai-undo-dialog[open] [data-ai-undo-apply]').click();await wait(()=>state().scheduleEvents[0].reminderMinutes===30&&!session.state().busy);
  undo.dispose();undo=null;root.remove();reload();await editor.open(id);
  check(state().scheduleEvents.length===1&&find('[name=reminderMinutes]').value==='30','Reviewed Undo persists without duplicating event');
  check(state().scheduleEvents[0].transparent===true&&state().boards[0].sections[0].tasks[0].title==='Existing work','Reminder workflow preserves free/busy and existing work');
  field('title','Private unsaved draft');identity={ownerId:'release-two',planId:'other'};session.sync();editor.sync();
  check(!document.querySelector('.native-event-editor').hasAttribute('open'),'Account switch closes the private event draft');
  check(find('[data-event-conflicts]').textContent==='','Account switch clears old conflict information');
  check(writes===3,'Account switch cannot save the old draft');
 } finally {undo?.dispose();editor.dispose();session.dispose();}
}
