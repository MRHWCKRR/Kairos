import {assertAssignmentOrder} from './assignment-order.js';
import {planningTasks,validPlanningDate,shiftPlanningDate} from './planning-model.js';
import {planningAvailability,planningWindows,planningOccupancy,planningBlockValid,intervalsOverlap} from './planning-slots.js?v=1';
import {previewCarryover} from './planning-commands.js?v=4';
import {parseTime,taskDurationMinutes} from './schedule-utils.js';

// Capacity is an upper bound: gaps may be too short, restricted by preferences,
// or invalid across DST. Only a complete validated preview earns "fits".
function freeMinutes(busy,options,clock){
 planningAvailability(options);let total=0;
 for(let date=options.from;date<=options.to;date=shiftPlanningDate(date,1)){
  for(const available of planningWindows(options,date)){
  let cursor=Math.ceil(Math.max(available.start,date===clock.date?parseTime(clock.time)+1:0)/5)*5;
  const intervals=busy.filter(item=>item.date===date).sort((a,b)=>a.startMin-b.startMin);
  for(const item of intervals){if(item.endMin<=cursor||item.startMin>=available.end)continue;total+=Math.max(0,Math.min(item.startMin,available.end)-cursor);cursor=Math.max(cursor,item.endMin);cursor=Math.ceil(cursor/5)*5;if(cursor>=available.end)break}
  total+=Math.max(0,available.end-cursor);
  }
 }
 return total;
}
export function assignmentFeasibility(state,parentId,input,clock){
 const tasks=planningTasks(state).map(entry=>entry.task),parents=tasks.filter(task=>task.id===parentId),parent=parents[0],sessions=tasks.filter(task=>task.assignmentId===parentId&&!task.completed);
 const movable=sessions.filter(task=>!task.scheduleLocked&&!task.recurrence?.enabled),remainingMinutes=sessions.reduce((sum,task)=>sum+taskDurationMinutes(task),0),movableMinutes=movable.reduce((sum,task)=>sum+taskDurationMinutes(task),0);
 const result={taskId:parentId,title:String(parent?.title||'Assignment'),dueDate:parent?.dueDate||null,remainingMinutes,movableMinutes,availableMinutes:null,shortfallMinutes:0,canPreview:false};
 const finish=(status,reason,extra={})=>({...result,status,reason,...extra});
 if(parents.length!==1||parent.assignmentId||parent.recurrence?.enabled||parent.completed)return finish('needs-review','Review the active parent assignment.');
 if(!sessions.length)return finish('no-work','No unfinished active sessions. This does not complete the assignment.');
 if(!parent.dueDate)return finish('no-deadline','Set an assignment deadline to check capacity.');
 if(!validPlanningDate(parent.dueDate))return finish('needs-review','Review the assignment deadline.');
 if(parent.dueDate<clock.date)return finish('overdue','The deadline has passed. Review it before planning future work.');
 if(parent.dueDate>shiftPlanningDate(clock.date,30))return finish('outside-range','Capacity checks cover deadlines within the next 31 days.');
 const options={from:clock.date,to:parent.dueDate,dayStart:input.dayStart||'07:00',dayEnd:input.dayEnd||'22:00',timezone:input.timezone||'UTC',...(input.availabilitySource?{availabilitySource:input.availabilitySource}:{}),...(input.weeklyAvailability!=null?{weeklyAvailability:input.weeklyAvailability}:{})};
 try{
  const all=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>section.tasks||[]));
  if(sessions.length>40||parent.startTime||all.filter(task=>task.id===parentId).length!==1||sessions.some(task=>task.recurrence?.enabled||all.filter(other=>other.id===task.id).length!==1))return finish('needs-review','Review session identities, recurring work, or the separately scheduled parent. Capacity checks support at most 40 sessions.');
  planningAvailability(options);
  const ids=new Set(movable.map(task=>task.id)),busy=planningOccupancy(state,options.from,options.to).filter(item=>item.kind!=='task'||!ids.has(item.taskId));
  result.availableMinutes=freeMinutes(busy,options,clock);
  // Locked work stays fixed. It must itself be a safe future placement before
  // free time for movable work can support an assurance about the whole plan.
  for(const task of sessions){
   if(task.dueDate&&!validPlanningDate(task.dueDate))return finish('needs-review','Review a session deadline.');
   if(!task.scheduleLocked)continue;
   const start=parseTime(task.startTime),minutes=taskDurationMinutes(task),deadline=[parent.dueDate,task.dueDate].filter(Boolean).sort()[0];
   if(!validPlanningDate(task.date)||task.date<clock.date||task.date>deadline||start===null||task.date===clock.date&&start<=parseTime(clock.time)||!planningBlockValid(task.date,start,minutes,options.timezone)||busy.some(item=>!(item.kind==='task'&&item.taskId===task.id)&&intervalsOverlap(item,{date:task.date,startMin:start,endMin:start+minutes})))return finish('needs-review','A locked session needs review: its saved time is past, missing, conflicting, or after its deadline.');
  }
  result.shortfallMinutes=Math.max(0,movableMinutes-result.availableMinutes);
  if(result.shortfallMinutes)return finish('shortfall','There is not enough free time for the movable session effort.');
  if(!movable.length){
   // Run the ordering guard even when nothing is movable.
   assertAssignmentOrder(state,new Set([parentId]));
   return finish('fits','All unfinished sessions have safe locked placements.');
  }
  previewCarryover(state,{...options,taskIds:movable.map(task=>task.id)},clock);
  return finish('fits','A complete session plan fits before the deadline.',{canPreview:true});
 }catch(error){return finish('needs-review',String(error?.message||'Review the sessions and available time.'))}
}


export const FEASIBILITY_LIMIT=10;
export function feasibilityAssignments(state){
 const tasks=planningTasks(state).map(entry=>entry.task),parents=new Set(tasks.filter(task=>task.assignmentId).map(task=>task.assignmentId));
 return tasks.filter(task=>parents.has(task.id)&&!task.completed&&!task.assignmentId&&!task.recurrence?.enabled).sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));
}
