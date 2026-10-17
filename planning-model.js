import {generateTaskOccurrences} from './recurrence-utils.js';

export function validPlanningDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
function requireDate(value){if(!validPlanningDate(value))throw Error('Choose a valid date.');return value}
export function shiftPlanningDate(date,days){requireDate(date);return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)}
export function planningWeekStart(date){requireDate(date);const day=new Date(date+'T12:00:00Z').getUTCDay();return shiftPlanningDate(date,-((day+6)%7))}
export function planningClock(now=Date.now(),timezone='UTC'){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
export function planningTasks(state){return (state.boards||[]).filter(board=>!board.archived).flatMap(board=>(board.sections||[]).filter(section=>!section.archived).flatMap(section=>(section.tasks||[]).filter(task=>!task.archived).map(task=>({board,section,task}))))}

export function deadlineSummary(state,today){
 requireDate(today);
 return planningTasks(state).filter(({task})=>!task.completed&&!task.recurrence?.enabled).map(entry=>{
  const due=validPlanningDate(entry.task.dueDate)?entry.task.dueDate:null;
  return {...entry,dueDate:due,status:!due?'no-deadline':due<today?'overdue':due===today?'today':'upcoming',afterDeadline:!!due&&validPlanningDate(entry.task.date)&&entry.task.date>due};
 }).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||String(a.task.title).localeCompare(String(b.task.title)));
}

export function planningOccurrences(task,from,to,today=from){
 const byId=new Map(generateTaskOccurrences(task,from,to,{today}).map(item=>[item.occurrenceId,item]));
 for(const [logicalDate,exception] of Object.entries(task.recurrence?.exceptions||{})){
  const moved=exception?.override?.date;
  if(validPlanningDate(logicalDate)&&validPlanningDate(moved)&&moved>=from&&moved<=to&&(logicalDate<from||logicalDate>to)){
   const item=generateTaskOccurrences(task,logicalDate,logicalDate,{today})[0];if(item)byId.set(item.occurrenceId,item);
  }
 }
 return [...byId.values()].filter(item=>item.displayDate>=from&&item.displayDate<=to&&!['deleted','skipped'].includes(item.status));
}

export function weeklyReview(state,weekStart,today){
 requireDate(today);const from=planningWeekStart(weekStart),to=shiftPlanningDate(from,6),items=[];
 for(const entry of planningTasks(state)){
  const task=entry.task;
  if(task.recurrence?.enabled){for(const occurrence of planningOccurrences(task,from,to,today))items.push({...entry,id:occurrence.occurrenceId,date:occurrence.displayDate,completed:occurrence.status==='completed',occurrenceDate:occurrence.occurrenceDate,title:occurrence.task.title})}
  else if(validPlanningDate(task.date)&&task.date>=from&&task.date<=to)items.push({...entry,id:task.id,date:task.date,completed:task.completed===true,title:task.title});
 }
 items.sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
 const pending=items.filter(item=>!item.completed);
 return {from,to,completed:items.filter(item=>item.completed),pending,slipped:pending.filter(item=>item.date<today),nextDeadlines:deadlineSummary(state,today).filter(item=>item.dueDate>to&&item.dueDate<=shiftPlanningDate(to,7))};
}
