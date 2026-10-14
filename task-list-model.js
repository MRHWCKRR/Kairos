import {stableStringify} from './plan-merge.js';
import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js';
import {normalizeRecurrence,validateRecurrence} from './recurrence-utils.js';

export const TASK_DETAIL_FIELDS=['title','notes','date','startTime','dueDate','durationMinutes','priority','reminderMinutes','scheduleLocked','schedulingPreference','color','recurrence'];
const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function resolveTaskDetail(state,target){
    if(target?.occurrenceDate)throw new Error('Edit individual occurrences from Schedule.');
    const found=(state?.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).filter(task=>task.id===target?.taskId).map(task=>({board,section,task}))));
    if(found.length!==1||found[0].board.archived||found[0].section.archived||found[0].task.archived)throw new Error('This task is missing, archived or ambiguous.');
    return found[0];
}
export function taskDetailValues(task){
    return Object.fromEntries(TASK_DETAIL_FIELDS.map(key=>[key,key==='durationMinutes'?taskDurationMinutes(task):key==='notes'?task.notes||'':key==='scheduleLocked'?task.scheduleLocked===true:task[key]??null]));
}
export function applyTaskListCommand(state,command,expected){
    if(command?.type!=='edit_task'||!command.changes||Array.isArray(command.changes))throw new Error('Unsupported task detail command.');
    const next=structuredClone(state),found=resolveTaskDetail(next,command.target),task=found.task,values=taskDetailValues(task),changes=command.changes;
    if(found.board.id!==expected?.boardId||found.section.id!==expected?.sectionId)throw new Error('This task moved. Reopen its details.');
    for(const [key,value] of Object.entries(changes)){
        if(!TASK_DETAIL_FIELDS.includes(key)||!Object.hasOwn(expected.fields||{},key))throw new Error('Unsupported task detail field.');
        if(stableStringify(values[key])!==stableStringify(expected.fields[key]))throw new Error('This field changed in another window or chat. Reopen the task to review it.');
        if(key==='title'&&(typeof value!=='string'||!value.trim()||value.length>180))throw new Error('Enter a title up to 180 characters.');
        if(key==='notes'&&(typeof value!=='string'||value.length>3000))throw new Error('Notes must be text up to 3000 characters.');
        if(['date','dueDate'].includes(key)&&value!==null&&!dateValid(value))throw new Error('Invalid date.');
        if(key==='startTime'&&value!==null&&(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))throw new Error('Invalid start time.');
        if(key==='durationMinutes'&&(!Number.isInteger(value)||value<1||value>=1440))throw new Error('Duration must be 1–1439 minutes.');
        if(key==='reminderMinutes'&&value!==null&&(!Number.isInteger(value)||value<1||value>10080))throw new Error('Invalid reminder lead time.');
        if(key==='priority'&&![null,'low','medium','high'].includes(value))throw new Error('Invalid priority.');
        if(key==='schedulingPreference'&&![null,'morning','afternoon','evening'].includes(value))throw new Error('Invalid preferred time.');
        if(key==='scheduleLocked'&&typeof value!=='boolean')throw new Error('Invalid lock value.');
        if(key==='color'&&value!==null&&!/^#[0-9a-f]{6}$/i.test(value))throw new Error('Invalid task color.');
        if(key==='recurrence'&&value!==null&&(typeof value!=='object'||Array.isArray(value)||value.enabled!==true||!['daily','weekly','monthly','yearly'].includes(value.frequency)))throw new Error('Invalid repeat rule.');
    }
    // Derived end times depend on both start and duration: reject stale schedule
    // expectations even if the editor only deliberately changes one of them.
    if(Object.hasOwn(changes,'startTime')||Object.hasOwn(changes,'durationMinutes')){
        for(const key of ['startTime','durationMinutes'])if(Object.hasOwn(expected.fields,key)&&stableStringify(values[key])!==stableStringify(expected.fields[key]))throw new Error('The schedule changed. Reopen the task.');
    }
    for(const [key,value] of Object.entries(changes))if(!['durationMinutes','recurrence'].includes(key))task[key]=key==='title'?value.trim():value;
    if(Object.hasOwn(changes,'startTime')||Object.hasOwn(changes,'durationMinutes')){
        const duration=changes.durationMinutes??values.durationMinutes,start=parseTime(task.startTime);
        if(start!==null){if(start+duration>1440)throw new Error('The task must end by midnight.');task.endTime=formatTime((start+duration)%1440,false);}
        else task.endTime=null;
        task.lastScheduledMinutes=duration;
        if(Object.hasOwn(changes,'durationMinutes'))task.estimatedMinutes=duration;
    }
    if(Object.hasOwn(changes,'recurrence'))task.recurrence=changes.recurrence?{...normalizeRecurrence(changes.recurrence,task.date),exceptions:structuredClone(task.recurrence?.exceptions||{})}:null;
    if(task.recurrence?.enabled&&!validateRecurrence(task.recurrence))throw new Error('Invalid repeat rule: review the start and end dates.');
    if(task.startTime&&!task.date)throw new Error('Choose a scheduled date before setting a start time.');
    if(task.recurrence?.enabled&&task.recurrence.mode==='fixed'&&!task.startTime)throw new Error('Fixed recurring tasks need a start time.');
    return {next,result:{type:'edit_task',task,board:found.board.title,section:found.section.title}};
}
