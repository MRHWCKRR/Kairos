import {stableStringify} from './plan-merge.js?v=1';
const allTasks=state=>(state.boards||[]).flatMap(board=>board.archived?[]:(board.sections||[]).flatMap(section=>section.archived?[]:(section.tasks||[]).filter(task=>!task.archived)));
const interval=task=>task?{date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null,recurrence:task.recurrence?.enabled?{...Object.fromEntries(Object.entries(task.recurrence).filter(([key])=>key!=='exceptions')),exceptions:Object.fromEntries(Object.entries(task.recurrence.exceptions||{}).map(([date,value])=>[date,Object.fromEntries(['date','startTime','endTime','durationMinutes'].filter(key=>Object.hasOwn(value.override||{},key)).map(key=>[key,value.override[key]]))]).filter(([,fields])=>Object.keys(fields).length))}:null}:null;
const canonical=timezone=>{try{return new Intl.DateTimeFormat('en',{timeZone:timezone}).resolvedOptions().timeZone}catch{return timezone}};
export function assertCalendarTimezones(before,after,timezone){
 if(!timezone||(after.calendarSources||[]).every(source=>canonical(source.timezone)===canonical(timezone)))return;
 const previous=new Map(allTasks(before).map(task=>[task.id,task]));
 if(allTasks(after).some(task=>(task.date&&task.startTime||task.recurrence?.enabled)&&stableStringify(interval(task))!==stableStringify(interval(previous.get(task.id)))))throw Error('Your calendar timezone changed. Refresh or replace imported calendars before planning tasks.');
}
export function assertCalendarImportTimezone(expected,timezone){if(expected&&timezone&&canonical(expected)!==canonical(timezone))throw Error('Your saved timezone changed. Preview this calendar again.');}
