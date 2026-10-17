import {planningTasks,planningClock,validPlanningDate} from './planning-model.js';
import {planningOccupancy,findPlanningSlot,planningAvailability,planningBlockValid,intervalsOverlap} from './planning-slots.js';
import {parseTime,taskDurationMinutes} from './schedule-utils.js';
import {zonedTaskStart} from './task-reminders.js';
import {stableStringify} from './plan-merge.js';

const allTasks=state=>(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>section.tasks||[]));
function locate(state,id){const entries=planningTasks(state).filter(entry=>entry.task.id===id);if(entries.length!==1||allTasks(state).filter(task=>task.id===id).length!==1)throw Error('A task is missing, archived, or has duplicate IDs.');return entries[0]}
function eligible(state,id){const entry=locate(state,id),task=entry.task;if(task.completed||task.recurrence?.enabled||task.scheduleLocked)throw Error('Completed, recurring, or locked tasks cannot be moved by this planner.');return entry}
const idValid=id=>typeof id==='string'&&id.length>0&&id.length<=160;
function recurrenceSnapshot(rule){if(!rule?.enabled)return null;return {...rule,exceptions:Object.fromEntries(Object.entries(rule.exceptions||{}).map(([date,value])=>[date,{status:value.status||'pending',override:Object.fromEntries(['date','startTime','endTime','durationMinutes'].filter(key=>value.override?.[key]!==undefined).map(key=>[key,value.override[key]]))}]))}}
export function planningSignature(state){return stableStringify({tasks:planningTasks(state).map(({board,section,task})=>({board:board.id,section:section.id,...Object.fromEntries(['id','date','startTime','endTime','dueDate','estimatedMinutes','lastScheduledMinutes','completed','scheduleLocked','schedulingPreference','assignmentId'].map(key=>[key,task[key]??null])),recurrence:recurrenceSnapshot(task.recurrence)})),events:(state.scheduleEvents||[]).map(event=>Object.fromEntries(['id','day','start','end','archived'].map(key=>[key,event[key]??null])))})}
const options=input=>({from:input.from,to:input.to,dayStart:input.dayStart,dayEnd:input.dayEnd,timezone:input.timezone||'UTC'});
const interval=row=>({date:row.date,startMin:parseTime(row.startTime),endMin:parseTime(row.startTime)+row.minutes});
function ensureSessionSource(state,parentId){const entry=eligible(state,parentId);if(entry.task.startTime)throw Error('This assignment is already scheduled. Unscheduled assignments can be split into work sessions.');if(allTasks(state).some(task=>task.assignmentId===parentId))throw Error('This assignment already has work sessions. Manage those tasks instead.');return entry}

export function previewSessions(state,input,clock){
 const parent=ensureSessionSource(state,input.taskId).task,total=Number(input.totalMinutes),size=Number(input.sessionMinutes),opts=options(input);planningAvailability(opts);
 if(!Number.isInteger(total)||total<15||total>2400||!Number.isInteger(size)||size<15||size>120)throw Error('Choose 15–2400 total minutes and 15–120 minutes per session.');
 const count=Math.ceil(total/size);if(count>40)throw Error('Use at most 40 work sessions in one assignment plan.');
 const labels=input.labels||[];if(!Array.isArray(labels)||labels.length&&labels.length!==count||labels.some(title=>typeof title!=='string'||!title.trim()||title.trim().length>180))throw Error(`Enter exactly ${count} session titles, or leave titles blank.`);
 const used=new Set(allTasks(state).map(task=>task.id)),busy=planningOccupancy(state,opts.from,opts.to),rows=[];
 for(let index=0;index<count;index++){
  const minutes=Math.min(size,total-index*size),taskId=input.idFactory?.()||'session-'+globalThis.crypto.randomUUID();
  if(!idValid(taskId)||used.has(taskId))throw Error('Work session IDs must be unique.');used.add(taskId);
  const placement=findPlanningSlot(minutes,{...opts,dueDate:parent.dueDate||null,preference:parent.schedulingPreference},busy,clock);
  if(!placement)throw Error('Not enough room to fit every session before the deadline. Extend availability or reduce the effort; no sessions were created.');
  const row={taskId,title:labels[index]?.trim()||String(parent.title||'Assignment').slice(0,160)+` · ${index+1}/${count}`,minutes,...placement};rows.push(row);busy.push(interval(row));
 }
 return {command:{type:'planning_batch',version:1,mode:'sessions',parentId:parent.id,totalMinutes:total,sessionMinutes:size,options:opts,rows},expected:{signature:planningSignature(state)},rows};
}

