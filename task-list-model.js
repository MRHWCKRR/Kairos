import {stableStringify,mergePlanEdits} from './plan-merge.js';
import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js';
import {normalizeRecurrence,validateRecurrence,generateTaskOccurrences,applyOccurrenceOverride} from './recurrence-utils.js';

export const TASK_DETAIL_FIELDS=['title','notes','date','startTime','dueDate','durationMinutes','priority','reminderMinutes','scheduleLocked','schedulingPreference','color','recurrence','checklist'];
const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export async function taskListFingerprint(command,expected){
    const bytes=new TextEncoder().encode(stableStringify({command,expected}));
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return 'sha256:'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function resolveTaskDetail(state,target){
    const found=(state?.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).filter(task=>task.id===target?.taskId).map(task=>({board,section,task}))));
    if(found.length!==1||found[0].board.archived||found[0].section.archived||found[0].task.archived)throw new Error('This task is missing, archived or ambiguous.');
    const entry=found[0];
    if(target?.occurrenceDate){
        if(!dateValid(target.occurrenceDate))throw new Error('Invalid occurrence date.');
        const occurrence=generateTaskOccurrences(entry.task,target.occurrenceDate,target.occurrenceDate).find(item=>item.occurrenceDate===target.occurrenceDate&&item.status!=='deleted');
        if(!occurrence)throw new Error('This recurring occurrence does not exist.');
        return {...entry,seriesTask:entry.task,task:occurrence.task,occurrence};
    }
    return entry;
}
export function taskDetailValues(task,target={}){
    const checklist=structuredClone(task.checklist||[]);
    // Schedule can convert an ordinary task with progress into a series.
    // Its template is always unchecked; dated occurrence snapshots retain progress.
    if(task.recurrence?.enabled&&!target.occurrenceDate)for(const item of checklist)item.completed=false;
    return Object.fromEntries(TASK_DETAIL_FIELDS.map(key=>[key,key==='checklist'?checklist:key==='durationMinutes'?taskDurationMinutes(task):key==='notes'?task.notes||'':key==='scheduleLocked'?task.scheduleLocked===true:task[key]??null]));
}
export function validateChecklist(entries){
    if(!Array.isArray(entries)||entries.length>100)throw new Error('A checklist supports up to 100 steps.');
    const ids=new Set();
    for(const item of entries){
        if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['id','title','completed'].includes(key))||typeof item.id!=='string'||!item.id||item.id.length>120||ids.has(item.id)||typeof item.title!=='string'||!item.title.trim()||item.title.length>180||typeof item.completed!=='boolean')throw new Error('Invalid checklist step. Use a unique ID and a title up to 180 characters.');
        ids.add(item.id);
    }
    return entries;
}
export function mergeChecklist(base,local,remote){
    validateChecklist(base);validateChecklist(local);validateChecklist(remote);
    const common=base.map(item=>item.id).filter(id=>local.some(item=>item.id===id)&&remote.some(item=>item.id===id));
    const order=list=>list.filter(item=>common.includes(item.id)).map(item=>item.id);
    const oldOrder=stableStringify(common),localOrder=stableStringify(order(local)),remoteOrder=stableStringify(order(remote));
    if(localOrder!==oldOrder&&remoteOrder!==oldOrder&&localOrder!==remoteOrder)throw new Error('The checklist order changed in another window.');
    const merged=mergePlanEdits(base,local,remote),preferred=localOrder!==oldOrder?local:remote;
    const ids=preferred.map(item=>item.id).filter(id=>merged.some(item=>item.id===id));
    // Integrate concurrent/new entries beside their nearest surviving anchor.
    // Newly added IDs are absent from the common-order comparison above.
    for(const source of [local,remote])for(let index=0;index<source.length;index++){
        const id=source[index].id;if(ids.includes(id)||!merged.some(item=>item.id===id))continue;
        const after=source.slice(index+1).find(item=>ids.includes(item.id));
        const before=source.slice(0,index).reverse().find(item=>ids.includes(item.id));
        ids.splice(after?ids.indexOf(after.id):before?ids.indexOf(before.id)+1:ids.length,0,id);
    }
    const result=ids.map(id=>merged.find(item=>item.id===id)).filter(Boolean);validateChecklist(result);return result;
}
function checklistCommand(state,command,expected){
    const entries=structuredClone(expected?.fields?.checklist||[]),index=entries.findIndex(item=>item.id===command.itemId);
    if(command.type==='add_checklist_item')entries.push(structuredClone(command.item));
    else if(command.type==='edit_checklist_item'){
        if(index<0||!command.changes||Object.keys(command.changes).some(key=>!['title','completed'].includes(key)))throw new Error('Checklist step not found or invalid fields.');
        Object.assign(entries[index],command.changes);
    }else if(command.type==='remove_checklist_item'){if(index<0)throw new Error('Checklist step not found.');entries.splice(index,1)}
    else if(command.type==='reorder_checklist'){
        if(!Array.isArray(command.itemIds)||command.itemIds.length!==entries.length||new Set(command.itemIds).size!==entries.length||command.itemIds.some(id=>!entries.some(item=>item.id===id)))throw new Error('Invalid checklist order.');
        entries.sort((a,b)=>command.itemIds.indexOf(a.id)-command.itemIds.indexOf(b.id));
    }
    const applied=applyTaskListCommand(state,{type:'edit_task',target:command.target,changes:{checklist:entries}},expected);
    applied.result.type=command.type;return applied;
}
export function taskListLocation(state,taskId,{allowArchived=false}={}){
    const matches=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).filter(task=>task.id===taskId).map(task=>({board,section,task}))));
    if(matches.length!==1)throw new Error('This task is missing or has ambiguous duplicate IDs.');
    const found=matches[0];if(found.board.archived||found.section.archived||(!allowArchived&&found.task.archived))throw new Error('This task or section is archived.');return found;
}
export function taskListSection(state,target){
    const matches=(state.boards||[]).flatMap(board=>(board.sections||[]).filter(section=>board.id===target?.boardId&&section.id===target?.sectionId).map(section=>({board,section})));
    if(matches.length!==1||matches[0].board.archived||matches[0].section.archived)throw new Error('This section is missing, archived or ambiguous.');return matches[0];
}
const taskIds=section=>(section.tasks||[]).map(task=>task.id);
function checkTaskOrder(state,section,expected){
    const ids=taskIds(section);
    if(!Array.isArray(expected)||stableStringify(ids)!==stableStringify(expected))throw new Error('The task order changed. Review the section before retrying.');
    const counts=new Map();for(const board of state.boards||[])for(const section of board.sections||[])for(const task of section.tasks||[])counts.set(task.id,(counts.get(task.id)||0)+1);
    if(ids.some(id=>typeof id!=='string'||!id||counts.get(id)!==1))throw new Error('Ambiguous duplicate task IDs.');return ids;
}
export function applyTaskListCommand(state,command,expected,{now=Date.now()}={}){
    if(command?.type==='undo_task_list'){
        if(!Number.isFinite(command.expiresAt)||command.expiresAt<=now||command.expiresAt>now+10000)throw new Error('Undo expired.');
        if(!['reorder_tasks','move_task','complete_task','archive_task'].includes(command.inverse?.command?.type))throw new Error('Unsupported Undo action.');
        const out=applyTaskListCommand(state,command.inverse.command,command.inverse.expected,{now});out.result.type='undo_task_list';return out;
    }
    if(command?.type==='reorder_tasks'){
        const next=structuredClone(state),{board,section}=taskListSection(next,command.target),before=checkTaskOrder(next,section,expected?.order),ids=command.taskIds;
        const beforeIds=new Set(before),byId=new Map(section.tasks.map(task=>[task.id,task]));
        if(expected?.boardId!==board.id||expected?.sectionId!==section.id||!Array.isArray(ids)||ids.length!==before.length||new Set(ids).size!==before.length||ids.some(id=>!beforeIds.has(id)))throw new Error('Invalid task order.');
        section.tasks=ids.map(id=>byId.get(id));
        return {next,result:{type:command.type,inverse:{command:{type:command.type,target:command.target,taskIds:before},expected:{boardId:board.id,sectionId:section.id,order:ids}}}};
    }
    if(command?.type==='move_task'){
        const next=structuredClone(state),source=taskListLocation(next,command.target?.taskId),destination=taskListSection(next,command.destination);
        if(command.target?.occurrenceDate||source.board.id!==expected?.boardId||source.section.id!==expected?.sectionId)throw new Error('This task moved. Reopen its section.');
        if(source.section===destination.section)throw new Error('Use reorder within the same section.');
        const sourceOrder=checkTaskOrder(next,source.section,expected?.sourceOrder),destinationOrder=checkTaskOrder(next,destination.section,expected?.destinationOrder),index=command.destination.index;
        if(!Number.isInteger(index)||index<0||index>destinationOrder.length)throw new Error('Invalid insertion position.');
        const originalIndex=sourceOrder.indexOf(source.task.id);source.section.tasks.splice(originalIndex,1);(destination.section.tasks??=[]).splice(index,0,source.task);
        return {next,result:{type:command.type,task:source.task,inverse:{command:{type:'move_task',target:command.target,destination:{boardId:source.board.id,sectionId:source.section.id,index:originalIndex}},expected:{boardId:destination.board.id,sectionId:destination.section.id,sourceOrder:taskIds(destination.section),destinationOrder:taskIds(source.section)}}}};
    }
    if(['complete_task','archive_task'].includes(command?.type)){
        const next=structuredClone(state),found=taskListLocation(next,command.target?.taskId,{allowArchived:command.type==='archive_task'&&command.value===false}),key=command.type==='complete_task'?'completed':'archived',before=found.task[key]===true;
        if(command.target?.occurrenceDate||found.board.id!==expected?.boardId||found.section.id!==expected?.sectionId||typeof command.value!=='boolean'||typeof expected.value!=='boolean'||before!==expected.value)throw new Error('This task moved or its affected field changed.');
        if(command.type==='complete_task'&&found.task.recurrence?.enabled)throw new Error('Complete recurring occurrences from Schedule.');
        found.task[key]=command.value;
        return {next,result:{type:command.type,task:found.task,inverse:{command:{type:command.type,target:command.target,value:before},expected:{boardId:found.board.id,sectionId:found.section.id,value:command.value}}}};
    }
    if(command?.type==='create_task'){
        const item=command.task;
        if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['id','title'].includes(key))||typeof item.id!=='string'||!item.id.trim()||item.id.length>160||typeof item.title!=='string'||!item.title.trim()||item.title.length>180)throw new Error('Enter a task title up to 180 characters and a valid ID.');
        const next=structuredClone(state),matches=(next.boards||[]).flatMap(board=>(board.sections||[]).filter(section=>board.id===command.target?.boardId&&section.id===command.target?.sectionId).map(section=>({board,section})));
        if(matches.length!==1||matches[0].board.archived||matches[0].section.archived||expected?.boardId!==command.target?.boardId||expected?.sectionId!==command.target?.sectionId)throw new Error('This section is missing, archived or ambiguous.');
        if((next.boards||[]).some(board=>(board.sections||[]).some(section=>(section.tasks||[]).some(task=>task.id===item.id))))throw new Error('This task ID already exists. Reconcile the original save.');
        const {board,section}=matches[0],task={id:item.id,title:item.title.trim(),completed:false,date:null,archived:false};
        (section.tasks??=[]).push(task);
        return {next,result:{type:'create_task',task,board:board.title,section:section.title}};
    }
    if(['add_checklist_item','edit_checklist_item','remove_checklist_item','reorder_checklist'].includes(command?.type))return checklistCommand(state,command,expected);
    if(command?.type!=='edit_task'||!command.changes||Array.isArray(command.changes))throw new Error('Unsupported task detail command.');
    const next=structuredClone(state),found=resolveTaskDetail(next,command.target),task=found.task,values=taskDetailValues(task,command.target),changes=command.changes;
    if(command.target?.occurrenceDate&&Object.keys(changes).some(key=>key!=='checklist'))throw new Error('Edit individual occurrence metadata from Schedule.');
    if(found.board.id!==expected?.boardId||found.section.id!==expected?.sectionId)throw new Error('This task moved. Reopen its details.');
    if(command.target?.occurrenceDate){
        if(Object.keys(changes).some(key=>key!=='checklist'))throw new Error('Edit individual occurrence metadata from Schedule.');
        if(!Object.hasOwn(expected.fields||{},'checklist'))throw new Error('Checklist baseline is required.');
        const checklist=mergeChecklist(expected.fields?.checklist||[],changes.checklist,values.checklist);
        const updated=applyOccurrenceOverride(found.seriesTask,command.target.occurrenceDate,{checklist});
        Object.assign(found.seriesTask,updated);
        return {next,result:{type:'edit_task',task:found.seriesTask,board:found.board.title,section:found.section.title}};
    }
    for(const [key,value] of Object.entries(changes)){
        if(!TASK_DETAIL_FIELDS.includes(key)||!Object.hasOwn(expected.fields||{},key))throw new Error('Unsupported task detail field.');
        if(key!=='checklist'&&stableStringify(values[key])!==stableStringify(expected.fields[key]))throw new Error('This field changed in another window or chat. Reopen the task to review it.');
        if(key==='checklist'){validateChecklist(value);if(task.recurrence?.enabled&&value.some(item=>item.completed))throw new Error('Series template steps must be unchecked. Select an occurrence to track progress.');}
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
    for(const [key,value] of Object.entries(changes))if(!['durationMinutes','recurrence','checklist'].includes(key))task[key]=key==='title'?value.trim():value;
    if(Object.hasOwn(changes,'checklist'))task.checklist=mergeChecklist(expected.fields.checklist,changes.checklist,values.checklist);
    if(Object.hasOwn(changes,'startTime')||Object.hasOwn(changes,'durationMinutes')){
        const duration=changes.durationMinutes??values.durationMinutes,start=parseTime(task.startTime);
        if(start!==null){if(start+duration>1440)throw new Error('The task must end by midnight.');task.endTime=formatTime((start+duration)%1440,false);}
        else task.endTime=null;
        task.lastScheduledMinutes=duration;
        if(Object.hasOwn(changes,'durationMinutes'))task.estimatedMinutes=duration;
    }
    if(Object.hasOwn(changes,'recurrence'))task.recurrence=changes.recurrence?{...normalizeRecurrence(changes.recurrence,task.date),exceptions:structuredClone(task.recurrence?.exceptions||{})}:null;
    if(task.recurrence?.enabled&&task.checklist?.some(item=>item.completed))task.checklist=task.checklist.map(item=>({...item,completed:false}));
    if(task.recurrence?.enabled&&!validateRecurrence(normalizeRecurrence(task.recurrence,task.date)))throw new Error('Invalid repeat rule: review the start and end dates.');
    if(task.startTime&&!task.date)throw new Error('Choose a scheduled date before setting a start time.');
    if(task.recurrence?.enabled&&task.recurrence.mode==='fixed'&&!task.startTime)throw new Error('Fixed recurring tasks need a start time.');
    return {next,result:{type:'edit_task',task,board:found.board.title,section:found.section.title}};
}
