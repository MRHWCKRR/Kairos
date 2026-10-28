import {assertFindTimePlacement} from './schedule-find-time-model.js?v=7';
import {stableStringify} from './plan-merge.js?v=1';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=6';
import {normalizeRecurrence,projectStoredOccurrence,generateTaskOccurrences} from './recurrence-utils.js?v=14';

const TASK_FIELDS=['date','startTime','endTime','estimatedMinutes','lastScheduledMinutes'];
const OCCURRENCE_FIELDS=['date','startTime','endTime','durationMinutes'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value||{},key)).map(key=>[key,structuredClone(value[key])]));
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function locate(state,target,{allowCompleted=false}={}){
 const found=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).filter(task=>String(task.id)===String(target?.taskId)).map(task=>({board,section,task}))));
 if(found.length!==1||found[0].board.archived||found[0].section.archived||found[0].task.archived)throw Error('This task is missing, archived or ambiguous.');
 const entry=found[0];
 if(target.occurrenceDate){
  if(!validDate(target.occurrenceDate))throw Error('Invalid occurrence date.');
  const occurrence=entry.task.recurrence?.exceptions?.[target.occurrenceDate]?.status==='completed'?projectStoredOccurrence(entry.task,target.occurrenceDate):generateTaskOccurrences(entry.task,target.occurrenceDate,target.occurrenceDate,{today:target.occurrenceDate})[0];
  if(!occurrence||!(occurrence.status==='pending'||allowCompleted&&occurrence.status==='completed'))throw Error('This occurrence changed or was completed.');
  return {...entry,occurrence};
 }
 if(entry.task.recurrence?.enabled||entry.task.completed&&!allowCompleted)throw Error('Choose an unfinished task or a single recurring occurrence.');
 return entry;
}
function fields(entry){
 if(!entry.occurrence)return {values:pick(entry.task,TASK_FIELDS)};
 const exception=entry.task.recurrence?.exceptions?.[entry.occurrence.occurrenceDate];
 return {values:pick(exception?.override,OCCURRENCE_FIELDS),exceptionPresent:!!exception,overridePresent:Object.hasOwn(exception||{},'override')};
}
function signature(entry){
 const rule=normalizeRecurrence(entry.task,entry.task.date);delete rule.exceptions;
 return stableStringify({schedule:fields(entry).values,template:entry.occurrence?pick(entry.task,TASK_FIELDS):null,
  effective:entry.occurrence?{date:entry.occurrence.displayDate,startTime:entry.occurrence.startTime,endTime:entry.occurrence.endTime,durationMinutes:entry.occurrence.durationMinutes}:null,
  completed:entry.task.completed===true,status:entry.occurrence?.status??null,scheduleLocked:entry.task.scheduleLocked===true,rule:entry.occurrence?rule:null});
}
function validateChanges(changes,occurrence){
 const allowed=occurrence?OCCURRENCE_FIELDS:['date','startTime','endTime','lastScheduledMinutes'];
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(key=>!allowed.includes(key))||!['date','startTime','endTime'].every(key=>Object.hasOwn(changes,key)))throw Error('Invalid schedule fields.');
 if(changes.date!==null&&!validDate(changes.date))throw Error('Choose a valid schedule date.');
 for(const key of ['startTime','endTime'])if(changes[key]!==null&&(typeof changes[key]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(changes[key])))throw Error('Choose a valid time.');
 const start=parseTime(changes.startTime),end=parseTime(changes.endTime);
 if((start===null)!==(end===null)||start!==null&&(!changes.date||end!==0&&end<=start))throw Error('A task must end after it starts and by midnight.');
 const duration=changes.durationMinutes??changes.lastScheduledMinutes;
 if(duration!==undefined&&(!Number.isInteger(duration)||duration<1||duration>1440))throw Error('Choose a valid duration.');
 if(occurrence&&(!Number.isInteger(changes.durationMinutes)||start!==null&&((end-start+1440)%1440||1440)!==duration))throw Error('This occurrence duration does not match its times.');
}
export function buildScheduleChange(state,target,changes,options={}){
 const entry=locate(state,target,options);validateChanges(changes,!!entry.occurrence);
 return {command:{type:'schedule_change',target:structuredClone(target),changes:structuredClone(changes)},expected:{boardId:entry.board.id,sectionId:entry.section.id,guard:signature(entry)}};
}
function check(entry,expected){
 if(entry.board.id!==expected?.boardId||entry.section.id!==expected?.sectionId||signature(entry)!==expected?.guard)throw Error('The task moved, its schedule changed or its status changed. Review the current task.');
}
function writeFields(entry,saved){
 if(!entry.occurrence){for(const key of TASK_FIELDS){if(Object.hasOwn(saved.values,key))entry.task[key]=structuredClone(saved.values[key]);else delete entry.task[key]}return}
 // Store explicit start/end overrides, including values equal to the template.
 // Flexible occurrences require an explicit startTime to become scheduled.
 const date=entry.occurrence.occurrenceDate,rule=normalizeRecurrence(entry.task,entry.task.date),exception=structuredClone(rule.exceptions[date]||{}),override={...exception.override};
 for(const key of OCCURRENCE_FIELDS){if(Object.hasOwn(saved.values,key))override[key]=structuredClone(saved.values[key]);else delete override[key]}
 if(Object.keys(override).length||saved.overridePresent)exception.override=override;else delete exception.override;
 if(Object.keys(exception).length||saved.exceptionPresent)rule.exceptions[date]=exception;else delete rule.exceptions[date];
 entry.task.recurrence=rule;
}
export function applyScheduleChange(state,command,expected,options={}){
 const entry=locate(state,command.target,options);check(entry,expected);validateChanges(command.changes,!!entry.occurrence);
 if(command.placement)assertFindTimePlacement(state,command.target,command.changes,command.placement);
 const before=fields(entry),next=structuredClone(state),destination=locate(next,command.target,options);
 writeFields(destination,{...before,values:{...before.values,...command.changes}});
 const after=locate(next,command.target,options);
 return {next,result:{type:'schedule_change',task:after.task,scheduleUndo:{version:1,target:structuredClone(command.target),boardId:after.board.id,sectionId:after.section.id,guard:signature(after),before}}};
}
export function applyScheduleUndo(state,record,options={}){
 if(record?.version!==1||!record.target||!record.before?.values||typeof record.guard!=='string')throw Error('This saved schedule Undo is unavailable.');
 const entry=locate(state,record.target,options);check(entry,record);
 const keys=entry.occurrence?OCCURRENCE_FIELDS:TASK_FIELDS;
 if(Object.keys(record.before.values).some(key=>!keys.includes(key)))throw Error('Invalid saved scheduling fields.');
 const next=structuredClone(state);writeFields(locate(next,record.target,options),record.before);
 return {next,result:{type:'schedule_undo',task:locate(next,record.target,options).task}};
}
