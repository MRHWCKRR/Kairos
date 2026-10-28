import {planningAlternatives,choosePlanningAlternative,planningAlternativesText,planningHoursText,planningReportText} from './planning-alternatives.js?v=8';
import {resolvePlanningPreferences} from './planning-preferences.js?v=7';
import {planningDefaults,weeklyAvailabilityText} from './weekly-availability.js?v=3';
import {combinedPlanning} from './combined-planning.js?v=9';
import {assignmentFeasibility,feasibilityAssignments,FEASIBILITY_LIMIT} from './deadline-feasibility.js?v=11';
import {assignmentReadiness} from './assignment-order.js?v=4';
import {planningTasks,planningClock,weeklyReview,deadlineSummary} from './planning-model.js?v=1';
import {planningConflicts,planningGapText,planningDailyLimitText} from './planning-slots.js?v=8';
import {previewSessions,previewCarryover} from './planning-commands.js?v=13';

export function resolveAiPlanningTimezone(userData,ownerId,storage=globalThis.localStorage) {
 const clean=value=>typeof value==='string'?value.trim().slice(0,80):'';
 let cached='';
 try{if(storage?.getItem('kairos_settings_cache_uid')===ownerId)cached=clean(JSON.parse(storage.getItem('kairos_settings_cache')||'{}').profile?.timezone)}catch{}
 const timezone=clean(userData?.settings?.profile?.timezone)||cached||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 new Intl.DateTimeFormat('en',{timeZone:timezone});
 return timezone;
}

export function aiPlanningSummary(state,{timezone='UTC',now=Date.now(),weeklyAvailability=null,planningPreferences={}}={}) {
 const today=planningClock(now,timezone).date,deadlines=deadlineSummary(state,today).filter(item=>item.dueDate),review=weeklyReview(state,today,today);
 const parents=feasibilityAssignments(state);
 const capacityAssumptions={...planningDefaults(weeklyAvailability),...resolvePlanningPreferences(planningPreferences),meaning:'Each assignment is checked separately within 31 days against current commitments; assignments may compete for the same time. Free minutes are an upper bound; fits requires a complete validated plan. Planned effort is not a completion prediction. A fits result may require reviewed rescheduling; no changes are saved. For shared capacity across selected assignments, use plan_assignments with checkOnly:true; never add separate fits results.'};
 const spacingCache=new Map();const feasibility=parents.slice(0,FEASIBILITY_LIMIT).map(task=>assignmentFeasibility(state,task.id,{...capacityAssumptions,timezone},planningClock(now,timezone),spacingCache));
 const readiness=assignmentReadiness(state);return {assignmentFeasibility:feasibility.map(row=>({...row,title:row.title.slice(0,180),reason:row.reason.slice(0,400)})),assignmentFeasibilityOmitted:Math.max(0,parents.length-FEASIBILITY_LIMIT),capacityAssumptions,orderedSessionReadiness:[...readiness].slice(0,80).map(([taskId,value])=>({taskId,...value})),orderedReadinessOmitted:Math.max(0,readiness.size-80),timezone,today,deadlineCount:deadlines.length,deadlines:deadlines.slice(0,30).map(item=>({taskId:item.task.id,title:String(item.task.title||'').slice(0,180),dueDate:item.dueDate,status:item.status,scheduledAfterDeadline:item.afterDeadline})),deadlinesOmitted:Math.max(0,deadlines.length-30),week:{from:review.from,to:review.to,completed:review.completed.length,pending:review.pending.length,slipped:review.slipped.length,meaning:'Current status of work dated in this week, including recurring occurrences; not historical completion dates.'},conflicts:planningConflicts(state,review.from,review.to).length};
}

// The model supplies intent only. IDs, occupancy, and exact placements come
// from the current planner and the same commands used by Schedule > Planning.
export function previewAiPlanning(state,action,{timezone='UTC',now=Date.now(),weeklyAvailability=null,planningPreferences={}}={}) {
 const args=action.args,clock=planningClock(now,timezone),input={...args,...planningDefaults(weeklyAvailability,args),...resolvePlanningPreferences(planningPreferences,args),timezone};
 if(action.type==='plan_assignments') {
  if(args.compareAlternatives){const report=planningAlternatives(state,input,clock,{focusAssignmentIds:args.focusAssignmentIds||[]});return {command:null,rows:[],options:input,notice:planningAlternativesText(report)}}
  const choice=args.alternative?choosePlanningAlternative(state,input,clock,args.alternative,{focusAssignmentIds:args.focusAssignmentIds||[]}):null,r=choice?choice.result:combinedPlanning(state,input,clock),usedInput=choice?.input||input,capacity={remainingMinutes:r.remainingMinutes,movableMinutes:r.movableMinutes,availableMinutes:r.availableMinutes,shortfallMinutes:r.shortfallMinutes,assignments:r.assignments.map(a=>({...a,title:a.title.slice(0,180),reason:a.reason.slice(0,400)}))};
  const totals='Shared capacity: '+capacity.remainingMinutes+' minutes remaining; up to '+capacity.availableMinutes+' free minutes for '+capacity.movableMinutes+' movable minutes in eligible assignments.'+(capacity.shortfallMinutes?' At least '+capacity.shortfallMinutes+' minutes short.':'')+' Free time is an upper bound before deadlines, preferences, fragmented gaps, spacing, and timezone transitions.';
  if(args.checkOnly||!r.proposal||r.assignments.some(a=>a.status==='no-work')){
   const labels={fits:'Fits in the candidate shared plan',fixed:'Locked sessions stay fixed','not-placed':'Not placed by this check','needs-review':'Needs review',unchanged:'Stays unchanged','no-work':'No unfinished sessions'};
   return {command:null,rows:[],options:usedInput,capacity,notice:totals+' '+input.from+' through '+input.to+' in '+timezone+'. '+(choice?choice.title+'. '+choice.changes+' ':'')+planningHoursText(usedInput)+'. '+capacity.assignments.map(a=>planningReportText(a.title,180)+': '+labels[a.status]+' ('+a.remainingMinutes+' minutes). '+planningReportText(a.reason)).join(' ')+' '+planningDailyLimitText(usedInput)+' '+planningGapText(usedInput)+' Assignments without deadlines use the range end. Not placed is not proof that no arrangement can fit. Nothing changed. To schedule work, request a reviewed plan. For missing sessions, create or review them in Planning first. For unplaced work, adjust the work hours or date range.'};
  }
  return {...r.proposal,capacity,notice:totals+' '+r.proposal.notice};
 }
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
