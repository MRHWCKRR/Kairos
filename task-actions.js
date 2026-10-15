const labels={details:'Task details',rename:'Rename',schedule:'Open in Schedule',complete:'Complete',incomplete:'Mark incomplete',up:'Move up',down:'Move down',move:'Move to section…',copy:'Copy title',archive:'Archive task…',saving:'Wait for the current save or resolve its Retry/Discard recovery.',recurring:'Complete individual occurrences in Schedule.',sorted:'Manual movement is unavailable in this sorted view.',first:'Already the first visible task.',last:'Already the last visible task.',missing:'This task is no longer available.',clipboard:'Could not copy the title. Allow clipboard access and try again.'};
const definitions=[['details','details','open'],['rename','rename','open'],['schedule','schedule','open'],['complete','complete','status'],['up','up','organise'],['down','down','organise'],['move','move','organise'],['copy-title','copy','copy'],['archive','archive','archive']];
const mutations=new Set(['complete','up','down','move','archive']);

export function createTaskActions({resolveTarget,getIdentity,getInteractionState,runTaskAction,openDetails,openSchedule,copyText,reportError=()=>{},translate}={}){
 const text=name=>{const key='task_menu_'+name,value=translate?.(key);return value&&value!==key?value:labels[name]};
 const same=context=>{const current=getIdentity();return !!context&&!!context.ownerId&&context.ownerId===current.ownerId&&context.planId===current.planId};
 function target(context){if(!same(context)||!Array.isArray(context.taskIds)||context.taskIds.length!==1||typeof context.taskIds[0]!=='string')return null;return resolveTarget({taskId:context.taskIds[0]})}
 function items(context){
  let found;try{found=target(context)}catch{return []}if(!found)return [];
  const state=getInteractionState({taskId:context.taskIds[0]}),task=found.task;
  return definitions.map(([id,name,group])=>{
   let reason='';if(mutations.has(id)&&(state.busy||state.pending))reason=text('saving');
   else if(id==='complete'&&task.recurrence?.enabled)reason=text('recurring');
   else if(['up','down','move'].includes(id)&&state.sorted)reason=text('sorted');
   else if(id==='up'&&!state.canMoveUp)reason=text('first');else if(id==='down'&&!state.canMoveDown)reason=text('last');
   return {id,label:text(id==='complete'&&task.completed?'incomplete':name),group,enabled:!reason,disabledReason:reason};
  });
 }
 async function invoke(id,context,sourceElement){
  if(!same(context))return false;
  try{
   const item=items(context).find(action=>action.id===id);if(!item||!item.enabled)return false;
   const found=target(context);if(!found)return false;const ref={taskId:context.taskIds[0]};
   if(id==='details'||id==='rename')return (await openDetails(ref,sourceElement,{focusField:id==='rename'?'title':null}))!==false;
   if(id==='schedule')return (await openSchedule(ref,sourceElement))!==false;
   if(id==='copy-title'){
    try{if(typeof copyText!=='function')throw Error('Clipboard unavailable');await copyText(String(found.task.title??''));return same(context)}
    catch{if(same(context))reportError(text('clipboard'));return false}
   }
   return (await runTaskAction(id,ref,sourceElement))!==false;
  }catch(error){if(same(context))reportError(error.message||text('missing'));return false}
 }
 return {items,invoke};
}
