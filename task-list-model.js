import {stableStringify,mergePlanEdits} from './plan-merge.js';
import {applySectionCommand} from './task-section-model.js';
import {buildTaskToolCommand,applyTaskToolCommand} from './task-tools-model.js';
import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js';
import {normalizeRecurrence,validateRecurrence,generateTaskOccurrences,applyOccurrenceOverride} from './recurrence-utils.js';
import {applyPlanningCommand} from './planning-commands.js?v=2';

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
function batchIds(ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>50)throw new Error('Select between 1 and 50 tasks for one batch.');
    if(new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id.trim()||id.length>160))throw new Error('Invalid or duplicate batch task IDs.');
    return ids;
}
const batchLocation=found=>({taskId:found.task.id,boardId:found.board.id,sectionId:found.section.id});
const batchSectionKey=value=>JSON.stringify([value.boardId,value.sectionId]);
function batchSections(found,destination){
    const all=[...found.map(item=>({boardId:item.board.id,sectionId:item.section.id,order:taskIds(item.section)})),...(destination?[{boardId:destination.board.id,sectionId:destination.section.id,order:taskIds(destination.section)}]:[])];
    return [...new Map(all.map(item=>[batchSectionKey(item),item])).values()];
}
export function buildTaskBatch(state,action,ids,destination){
    batchIds(ids);if(!['complete','incomplete','archive','move'].includes(action))throw new Error('Unsupported batch action.');
    const found=ids.map(id=>taskListLocation(state,id)),field=action==='archive'?'archived':'completed';
    const command={type:'task_batch',action,taskIds:[...ids]},expected={tasks:found.map(item=>({...batchLocation(item),...(action==='move'?{}:{value:item.task[field]===true})}))};
    if(action==='move'){const target=taskListSection(state,destination);command.destination={boardId:target.board.id,sectionId:target.section.id,...(destination.anchorTaskId!==undefined?{anchorTaskId:destination.anchorTaskId,after:destination.after===true}:{})};expected.sections=batchSections(found,target)}
    return {command,expected};
}
function applyTaskBatch(state,command,expected,restore=false){
    const ids=batchIds(command.taskIds),action=command.action,field=action==='archive'||action==='archived'?'archived':'completed';
    if(!(restore?['completed','archived','move']:['complete','incomplete','archive','move']).includes(action))throw new Error('Unsupported batch action.');
    const next=structuredClone(state),found=ids.map(id=>taskListLocation(next,id,{allowArchived:restore&&action==='archived'}));
    if(!Array.isArray(expected?.tasks)||expected.tasks.length!==ids.length||new Set(expected.tasks.map(item=>item?.taskId)).size!==ids.length)throw new Error('Invalid batch expectations.');
    for(const item of found){const old=expected.tasks.find(value=>value?.taskId===item.task.id);
        if(!old||old.boardId!==item.board.id||old.sectionId!==item.section.id||(action!=='move'&&(typeof old.value!=='boolean'||old.value!==(item.task[field]===true))))throw new Error('A selected task moved or its affected field changed. No tasks were changed.');
        if(field==='completed'&&action!=='move'&&item.task.recurrence?.enabled)throw new Error('Complete recurring occurrences from Schedule. No tasks were changed.');
    }
    const result={type:command.type,action,taskIds:[...ids],completedTaskIds:[],affectedCount:ids.length};
    if(action!=='move'){
        let desired;
        if(restore){
            desired=command.tasks;if(!Array.isArray(desired)||desired.length!==ids.length||new Set(desired.map(item=>item?.taskId)).size!==ids.length)throw new Error('Invalid batch inverse.');
            if(desired.some(item=>!ids.includes(item?.taskId)||typeof item.value!=='boolean'))throw new Error('Invalid batch inverse values.');
        }
        const before=found.map(item=>({...batchLocation(item),value:item.task[field]===true})),value=action==='complete'||action==='archive';
        for(const item of found){if(action==='complete'&&!item.task.completed)result.completedTaskIds.push(item.task.id);item.task[field]=restore?desired.find(old=>old.taskId===item.task.id).value:value}
        if(!restore)result.inverse={command:{type:'restore_task_batch',action:field,taskIds:[...ids],tasks:before},expected:{tasks:found.map(item=>({...batchLocation(item),value:item.task[field]===true}))}};
        return {next,result};
    }
    const destination=restore?null:taskListSection(next,command.destination),sections=restore?expected?.sections:batchSections(found,destination);
    if(!Array.isArray(sections)||!sections.length||!Array.isArray(expected?.sections)||expected.sections.length!==sections.length||new Set(expected.sections.map(batchSectionKey)).size!==sections.length)throw new Error('Invalid batch section expectations.');
    const snapshots=sections.map(section=>{const location=taskListSection(next,section),old=expected.sections.find(item=>batchSectionKey(item)===batchSectionKey(section));checkTaskOrder(next,location.section,old?.order);return {boardId:location.board.id,sectionId:location.section.id,order:taskIds(location.section)}});
    if(found.some(item=>!snapshots.some(section=>section.boardId===item.board.id&&section.sectionId===item.section.id)))throw new Error('Missing selected source section.');
    if(restore){
        const desired=command.sections;
        if(!Array.isArray(desired)||desired.length!==snapshots.length||new Set(desired.map(batchSectionKey)).size!==desired.length)throw new Error('Invalid batch inverse sections.');
        const currentIds=snapshots.flatMap(item=>item.order),desiredIds=desired.flatMap(item=>Array.isArray(item.order)?item.order:[]),all=new Set(currentIds);
        if(desiredIds.length!==currentIds.length||new Set(desiredIds).size!==all.size||desiredIds.some(id=>!all.has(id)))throw new Error('Invalid batch inverse order.');
        for(const section of snapshots){const old=desired.find(item=>batchSectionKey(item)===batchSectionKey(section));if(!old||stableStringify(old.order.filter(id=>!ids.includes(id)))!==stableStringify(section.order.filter(id=>!ids.includes(id))))throw new Error('Unrelated tasks changed order.');}
        const byId=new Map(snapshots.flatMap(section=>taskListSection(next,section).section.tasks.map(task=>[task.id,task])));
        for(const section of desired)taskListSection(next,section).section.tasks=section.order.map(id=>byId.get(id));
    }else{
        for(const section of snapshots){const item=taskListSection(next,section).section;item.tasks=(item.tasks||[]).filter(task=>!ids.includes(task.id))}
        const anchor=command.destination.anchorTaskId;let index=(destination.section.tasks||[]).length;
        if(anchor!==undefined){if(typeof anchor!=='string'||ids.includes(anchor)||(index=destination.section.tasks.findIndex(task=>task.id===anchor))<0)throw Error('The drop anchor is missing or selected.');if(command.destination.after)index++}
        (destination.section.tasks??=[]).splice(index,0,...found.map(item=>item.task));
        result.inverse={command:{type:'restore_task_batch',action:'move',taskIds:[...ids],sections:snapshots},expected:{tasks:ids.map(id=>batchLocation(taskListLocation(next,id))),sections:snapshots.map(section=>({...section,order:taskIds(taskListSection(next,section).section)}))}};
    }
    return {next,result};
}
export function buildTaskTool(state,action,ids,options={}){batchIds(ids);return buildTaskToolCommand(state,action,ids,options,{resolve:taskListLocation,values:taskDetailValues})}
export function applyTaskListCommand(state,command,expected,{now=Date.now()}={}){
    if(command?.type==='planning_batch')return applyPlanningCommand(state,command,expected,{now});
    if(['move_section','reorder_sections'].includes(command?.type))return applySectionCommand(state,command,expected);
    if(command?.type==='task_tool'){batchIds(command.taskIds);return applyTaskToolCommand(state,command,expected,{resolve:taskListLocation,values:taskDetailValues,apply:applyTaskListCommand})}
    if(command?.type==='undo_task_list'){
        if(!Number.isFinite(command.expiresAt)||command.expiresAt<=now||command.expiresAt>now+10000)throw new Error('Undo expired.');
        if(command.inverse?.command?.type==='restore_task_fields'){batchIds(command.inverse.command.taskIds);const out=applyTaskToolCommand(state,command.inverse.command,command.inverse.expected,{resolve:taskListLocation,values:taskDetailValues,apply:applyTaskListCommand},true);out.result.type='undo_task_list';return out}
        if(command.inverse?.command?.type==='restore_task_batch'){const out=applyTaskBatch(state,command.inverse.command,command.inverse.expected,true);out.result.type='undo_task_list';return out}
        if(!['reorder_tasks','move_task','complete_task','archive_task','move_section','reorder_sections'].includes(command.inverse?.command?.type))throw new Error('Unsupported Undo action.');
        const out=applyTaskListCommand(state,command.inverse.command,command.inverse.expected,{now});out.result.type='undo_task_list';return out;
    }
    if(command?.type==='task_batch')return applyTaskBatch(state,command,expected);
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
