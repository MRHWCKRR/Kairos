import {eventSegmentsForDate} from './schedule-events.js?v=3';
import {planningTasks,planningOccurrences,validPlanningDate,shiftPlanningDate} from './planning-model.js?v=1';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=5';

export function calendarConflicts(state,sourceId,clock){
 const source=(state.calendarSources||[]).find(s=>s.id===sourceId);if(!source)return [];
 const events=(state.scheduleEvents||[]).filter(e=>e.calendarSourceId===sourceId&&!e.archived&&!e.transparent&&validPlanningDate(e.date)),dates=[...new Set(events.map(e=>e.date))].sort();if(!dates.length)return [];
 const from=dates[0],to=dates.at(-1);if((Date.parse(to)-Date.parse(from))/86400000>366)throw Error('Refresh this calendar with a smaller date range before reviewing conflicts.');
 const found=[];
 for(const {task} of planningTasks(state)){
  const occurrences=task.recurrence?.enabled?planningOccurrences(task,shiftPlanningDate(from,-1),to,clock.date):task.completed?[]:[{task,displayDate:task.date,startTime:task.startTime,endTime:task.endTime,status:'pending'}];
  for(const occurrence of occurrences){
   if(occurrence.status!=='pending')continue;
   const effective={...occurrence.task,date:occurrence.displayDate,startTime:occurrence.startTime,endTime:occurrence.endTime},start=parseTime(effective.startTime),minutes=occurrence.durationMinutes??taskDurationMinutes(effective),date=effective.date;
   if(!validPlanningDate(date)||start===null||!Number.isFinite(minutes)||minutes<=0||minutes>1440)continue;
   const parts=[{date,start,end:Math.min(1440,start+minutes)}];if(start+minutes>1440)parts.push({date:shiftPlanningDate(date,1),start:0,end:start+minutes-1440});
   const collisions=new Map();for(const part of parts)for(const segment of eventSegmentsForDate(events,part.date,{busyOnly:true}))if(part.start<segment.endMin&&segment.startMin<part.end)collisions.set(segment.event.id,segment.event);
   if(!collisions.size)continue;
   const recurring=!!task.recurrence?.enabled,key=recurring?occurrence.occurrenceId:String(task.id),target={taskId:task.id,...(recurring?{occurrenceDate:occurrence.occurrenceDate}:{})};
   const reason=source.timezone!==clock.timezone&&clock.timezone?'Refresh this calendar in your current timezone.':task.scheduleLocked?'Schedule locked':recurring&&occurrence.mode!=='flexible'?'Fixed recurring occurrence':date<clock.date?'Past work':date===clock.date&&start<=parseTime(clock.time)?'Work has started':date>shiftPlanningDate(clock.date,7)?'Outside the next seven days':start+minutes>1440?'Overnight task — review manually':!Number.isInteger(minutes)||minutes>=1440?'Review the task duration':null;
   found.push({key,target,title:String(task.title||'Task'),date,startTime:effective.startTime,endTime:effective.endTime,minutes,task:effective,events:[...collisions.values()],movable:!reason,reason});
  }
 }
 return found.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.key.localeCompare(b.key));
}
