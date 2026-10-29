import vm from 'node:vm';
import {createPlannerPersistence} from '../../app-planner-persistence.js';
/** Bind real persistence to legacy host fixtures without evaluating its source. */
export function attachPlannerPersistence(context) {
 context.createPlannerPersistence=createPlannerPersistence;
 vm.runInContext(`
 const plannerPersistence=createPlannerPersistence({
 writes:plannerWrites,getOwnerId:()=>auth.currentUser?.uid||null,getPlanId:()=>currentPlanDocId,
 getState:()=>({boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData}),
 setState:state=>{boardsData=state.boards;dayInsights=state.dayInsights;scheduleData=state.scheduleEvents;calendarSourcesData=state.calendarSources},
 setIdentity:(owner,id)=>{searchPlannerOwnerId=owner;currentPlanDocId=id},
 readPlans:async owner=>{const result=await getDocs(query(collection(db,'study_plans'),where('userID','==',owner)));return (result.docs||[]).map(item=>({docId:item.id,...item.data()}))},
 initialize:owner=>initializePlanner(owner),saveEdits:(...args)=>savePlannerEdits(...args),migrate:plan=>migrateToBoards(plan),normalizeBoards:boards=>normalizeArchiveFields(boards),
 onInvalidate:(...args)=>invalidateKairosContext(...args),onSaved:()=>{globalSearchController?.sync();taskCaptureController?.sync();window.__kairosScheduleWorkspace?.invalidate()},
 onReminders:()=>{void window.__kairosTaskReminders?.check()},onRender:()=>renderApp(),onLoadComplete:()=>markInitialLoadComplete(),onError:(phase,error)=>{if(phase==='save')showNotice('Your changes could not be synced. '+error.message)}
 });
 globalThis.updatePlanInFirestore=options=>plannerPersistence.save(options);
 globalThis.loadLatestPlanFromFirestore=user=>plannerPersistence.load(user);
 `,context);
}
