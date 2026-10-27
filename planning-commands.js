import {taskRemainingMinutes} from './remaining-work.js?v=4';
import {capturePlanningUndo} from './planning-undo.js?v=6';
import {normaliseWeeklyAvailability} from './weekly-availability.js?v=2';
import {planningTasks,planningClock,validPlanningDate} from './planning-model.js?v=1';
import {findPlanningSlot,planningAvailability,planningWindows,planningBlockValid,planningPlacementOccupancy,planningIntervalsConflict,planningDailyWork,planningDailyRemaining,addPlanningDailyWork,planningDailyLimitText} from './planning-slots.js?v=7';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=4';
import {zonedTaskStart} from './task-reminders.js?v=5';
import {stableStringify} from './plan-merge.js?v=1';
import {orderedSessionGroup,orderedPlacementClock,clockAfterSession,expandOrderedTaskIds,assertAssignmentOrder,validateAssignmentOrderChanges} from './assignment-order.js?v=3';

const allTasks=state=>(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>section.tasks||[]));
function locate(state,id){const entries=planningTasks(state).filter(entry=>entry.task.id===id);if(entries.length!==1||allTasks(state).filter(task=>task.id===id).length!==1)throw Error('A task is missing, archived, or has duplicate IDs.');return entries[0]}
function eligible(state,id){const entry=locate(state,id),task=entry.task;if(task.completed||task.recurrence?.enabled||task.scheduleLocked)throw Error('Completed, recurring, or locked tasks cannot be moved by this planner.');return entry}
const idValid=id=>typeof id==='string'&&id.length>0&&id.length<=160;
function recurrenceSnapshot(rule){if(!rule?.enabled)return null;return {...rule,exceptions:Object.fromEntries(Object.entries(rule.exceptions||{}).map(([date,value])=>[date,{status:value.status||'pending',override:Object.fromEntries(['date','startTime','endTime','durationMinutes'].filter(key=>value.override?.[key]!==undefined).map(key=>[key,value.override[key]]))}]))}}
export function planningSignature(state){return stableStringify({tasks:planningTasks(state).map(({board,section,task})=>({board:board.id,section:section.id,...Object.fromEntries(['id','date','startTime','endTime','dueDate','estimatedMinutes','remainingMinutes','lastScheduledMinutes','completed','scheduleLocked','schedulingPreference','assignmentId','sessionIndex','sessionOrder'].map(key=>[key,task[key]??null])),recurrence:recurrenceSnapshot(task.recurrence)})),events:(state.scheduleEvents||[]).map(event=>Object.fromEntries(['id','day','date','start','end','archived','transparent','allDay','exceptions'].map(key=>[key,event[key]??null])))})}
const options=input=>({...(input.dailyLimitMinutes!==undefined?{dailyLimitMinutes:input.dailyLimitMinutes}:{}),from:input.from,to:input.to,...(input.dayStart!==undefined?{dayStart:input.dayStart}:{}),...(input.dayEnd!==undefined?{dayEnd:input.dayEnd}:{}),timezone:input.timezone||'UTC',...(input.gapMinutes!==undefined?{gapMinutes:input.gapMinutes}:{}),...(input.weeklyAvailability!=null?{weeklyAvailability:normaliseWeeklyAvailability(input.weeklyAvailability)}:{}),...(input.availabilitySource?{availabilitySource:input.availabilitySource}:{})});
const interval=row=>({date:row.date,startMin:parseTime(row.startTime),endMin:parseTime(row.startTime)+row.minutes});
function effectiveDeadline(state,task){
 const parent=task.assignmentId?planningTasks(state).find(entry=>entry.task.id===task.assignmentId)?.task:null;
 const dates=[task.dueDate,parent?.dueDate].filter(Boolean);if(dates.some(date=>!validPlanningDate(date)))throw Error('Review the task or assignment deadline.');
 return dates.sort()[0]||null;
}
function ensureSessionSource(state,parentId){const entry=eligible(state,parentId);if(entry.task.startTime)throw Error('This assignment is already scheduled. Unscheduled assignments can be split into work sessions.');if(allTasks(state).some(task=>task.assignmentId===parentId))throw Error('This assignment already has work sessions. Manage those tasks instead.');return entry}

