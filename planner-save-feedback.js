import {plannerChangeRows} from './planner-changes.js?v=2';

export function mountPlannerSaveFeedback({root,window=globalThis.window,controller,getOwnerId,confirmDiscard}){
 if(!root)return {sync(){},open(){},dispose(){}};
 const document=root.ownerDocument,heading=document.createElement('h3'),message=document.createElement('p'),retention=document.createElement('p'),list=document.createElement('ul'),actions=document.createElement('div'),retry=document.createElement('button'),discard=document.createElement('button');
 heading.textContent='Planner changes need review';retry.type=discard.type='button';retry.textContent='Retry save';discard.textContent='Discard pending changes';retry.dataset.plannerRetry='';discard.dataset.plannerDiscard='';actions.append(retry,discard);root.replaceChildren(heading,message,retention,list,actions);
 root.classList.add('planner-save-feedback');root.setAttribute('aria-label','Pending planner changes');message.setAttribute('role','status');message.setAttribute('aria-live','polite');let disposed=false,confirming=false;
 function sync(){
  if(disposed)return;const state=controller.state(),owned=getOwnerId()&&state.ownerId===getOwnerId();
  root.hidden=!owned||!state.pending||(state.busy&&root.hidden);if(root.hidden)return;
  heading.textContent=state.conflict?'Planner changes need review':'Planner changes are not synced';message.textContent=state.message||'Review these pending changes, then retry or discard them.';
  retention.textContent=state.retained?'Pending edits are saved on this device.':'Pending edits could not be saved on this device. Keep this tab open.';
  retry.disabled=state.busy||state.canRetry===false;discard.disabled=state.busy||confirming||state.canDiscard===false;
  const record=controller.recovery();list.replaceChildren();
  if(record)try{const rows=plannerChangeRows(record.base,record.local);for(const row of rows.slice(0,12)){const item=document.createElement('li');item.textContent=row.title+' · '+row.field+': '+row.before+' → '+row.after;list.append(item);}if(rows.length>12){const item=document.createElement('li');item.textContent=(rows.length-12)+' more pending changes.';list.append(item);}}catch{const item=document.createElement('li');item.textContent='Pending planner edits are retained for review.';list.append(item);}
 }
 async function retrySave(){if(!disposed&&!retry.disabled)await controller.retry();}
 async function discardChanges(){
  if(disposed||discard.disabled)return;const identity=controller.recovery()?.id??null;confirming=true;sync();
  try{if(await confirmDiscard('Discard these pending planner changes and load the saved planner?')&&!disposed)await controller.discard(identity);}finally{confirming=false;sync();}
 }
 function open(){sync();if(!root.hidden){root.scrollIntoView?.({block:'nearest'});retry.focus();}}
 function pagehide(event){if(!event.persisted)dispose();}
 function dispose(){if(disposed)return;disposed=true;unsubscribe();retry.removeEventListener('click',retrySave);discard.removeEventListener('click',discardChanges);window.removeEventListener('pagehide',pagehide);}
 const unsubscribe=controller.subscribe(sync);retry.addEventListener('click',retrySave);discard.addEventListener('click',discardChanges);window.addEventListener('pagehide',pagehide);sync();
 return {sync,open,dispose};
}
