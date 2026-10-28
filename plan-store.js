import {aiEventConflictSummary} from './ai-event-actions.js?v=3';
import {applyNativeEventUndo,buildNativeEventUndo} from './native-event-commands.js?v=3';
import {applyCalendarRepairUndo} from './calendar-repair.js?v=4';
import {assertCalendarTimezones,assertCalendarImportTimezone} from './calendar-policy.js?v=1';
import {plannerChanges,undoPlannerChanges,plannerChangeRows} from './planner-changes.js?v=2';
import {assertFindTimeSettings} from './schedule-find-time-model.js?v=6';
import {planningUndoSource,planningUndoPreview,applyPlanningUndo} from './planning-undo.js?v=7';
import {assertScheduleAvailability} from './schedule-planning-availability.js?v=5';
import {assertSavedAvailability} from './weekly-availability.js?v=3';
import { db } from './firebase.js?v=1';
import { doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { mergePlanEdits, planState, stableStringify } from './plan-merge.js?v=1';
import {validateAssignmentOrderChanges} from './assignment-order.js?v=4';
import { applyTaskListCommand, taskListFingerprint } from './task-list-model.js?v=25';
import {completedScheduleChanges,assertCompletedScheduleChanges} from './schedule-policy.js?v=4';
import {applyScheduleUndo} from './schedule-change-model.js?v=9';

export async function persistTaskListCommand(planId, uid, command, expected, operationId, createdAt) {
    if(typeof operationId!=='string'||!operationId||operationId.length>160||!Number.isFinite(createdAt)||createdAt<=0)throw new Error('Invalid operation identity.');
    const commandHash=await taskListFingerprint(command,expected);
    return persistAiPlanAction(planId,uid,{type:'task_list',commandHash},operationId,createdAt,plan=>{
        if(command.type==='native_event_undo'){
            const source=plan.receipts.find(receipt=>receipt.id===command.sourceOperationId);
            if(!['native_event_change','create_schedule_event','update_schedule_event','delete_schedule_event'].includes(source?.result?.type)||!source.result.nativeEventUndo||source.nativeEventUndoUsedBy)throw Error('This event Undo is unavailable or already used.');
            const applied=applyNativeEventUndo(plan.data,source.result.nativeEventUndo,command,expected);Object.assign(plan.data,applied.next);return {...applied.result,undoneOperationId:source.id};
        }
        if(command.type==='calendar_repair_undo'){

            if(Object.keys(command).some(key=>!['type','sourceOperationId','timezone'].includes(key))||expected?.sourceOperationId!==command.sourceOperationId)throw Error('Invalid repair Undo.');
            const source=plan.receipts.find(receipt=>receipt.id===command.sourceOperationId);
            if(source?.result?.type!=='calendar_repair'||!source.result.calendarRepairUndo||source.calendarRepairUndoUsedBy)throw Error('This repair Undo is unavailable or already used.');
            const applied=applyCalendarRepairUndo(plan.data,source.result.calendarRepairUndo);Object.assign(plan.data,applied.next);return {...applied.result,undoneOperationId:source.id};
        }
        if(command.type==='action_undo'){

            if(Object.keys(command).some(key=>!['type','sourceOperationId'].includes(key))||expected?.sourceOperationId!==command.sourceOperationId)throw Error('Invalid reviewed AI Undo.');
            const source=plan.receipts.find(receipt=>receipt.id===command.sourceOperationId);
            if(!source?.result?.plannerUndo||source.plannerUndoUsedBy)throw Error('This AI Undo is unavailable or already used.');
            Object.assign(plan.data,undoPlannerChanges(plan.data,source.result.plannerUndo));
            return {type:'action_undo',undoneOperationId:source.id};
        }
        if(command.type==='schedule_undo'){
            const source=plan.receipts.find(receipt=>receipt.id===command.sourceOperationId);
            if(!source?.result?.scheduleUndo||source.scheduleUndoUsedBy||expected?.sourceOperationId!==command.sourceOperationId)throw Error('This schedule Undo is unavailable or already used.');
            // Bound the initiation window, rather than time spent awaiting the
            // shared save queue. A clicked-in-time Undo may finish later.
            if(!Number.isFinite(command.expiresAt)||command.expiresAt<=createdAt||command.expiresAt>createdAt+10000)throw Error('Schedule Undo expired.');
            const applied=applyScheduleUndo(plan.data,source.result.scheduleUndo,{allowCompleted:plan.allowCompleted});Object.assign(plan.data,applied.next);
            return {...applied.result,undoneOperationId:source.id};
        }
        if(command.type==='planning_undo')return applyStoredPlanningUndo(plan,command,expected);
        if(command.type==='undo_create_task'){
            const source=plan.receipts.find(receipt=>receipt.id===command.sourceOperationId);
            if(!source||source.result?.type!=='create_task'||!source.result.createdTask||source.creationUndoUsedBy||stableStringify(source.result.createdTask)!==stableStringify(expected?.task))throw new Error('This creation receipt is unavailable or already undone. Review the task before changing it.');
        }
        const applied=applyTaskListCommand(plan.data,command,expected,{allowCompleted:plan.allowCompleted});
        Object.assign(plan.data,applied.next);
        return applied.result;
    },{nativeEventTimezone:['native_event_change','native_event_undo'].includes(command.type)?command.timezone:null,calendarTimezone:command.type==='calendar_sync'?command.source?.timezone:null,scheduleAvailability:command.type==='reviewed_schedule'?command.options?.availability:null,manualScheduling:['reviewed_schedule','schedule_create','recurring_inspector','schedule_change','schedule_undo','edit_task','task_tool','undo_task_list','action_undo'].includes(command.type),legacyFingerprint:stableStringify({command,expected}),findTimeOptions:command.type==='calendar_repair'?command.options:command.type==='schedule_change'?command.placement?.options:null,...(command.type==='calendar_repair_undo'?{repairUndoSource:command.sourceOperationId,repairUndoTimezone:command.timezone}:{}),planningOptions:command.type==='planning_batch'?command.options:null,...(command.type==='planning_undo'?{undoSourceOperationId:command.sourceOperationId,undoTimezone:command.options?.timezone}:{})});
}

export function applyStoredPlanningUndo(plan,command,expected){
 if(command?.type!=='planning_undo'||Object.keys(command).some(key=>!['type','sourceOperationId','options'].includes(key))||typeof command.sourceOperationId!=='string'||!command.sourceOperationId||command.sourceOperationId.length>160||expected?.sourceOperationId!==command.sourceOperationId||!command.options||Object.keys(command.options).some(key=>key!=='timezone'))throw Error('Invalid reviewed planning Undo command.');
 const source=planningUndoSource({aiActionReceipts:plan.receipts},command.sourceOperationId);
 if(command.options.timezone!==source.result.planningUndo.timezone)throw Error('The Undo timezone changed. Review it again.');
 const applied=applyPlanningUndo(plan.data,source.result.planningUndo);Object.assign(plan.data,applied.next);
 return {...applied.result,undoneOperationId:source.id};
}
export async function loadPlanningUndoPreview(planId,uid,timezone){
 const [snapshot,userSnapshot]=await Promise.all([getDoc(doc(db,'study_plans',planId)),getDoc(doc(db,'users',uid))]);
 return planningUndoPreview(ownedPlan(snapshot,uid),null,userSnapshot.data()?.settings?.profile?.timezone||timezone);
}

function ownedPlan(snapshot, uid) {
    if (!snapshot.exists()) return { userID: uid, boards: [], dayInsights: {}, scheduleEvents: [], createdAt: serverTimestamp() };
    const data = snapshot.data();
    if (data.userID !== uid) throw new Error('This planner belongs to another account.');
    return data;
}

export async function savePlannerEdits(planId, uid, base, local, options={}) {
    const ref = doc(db, 'study_plans', planId);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const data = ownedPlan(snapshot, uid);
        if(options.scheduleAvailability){const userSnapshot=await transaction.get(doc(db,'users',uid));assertScheduleAvailability(options.scheduleAvailability,userSnapshot.exists()?userSnapshot.data():{});}
        const merged = mergePlanEdits(planState(base), planState(local), planState(data));
        if(completedScheduleChanges(planState(data),merged)){const userSnapshot=await transaction.get(doc(db,'users',uid));assertCompletedScheduleChanges(planState(data),merged,userSnapshot.data()?.settings?.planning?.rescheduleCompleted===true);}
        if((merged.calendarSources||[]).length){const userSnapshot=await transaction.get(doc(db,'users',uid));assertCalendarTimezones(planState(data),merged,userSnapshot.data()?.settings?.profile?.timezone);}
        validateAssignmentOrderChanges(planState(data),merged);
        transaction.set(ref, { ...(!snapshot.exists() ? data : {}), ...merged }, { merge: true });
        return merged;
    });
}

