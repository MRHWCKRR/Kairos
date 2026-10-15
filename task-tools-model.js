import {stableStringify} from './plan-merge.js';

const location=found=>({taskId:found.task.id,boardId:found.board.id,sectionId:found.section.id});
export const TASK_TOOL_FIELDS=['date','dueDate','priority','durationMinutes','reminderMinutes','scheduleLocked'];
function ordinary(found){if(found.some(item=>item.task.recurrence?.enabled))throw Error('Use Details or Schedule for recurring series.');}
export function buildTaskToolCommand(state,action,ids,options,{resolve,values}){
 const found=ids.map(id=>resolve(state,id));ordinary(found);
 if(action==='edit'){
  if(!TASK_TOOL_FIELDS.includes(options.field))throw Error('Unsupported task field.');
  return {command:{type:'task_tool',action,taskIds:[...ids],field:options.field,value:options.value},expected:{tasks:found.map(item=>({...location(item),fields:{[options.field]:values(item.task)[options.field]}}))}};
 }
 if(action!=='duplicate')throw Error('Unsupported task tool.');
 const uuid=options.uuid||(()=>globalThis.crypto.randomUUID());
 return {command:{type:'task_tool',action,taskIds:[...ids],copies:found.map(item=>({taskId:item.task.id,id:'task-'+uuid(),checklistIds:(item.task.checklist||[]).map(()=>'step-'+uuid())}))},expected:{tasks:found.map(item=>({...location(item),fields:values(item.task)}))}};
}
export function applyTaskToolCommand(state,command,expected,{resolve,values,apply},restore=false){
 const ids=command.taskIds,found=ids.map(id=>resolve(state,id));ordinary(found);
 if(command.action==='edit'||restore){
  const field=command.field;if(!TASK_TOOL_FIELDS.includes(field)||!Array.isArray(expected?.tasks)||expected.tasks.length!==ids.length||new Set(expected.tasks.map(item=>item?.taskId)).size!==ids.length)throw Error('Invalid task field expectations.');
  if(restore&&(!Array.isArray(command.values)||command.values.length!==ids.length||new Set(command.values.map(item=>item?.taskId)).size!==ids.length||command.values.some(item=>!ids.includes(item?.taskId))))throw Error('Invalid field inverse.');
  let next=structuredClone(state);const before=[];
  for(const source of found){const old=expected.tasks.find(item=>item.taskId===source.task.id),current=values(source.task)[field];if(!old||old.boardId!==source.board.id||old.sectionId!==source.section.id||Object.keys(old.fields||{}).length!==1||stableStringify(old.fields[field])!==stableStringify(current))throw Error('A selected task moved or its field changed.');before.push({taskId:source.task.id,value:current});
   next=apply(next,{type:'edit_task',target:{taskId:source.task.id},changes:{[field]:restore?command.values.find(item=>item.taskId===source.task.id).value:command.value}},{boardId:source.board.id,sectionId:source.section.id,fields:old.fields}).next;
  }
  const result={type:'task_tool',action:'edit',taskIds:[...ids],completedTaskIds:[],affectedCount:ids.length};
  if(!restore)result.inverse={command:{type:'restore_task_fields',taskIds:[...ids],field,values:before},expected:{tasks:ids.map(id=>{const source=resolve(next,id);return {...location(source),fields:{[field]:values(source.task)[field]}}})}};
  return {next,result};
 }
 if(command.action!=='duplicate'||!Array.isArray(command.copies)||command.copies.length!==ids.length||new Set(command.copies.map(copy=>copy?.taskId)).size!==ids.length)throw Error('Invalid task duplication.');
 if(!Array.isArray(expected?.tasks)||expected.tasks.length!==ids.length||new Set(expected.tasks.map(item=>item?.taskId)).size!==ids.length)throw Error('Invalid task tool expectations.');
 const used=new Set((state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).flatMap(task=>[task.id,...(task.checklist||[]).map(item=>item.id)]))));let next=structuredClone(state);const created=[];
 for(const source of found){
  const old=expected.tasks.find(item=>item.taskId===source.task.id),copy=command.copies.find(item=>item.taskId===source.task.id),fields=values(source.task);
  if(!old||old.boardId!==source.board.id||old.sectionId!==source.section.id||stableStringify(old.fields)!==stableStringify(fields))throw Error('A source task changed. No copies were created.');
  const generated=[copy?.id,...(Array.isArray(copy?.checklistIds)?copy.checklistIds:[])];
  if(!copy||!Array.isArray(copy.checklistIds)||copy.checklistIds.length!==fields.checklist.length||generated.some(id=>typeof id!=='string'||!id||id.length>120||used.has(id))||new Set(generated).size!==generated.length)throw Error('Invalid or existing generated ID.');
  generated.forEach(id=>used.add(id));const target={boardId:source.board.id,sectionId:source.section.id};
  next=apply(next,{type:'create_task',target,task:{id:copy.id,title:source.task.title}},target).next;
  // Copy only supported metadata: scheduling, recurrence and operation history
  // deliberately never enter the new ordinary task.
  const changes=Object.fromEntries(['notes','dueDate','priority','durationMinutes','reminderMinutes','schedulingPreference','color'].map(key=>[key,fields[key]]));changes.checklist=fields.checklist.map((item,index)=>({id:copy.checklistIds[index],title:item.title,completed:false}));changes.scheduleLocked=false;
  next=apply(next,{type:'edit_task',target:{taskId:copy.id},changes},{...target,fields:values(resolve(next,copy.id).task)}).next;created.push(copy.id);
 }
 return {next,result:{type:'task_tool',action:'duplicate',taskIds:created,completedTaskIds:[],affectedCount:created.length}};
}