export function previewSessions(state,input,clock,spacingCache=new Map()){
 if(input.ordered!==undefined&&typeof input.ordered!=='boolean')throw Error('Choose a valid session ordering setting.');
 let placementClock=clock;
 const parent=ensureSessionSource(state,input.taskId).task,total=Number(input.totalMinutes),size=Number(input.sessionMinutes),opts=options(input);planningAvailability(opts);
 if(!Number.isInteger(total)||total<15||total>2400||!Number.isInteger(size)||size<15||size>120)throw Error('Choose 15–2400 total minutes and 15–120 minutes per session.');
 const count=Math.ceil(total/size);if(count>40)throw Error('Use at most 40 work sessions in one assignment plan.');
 const labels=input.labels||[];if(!Array.isArray(labels)||labels.length&&labels.length!==count||labels.some(title=>typeof title!=='string'||!title.trim()||title.trim().length>180))throw Error(`Enter exactly ${count} session titles, or leave titles blank.`);
 const used=new Set(allTasks(state).map(task=>task.id)),busy=planningPlacementOccupancy(state,opts),dailyWork=planningDailyWork(state,opts),rows=[];
 for(let index=0;index<count;index++){
  const minutes=Math.min(size,total-index*size),taskId=input.idFactory?.()||'session-'+globalThis.crypto.randomUUID();
  if(!idValid(taskId)||used.has(taskId))throw Error('Work session IDs must be unique.');used.add(taskId);
  const placement=findPlanningSlot(minutes,{...opts,dailyWork,dueDate:parent.dueDate||null,preference:parent.schedulingPreference},busy,placementClock,spacingCache);
  if(!placement)throw Error('Not enough room to fit every session before the deadline'+(opts.gapMinutes?' with '+opts.gapMinutes+'-minute gaps':'')+'. '+planningDailyLimitText(opts)+' Extend availability or reduce the effort; no sessions were created.');
  const row={taskId,title:labels[index]?.trim()||String(parent.title||'Assignment').slice(0,160)+` · ${index+1}/${count}`,minutes,...placement};rows.push(row);busy.push(interval(row));addPlanningDailyWork(dailyWork,row.date,minutes);
  if(input.ordered)placementClock=clockAfterSession(row,clock);
 }
 return {command:{type:'planning_batch',version:1,mode:'sessions',parentId:parent.id,totalMinutes:total,sessionMinutes:size,ordered:input.ordered===true,options:opts,rows},expected:{signature:planningSignature(state)},rows};
}

