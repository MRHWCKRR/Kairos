import {taskRemainingMinutes} from './remaining-work.js?v=5';
import {planningTasks,validPlanningDate} from './planning-model.js?v=1';
import {planningAvailability,planningOccupancy,planningBlockValid,intervalsOverlap,planningDailyWork,planningDailyLimit,addPlanningDailyWork} from './planning-slots.js?v=8';
import {previewCarryover} from './planning-commands.js?v=13';
import {freeMinutes} from './deadline-feasibility.js?v=11';
import {orderedSessionGroup,assertAssignmentOrder} from './assignment-order.js?v=4';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=5';

export function combinedPlanning(state,input,clock){
 const ids=input.assignmentIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length)throw Error('Choose between 1 and 10 distinct assignments.');
 planningAvailability(input);
 if(input.from<clock.date)throw Error('Choose today or a future date for the shared check.');
 const active=planningTasks(state).map(entry=>entry.task),all=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>section.tasks||[]));
 const groups=ids.map(id=>{
  const parent=active.find(task=>task.id===id);
  if(!parent||parent.completed||parent.assignmentId||parent.recurrence?.enabled)throw Error('Review the selected active assignments.');
  const sessions=active.filter(task=>task.assignmentId===id&&!task.completed),movable=sessions.filter(task=>!task.scheduleLocked&&!task.recurrence?.enabled);
  return {parent,sessions,movable,taskId:id,title:String(parent.title||'Assignment'),dueDate:parent.dueDate||null,priority:[parent.dueDate,...sessions.map(task=>task.dueDate)].filter(Boolean).sort()[0]||input.to,remainingMinutes:sessions.reduce((n,task)=>n+taskRemainingMinutes(task),0),sessionCount:sessions.length,lockedCount:sessions.filter(task=>task.scheduleLocked).length,status:'pending',reason:''};
 }).sort((a,b)=>a.priority.localeCompare(b.priority)||String(a.taskId).localeCompare(String(b.taskId)));
 if(groups.reduce((n,g)=>n+g.sessionCount,0)>40)throw Error('Choose at most 40 unfinished sessions in one combined plan.');
 for(const g of groups){
  try{
   if(all.filter(task=>task.id===g.taskId).length!==1||g.parent.startTime||g.sessions.some(task=>task.recurrence?.enabled||all.filter(other=>other.id===task.id).length!==1||active.some(other=>other.assignmentId===task.id)))throw Error('Review duplicate identities, recurring sessions, nested assignments, or the separately scheduled parent.');
   if([g.parent,...g.sessions].some(task=>task.dueDate&&!validPlanningDate(task.dueDate)))throw Error('Review the assignment or session deadline.');
   orderedSessionGroup(state,g.taskId);
   // This group's movable sessions will all move together. Other groups stay
   // occupied here because a later fallback may leave them unchanged.
   const ownMovable=new Set(g.movable.map(task=>task.id));
   for(const task of g.sessions.filter(task=>task.scheduleLocked)){
    if(taskRemainingMinutes(task)>taskDurationMinutes(task))throw Error('A locked session is shorter than its remaining work. Unlock it and review rescheduling.');
   const start=parseTime(task.startTime),minutes=taskDurationMinutes(task),deadline=[g.dueDate,task.dueDate].filter(Boolean).sort()[0];
    if(!validPlanningDate(task.date)||task.date<clock.date||deadline&&task.date>deadline||start===null||task.date===clock.date&&start<=parseTime(clock.time)||!planningBlockValid(task.date,start,minutes,input.timezone||'UTC')||planningOccupancy(state,task.date,task.date).some(item=>!(item.kind==='task'&&(item.taskId===task.id||ownMovable.has(item.taskId)))&&intervalsOverlap(item,{date:task.date,startMin:start,endMin:start+minutes})))throw Error('A locked session needs review: its time is past, missing, conflicting, or after its deadline.');
   }
   if(!g.sessions.length){g.status='no-work';g.reason='No unfinished active sessions.'}
   else if(!g.movable.length){assertAssignmentOrder(state,new Set([g.taskId]));g.status='fixed';g.reason='All unfinished sessions remain at their locked times.'}
  }catch(error){g.status='needs-review';g.reason=String(error.message||'Review this assignment.');}
 }
 const candidates=groups.filter(g=>g.status==='pending'),movableIds=new Set(candidates.flatMap(g=>g.movable.map(task=>task.id))),busy=planningOccupancy(state,input.from,input.to).filter(item=>item.kind!=='task'||!movableIds.has(item.taskId));
 const movableMinutes=candidates.reduce((n,g)=>n+g.movable.reduce((m,t)=>m+taskRemainingMinutes(t),0),0),availableMinutes=freeMinutes(busy,input,clock,planningDailyWork(state,input,movableIds));
 let proposal=null;const spacingCache=new Map();
 const lockedWithinBudget=(group,selected,rows)=>{
  if(!planningDailyLimit(input))return true;
  for(const task of group.sessions.filter(task=>task.scheduleLocked)){
   const work=planningDailyWork(state,{...input,from:task.date,to:task.date},selected);
   for(const row of rows)addPlanningDailyWork(work,row.date,row.minutes);
   if((work.get(task.date)||0)>planningDailyLimit(input))return false;
  }
  return true;
 };
 const attempt=selected=>{
  const proposal=previewCarryover(state,{...input,taskIds:selected.flatMap(g=>g.movable.map(task=>task.id))},clock,spacingCache),excluded=new Set(proposal.rows.map(row=>row.taskId));
  if(selected.some(g=>!lockedWithinBudget(g,excluded,proposal.rows)))throw Error('A locked session date exceeds the daily assignment-work limit.');
  return proposal;
 };
 if(candidates.length){
  try{proposal=attempt(candidates);for(const g of candidates){g.status='fits';g.reason='All movable sessions are included in the shared plan.'}}
  catch{
   // Retry whole assignments in deadline order. Every trial starts from the
   // original state, so rejected groups retain their occupied saved times.
   const accepted=[];
   for(const g of candidates){try{const trial=attempt([...accepted,g]);proposal=trial;accepted.push(g);g.status='fits';g.reason='All movable sessions are included in the partial shared plan.'}catch(error){g.status='not-placed';g.reason='Not placed by this check. '+String(error.message||'Review the range and available time.')}}
  }
 }
 const proposedIds=new Set(proposal?.rows.map(row=>row.taskId)||[]);
 for(const g of groups.filter(g=>g.status==='fixed'||g.status==='not-placed'))if(!lockedWithinBudget(g,proposedIds,proposal?.rows||[])){g.status='needs-review';g.reason='A locked session date exceeds the daily assignment-work limit.'}
 const excluded=groups.filter(g=>g.status==='needs-review'||g.status==='not-placed'),locked=groups.reduce((n,g)=>n+g.lockedCount,0),remainingMinutes=groups.reduce((n,g)=>n+g.remainingMinutes,0);
 if(proposal){
  const titles=new Map(groups.flatMap(g=>g.sessions.map(task=>[task.id,g.title])));
  for(const row of proposal.rows)row.title=titles.get(row.taskId)+' / '+row.title;
  proposal.notice=[excluded.length?'Partial plan. '+excluded.map(g=>g.title+' ('+g.sessionCount+' sessions, '+g.remainingMinutes+' minutes) stays unchanged').join('; ')+'.':'All selected movable sessions fit in this candidate plan.',locked?locked+' locked sessions stay at their current times, including any outside the placement range.':'',groups.some(g=>!g.dueDate)?'No deadline: those assignments use the range end as the placement cutoff.':'','Unselected assignments and completed sessions stay unchanged.'].filter(Boolean).join(' ');
 }
 return {assignments:groups.map(({parent,sessions,movable,priority,...result})=>result),remainingMinutes,movableMinutes,availableMinutes,shortfallMinutes:Math.max(0,movableMinutes-availableMinutes),excludedMinutes:excluded.reduce((n,g)=>n+g.remainingMinutes,0),proposal};
}
