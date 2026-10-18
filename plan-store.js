import { db } from './firebase.js';
import { doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { mergePlanEdits, planState, stableStringify } from './plan-merge.js';
import { applyTaskListCommand, taskListFingerprint } from './task-list-model.js?v=3';

export async function persistTaskListCommand(planId, uid, command, expected, operationId, createdAt) {
    if(typeof operationId!=='string'||!operationId||operationId.length>160||!Number.isFinite(createdAt)||createdAt<=0)throw new Error('Invalid operation identity.');
    const commandHash=await taskListFingerprint(command,expected);
    return persistAiPlanAction(planId,uid,{type:'task_list',commandHash},operationId,createdAt,plan=>{
        const applied=applyTaskListCommand(plan.data,command,expected);
        Object.assign(plan.data,applied.next);
        return applied.result;
    },{legacyFingerprint:stableStringify({command,expected})});
}

function ownedPlan(snapshot, uid) {
    if (!snapshot.exists()) return { userID: uid, boards: [], dayInsights: {}, scheduleEvents: [], createdAt: serverTimestamp() };
    const data = snapshot.data();
    if (data.userID !== uid) throw new Error('This planner belongs to another account.');
    return data;
}

export async function savePlannerEdits(planId, uid, base, local) {
    const ref = doc(db, 'study_plans', planId);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const data = ownedPlan(snapshot, uid);
        const merged = mergePlanEdits(planState(base), planState(local), planState(data));
        transaction.set(ref, { ...(!snapshot.exists() ? data : {}), ...merged }, { merge: true });
        return merged;
    });
}

function receiptResult(result) {
    const compact = { type: result.type };
    if(Array.isArray(result.taskIds)){compact.taskIds=structuredClone(result.taskIds);compact.completedTaskIds=structuredClone(result.completedTaskIds||[]);compact.action=result.action;}
    for (const field of ['task', 'event', 'movedTask']) {
        const item = result[field];
        if (item) compact[field] = Object.fromEntries(['id', 'title', 'date', 'startTime', 'endTime', 'completed', 'archived', 'day', 'start', 'end', 'estimatedMinutes', 'lastScheduledMinutes', 'reminderMinutes'].filter(key => item[key] !== undefined).map(key => [key, item[key]]));
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
        const next = planState(data);
        const result = receiptResult(apply({ data: next }));
        const updated = [...receipts, { id: operationId, createdAt, fingerprint, result }];
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