export function previewCarryover(state,input,clock){
 const ids=input.taskIds,opts=options(input);planningAvailability(opts);
 if(!Array.isArray(ids)||!ids.length||ids.length>40||new Set(ids).size!==ids.length)throw Error('Choose between 1 and 40 distinct tasks.');
 const sources=ids.map(id=>eligible(state,id)).sort((a,b)=>String(a.task.dueDate||'9999').localeCompare(String(b.task.dueDate||'9999'))),selected=new Set(ids);
 const busy=planningOccupancy(state,opts.from,opts.to).filter(item=>item.kind!=='task'||!selected.has(item.taskId)),rows=[];
 for(const {task} of sources){
  const minutes=taskDurationMinutes(task),placement=findPlanningSlot(minutes,{...opts,dueDate:task.dueDate||null,preference:task.schedulingPreference},busy,clock);
  if(!placement)throw Error(`No safe time fits before the deadline for “${String(task.title||'Task')}”. Adjust the range or availability.`);
  const row={taskId:task.id,title:String(task.title||'Task'),minutes,...placement};rows.push(row);busy.push(interval(row));
 }
 return {command:{type:'planning_batch',version:1,mode:'move',options:opts,rows},expected:{signature:planningSignature(state)},rows};
}

export function applyPlanningCommand(state,command,expected,{now=Date.now()}={}){
 if(command?.type!=='planning_batch'||command.version!==1||!['sessions','move'].includes(command.mode)||!Array.isArray(command.rows)||!command.rows.length||command.rows.length>40)throw Error('Invalid planning command.');
 if(typeof expected?.signature!=='string'||expected.signature!==planningSignature(state))throw Error('The schedule, deadline, or task status changed. Refresh this preview before applying it.');
 const opts=command.options||{};planningAvailability(opts);const clock=planningClock(now,opts.timezone||'UTC'),rows=command.rows,ids=rows.map(row=>row.taskId);
 if(ids.some(id=>!idValid(id))||new Set(ids).size!==ids.length)throw Error('Invalid or duplicate work session IDs.');
 let parent=null;
 if(command.mode==='sessions'){
  parent=ensureSessionSource(state,command.parentId).task;const {totalMinutes:total,sessionMinutes:size}=command;
  if(!Number.isInteger(total)||total<15||total>2400||!Number.isInteger(size)||size<15||size>120||rows.length!==Math.ceil(total/size)||rows.some((row,index)=>row.minutes!==Math.min(size,total-index*size)))throw Error('Invalid session effort or duration.');
  if(allTasks(state).some(task=>ids.includes(task.id)))throw Error('A session ID already exists. Retry the original operation to reconcile its save.');
 }
 const selected=new Set(command.mode==='move'?ids:[]),busy=planningOccupancy(state,opts.from,opts.to).filter(item=>item.kind!=='task'||!selected.has(item.taskId));
 for(const row of rows){
  const task=parent||eligible(state,row.taskId).task,start=parseTime(row.startTime),end=parseTime(row.endTime),available=planningAvailability({...opts,preference:task.schedulingPreference});
  if(!Number.isInteger(row.minutes)||row.minutes<1||row.minutes>=1440||start===null||end===null||(end-start+1440)%1440!==row.minutes||start%5!==0||start<available.start||start+row.minutes>available.end||!validPlanningDate(row.date)||row.date<opts.from||row.date>opts.to)throw Error('Invalid session schedule, time, or duration.');
  if(!parent&&row.minutes!==taskDurationMinutes(task))throw Error('This task duration changed. Refresh the preview.');
  if(task.dueDate&&(!validPlanningDate(task.dueDate)||row.date>task.dueDate))throw Error('This placement would miss its deadline.');
  if(row.date<clock.date||zonedTaskStart(row.date,row.startTime,opts.timezone||'UTC')<now||!planningBlockValid(row.date,start,row.minutes,opts.timezone||'UTC'))throw Error('This preview time is in the past or crosses a timezone transition. Refresh it.');
  const nextInterval=interval(row);if(busy.some(item=>intervalsOverlap(item,nextInterval)))throw Error('This proposed time conflicts with another commitment. Refresh the preview.');busy.push(nextInterval);
  if(parent&&(typeof row.title!=='string'||!row.title.trim()||row.title.trim().length>180))throw Error('Use a session title up to 180 characters.');
 }
 const next=structuredClone(state);
 if(parent){
  const destination=locate(next,parent.id).section;
  for(const [index,row] of rows.entries())destination.tasks.push({id:row.taskId,title:row.title.trim(),completed:false,archived:false,assignmentId:parent.id,sessionIndex:index+1,date:row.date,startTime:row.startTime,endTime:row.endTime,dueDate:parent.dueDate||null,estimatedMinutes:row.minutes,lastScheduledMinutes:row.minutes,priority:parent.priority||null,schedulingPreference:parent.schedulingPreference||null,scheduleLocked:false,notes:'',checklist:[]});
 }else for(const row of rows){const task=locate(next,row.taskId).task;Object.assign(task,{date:row.date,startTime:row.startTime,endTime:row.endTime,lastScheduledMinutes:row.minutes})}
 return {next,result:{type:'planning_batch',action:command.mode,taskIds:ids,completedTaskIds:[],affectedCount:rows.length}};
}
