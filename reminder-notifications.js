import { db } from './firebase.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { dueTaskReminders,dueBedtimeReminders } from './task-reminders.js?v=2';
import { mergePlanEdits, planState } from './plan-merge.js';

export function escapeNotificationText(value) {
    return String(value??'').replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
}

export async function saveNotificationEdits(uid, base, local) {
    const ref=doc(db,'users',uid);
    return runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(ref);
        const remote=snapshot.exists()?(snapshot.data().notifications||[]):[];
        const merged=mergePlanEdits(base,local,remote).slice(0,50);
        transaction.set(ref,{notifications:merged},{merge:true});
        return merged;
    });
}

export async function deliverTaskReminder(planId,uid,candidate,options={}) {
    return deliverReminder('task',planId,uid,candidate,options);
}

export async function deliverBedtimeReminder(planId,uid,candidate,options={}) {
    return deliverReminder('bedtime',planId,uid,candidate,options);
}

async function deliverReminder(kind,planId,uid,candidate,options) {
    const planRef=doc(db,'study_plans',planId),userRef=doc(db,'users',uid);
    return runTransaction(db,async transaction=>{
        const [planSnapshot,userSnapshot]=await Promise.all([transaction.get(planRef),transaction.get(userRef)]);
        if(!planSnapshot.exists()||!userSnapshot.exists())return {delivered:false};
        const plan=planSnapshot.data(),user=userSnapshot.data();
        if(plan.userID!==uid)throw new Error('This planner belongs to another account.');
        if(user.settings?.notifications?.enabled===false)return {delivered:false};
        if(kind==='bedtime'&&user.settings?.notifications?.bedtimeReminders===false)return {delivered:false};
        const now=options.now??Date.now(),zone=user.settings?.profile?.timezone||options.timeZone||'UTC';
        const state=planState(plan),candidates=kind==='bedtime'?dueBedtimeReminders(state.scheduleEvents,now,zone):dueTaskReminders(state.boards,now,zone);
        const fresh=candidates.find(item=>item.id===candidate.id);
        if(!fresh)return {delivered:false};
        // Keep every active delivery window, including bursts above 200 tasks.
        // Expired windows cannot be delivered again, so their receipts are safe to drop.
        const receipts=(Array.isArray(user.taskReminderReceipts)?user.taskReminderReceipts:[])
            .filter(item=>(item.startsAt??item.dueAt+10080*60000)>now);
        // Receipts written before planner scoping continue to suppress replay.
        if(receipts.some(item=>item.id===fresh.id&&(!item.planId||item.planId===planId)))return {delivered:false};
        const title=kind==='bedtime'?'Bedtime coming up':'Task reminder',message='"'+fresh.title+'" starts at '+fresh.startTime+' on '+fresh.date+'.'+(kind==='bedtime'?' Start winding down.':'');
        const notifications=[{id:fresh.id+':plan:'+encodeURIComponent(planId),title,message,time:now,read:false},...(user.notifications||[])].slice(0,50);
        const updated=[...receipts,{id:fresh.id,planId,dueAt:fresh.dueAt,startsAt:fresh.startsAt}];
        transaction.set(userRef,{notifications,taskReminderReceipts:updated},{merge:true});
        return {delivered:true,title,message};
    });
}
