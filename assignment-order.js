import {planningTasks,validPlanningDate} from './planning-model.js?v=1';
import {parseTime,taskDurationMinutes} from './schedule-utils.js';

const active=state=>planningTasks(state).map(entry=>entry.task);
const ordered=task=>task?.sessionOrder==='sequential';
export function orderedSessionGroup(state,parentId){
 const tasks=active(state),parents=tasks.filter(task=>task.id===parentId);if(!parents.some(ordered))return null;
 const sessions=tasks.filter(task=>task.assignmentId===parentId).sort((a,b)=>a.sessionIndex-b.sessionIndex);
 const all=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>section.tasks||[])),ids=new Set(),indexes=new Set();
 if(parents.length!==1||parents[0].assignmentId||parents[0].recurrence?.enabled)throw Error('Review the assignment session order: the parent is ambiguous or recurring.');
 for(const task of sessions){
  if(!Number.isSafeInteger(task.sessionIndex)||task.sessionIndex<1||indexes.has(task.sessionIndex)||ids.has(task.id)||all.filter(item=>item.id===task.id).length!==1||task.recurrence?.enabled)throw Error('Review session order: use unique positive session numbers and ordinary tasks.');
  ids.add(task.id);indexes.add(task.sessionIndex);
 }
 return {parent:parents[0],sessions};
}
export function assignmentReadiness(state){
 const tasks=active(state),result=new Map();
 for(const parent of tasks.filter(ordered)){
  let group;try{group=orderedSessionGroup(state,parent.id)}catch{for(const task of tasks.filter(task=>task.assignmentId===parent.id))result.set(task.id,{state:'review'});continue}
  let needsReschedule=false;try{assertAssignmentOrder(state,new Set([parent.id]))}catch{needsReschedule=true}
  let waiting=null;for(const task of group.sessions){result.set(task.id,{state:task.completed?'completed':waiting?'waiting':'ready',needsReschedule,...(waiting?{waitingFor:waiting.id,waitingTitle:String(waiting.title||'Earlier session')}:{} )});if(!task.completed&&!waiting)waiting=task}
 }
 return result;
}
// Wall-clock values compare sessions within the same profile timezone. Slot
// generation separately rejects DST gaps and elapsed-duration transitions.
function wallStart(task){const start=parseTime(task?.startTime);return validPlanningDate(task?.date)&&start!==null?Date.parse(task.date+'T00:00:00Z')+start*60000:null}
function wallEnd(task){const start=wallStart(task);return start===null?null:start+taskDurationMinutes(task)*60000}
export function clockAfterSession(task,clock){
 const end=wallEnd(task);if(end===null)throw Error('Schedule the prerequisite session first, or reschedule the whole assignment.');
 const current=Date.parse(clock.date+'T'+clock.time+':00Z');
 // findPlanningSlot adds one minute before rounding; allow exact adjacency.
 const lower=Math.max(current,end-60000),iso=new Date(lower).toISOString();return {date:iso.slice(0,10),time:iso.slice(11,16)};
}
export function orderedPlacementClock(state,task,clock){
 const group=task.assignmentId?orderedSessionGroup(state,task.assignmentId):null;if(!group)return clock;
 const preceding=group.sessions.filter(item=>!item.completed&&item.sessionIndex<task.sessionIndex).at(-1);return preceding?clockAfterSession(preceding,clock):clock;
}
export function expandOrderedTaskIds(state,ids){
 const result=new Set(ids),tasks=active(state);
 for(const id of ids){const task=tasks.find(item=>item.id===id),group=task?.assignmentId?orderedSessionGroup(state,task.assignmentId):null;if(group)for(const later of group.sessions)if(later.sessionIndex>task.sessionIndex&&!later.completed&&!later.scheduleLocked)result.add(later.id)}
 return [...result];
}
export function assertAssignmentOrder(state,parentIds=null){
 for(const parent of active(state).filter(task=>ordered(task)&&(!parentIds||parentIds.has(task.id)))){
  const group=orderedSessionGroup(state,parent.id);let previous=null;
  for(const task of group.sessions){if(task.completed)continue;const start=wallStart(task);if(previous&&start!==null&&(wallEnd(previous)===null||start<wallEnd(previous)))throw Error('Session order would be broken for "'+String(parent.title||'Assignment')+'". Review the prerequisite and later sessions in Planning.');previous=task}
 }
}
export function validateAssignmentOrderChanges(before,after){
 const old=new Map(active(before).map(task=>[task.id,task])),affected=new Set(),fields=['date','startTime','endTime','assignmentId','sessionIndex'];
 for(const task of active(after)){
  const prior=old.get(task.id);
  if(task.sessionOrder!==prior?.sessionOrder)affected.add(task.id);
  if(task.assignmentId&&(!prior||fields.some(key=>task[key]!==prior[key])||taskDurationMinutes(task)!==taskDurationMinutes(prior))){affected.add(task.assignmentId);if(prior?.assignmentId)affected.add(prior.assignmentId)}
 }
 assertAssignmentOrder(after,affected);
}