function receiptResult(result) {
    const compact = { type: result.type };
    for(const key of ['occurrenceDate','occurrenceOperation'])if(result[key]!==undefined)compact[key]=result[key];
    if(result.type==='create_task')compact.createdTask=structuredClone(result.task);
    if(result.planningUndo)compact.planningUndo=structuredClone(result.planningUndo);
    if(result.nativeEventUndo)compact.nativeEventUndo=structuredClone(result.nativeEventUndo);
    if(result.nativeEventUndoUnavailable)compact.nativeEventUndoUnavailable=true;
    if(result.calendarRepairUndo)compact.calendarRepairUndo=structuredClone(result.calendarRepairUndo);
    if(result.scheduleUndo)compact.scheduleUndo=structuredClone(result.scheduleUndo);
    if(result.planningUndoUnavailable)compact.planningUndoUnavailable=true;
    if(['native_event_undo','calendar_repair_undo','planning_undo','undo_create_task','schedule_undo','action_undo'].includes(result.type))compact.undoneOperationId=result.undoneOperationId;
    if(Array.isArray(result.taskIds)){compact.taskIds=structuredClone(result.taskIds);compact.completedTaskIds=structuredClone(result.completedTaskIds||[]);if(result.action!==undefined)compact.action=result.action;}
    for (const field of ['task', 'event', 'movedTask']) {
        const item = result[field];
        if (item) compact[field] = Object.fromEntries(['id', 'title', 'date', 'startTime', 'endTime', 'completed', 'archived', 'day', 'start', 'end', 'category', 'allDay', 'transparent', 'startDate', 'endDate', 'estimatedMinutes', 'lastScheduledMinutes', 'reminderMinutes'].filter(key => item[key] !== undefined).map(key => [key, item[key]]));
    }
    if (result.board) compact.board = typeof result.board === 'string' ? result.board : { id: result.board.id, title: result.board.title, archived: result.board.archived ?? false };
    if (result.section) compact.section = typeof result.section === 'string' ? result.section : { id: result.section.id, title: result.section.title, archived: result.section.archived ?? false };
    if (result.originalTitle) compact.originalTitle = result.originalTitle;
    if (result.boardCreated !== undefined) compact.boardCreated = result.boardCreated;
    if (result.sectionCreated !== undefined) compact.sectionCreated = result.sectionCreated;
    if (result.archiveChanged !== undefined) compact.archiveChanged = result.archiveChanged;
    if (result.affectedCount !== undefined) compact.affectedCount = result.affectedCount;
    if (result.remainingConflicts !== undefined) compact.remainingConflicts = result.remainingConflicts;
    return compact;
}

