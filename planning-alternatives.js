import {combinedPlanning} from './combined-planning.js?v=7';
import {applyPlanningCommand} from './planning-commands.js?v=11';
import {planningGapMinutes,planningDailyLimit,planningGapText,planningDailyLimitText} from './planning-slots.js?v=6';
import {normaliseWeeklyAvailability,weeklyAvailabilityText} from './weekly-availability.js?v=1';
import {parseTime,formatTime} from './schedule-utils.js?v=3';
import {zonedTaskStart} from './task-reminders.js?v=4';

export function planningReportText(value,max=400){return [...String(value).replace(/\s+/g,' ').slice(0,max)].map(ch=>'&<>[]`*_\\'.includes(ch)?'&#'+ch.charCodeAt(0)+';':ch).join('')}
const fits=g=>['fits','fixed'].includes(g.status);
const fitted=result=>result.assignments.filter(fits).reduce((n,g)=>n+g.remainingMinutes,0);
const count=result=>result.assignments.filter(fits).length;
export function planningHoursText(input){return input.weeklyAvailability?(input.availabilitySource==='custom-weekly'?'Custom weekly hours for this plan: ':'Saved weekly hours: ')+weeklyAvailabilityText(input.weeklyAvailability):'Daily work hours: '+input.dayStart+'-'+input.dayEnd}
function extraHours(input){
 const weekly=normaliseWeeklyAvailability(input.weeklyAvailability);
 if(weekly){let changed=false;const next=Object.fromEntries(Object.entries(weekly).map(([day,windows])=>{const expanded=[];for(const window of windows){const end=Math.min(1435,parseTime(window.end)+60);if(end>parseTime(window.end))changed=true;const item={start:window.start,end:formatTime(Math.max(end,parseTime(window.end)),false)},prior=expanded.at(-1);if(prior&&parseTime(item.start)<=parseTime(prior.end))prior.end=item.end>prior.end?item.end:prior.end;else expanded.push(item)}return [day,expanded]}));return changed?{...input,weeklyAvailability:next,availabilitySource:'custom-weekly'}:null}
 const end=Math.min(1435,parseTime(input.dayEnd)+60);return end>parseTime(input.dayEnd)?{...input,dayEnd:formatTime(end,false),availabilitySource:'daily'}:null;
}

// Compare only a small fixed set of single-assumption changes. This is a
// candidate search, never a claim of optimality or proof of impossibility.
export function planningAlternatives(state,input,clock,{focusAssignmentIds=[]}={}){
 const baseline=combinedPlanning(state,input,clock);
 if(!Array.isArray(focusAssignmentIds)||focusAssignmentIds.length>10||new Set(focusAssignmentIds).size!==focusAssignmentIds.length||focusAssignmentIds.some(id=>!input.assignmentIds.includes(id)))throw Error('Prioritise only distinct assignments from the selected plan.');
 const notice='These options use the current planner and may not include every possible arrangement. Confirm any extra hours, then review the schedule before Apply. Saved settings, deadlines, locks and task durations stay unchanged.';
 if(baseline.assignments.every(g=>fits(g)||g.status==='no-work'))return {input:structuredClone(input),baseline,alternatives:[],checked:0,notice:'The current candidate already fits all unfinished selected work. '+notice};
 const alternatives=[],limit=planningDailyLimit(input),gap=planningGapMinutes(input);let checked=0;
 const improved=r=>fitted(r)>fitted(baseline)||count(r)>count(baseline);
 const attempt=(id,title,changes,candidate)=>{
  checked++;const result=combinedPlanning(state,candidate,clock);
  if(!result.proposal||!(id==='focus'?result.assignments.every(g=>fits(g)||g.status==='no-work'):improved(result)))return false;
  // Run the independent write validator now; the reviewed command will be
  // checked again against live state/clock when the user applies it.
  try{applyPlanningCommand(state,result.proposal.command,result.proposal.expected,{now:zonedTaskStart(clock.date,clock.time,input.timezone||'UTC')})}catch{return false}
  if(id==='focus'){
   const included=new Set(candidate.assignmentIds),unchanged=baseline.assignments.filter(g=>!included.has(g.taskId));
   result.assignments=[...result.assignments,...unchanged.map(g=>({...g,status:'unchanged',reason:'Not included in this priority option; its saved sessions stay unchanged.'}))];
   result.remainingMinutes=baseline.remainingMinutes;result.excludedMinutes=unchanged.reduce((n,g)=>n+g.remainingMinutes,0);
   result.proposal.notice+=' '+unchanged.map(g=>g.title+' ('+g.remainingMinutes+' minutes) stays unchanged.').join(' ');
  }
  result.proposal.notice=title+'. '+changes+' '+planningHoursText(candidate)+'. '+result.proposal.notice+' Saved settings and deadlines stay unchanged.';
  alternatives.push({id,title,changes,input:structuredClone(candidate),result});return true;
 };
 if(limit&&limit<1440){for(const next of [...new Set([Math.min(1440,limit+30),Math.min(1440,limit+60)])])if(attempt('daily-limit','Increase the daily limit','Daily assignment-work limit changes from '+limit+' to '+next+' minutes for this plan only.',{...input,dailyLimitMinutes:next}))break}
 if(gap)attempt('gap','Use no added gap','Session spacing changes from '+gap+' to 0 minutes for this plan only.',{...input,gapMinutes:0});
 const hours=extraHours(input);if(hours)attempt('hours','Use extra work hours','Assumes you are available for up to one extra hour at the end of each existing work window. Closed days stay closed. Confirm these extra hours before Apply.',hours);
 if(focusAssignmentIds.length&&focusAssignmentIds.length<input.assignmentIds.length)attempt('focus','Prioritise chosen assignments','Only the assignments you explicitly chose are considered for moving; all other selected assignments stay unchanged.',{...input,assignmentIds:[...focusAssignmentIds]});
 return {input:structuredClone(input),baseline,alternatives,checked,notice};
}
export function choosePlanningAlternative(state,input,clock,id,options){
 if(!['daily-limit','gap','hours','focus'].includes(id))throw Error('Choose a supported planning alternative.');
 const choice=planningAlternatives(state,input,clock,options).alternatives.find(item=>item.id===id);
 if(!choice)throw Error('That alternative has no improved validated candidate for the current planner. Compare again or review the assignments.');return choice;
}
export function planningAlternativesText(report){
 const original=report.baseline.assignments;const describe=groups=>groups.map(g=>planningReportText(g.title,180)+' ('+g.remainingMinutes+' minutes)').join('; ')||'None';
 return 'What would make this fit?\n\n'+report.input.from+' through '+report.input.to+' in '+(report.input.timezone||'UTC')+'. '+planningDailyLimitText(report.input)+' '+planningGapText(report.input)+'\n\nCurrent check. Fits: '+describe(original.filter(fits))+'. Unplaced or needs review: '+describe(original.filter(g=>!fits(g)&&g.status!=='no-work'))+'.\n\n'+(report.alternatives.length?report.alternatives.map((a,i)=>(i+1)+'. '+a.title+': '+a.changes+' '+planningHoursText(a.input)+'. Fits: '+describe(a.result.assignments.filter(fits))+'. Unplaced or unchanged: '+describe(a.result.assignments.filter(g=>!fits(g)&&g.status!=='no-work'))+'. Ask to review this option before any changes.').join('\n\n'):'No improved validated alternative was found among the changes tested. ')+ '\n\n'+report.notice+' Nothing changed.';
}
