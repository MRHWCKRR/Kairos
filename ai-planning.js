import {assignmentFeasibility,feasibilityAssignments,FEASIBILITY_LIMIT} from './deadline-feasibility.js';
import {assignmentReadiness} from './assignment-order.js';
import {planningTasks,planningClock,weeklyReview,deadlineSummary} from './planning-model.js';
import {planningConflicts} from './planning-slots.js';
import {previewSessions,previewCarryover} from './planning-commands.js?v=3';

export function resolveAiPlanningTimezone(userData,ownerId,storage=globalThis.localStorage) {
 const clean=value=>typeof value==='string'?value.trim().slice(0,80):'';
 let cached='';
 try{if(storage?.getItem('kairos_settings_cache_uid')===ownerId)cached=clean(JSON.parse(storage.getItem('kairos_settings_cache')||'{}').profile?.timezone)}catch{}
 const timezone=clean(userData?.settings?.profile?.timezone)||cached||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 new Intl.DateTimeFormat('en',{timeZone:timezone});
 return timezone;
}

export function aiPlanningSummary(state,{timezone='UTC',now=Date.now()}={}) {
 const today=planningClock(now,timezone).date,deadlines=deadlineSummary(state,today).filter(item=>item.dueDate),review=weeklyReview(state,today,today);
 const parents=feasibilityAssignments(state);
 const capacityAssumptions={dayStart:'07:00',dayEnd:'22:00',meaning:'Each assignment is checked separately within 31 days against current commitments; assignments may compete for the same time. Free minutes are an upper bound; fits requires a complete validated plan. Planned effort is not a completion prediction. A fits result may require reviewed rescheduling; no changes are saved.'};
 const feasibility=parents.slice(0,FEASIBILITY_LIMIT).map(task=>assignmentFeasibility(state,task.id,{...capacityAssumptions,timezone},planningClock(now,timezone)));
 const readiness=assignmentReadiness(state);return {assignmentFeasibility:feasibility.map(row=>({...row,title:row.title.slice(0,180),reason:row.reason.slice(0,400)})),assignmentFeasibilityOmitted:Math.max(0,parents.length-FEASIBILITY_LIMIT),capacityAssumptions,orderedSessionReadiness:[...readiness].slice(0,80).map(([taskId,value])=>({taskId,...value})),orderedReadinessOmitted:Math.max(0,readiness.size-80),timezone,today,deadlineCount:deadlines.length,deadlines:deadlines.slice(0,30).map(item=>({taskId:item.task.id,title:String(item.task.title||'').slice(0,180),dueDate:item.dueDate,status:item.status,scheduledAfterDeadline:item.afterDeadline})),deadlinesOmitted:Math.max(0,deadlines.length-30),week:{from:review.from,to:review.to,completed:review.completed.length,pending:review.pending.length,slipped:review.slipped.length,meaning:'Current status of work dated in this week, including recurring occurrences; not historical completion dates.'},conflicts:planningConflicts(state,review.from,review.to).length};
}

// The model supplies intent only. IDs, occupancy, and exact placements come
// from the current planner and the same commands used by Schedule > Planning.
export function previewAiPlanning(state,action,{timezone='UTC',now=Date.now()}={}) {
 const args=action.args,clock=planningClock(now,timezone),input={...args,timezone,dayStart:args.dayStart??'07:00',dayEnd:args.dayEnd??'22:00'};
 if(action.type==='plan_sessions') {
  const entries=planningTasks(state).filter(({task})=>args.taskId?task.id===args.taskId:String(task.title||'').trim().toLowerCase()===String(args.title||'').trim().toLowerCase());
  if(entries.length!==1)throw Error(entries.length?'Multiple assignments match. Choose an exact task ID.':'Assignment not found.');
  return previewSessions(state,{...input,taskId:entries[0].task.id},clock);
 }
 if(action.type==='plan_carryover') {
  const taskIds=args.taskIds??weeklyReview(state,args.week,clock.date).pending.filter(item=>!item.occurrenceDate&&!item.task.scheduleLocked).map(item=>item.task.id);
  return previewCarryover(state,{...input,taskIds},clock);
 }
 if(action.type==='plan_conflicts') {
  const selected=new Set(),pairs=planningConflicts(state,args.from,args.to);
  for(const pair of pairs) {
   if([pair.a,pair.b].some(item=>selected.has(item.taskId)))continue;
   const movable=[pair.a,pair.b].find(item=>item.kind==='task'&&!item.locked);
   if(movable)selected.add(movable.taskId);
  }
  if(!selected.size)throw Error('No movable conflicts in this range. Locked, fixed and recurring commitments must be reviewed in Schedule.');
  return {...previewCarryover(state,{...input,taskIds:[...selected]},clock),remainingConflicts:pairs.filter(pair=>![pair.a,pair.b].some(item=>selected.has(item.taskId))).length};
 }
 throw Error('Unsupported planning request.');
}