export async function getConfirmedAiAction(planId, uid, action, operationId) {
    const snapshot = await getDoc(doc(db, 'study_plans', planId));
    if (!snapshot.exists()) return null;
    const data = ownedPlan(snapshot, uid);
    const receipt = (data.aiActionReceipts || []).find(item => item.id === operationId);
    if (!receipt) return null;
    if (receipt.fingerprint !== stableStringify(action)) throw new Error('This operation ID already belongs to a different action.');
    return structuredClone(receipt.result);
}

export async function persistAiPlanAction(planId, uid, action, operationId, createdAt, apply, options={}) {
    const ref = doc(db, 'study_plans', planId);
    const fingerprint = stableStringify(action);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const data = ownedPlan(snapshot, uid);
        const receipts = Array.isArray(data.aiActionReceipts) ? data.aiActionReceipts : [];
        const existing = receipts.find(receipt => receipt.id === operationId);
        if (existing) {
            if (existing.fingerprint !== fingerprint && (typeof options.legacyFingerprint !== 'string' || existing.fingerprint !== options.legacyFingerprint)) throw new Error('This operation ID already belongs to a different action.');
            return structuredClone(existing.result);
        }
        // Never replay an evicted receipt: its save may already have succeeded.
        if (createdAt <= (data.aiActionReceiptFloor || 0)) throw new Error('This retry is too old to reconcile safely. Check the planner before requesting a new change.');
        if(options.nativeEventTimezone){const userSnapshot=await transaction.get(doc(db,'users',uid));assertCalendarImportTimezone(options.nativeEventTimezone,userSnapshot.data()?.settings?.profile?.timezone);}
        if(options.planningOptions?.availabilitySource==='saved'){const userSnapshot=await transaction.get(doc(db,'users',uid));assertSavedAvailability(options.planningOptions,userSnapshot.exists()?userSnapshot.data():{});}
        if(options.undoSourceOperationId){const source=planningUndoSource(data,options.undoSourceOperationId),userSnapshot=await transaction.get(doc(db,'users',uid)),timezone=userSnapshot.data()?.settings?.profile?.timezone||options.undoTimezone;if(timezone!==source.result.planningUndo.timezone||options.undoTimezone!==timezone)throw Error('Your timezone changed. Review the previous placements manually.');}
        if(options.repairUndoSource){const source=receipts.find(receipt=>receipt.id===options.repairUndoSource),userSnapshot=await transaction.get(doc(db,'users',uid)),timezone=userSnapshot.data()?.settings?.profile?.timezone||options.repairUndoTimezone;if(!source?.result?.calendarRepairUndo||options.repairUndoTimezone!==timezone||source.result.calendarRepairUndo.timezone!==timezone)throw Error('Your timezone changed or this repair Undo is unavailable.');}
        if(options.findTimeOptions){const userSnapshot=await transaction.get(doc(db,'users',uid));assertFindTimeSettings(options.findTimeOptions,userSnapshot.exists()?userSnapshot.data():{});}
        if(options.scheduleAvailability){const userSnapshot=await transaction.get(doc(db,'users',uid));assertScheduleAvailability(options.scheduleAvailability,userSnapshot.exists()?userSnapshot.data():{});}
        let allowCompleted=false;
        if(options.manualScheduling){const userSnapshot=await transaction.get(doc(db,'users',uid));allowCompleted=userSnapshot.data()?.settings?.planning?.rescheduleCompleted===true;}
        const next = planState(data);
        const result = receiptResult(apply({ data: next,receipts,allowCompleted }));
        if(action.type!=='task_list'&&!action.type.startsWith('plan_')&&!result.nativeEventUndo&&!result.nativeEventUndoUnavailable){
            const changes=plannerChanges(planState(data),next);
            if(changes.length&&changes.length<=250&&JSON.stringify(changes).length<=16384)result.plannerUndo=changes;
            else if(changes.length)result.plannerUndoUnavailable=true;
        }
        if(options.manualScheduling)assertCompletedScheduleChanges(planState(data),next,allowCompleted);
        if(result.type==='planning_undo'&&result.undoneOperationId!==options.undoSourceOperationId)throw Error('A saved planning receipt is required for Undo.');
        if(options.calendarTimezone||(next.calendarSources||[]).length){const userSnapshot=await transaction.get(doc(db,'users',uid)),timezone=userSnapshot.data()?.settings?.profile?.timezone;assertCalendarImportTimezone(options.calendarTimezone,timezone);assertCalendarTimezones(planState(data),next,timezone);}
        validateAssignmentOrderChanges(planState(data),next);
        const history=['native_event_undo','calendar_repair_undo','planning_undo','undo_create_task','schedule_undo','action_undo'].includes(result.type)?receipts.map(receipt=>receipt.id===result.undoneOperationId?{...receipt,[result.type==='native_event_undo'?'nativeEventUndoUsedBy':result.type==='calendar_repair_undo'?'calendarRepairUndoUsedBy':result.type==='planning_undo'?'planningUndoUsedBy':result.type==='schedule_undo'?'scheduleUndoUsedBy':result.type==='action_undo'?'plannerUndoUsedBy':'creationUndoUsedBy']:operationId}:receipt):receipts;
        const updated = [...history, { id: operationId, createdAt, fingerprint, result }];
        const removed = updated.slice(0, Math.max(0, updated.length - 100));
        const retained=updated.slice(-100);
        // Batch results stay small; bound the whole history as well as its count.
        while(retained.length>1&&JSON.stringify(retained).length>65536)removed.push(retained.shift());
        if(JSON.stringify(retained).length>65536)throw new Error('This operation receipt is too large to save safely.');
        transaction.set(ref, {
            ...(!snapshot.exists() ? data : {}),
            ...next,
            aiActionReceipts: retained,
            aiActionReceiptFloor: Math.max(data.aiActionReceiptFloor || 0, ...removed.map(receipt => receipt.createdAt))
        }, { merge: true });
        return result;
    });
}

