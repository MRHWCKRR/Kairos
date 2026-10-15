export function createTaskSectionActions({getIdentity,resolveSection,getInteractionState,addTask,selectSection,collapseSection,translate}={}){
 const labels={add:'Add task',select:'Select tasks in section',collapse:'Collapse section',saving:'Wait for the current save or resolve Retry/Discard.'};
 const text=key=>{const name='task_section_'+key,value=translate?.(name);return value&&value!==name?value:labels[key]};
 function valid(context){const current=getIdentity();if(context?.scope!=='section'||!current.ownerId||context.ownerId!==current.ownerId||context.planId!==current.planId)return false;try{return !!resolveSection(context.section)}catch{return false}}
 function items(context){if(!valid(context))return [];const state=getInteractionState?.()||{},reason=state.busy||state.pending?text('saving'):'';return [{id:'add',label:text('add'),group:'section',enabled:!reason,disabledReason:reason},{id:'select-section',label:text('select'),group:'section',enabled:true},{id:'collapse-section',label:text('collapse'),group:'section',enabled:true}]}
 async function invoke(id,context,source){const item=items(context).find(item=>item.id===id);if(!item?.enabled)return false;const callbacks={add:addTask,'select-section':selectSection,'collapse-section':collapseSection};return (await callbacks[id]({...context.section},source))!==false}
 return {items,invoke};
}