export function previewCarryover(state,input,clock,spacingCache=new Map()){
 const requested=input.taskIds,opts=options(input);planningAvailability(opts);
 if(!Array.isArray(requested)||!requested.length||requested.length>40||new Set(requested).size!==requested.length)throw Error('Choose between 1 and 40 distinct tasks.');
 requested.forEach(id=>eligible(state,id));const ids=expandOrderedTaskIds(state,requested);if(ids.length>40)throw Error('This order requires more than 40 tasks. Review the assignment in a smaller plan.');
 const sources=ids.map(id=>eligible(state,id)).sort((a,b)=>String(effectiveDeadline(state,a.task)||'9999').localeCompare(String(effectiveDeadline(state,b.task)||'9999'))),selected=new Set(ids),working=structuredClone(state);
 const busy=planningPlacementOccupancy(state,opts).filter(item=>item.kind!=='task'||!selected.has(item.taskId)),rows=[],dailyWork=planningDailyWork(state,opts,selected);
 while(sources.length){
  const ready=sources.findIndex(({task})=>{const group=task.assignmentId?orderedSessionGroup(working,task.assignmentId):null;return !group||!group.sessions.some(prior=>!prior.completed&&prior.sessionIndex<task.sessionIndex&&sources.some(entry=>entry.task.id===prior.id))});
  if(ready<0)throw Error('Review the prerequisite session order.');const {task}=sources.splice(ready,1)[0];
  const minutes=taskRemainingMinutes(task),placement=findPlanningSlot(minutes,{...opts,dailyWork,assignmentWork:!!task.assignmentId,dueDate:effectiveDeadline(state,task),preference:task.schedulingPreference},busy,orderedPlacementClock(working,task,clock),spacingCache);
  if(!placement)throw Error(`No safe time fits before the deadline for “${String(task.title||'Task')}”. Adjust the range or availability. ${planningDailyLimitText(opts)}${opts.gapMinutes?' This check includes '+opts.gapMinutes+'-minute gaps.':''}`);
  const row={taskId:task.id,title:String(task.title||'Task'),minutes,...placement};rows.push(row);busy.push(interval(row));if(task.assignmentId)addPlanningDailyWork(dailyWork,row.date,minutes);
  Object.assign(locate(working,task.id).task,placement);
 }
 assertAssignmentOrder(working,new Set(rows.map(row=>locate(working,row.taskId).task.assignmentId).filter(Boolean)));
 return {command:{type:'planning_batch',version:1,mode:'move',options:opts,rows},expected:{signature:planningSignature(state)},rows,notice:ids.length>requested.length?'Includes '+(ids.length-requested.length)+' later sessions to preserve assignment order.':''};
}

function revisionSources(state,parentId){
 const parent=eligible(state,parentId).task;
 if(parent.assignmentId)throw Error('Choose the parent assignment.');
 const sessions=planningTasks(state).map(entry=>entry.task).filter(task=>task.assignmentId===parentId);
 const pending=sessions.filter(task=>!task.completed).sort((a,b)=>(a.sessionIndex||0)-(b.sessionIndex||0)||String(a.id).localeCompare(String(b.id)));
 for(const task of pending)eligible(state,task.id);
 return {parent,pending,completed:sessions.filter(task=>task.completed)};
}
export function previewSessionRevision(state,input,clock,spacingCache=new Map()){
 if(!['number','string'].includes(typeof input.remainingMinutes)||typeof input.remainingMinutes==='string'&&!input.remainingMinutes.trim())throw Error('Enter remaining effort, including 0 only when you intend to archive unfinished sessions.');
 const {parent,pending,completed}=revisionSources(state,input.taskId),total=Number(input.remainingMinutes),size=Number(input.sessionMinutes),opts=options(input);planningAvailability(opts);
 if(input.ordered!==undefined&&typeof input.ordered!=='boolean')throw Error('Choose a valid session ordering setting.');
 const ordered=input.ordered??(parent.sessionOrder==='sequential');let placementClock=clock;
 if(!Number.isInteger(total)||total<0||total>2400||!Number.isInteger(size)||size<15||size>120)throw Error('Choose 0-2400 remaining minutes and 15-120 minutes per session.');
 const count=Math.ceil(total/size);if(count+completed.length>40)throw Error('Keep at most 40 active sessions in one assignment plan.');
 if(!count&&!pending.length)throw Error('There are no unfinished sessions to change.');
 const selected=new Set(pending.map(task=>task.id)),busy=planningPlacementOccupancy(state,opts).filter(item=>item.kind!=='task'||!selected.has(item.taskId)),used=new Set(allTasks(state).map(task=>task.id)),rows=[],dailyWork=planningDailyWork(state,opts,selected);
 for(let index=0;index<count;index++){
  const existing=pending[index],minutes=Math.min(size,total-index*size),taskId=existing?.id||input.idFactory?.()||'session-'+globalThis.crypto.randomUUID();
  if(!idValid(taskId)||!existing&&used.has(taskId))throw Error('Work session IDs must be unique.');used.add(taskId);
  const dueDate=[parent.dueDate,existing?.dueDate].filter(Boolean).sort()[0]||null;
  const placement=findPlanningSlot(minutes,{...opts,dailyWork,dueDate,preference:existing?.schedulingPreference||parent.schedulingPreference},busy,placementClock,spacingCache);
  if(!placement)throw Error('Not enough room to fit the remaining effort before its deadlines. '+planningDailyLimitText(opts)+' No sessions were changed.');
  const row={taskId,title:existing?.title||String(parent.title||'Assignment').slice(0,160)+' · New session '+(index+1),minutes,...placement};rows.push(row);busy.push(interval(row));addPlanningDailyWork(dailyWork,row.date,minutes);
  if(ordered)placementClock=clockAfterSession(row,clock);
 }
 return {command:{type:'planning_batch',version:1,mode:'revise-sessions',parentId:parent.id,totalMinutes:total,sessionMinutes:size,ordered,options:opts,rows,archiveIds:pending.slice(count).map(task=>task.id)},expected:{signature:planningSignature(state)},rows};
}

