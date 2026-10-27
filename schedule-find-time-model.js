import {planningTasks,planningClock,validPlanningDate,shiftPlanningDate} from './planning-model.js?v=1';
import {planningWindows,planningPlacementOccupancy,planningIntervalsConflict,planningBlockValid,planningDailyWork,planningDailyRemaining,validatePlanningRange} from './planning-slots.js?v=6';
import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js?v=3';
import {generateTaskOccurrences,projectStoredOccurrence} from './recurrence-utils.js?v=14';
import {stableStringify} from './plan-merge.js?v=1';
import {savedPlanningPreferences} from './planning-preferences.js?v=5';
import {savedWeeklyAvailability,normaliseWeeklyAvailability} from './weekly-availability.js?v=1';
import {taskOverdueState} from './schedule-overdue.js?v=2';

export function findTimeTask(state,target,{recovery=false,clock}={}){
 const entries=planningTasks(state).filter(({task})=>String(task.id)===String(target?.taskId));
 if(entries.length!==1)throw Error('This task is missing, archived or ambiguous.');
 const entry=entries[0];let task=entry.task,occurrence=null;
 if(target.occurrenceDate){
  occurrence=generateTaskOccurrences(task,target.occurrenceDate,target.occurrenceDate)[0];
  if(!occurrence||occurrence.status!=='pending'||!recovery&&occurrence.mode!=='flexible')throw Error('Choose an unfinished flexible occurrence.');
  task=occurrence.task;
 }else if(task.recurrence?.enabled)throw Error('Choose a single recurring occurrence.');
 if(task.completed||task.scheduleLocked)throw Error('This task is completed or locked.');
 if(recovery){if(!clock||!taskOverdueState(task,clock,occurrence?.durationMinutes))throw Error('This task is no longer overdue.');}
 else if(task.date&&parseTime(task.startTime)!==null)throw Error('This task is already scheduled.');
 if(task.dueDate&&!validPlanningDate(task.dueDate))throw Error('Review the task deadline first.');
 const remembered=Number(task.lastScheduledMinutes);
 const duration=occurrence?.durationMinutes??(parseTime(task.startTime)===null&&Number.isInteger(remembered)&&remembered>0?remembered:taskDurationMinutes(task));
 if(!Number.isInteger(duration)||duration<1||duration>=1440)throw Error('Choose a task duration from 1 to 1439 minutes.');
 return {...entry,task,occurrence,duration};
}
function storedSchedule(task,date){const old=projectStoredOccurrence(task,date);return old?{date:old.displayDate,startTime:old.startTime,endTime:old.endTime,durationMinutes:old.durationMinutes}:{}}
// Completed blocks still occupy calendar space, even if the view hides them.
function occupiedState(state){return {...state,boards:(state.boards||[]).map(board=>({...board,sections:(board.sections||[]).map(section=>({...section,tasks:(section.tasks||[]).map(task=>({...task,completed:false,...(task.recurrence?.enabled?{recurrence:{...task.recurrence,exceptions:Object.fromEntries(Object.entries(task.recurrence.exceptions||{}).map(([date,exception])=>[date,exception.status==='completed'?{...exception,status:'pending',override:{...exception.override,...storedSchedule(task,date)}}:exception]))}}:{})}))}))}))}}
function otherWork(state,target){return {...state,boards:(state.boards||[]).map(board=>({...board,sections:(board.sections||[]).map(section=>({...section,tasks:(section.tasks||[]).flatMap(task=>String(task.id)!==String(target.taskId)?[task]:target.occurrenceDate?[{...task,recurrence:{...task.recurrence,exceptions:{...task.recurrence.exceptions,[target.occurrenceDate]:{status:'skipped'}}}}]:[])}))}))}}

export function findTaskTimes(state,target,options,clock=planningClock(Date.now(),options.timezone)){
 validatePlanningRange(options.from,options.to);
 if(!validPlanningDate(clock.date)||parseTime(clock.time)===null)throw Error('Current planning time is unavailable.');
 const entry=findTimeTask(state,target,{recovery:options.recovery===true,clock}),{task,duration}=entry;
 const remaining=otherWork(state,target),afterDeadline=options.recovery===true&&task.dueDate&&task.dueDate<clock.date?task.dueDate:null;
 // Vacate only the reviewed placement. Other occurrences still reserve their time.
 const busy=planningPlacementOccupancy(occupiedState(options.recovery===true?remaining:state),options),dailyWork=planningDailyWork(remaining,options),cache=new Map(),slots=[];
 const signature=stableStringify({target,options,busy,boardId:entry.board.id,sectionId:entry.section.id,duration,date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null,dueDate:task.dueDate??null,assignmentId:task.assignmentId??null,dailyWork:[...dailyWork]});
 for(let date=options.from;date<=options.to;date=shiftPlanningDate(date,1)){
  if(date<clock.date||!options.recovery&&validPlanningDate(task.date)&&date<task.date||!afterDeadline&&task.dueDate&&date>task.dueDate||task.assignmentId&&duration>planningDailyRemaining(dailyWork,date,options))continue;
  for(const window of planningWindows(options,date)){
   let inGap=false;
   const earliest=Math.max(window.start,date===clock.date?parseTime(clock.time)+1:0);
   for(let start=Math.ceil(earliest/5)*5;start+duration<=window.end;start+=5){
    const candidate={date,startMin:start,endMin:start+duration};
    const fits=!busy.some(item=>planningIntervalsConflict(candidate,item,options,cache))&&planningBlockValid(date,start,duration,options.timezone||'UTC');
    if(fits&&!inGap)slots.push({date,startTime:formatTime(start,false),endTime:formatTime((start+duration)%1440,false)});
    inGap=fits;
   }
  }
 }
 const previousStart=parseTime(task.startTime);
 return {target:structuredClone(target),title:String(task.title||'Task'),duration,signature,slots,afterDeadline,previous:{date:task.date||null,startTime:task.startTime||null,endTime:previousStart===null?null:formatTime((previousStart+duration)%1440,false)}};
}

export function assertFindTimePlacement(state,target,changes,placement,clock){
 if(!placement?.options||typeof placement.signature!=='string')throw Error('Review a new time preview.');
 const report=findTaskTimes(state,target,placement.options,clock);
 if(report.signature!==placement.signature||!report.slots.some(slot=>slot.date===changes.date&&slot.startTime===changes.startTime&&slot.endTime===changes.endTime))throw Error('The task, calendar or available time changed. Find a time again.');
 if(target.occurrenceDate&&changes.durationMinutes!==undefined&&changes.durationMinutes!==report.duration)throw Error('The occurrence duration changed. Review a new time.');
}
export function assertFindTimeSettings(options,userData){
 const saved=savedPlanningPreferences(userData),weekly=savedWeeklyAvailability(userData),timezone=userData?.settings?.profile?.timezone||options.timezone;
 if(timezone!==options.timezone||saved.gapMinutes!==(options.gapMinutes??0)||saved.dailyLimitMinutes!==(options.dailyLimitMinutes??0)||stableStringify(weekly)!==stableStringify(normaliseWeeklyAvailability(options.weeklyAvailability)))throw Error('Your saved planning settings changed. Find a time again.');
}
