import {stableStringify} from './plan-merge.js?v=1';
import {taskDurationMinutes} from './schedule-utils.js?v=3';
import {projectStoredOccurrence} from './recurrence-utils.js?v=14';
const tasks=state=>(state?.boards||[]).flatMap(b=>(b.sections||[]).flatMap(s=>s.tasks||[]));
const fields=task=>task?{date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null,duration:taskDurationMinutes(task)}:null;
export function completedScheduleChanges(before,after){
 const next=new Map(tasks(after).map(task=>[task.id,task]));
 for(const task of tasks(before)){
  const changed=next.get(task.id);if(!changed)continue;
  if(task.completed&&stableStringify(fields(task))!==stableStringify(fields(changed)))return true;
  for(const [date,exception] of Object.entries(task.recurrence?.exceptions||{})){
   if(exception?.status!=='completed')continue;
   const old=projectStoredOccurrence(task,date),current=projectStoredOccurrence(changed,date);
   if(stableStringify(old?{...fields(old.task),duration:old.durationMinutes}:null)!==stableStringify(current?{...fields(current.task),duration:current.durationMinutes}:null))return true;
  }
 }
 return false;
}
export function assertCompletedScheduleChanges(before,after,allowed=false){if(!allowed&&completedScheduleChanges(before,after))throw Error('Completed task schedules are locked. Enable rescheduling completed tasks in Planning & Schedule settings first.');}