export async function loadActionUndoPreview(planId,uid){
 const snapshot=await getDoc(doc(db,'study_plans',planId)),data=ownedPlan(snapshot,uid);
 const source=[...(data.aiActionReceipts||[])].reverse().find(receipt=>receipt.result?.plannerUndo&&!receipt.plannerUndoUsedBy||['create_schedule_event','update_schedule_event','delete_schedule_event'].includes(receipt.result?.type)&&receipt.result.nativeEventUndo&&!receipt.nativeEventUndoUsedBy);
 if(!source)throw Error('There is no supported AI change to undo. Deleted tasks and boards can also be restored from Archive.');
 const before=planState(data);
 if(source.result.nativeEventUndo){
  const userSnapshot=await getDoc(doc(db,'users',uid)),record=source.result.nativeEventUndo,timezone=userSnapshot.data()?.settings?.profile?.timezone||record.timezone,preview=buildNativeEventUndo(before,source.id,record,timezone),applied=applyNativeEventUndo(before,record,preview.command,preview.expected);
  return {command:preview.command,expected:preview.expected,rows:plannerChangeRows(before,applied.next),eventSummary:{kind:'native-event',title:'Undo '+String((record.before||record.after).title),timezone,range:preview.range,before:preview.beforeEvent,event:preview.afterEvent,inactiveExceptions:preview.inactiveExceptions,reactivatedExceptions:preview.reactivatedExceptions,...(record.occurrenceDate?{occurrenceDate:record.occurrenceDate,occurrenceOperation:'undo'}:{}),...aiEventConflictSummary(preview.conflicts)}};
 }
 const after=undoPlannerChanges(before,source.result.plannerUndo);
 return {command:{type:'action_undo',sourceOperationId:source.id},expected:{sourceOperationId:source.id},rows:plannerChangeRows(before,after)};
}
