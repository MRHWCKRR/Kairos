import {planningTasks,planningOccurrences,validPlanningDate,shiftPlanningDate} from './planning-model.js';
import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js';
import {zonedTaskStart} from './task-reminders.js';
import {normaliseWeeklyAvailability} from './weekly-availability.js';

export function validatePlanningRange(from,to){
 if(!validPlanningDate(from)||!validPlanningDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>=31)throw Error('Choose a valid date range of at most 31 days.');
}
export function planningAvailability(input){
 planningGapMinutes(input);
 if(input.availabilitySource==='saved'&&input.weeklyAvailability==null)throw Error('Your saved weekly availability changed. Review a new preview.');
 validatePlanningRange(input.from,input.to);const weekly=normaliseWeeklyAvailability(input.weeklyAvailability),start=weekly?0:parseTime(input.dayStart),end=weekly?1440:parseTime(input.dayEnd);
 if(start===null||end===null||end<=start)throw Error('Daily availability must end after it starts.');
 const preference={morning:[0,720],afternoon:[720,1020],evening:[1020,1440]}[input.preference];
 new Intl.DateTimeFormat('en',{timeZone:input.timezone||'UTC'}).format(new Date());
 return {start:Math.max(start,preference?.[0]||0),end:Math.min(end,preference?.[1]??1440)};
}
export function planningWindows(input,date){
 const bounds=planningAvailability(input);if(!validPlanningDate(date))throw Error('Choose a valid availability date.');
 const weekly=normaliseWeeklyAvailability(input.weeklyAvailability),windows=weekly?weekly[new Date(date+'T12:00:00Z').getUTCDay()]:[{start:input.dayStart,end:input.dayEnd}];
 const result=[];for(const window of windows){const start=Math.max(parseTime(window.start),bounds.start),end=Math.min(parseTime(window.end),bounds.end);if(end<=start)continue;const prior=result.at(-1);if(prior&&prior.end===start)prior.end=end;else result.push({start,end})}return result;
}
export const intervalsOverlap=(a,b)=>a.date===b.date&&a.startMin<b.endMin&&b.startMin<a.endMin;
export function planningGapMinutes(input){
 const value=input.gapMinutes===undefined?0:input.gapMinutes;
 if(!Number.isInteger(value)||![0,5,10,15].includes(value))throw Error('Choose a session gap of 0, 5, 10, or 15 minutes.');
 return value;
}
export function planningGapText(input){const gap=planningGapMinutes(input);return gap?'Spacing: '+gap+' minutes before or after neighbouring scheduled commitments. Gaps stay as free time; no break tasks are created.':'Spacing: no added gap.'}
export function planningIntervalsConflict(a,b,input,cache=new Map()){
 if(intervalsOverlap(a,b))return true;
 const gap=planningGapMinutes(input);if(!gap||Math.abs(Date.parse(a.date)-Date.parse(b.date))>86400000)return false;
 const stamp=(date,minute)=>{const key=(input.timezone||'UTC')+'/'+date+'/'+minute;if(!cache.has(key))cache.set(key,zonedTaskStart(minute===1440?shiftPlanningDate(date,1):date,formatTime(minute%1440,false),input.timezone||'UTC'));return cache.get(key)};
 const first=stamp(a.date,a.startMin),last=stamp(a.date,a.endMin),otherFirst=stamp(b.date,b.startMin),otherLast=stamp(b.date,b.endMin);
 // An invalid commitment boundary cannot establish a safe elapsed-time gap.
 if([first,last,otherFirst,otherLast].some(value=>value===null))return true;
 return first<otherLast+gap*60000&&otherFirst<last+gap*60000;
}
export function planningBlockValid(date,start,duration,timezone){
 const end=start+duration;if(start<0||end>1440||duration<1)return false;
 const first=zonedTaskStart(date,formatTime(start,false),timezone),last=zonedTaskStart(end===1440?shiftPlanningDate(date,1):date,formatTime(end%1440,false),timezone);
 return first!==null&&last!==null&&last-first===duration*60000;
}
export function planningOccupancy(state,from,to){
 validatePlanningRange(from,to);const out=[];
 function add(item,date,start,duration){
  if(!validPlanningDate(date)||start===null||!Number.isFinite(duration)||duration<=0||duration>1440)return;
  const first={...item,date,startMin:start,endMin:Math.min(1440,start+duration)};
  if(date>=from&&date<=to)out.push(first);
  if(start+duration>1440){const next=shiftPlanningDate(date,1);if(next>=from&&next<=to)out.push({...item,date:next,startMin:0,endMin:start+duration-1440})}
 }
 for(const {task} of planningTasks(state)){
  const item={id:String(task.id),taskId:task.id,title:String(task.title||'Task'),kind:'task',locked:task.scheduleLocked===true};
  if(task.recurrence?.enabled){
   for(const occurrence of planningOccurrences(task,shiftPlanningDate(from,-1),to,from))if(occurrence.status==='pending'){
    const explicit=task.recurrence.exceptions?.[occurrence.occurrenceDate]?.override?.durationMinutes;
    const duration=Number.isFinite(explicit)&&explicit>0?explicit:taskDurationMinutes(occurrence.task);
    add({...item,id:occurrence.occurrenceId,kind:'occurrence',locked:true},occurrence.displayDate,parseTime(occurrence.startTime),duration);
   }
  }else if(!task.completed)add(item,task.date,parseTime(task.startTime),taskDurationMinutes(task));
 }
 for(let date=shiftPlanningDate(from,-1);date<=to;date=shiftPlanningDate(date,1)){
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  for(const event of state.scheduleEvents||[]){
   if(event.archived||Number(event.day)!==day)continue;const start=parseTime(event.start),end=parseTime(event.end);
   if(start!==null&&end!==null)add({id:String(event.id),taskId:null,title:String(event.title||'Fixed commitment'),kind:'event',locked:true},date,start,(end-start+1440)%1440||1440);
  }
 }
 return out.sort((a,b)=>a.date.localeCompare(b.date)||a.startMin-b.startMin||String(a.id).localeCompare(String(b.id)));
}
export function planningConflicts(state,from,to){
 const items=planningOccupancy(state,from,to),out=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  if(items[j].date>items[i].date)break;
  if(intervalsOverlap(items[i],items[j])&&!(items[i].kind===items[j].kind&&items[i].id===items[j].id))out.push({date:items[i].date,a:items[i],b:items[j]});
 }
 return out;
}
export function planningPlacementOccupancy(state,input){
 const busy=planningOccupancy(state,input.from,input.to);if(!planningGapMinutes(input))return busy;
 // Boundary neighbours matter for gaps, even when a 31-day placement range
 // cannot be widened. Keep the underlying occupancy range limit unchanged.
 for(const date of [shiftPlanningDate(input.from,-1),shiftPlanningDate(input.to,1)])busy.push(...planningOccupancy(state,date,date));
 return busy;
}
export function findPlanningSlot(duration,input,busy,clock,spacingCache=new Map()){
 planningAvailability(input);
 if(!Number.isInteger(duration)||duration<1||duration>=1440)throw Error('Choose a duration from 1 to 1439 minutes.');
 if(!validPlanningDate(clock.date)||parseTime(clock.time)===null)throw Error('Current planning time is unavailable.');
 if(input.dueDate&&!validPlanningDate(input.dueDate))throw Error('Review the task deadline first.');
 const last=input.dueDate&&input.dueDate<input.to?input.dueDate:input.to;
 for(let date=input.from;date<=last;date=shiftPlanningDate(date,1)){
  if(date<clock.date)continue;
  for(const available of planningWindows(input,date)){
  const earliest=Math.max(available.start,date===clock.date?parseTime(clock.time)+1:0);
  for(let start=Math.ceil(earliest/5)*5;start+duration<=available.end;start+=5){
   const candidate={date,startMin:start,endMin:start+duration};if(busy.some(item=>planningIntervalsConflict(candidate,item,input,spacingCache)))continue;
   if(!planningBlockValid(date,start,duration,input.timezone||'UTC'))continue;
   return {date,startTime:formatTime(start,false),endTime:formatTime((start+duration)%1440,false)};
  }
  }
 }
 return null;
}
