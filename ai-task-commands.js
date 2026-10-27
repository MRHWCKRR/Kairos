import {applyTaskListCommand,taskDetailValues,taskListLocation,taskListSection} from './task-list-model.js?v=23';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=3';

const fields={
 update_task:['taskId','title','newTitle','boardId','board','sectionId','section','date','startTime','endTime','completed','archived'],
 resize_task:['taskId','title','date','startTime','endTime','durationMinutes'],
 set_task_reminder:['taskId','title','minutesBefore'],
 remove_task_reminder:['taskId','title'],
 move_task:[]
};
function time(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Invalid schedule time.');
 return parseTime(value);
}
const timeText=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
function scheduleChanges(task,type,args,allowDurationChange){
 if(task.scheduleLocked)throw Error('This task schedule is locked.');
 if(task.recurrence?.enabled)throw Error('Use the schedule to change recurring task occurrences.');
 const resizing=type==='resize_task';
 if(resizing&&!allowDurationChange)throw Error('An explicit duration change request is required.');
 const date=args.date!==undefined?args.date||null:task.date||null;
 const startText=args.startTime!==undefined?args.startTime||null:task.startTime||null;
 let endText=args.endTime!==undefined?args.endTime||null:task.endTime||null;
 const start=time(startText);let end=time(endText),duration=taskDurationMinutes(task);
 if(!resizing&&args.startTime&&args.endTime===undefined){
  end=start+duration;if(end>=1440)throw Error('Invalid schedule duration: the task must end on the same day.');endText=timeText(end);
 }
 if(resizing&&args.durationMinutes!==undefined){
  duration=args.durationMinutes;
  if(!Number.isInteger(duration)||duration<1||duration>=1440)throw Error('Invalid duration: use 1–1439 whole minutes.');
  if(start!==null){
   end=start+duration;if(end>=1440)throw Error('Invalid duration: the task must end on the same day.');
   if(args.endTime!==undefined&&args.endTime!==timeText(end))throw Error('Invalid duration: end time and duration do not agree.');
   endText=timeText(end);
  }
 }
 if((start===null)!==(end===null)||start!==null&&(!date||end<=start))throw Error('Invalid task date or time range.');
 if(resizing){
  if(start!==null)duration=end-start;
  else if(args.endTime!==undefined||args.durationMinutes===undefined)throw Error('Invalid duration: provide a start time or duration.');
 }else if(start!==null&&end-start!==duration)throw Error('The schedule must preserve the task duration.');
 const changes={date};
 if(args.startTime!==undefined||!resizing&&args.endTime!==undefined)changes.startTime=startText;
 if(resizing)changes.durationMinutes=duration;
 return changes;
}

// AI intent is translated into the same commands used by Details and Schedule.
// All steps operate on a private draft, so a failed move or field validation
// cannot leave an earlier rename/completion applied.
export function applyAiTaskMutation(state,{type,target,args={},destination}={}, {allowDurationChange=false,allowCompleted=false}={}){
 if(!fields[type]||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!fields[type].includes(key)))throw Error('Unsupported AI task fields.');
 let next=structuredClone(state);
 const current=()=>taskListLocation(next,target?.taskId,{allowArchived:true});
 const apply=command=>{
  const found=current(),expected={boardId:found.board.id,sectionId:found.section.id};
  if(command.type==='edit_task')expected.fields=taskDetailValues(found.task);
  else if(['archive_task','complete_task'].includes(command.type))expected.value=found.task[command.type==='archive_task'?'archived':'completed']===true;
  const applied=applyTaskListCommand(next,command,expected,{allowCompleted});next=applied.next;
 };
 let found=current();const originalTitle=found.task.title;
 if(found.task.archived){
  if(type!=='update_task'||args.archived!==false)throw Error('Restore this archived task before editing it.');
  apply({type:'archive_task',target,value:false});found=current();
 }
 if(type==='set_task_reminder'||type==='remove_task_reminder'){
  apply({type:'edit_task',target,changes:{reminderMinutes:type==='remove_task_reminder'?null:args.minutesBefore}});
  const task=current().task;
  // An AI series-reminder request applies to every occurrence, as before.
  for(const exception of Object.values(task.recurrence?.exceptions||{}))if(exception?.override)delete exception.override.reminderMinutes;
 }else if(type==='update_task'||type==='resize_task'){
  const changes={};
  if(args.newTitle!==undefined)changes.title=args.newTitle;
  if(type==='resize_task'||['date','startTime','endTime'].some(key=>args[key]!==undefined))Object.assign(changes,scheduleChanges(found.task,type,args,allowDurationChange));
  if(Object.keys(changes).length)apply({type:'edit_task',target,changes});
  if(args.completed!==undefined)apply({type:'complete_task',target,value:args.completed});
 }
 if(destination){
  found=current();const dest=taskListSection(next,destination);
  if(found.board.id!==dest.board.id||found.section.id!==dest.section.id){
   const expected={boardId:found.board.id,sectionId:found.section.id,sourceOrder:found.section.tasks.map(t=>t.id),destinationOrder:(dest.section.tasks||[]).map(t=>t.id)};
   next=applyTaskListCommand(next,{type:'move_task',target,destination:{...destination,index:(dest.section.tasks||[]).length}},expected,{allowCompleted}).next;
  }
 }
 if(type==='update_task'&&args.archived===true)apply({type:'archive_task',target,value:true});
 found=current();
 return {next,result:{type,task:found.task,board:found.board.title,section:found.section.title,...(args.newTitle!==undefined?{originalTitle}:{})}};
}

