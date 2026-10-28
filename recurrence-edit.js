import {normalizeRecurrence,preserveOccurrenceOnSeriesEdit,projectStoredOccurrence,generateTaskOccurrences,applyOccurrenceOverride,splitRecurringSeries} from './recurrence-utils.js?v=14';
import {completedScheduleChanges} from './schedule-policy.js?v=4';

export function applyRecurringEdit(task,date,{scope,changes={},recurrence,newTaskId='preview-series'}={}){
 if(scope!=='occurrence'&&Object.hasOwn(changes,'durationMinutes')&&!(Object.hasOwn(changes,'startTime')?changes.startTime:task.startTime))changes={...changes,estimatedMinutes:changes.durationMinutes};
 if(scope==='occurrence')return [applyOccurrenceOverride(task,date,changes)];
 if(scope==='future'){const split=splitRecurringSeries(task,date,{...changes,recurrence},newTaskId,{preserveMoved:true});
  const details=Object.fromEntries(Object.entries(changes).filter(([key])=>!['date','startTime','endTime','durationMinutes','recurrence'].includes(key)));
  for(const [key,exception] of Object.entries(task.recurrence.exceptions||{}))if(key>=date&&preserveOccurrenceOnSeriesEdit(exception)){const old=projectStoredOccurrence(task,key);split.originalTask=applyOccurrenceOverride(split.originalTask,key,details);if(old){const kept=split.originalTask.recurrence.exceptions[key];kept.override={...kept.override,date:old.displayDate,startTime:old.startTime,endTime:old.endTime,durationMinutes:old.durationMinutes};}}
  return [split.originalTask,...(split.newTask?[split.newTask]:[])]}
 if(scope!=='series')throw Error('Choose an edit scope.');
 const next={...structuredClone(task),...structuredClone(changes),recurrence:normalizeRecurrence(recurrence||task.recurrence,task.recurrence.startDate)};
 next.recurrence.exceptions=structuredClone(task.recurrence.exceptions||{});
 // A series edit must not change a placement the user adjusted individually.
 for(const [key,exception] of Object.entries(next.recurrence.exceptions))if(preserveOccurrenceOnSeriesEdit(exception)){
  const old=projectStoredOccurrence(task,key);if(old)exception.override={...exception.override,date:old.displayDate,startTime:old.startTime,endTime:old.endTime,durationMinutes:old.durationMinutes};
 }
 return [next];
}
const state=tasks=>({boards:[{sections:[{tasks}]}]});
export function recurringEditPreview(task,date,{scope,changes={},recurrence,allowCompleted=false,deleting=false}={}){
 const next=deleting?(scope==='series'?[]:scope==='future'?[splitRecurringSeries(task,date,{},'unused').originalTask]:[applyOccurrenceOverride(task,date,{})]):applyRecurringEdit(task,date,{scope,changes,recurrence}),start=scope==='series'?task.recurrence.startDate:date,horizon=new Date(start+'T12:00:00');horizon.setFullYear(horizon.getFullYear()+5);const end=horizon.getFullYear()+'-'+String(horizon.getMonth()+1).padStart(2,'0')+'-'+String(horizon.getDate()).padStart(2,'0');if(deleting&&scope==='occurrence')next[0].recurrence.exceptions[date]={...next[0].recurrence.exceptions[date],status:'deleted'};
 const sample=tasks=>tasks.flatMap(t=>generateTaskOccurrences(t,start,end)).filter(o=>o.status!=='deleted').filter(o=>scope!=='occurrence'||o.occurrenceDate===date).sort((a,b)=>a.displayDate.localeCompare(b.displayDate)).slice(0,4).map(o=>({date:o.displayDate,startTime:o.startTime,endTime:o.endTime}));
 const preserved=deleting||scope==='occurrence'?0:Object.entries(task.recurrence.exceptions||{}).filter(([key,value])=>preserveOccurrenceOnSeriesEdit(value)&&(scope==='series'||key>=date)).length;
 return {description:scope==='occurrence'?`Only the occurrence originally dated ${date}. A single-occurrence edit leaves the repeat rule unchanged.`:scope==='future'?`Logical occurrence dates from ${date} onward. Earlier dates stay unchanged.`:'Every logical date in this series, including earlier dates.',caption:'Date sample (up to four occurrences within five years)',before:sample([task]),after:sample(next),preserved,error:!deleting&&!allowCompleted&&completedScheduleChanges(state([task]),state(next))?'Completed schedules are locked. Enable rescheduling completed tasks in Planning & Schedule first.':null};
}
