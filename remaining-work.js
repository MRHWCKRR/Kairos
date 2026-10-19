import {taskDurationMinutes} from './schedule-utils.js';
import {stableStringify} from './plan-merge.js';

export function taskRemainingMinutes(task){
 return Number.isInteger(task?.remainingMinutes)&&task.remainingMinutes>=1&&task.remainingMinutes<=1440?task.remainingMinutes:taskDurationMinutes(task);
}

// A check-in must not overwrite an estimate or status edited while it was open.
export function remainingWorkSnapshot(task){
 return stableStringify(Object.fromEntries(['remainingMinutes','estimatedMinutes','lastScheduledMinutes','date','startTime','endTime','completed','assignmentId'].map(key=>[key,task[key]??null])));
}

export function taskWorkCheckin(state,taskId){
 const all=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).map(task=>({board,section,task})))),matches=all.filter(e=>e.task.id===taskId),found=matches[0];
 if(matches.length!==1||found.board.archived||found.section.archived||found.task.archived||found.task.completed||found.task.recurrence?.enabled||all.some(e=>e.task.assignmentId===taskId))return null;
 return {title:String(found.task.title||'Task').slice(0,180),remainingMinutes:taskRemainingMinutes(found.task),workExpected:remainingWorkSnapshot(found.task)};
}
