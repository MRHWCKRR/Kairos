const labels={details:'Task details',rename:'Rename',schedule:'Open in Schedule',complete:'Complete',incomplete:'Mark incomplete',up:'Move up',down:'Move down',move:'Move to section…',copy:'Copy title',archive:'Archive task…',saving:'Wait for the current save or resolve its Retry/Discard recovery.',recurring:'Complete individual occurrences in Schedule.',sorted:'Manual movement is unavailable in this sorted view.',first:'Already the first visible task.',last:'Already the last visible task.',missing:'This task is no longer available.',clipboard:'Could not copy the title. Allow clipboard access and try again.'};
const definitions=[['details','details','open'],['rename','rename','open'],['schedule','schedule','open'],['complete','complete','status'],['up','up','organise'],['down','down','organise'],['move','move','organise'],['copy-title','copy','copy'],['archive','archive','archive']];
const mutations=new Set(['complete','up','down','move','archive']);
const batchLabels={batch_complete:'Complete',batch_incomplete:'Mark incomplete',batch_move:'Move to section',batch_archive:'Archive tasks',batch_limit:'Select at most 50 tasks for one batch.'};

export function createTaskActions({resolveTarget,getIdentity,getInteractionState,runTaskAction,runTaskBatch,openDetails,openSchedule,copyText,reportError=()=>{},translate,selection}={}){
 const text=name=>{const key='task_menu_'+name,value=translate?.(key);return value&&value!==key?value:labels[name]||batchLabels[name]};
 const same=context=>{const current=getIdentity();return !!context&&!!context.ownerId&&context.ownerId===current.ownerId&&context.planId===current.planId};
 function targets(context){
  if(!same(context)||!Array.isArray(context.taskIds)||!context.taskIds.length||(!selection&&context.taskIds.length!==1)||new Set(context.taskIds).size!==context.taskIds.length)return null;
  const found=context.taskIds.map(taskId=>typeof taskId==='string'?resolveTarget({taskId}):null);
  return found.every(item=>item&&!item.task.archived&&!item.board.archived&&!item.section.archived)?found:null;
 }
 const target=context=>targets(context)?.[0];
 const selectionItem=(context)=>{const id=context.primaryTaskId||context.taskIds[0],checked=selection.has(id);return {id:'select',label:selectionText(checked?'deselect':'select'),group:'selection',enabled:true,disabledReason:'',checked}};
 const selectionText=key=>{const name='task_selection_'+key,value=translate?.(name);return value&&value!==name?value:({select:'Select task',deselect:'Deselect task',clear:'Clear selection',copy:'Copy titles'})[key]};
 function items(context){
  let found;try{found=target(context)}catch{return []}if(!found)return [];
  const extra=selection?[selectionItem(context),...(selection.ids().length?[{id:'clear-selection',label:selectionText('clear'),group:'selection',enabled:true,disabledReason:''}]:[])]:[];
  if(context.taskIds.length>1){
   if(!context.taskIds.every(id=>selection.has(id)))return [];
   const state=getInteractionState({taskId:context.taskIds[0]}),recurring=targets(context).some(item=>item.task.recurrence?.enabled);
   const batch=typeof runTaskBatch==='function'?['complete','incomplete','move','archive'].map(action=>{
    const reason=context.taskIds.length>50?text('batch_limit'):state.busy||state.pending?text('saving'):['complete','incomplete'].includes(action)&&recurring?text('recurring'):action==='move'&&state.sorted?text('sorted'):'';
    return {id:'bulk-'+action,label:text('batch_'+action),group:action==='complete'||action==='incomplete'?'status':action==='archive'?'archive':'organise',enabled:!reason,disabledReason:reason};
   }):[];
   return [...batch,{id:'copy-titles',label:selectionText('copy'),group:'copy',enabled:true,disabledReason:''},...extra];
  }
  const state=getInteractionState({taskId:context.taskIds[0]}),task=found.task;
  return [...definitions.map(([id,name,group])=>{
   let reason='';if(mutations.has(id)&&(state.busy||state.pending))reason=text('saving');
   else if(id==='complete'&&task.recurrence?.enabled)reason=text('recurring');
   else if(['up','down','move'].includes(id)&&state.sorted)reason=text('sorted');
   else if(id==='up'&&!state.canMoveUp)reason=text('first');else if(id==='down'&&!state.canMoveDown)reason=text('last');
   return {id,label:text(id==='complete'&&task.completed?'incomplete':name),group,enabled:!reason,disabledReason:reason};
  }),...extra];
 }
 async function invoke(id,context,sourceElement){
  if(!same(context))return false;
  try{
   const item=items(context).find(action=>action.id===id);if(!item||!item.enabled)return false;
   const found=target(context);if(!found)return false;const ref={taskId:context.taskIds[0]};
   if(id.startsWith('bulk-'))return (await runTaskBatch(id.slice(5),{taskIds:[...context.taskIds]},sourceElement))!==false;
   if(id==='select')return selection.toggle(context.primaryTaskId||ref.taskId);
   if(id==='clear-selection')return selection.clear();
   if(id==='details'||id==='rename')return (await openDetails(ref,sourceElement,{focusField:id==='rename'?'title':null}))!==false;
   if(id==='schedule')return (await openSchedule(ref,sourceElement))!==false;
   if(id==='copy-title'||id==='copy-titles'){
    try{if(typeof copyText!=='function')throw Error('Clipboard unavailable');const text=targets(context).map(item=>String(item.task.title??'')).join('\n');await copyText(text);return same(context)}
    catch{if(same(context))reportError(text('clipboard'));return false}
   }
   return (await runTaskAction(id,ref,sourceElement))!==false;
  }catch(error){if(same(context))reportError(error.message||text('missing'));return false}
 }
 return {items,invoke};
}