export function applyPlanningCommand(state,command,expected,{now=Date.now()}={}){
 if(command?.ordered!==undefined&&typeof command.ordered!=='boolean')throw Error('Invalid session ordering setting.');
 const revising=command?.mode==='revise-sessions';
 if(command?.type!=='planning_batch'||command.version!==1||!['sessions','move','revise-sessions'].includes(command.mode)||!Array.isArray(command.rows)||!command.rows.length&&!(revising&&command.archiveIds?.length)||command.rows.length>40)throw Error('Invalid planning command.');
 if(typeof expected?.signature!=='string'||expected.signature!==planningSignature(state))throw Error('The schedule, deadline, or task status changed. Refresh this preview before applying it.');
 const opts=command.options||{};planningAvailability(opts);const clock=planningClock(now,opts.timezone||'UTC'),rows=command.rows,ids=rows.map(row=>row.taskId),spacingCache=new Map();
 if(ids.some(id=>!idValid(id))||new Set(ids).size!==ids.length)throw Error('Invalid or duplicate work session IDs.');
 let parent=null;
 let archiveIds=[],existingIds=new Set();
 if(revising){
  const source=revisionSources(state,command.parentId);parent=source.parent;
  const total=command.totalMinutes,size=command.sessionMinutes;archiveIds=command.archiveIds;
  if(!Number.isInteger(total)||total<0||total>2400||!Number.isInteger(size)||size<15||size>120||rows.length!==Math.ceil(total/size)||rows.length+source.completed.length>40||rows.some((row,index)=>row.minutes!==Math.min(size,total-index*size))||!Array.isArray(archiveIds)||archiveIds.length>40||new Set(archiveIds).size!==archiveIds.length)throw Error('Invalid session revision.');
  existingIds=new Set(source.pending.map(task=>task.id));
  if(archiveIds.some(id=>!existingIds.has(id)||ids.includes(id))||[...existingIds].some(id=>!ids.includes(id)&&!archiveIds.includes(id))||ids.some(id=>!existingIds.has(id)&&allTasks(state).some(task=>task.id===id)))throw Error('Invalid session targets. Only this assignment’s unfinished sessions may change.');
 }
 if(command.mode==='sessions'){
  parent=ensureSessionSource(state,command.parentId).task;const {totalMinutes:total,sessionMinutes:size}=command;
  if(!Number.isInteger(total)||total<15||total>2400||!Number.isInteger(size)||size<15||size>120||rows.length!==Math.ceil(total/size)||rows.some((row,index)=>row.minutes!==Math.min(size,total-index*size)))throw Error('Invalid session effort or duration.');
  if(allTasks(state).some(task=>ids.includes(task.id)))throw Error('A session ID already exists. Retry the original operation to reconcile its save.');
 }
 const selected=new Set(revising?[...existingIds]:command.mode==='move'?ids:[]),busy=planningPlacementOccupancy(state,opts).filter(item=>item.kind!=='task'||!selected.has(item.taskId)),dailyWork=planningDailyWork(state,opts,selected);
 for(const row of rows){
  const task=revising&&existingIds.has(row.taskId)?eligible(state,row.taskId).task:parent||eligible(state,row.taskId).task,start=parseTime(row.startTime),end=parseTime(row.endTime),windows=planningWindows({...opts,preference:task.schedulingPreference||parent?.schedulingPreference},row.date);
  if(!Number.isInteger(row.minutes)||row.minutes<1||row.minutes>=1440||start===null||end===null||(end-start+1440)%1440!==row.minutes||start%5!==0||!windows.some(window=>start>=window.start&&start+row.minutes<=window.end)||!validPlanningDate(row.date)||row.date<opts.from||row.date>opts.to)throw Error('Invalid session schedule, time, or duration.');
  if(!parent&&row.minutes!==taskRemainingMinutes(task))throw Error('This task duration changed. Refresh the preview.');
  if(task.dueDate&&(!validPlanningDate(task.dueDate)||row.date>task.dueDate))throw Error('This placement would miss its deadline.');
  const deadline=effectiveDeadline(state,task);if(deadline&&row.date>deadline)throw Error('This placement would miss the task or assignment deadline.');
  if(parent?.dueDate&&(!validPlanningDate(parent.dueDate)||row.date>parent.dueDate))throw Error('This placement would miss the assignment deadline.');
  if(row.date<clock.date||zonedTaskStart(row.date,row.startTime,opts.timezone||'UTC')<now||!planningBlockValid(row.date,start,row.minutes,opts.timezone||'UTC'))throw Error('This preview time is in the past or crosses a timezone transition. Refresh it.');
  if(parent||task.assignmentId){if(row.minutes>planningDailyRemaining(dailyWork,row.date,opts))throw Error('This placement exceeds the daily assignment-work limit. Review a new preview.');addPlanningDailyWork(dailyWork,row.date,row.minutes)}
  const nextInterval=interval(row);if(busy.some(item=>planningIntervalsConflict(item,nextInterval,opts,spacingCache)))throw Error('This proposed time conflicts with another commitment. Refresh the preview.');busy.push(nextInterval);
  if(parent&&(typeof row.title!=='string'||!row.title.trim()||row.title.trim().length>180))throw Error('Use a session title up to 180 characters.');
 }
 const next=structuredClone(state);
 if(parent){
  const destination=locate(next,parent.id).section;
  if(command.ordered!==undefined&&(command.ordered||parent.sessionOrder!==undefined))locate(next,parent.id).task.sessionOrder=command.ordered?'sequential':'independent';
  let sequence=Math.max(0,...allTasks(state).filter(task=>task.assignmentId===parent.id).map(task=>Number(task.sessionIndex)||0));
  for(const row of rows){
   if(revising&&existingIds.has(row.taskId)){Object.assign(locate(next,row.taskId).task,{date:row.date,startTime:row.startTime,endTime:row.endTime,estimatedMinutes:row.minutes,lastScheduledMinutes:row.minutes,...(locate(next,row.taskId).task.remainingMinutes!==undefined?{remainingMinutes:row.minutes}:{})});continue}
   destination.tasks.push({id:row.taskId,title:row.title.trim(),completed:false,archived:false,assignmentId:parent.id,sessionIndex:++sequence,date:row.date,startTime:row.startTime,endTime:row.endTime,dueDate:parent.dueDate||null,estimatedMinutes:row.minutes,lastScheduledMinutes:row.minutes,priority:parent.priority||null,schedulingPreference:parent.schedulingPreference||null,scheduleLocked:false,notes:'',checklist:[]});
  }
  for(const id of archiveIds)locate(next,id).task.archived=true;
 }else for(const row of rows){const task=locate(next,row.taskId).task;Object.assign(task,{date:row.date,startTime:row.startTime,endTime:row.endTime,lastScheduledMinutes:row.minutes})}
 validateAssignmentOrderChanges(state,next);
 const planningUndo=capturePlanningUndo(state,next,command);
 return {next,result:{type:'planning_batch',action:command.mode,taskIds:[...ids,...archiveIds],completedTaskIds:[],affectedCount:rows.length+archiveIds.length,...(planningUndo?{planningUndo}:{planningUndoUnavailable:true})}};
}
