import {stableStringify} from './plan-merge.js?v=1';
import {parseTime,taskDurationMinutes,validateScheduleProposals} from './schedule-utils.js?v=6';
import {normalizeRecurrence,validateRecurrence,generateTaskOccurrences,generateTaskOccurrencesThrough,applyOccurrenceOverride} from './recurrence-utils.js?v=14';
import {buildScheduleChange,applyScheduleChange} from './schedule-change-model.js?v=11';
import {planningClock,shiftPlanningDate,validPlanningDate} from './planning-model.js?v=1';
import {scheduleProposalFits} from './schedule-planning-availability.js?v=7';
const baseFields=['id','title','date','dueDate','estimatedMinutes','startTime','endTime'];
const richFields=['notes','priority','reminderMinutes','scheduleLocked','schedulingPreference','color','recurrence'];
const proposalFields=['priority','estimatedMinutes','schedulingPreference','color'];
const ruleFields=['enabled','frequency','interval','weekdays','monthlyMode','monthDay','weekdayPosition','weekday','month','startDate','endType','endDate','count','mode','exceptions'];
const idValid=v=>typeof v==='string'&&!!v.trim()&&v.length<=160;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(v||{},k)).map(k=>[k,structuredClone(v[k])]));
function boardFor(state,id){const boards=(state.boards||[]).filter(b=>b.id===id);if(boards.length!==1||boards[0].archived)throw Error('This board is missing, archived or ambiguous.');return boards[0]}
const sectionGuard=board=>(board.sections||[]).map(s=>({id:s.id,archived:s.archived===true}));
export function buildScheduleCreate(state,target,task,{defaultSectionId}={},helpers){
 const board=boardFor(state,target?.boardId),empty=!(board.sections||[]).some(s=>!s.archived);
 const command={type:'schedule_create',target:structuredClone(target),task:structuredClone(task),...(empty&&!target.sectionId?{defaultSection:{id:defaultSectionId,title:'General'}}:{})};
 const expected={boardId:target.boardId,sectionId:target.sectionId??null,...(command.defaultSection?{sections:sectionGuard(board)}:{})};
 applyScheduleCreate(state,command,expected,helpers);return {command,expected};
}
export function applyScheduleCreate(state,command,expected,helpers){
 if(Object.keys(command).some(k=>!['type','target','task','defaultSection'].includes(k))||!object(command.target)||Object.keys(command.target).some(k=>!['boardId','sectionId'].includes(k))||!object(command.task)||Object.keys(command.task).some(k=>![...baseFields,...richFields].includes(k)))throw Error('Invalid Schedule creation fields.');
 let next=structuredClone(state),board=boardFor(next,command.target.boardId),target=structuredClone(command.target);
 if(expected?.boardId!==target.boardId||(expected?.sectionId??null)!==(target.sectionId??null))throw Error('The destination changed.');
 if(command.defaultSection){
  const section=command.defaultSection;
  if(target.sectionId||!object(section)||Object.keys(section).some(k=>!['id','title'].includes(k))||!idValid(section.id)||section.title!=='General'||(board.sections||[]).some(s=>!s.archived)||stableStringify(sectionGuard(board))!==stableStringify(expected.sections))throw Error('The destination sections changed. Review the board.');
  if((next.boards||[]).some(b=>(b.sections||[]).some(s=>s.id===section.id)))throw Error('The section ID already exists.');
  (board.sections??=[]).push({...section,archived:false,tasks:[]});target.sectionId=section.id;
 }
 const task=command.task,rule=task.recurrence;
 if(rule!=null&&(!object(rule)||Object.keys(rule).some(k=>!ruleFields.includes(k))||rule.enabled!==true||!validateRecurrence(rule)||!object(rule.exceptions||{})||Object.keys(rule.exceptions||{}).length))throw Error('Invalid repeat rule for a new task.');
 const created=helpers.apply(next,{type:'create_task',target,task:pick(task,baseFields)},{boardId:target.boardId,sectionId:target.sectionId});next=created.next;
 const found=helpers.resolve(next,task.id),changes=pick(task,richFields),fields=helpers.values(found.task);
 if(Object.keys(changes).length)next=helpers.apply(next,{type:'edit_task',target:{taskId:task.id},changes},{boardId:target.boardId,sectionId:target.sectionId,fields}).next;
 const saved=helpers.resolve(next,task.id);saved.task.lastScheduledMinutes=null;
 return {next,result:{type:'schedule_create',task:saved.task,board:saved.board.title,section:saved.section.title,sectionCreated:!!command.defaultSection}};
}
function targetFor(id){const value=String(id||''),index=value.lastIndexOf('::');return index<0?{taskId:value}:{taskId:value.slice(0,index),occurrenceDate:value.slice(index+2)}}
function entryFor(state,id,helpers){
 const target=targetFor(id),entry=helpers.resolve(state,target.taskId);
 if(!target.occurrenceDate){if(entry.task.recurrence?.enabled)throw Error('Choose a logical recurring occurrence.');return {...entry,target,effective:entry.task}}
 if(!validPlanningDate(target.occurrenceDate)||!entry.task.recurrence?.enabled)throw Error('Invalid logical occurrence.');
 const occurrence=generateTaskOccurrences(entry.task,target.occurrenceDate,target.occurrenceDate,{today:target.occurrenceDate})[0];
 if(!occurrence||occurrence.status!=='pending'||occurrence.mode!=='flexible')throw Error('This occurrence changed or is unavailable.');
 return {...entry,target,occurrence,effective:{...occurrence.task,id,completed:false,archived:false,date:occurrence.displayDate,startTime:occurrence.startTime,endTime:occurrence.endTime}};
}
function metadataGuard(entry){return stableStringify(Object.fromEntries(['title','notes','dueDate','priority','estimatedMinutes','lastScheduledMinutes','schedulingPreference','color'].map(k=>[k,entry.effective[k]??null])))}
function duration(to){const start=parseTime(to?.startTime),raw=parseTime(to?.endTime),end=raw===0?1440:raw;if(start===null||end===null||end<=start)throw Error('Choose a valid time range ending by midnight.');return end-start}
function validateMetadata(entry,metadata,helpers){
 if(!object(metadata)||Object.keys(metadata).some(k=>!proposalFields.includes(k)))throw Error('Invalid reviewed metadata fields.');
 // The detail validator is shared with the inspector. Occurrence identity is applied separately.
 const task={...structuredClone(entry.effective),id:'validation',recurrence:null,completed:false};
 helpers.apply({boards:[{id:'b',sections:[{id:'s',tasks:[task]}]}]},{type:'edit_task',target:{taskId:'validation'},changes:metadata},{boardId:'b',sectionId:'s',fields:helpers.values(task)});
}
function optionsValid(options){
 if(!object(options)||Object.keys(options).some(k=>!['availability','currentDate','dayChange'].includes(k))||!validPlanningDate(options.currentDate)||!object(options.availability)||Object.keys(options.availability).some(k=>!['timezone','weeklyAvailability'].includes(k))||typeof options.availability.timezone!=='string')throw Error('Invalid reviewed planning options.');
 const change=options.dayChange;
 if(change!=null&&(!object(change)||Object.keys(change).some(k=>!['currentDate','taskIds','blockedWindows'].includes(k))||change.currentDate!==options.currentDate||!Array.isArray(change.taskIds)||!Array.isArray(change.blockedWindows)))throw Error('Invalid reviewed day change.');
}
function validationMap(state,items,options,helpers){
 const map=new Map(),end=shiftPlanningDate(options.currentDate,7),logical=items.map(p=>targetFor(p.taskId).occurrenceDate).filter(Boolean),start=[options.currentDate,...logical].sort()[0];
 for(const board of state.boards||[]){if(board.archived)continue;for(const section of board.sections||[]){if(section.archived)continue;for(const task of section.tasks||[]){if(task.archived)continue;if(!task.recurrence?.enabled){map.set(String(task.id),task);continue}
  const occurrences=generateTaskOccurrencesThrough(task,end,{today:options.currentDate});
  for(const item of generateTaskOccurrences(task,start,end,{today:options.currentDate}))if(!occurrences.some(o=>o.occurrenceId===item.occurrenceId))occurrences.push(item);
  for(const o of occurrences)if(o.status==='pending')map.set(o.occurrenceId,{...o.task,id:o.occurrenceId,date:o.displayDate,startTime:o.startTime,endTime:o.endTime,estimatedMinutes:o.durationMinutes,lastScheduledMinutes:o.durationMinutes,dueDate:null,completed:false,archived:false,scheduleLocked:!!task.scheduleLocked||o.mode==='fixed'});
 }}}
 return map;
}
function reviewed(state,command,expected,{now=Date.now(),...helpers},building=false){
 if(Object.keys(command).some(k=>!['type','items','options'].includes(k))||!Array.isArray(command.items)||command.items.length<1||command.items.length>50||new Set(command.items.map(p=>p?.taskId)).size!==command.items.length)throw Error('Choose 1 to 50 distinct reviewed changes.');
 optionsValid(command.options);const options=command.options,clock=planningClock(now,options.availability.timezone),maxDate=options.dayChange?options.currentDate:shiftPlanningDate(options.currentDate,7);
 if(clock.date!==options.currentDate)throw Error('The planning day changed. Preview again.');
 const entries=[],guards=[],map=validationMap(state,command.items,options,helpers);
 for(const item of command.items){
  if(!object(item)||Object.keys(item).some(k=>!['taskId','from','to','metadata'].includes(k))||!idValid(item.taskId)||!object(item.to)||Object.keys(item.to).some(k=>!['date','startTime','endTime'].includes(k)))throw Error('Invalid reviewed schedule fields.');
  const entry=entryFor(state,item.taskId,helpers),task=entry.effective,minutes=duration(item.to),start=parseTime(task.startTime);
  if(task.completed||task.archived||task.scheduleLocked||entry.task.scheduleLocked||!['date','startTime','endTime'].every(k=>(item.from?.[k]??null)===(task[k]??null)))throw Error('The reviewed task schedule or status changed.');
  if(task.date===clock.date&&start!==null&&start<=parseTime(clock.time)&&start+taskDurationMinutes(task)>parseTime(clock.time))throw Error('A reviewed task is now underway.');
  if(options.dayChange&&(!options.dayChange.taskIds.includes(item.taskId)||task.date!==clock.date||start===null))throw Error('A selected task is no longer available.');
  validateMetadata(entry,item.metadata||{},helpers);
  if(!scheduleProposalFits(item,options.availability,minutes))throw Error('The reviewed change does not fit saved work hours.');
  const changes={...item.to,...(entry.occurrence?{durationMinutes:minutes}:{lastScheduledMinutes:minutes})},op=buildScheduleChange(state,entry.target,changes),guard={taskId:item.taskId,schedule:op.expected,metadata:metadataGuard(entry)};
  if(!building&&stableStringify(guard)!==stableStringify(expected?.items?.[guards.length]))throw Error('A reviewed task moved or its metadata changed.');
  entries.push({entry,item,op});guards.push(guard);
  map.set(item.taskId,{...map.get(item.taskId),startTime:null,endTime:null,estimatedMinutes:minutes,lastScheduledMinutes:minutes});
 }
 const valid=validateScheduleProposals(command.items,map,state.scheduleEvents||[],{minDate:clock.date,minTime:clock.time,maxDate,blockedWindows:options.dayChange?.blockedWindows||[]});
 if(valid.length!==command.items.length)throw Error('The reviewed changes conflict or depend on another move. Preview again.');
 let next=structuredClone(state);
 // All collisions/dependencies were checked against the final batch, never intermediate slots.
 for(const {entry,item,op} of entries){next=applyScheduleChange(next,op.command,op.expected).next;const found=helpers.resolve(next,entry.target.taskId);if(entry.occurrence){const updated=applyOccurrenceOverride(found.task,entry.target.occurrenceDate,item.metadata||{});found.section.tasks[found.section.tasks.indexOf(found.task)]=updated}else Object.assign(found.task,item.metadata||{})}
 return {next,result:{type:'reviewed_schedule',taskIds:command.items.map(p=>p.taskId),affectedCount:command.items.length},expected:{items:guards}};
}
export function buildReviewedSchedule(state,items,options,helpers){const command={type:'reviewed_schedule',items:items.map(p=>({...pick(p,['taskId','from','to']),...(p.metadata?{metadata:structuredClone(p.metadata)}:{})})),options:structuredClone(options)};const out=reviewed(state,command,null,helpers,true);return {command,expected:out.expected}}
export function applyReviewedSchedule(state,command,expected,helpers){return reviewed(state,command,expected,helpers)}
