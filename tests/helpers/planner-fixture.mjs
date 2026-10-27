import {applyCalendarRepairUndo} from '../../calendar-repair.js';
import {assertCalendarTimezones,assertCalendarImportTimezone} from '../../calendar-policy.js';
import {applyAiTaskMutation} from '../../ai-task-commands.js';
import {plannerChanges,undoPlannerChanges,plannerChangeRows} from '../../planner-changes.js';
import {createPlannerBootstrap} from '../../planner-bootstrap.js';
import {assertFindTimeSettings} from '../../schedule-find-time-model.js';
import {planningUndoSource,planningUndoPreview,applyPlanningUndo} from '../../planning-undo.js';
import {savedPlanningPreferences,planningPreferencesText} from '../../planning-preferences.js';
import {assertScheduleAvailability} from '../../schedule-planning-availability.js';
import {savedWeeklyAvailability,assertSavedAvailability} from '../../weekly-availability.js';
import {planningConflicts,planningGapText,planningDailyLimitText} from '../../planning-slots.js';
import {validateAssignmentOrderChanges} from '../../assignment-order.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {mergePlanEdits,planState,stableStringify} from '../../plan-merge.js';
import {taskDurationMinutes} from '../../schedule-utils.js';
import {taskListFingerprint,applyTaskListCommand} from '../../task-list-model.js';
import {completedScheduleChanges,assertCompletedScheduleChanges} from '../../schedule-policy.js';
import {applyScheduleUndo} from '../../schedule-change-model.js';
import {previewAiPlanning,aiPlanningSummary,resolveAiPlanningTimezone} from '../../ai-planning.js';
import {applyPlanningCommand} from '../../planning-commands.js';

export async function plannerFixture(data, {failAfterCommit=false,retryTransaction=false,userData={},denyMissingReads=false}={}) {
  let stored=structuredClone(data), userStored=structuredClone(userData), writes=[], events=0, fail=failAfterCommit;
  const context=vm.createContext({applyCalendarRepairUndo,assertCalendarTimezones,assertCalendarImportTimezone,applyAiTaskMutation,plannerChanges,undoPlannerChanges,plannerChangeRows,assertFindTimeSettings,completedScheduleChanges,assertCompletedScheduleChanges,applyScheduleUndo,planningUndoSource,planningUndoPreview,applyPlanningUndo,savedPlanningPreferences,planningPreferencesText,assertScheduleAvailability,savedWeeklyAvailability,assertSavedAvailability,applyTaskListCommand,validateAssignmentOrderChanges,structuredClone,console,Date,Intl,previewAiPlanning,aiPlanningSummary,resolveAiPlanningTimezone,planningConflicts,planningGapText,planningDailyLimitText,applyPlanningCommand,mergePlanEdits,planState,stableStringify,taskDurationMinutes,taskListFingerprint,
    calendarSourcesData:[],globalSearchController:null,taskCaptureController:null,plannerMutations:null,aiUndoView:null,todayView:null,searchPlannerOwnerId:null,
    initializePlanner:createPlannerBootstrap({getUser:()=>context.auth.currentUser,projectId:'kairos-1a',getAppToken:async()=> 'test-app-check',fetchImpl:async(_url,options)=>{if(stored)return {ok:false,status:409,json:async()=>({error:{status:'ALREADY_EXISTS'}})};const fields=JSON.parse(options.body).fields;stored={userID:fields.userID.stringValue,boards:[],dayInsights:{},scheduleEvents:[]};return {ok:true,status:200};}}),auth:{currentUser:{uid:'one',emailVerified:true,getIdToken:async()=> 'test-id-token'}},db:{},collection:()=>({}),query:x=>x,where:()=>({}),doc:(...args)=>args,
    serverTimestamp:()=>({seconds:1}),getDoc:async ref=>({exists:()=>!!stored,data:()=>structuredClone(ref?.[1]==='users'?userStored:stored)}),
    getDocs:async()=>({docs:stored?[{id:'plan',data:()=>structuredClone(stored)}]:[]}),
    setDoc:async(_,next)=>{stored={...stored,...structuredClone(next)};writes.push(structuredClone(stored))},
    runTransaction:async(_,callback)=>{
      let pending;
      const tx={get:async ref=>{if(denyMissingReads&&!stored)throw Object.assign(Error('Missing or insufficient permissions'),{code:'permission-denied'});return {exists:()=>!!stored,data:()=>structuredClone(ref?.[1]==='users'?userStored:stored)}},
        set:(_,next)=>pending=structuredClone(next)};
      if(retryTransaction){await callback(tx);pending=undefined}
      const result=await callback(tx);
      if(pending){stored={...stored,...pending};writes.push(structuredClone(stored))}
      if(fail){fail=false;throw new Error('Network response lost')}
      return result;
    },
    window:{dispatchEvent(){events++}},CustomEvent:class{},invalidateKairosContext(){}});
  const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
  vm.runInContext(strip(await readFile(new URL('../../ai-action-schema.js',import.meta.url),'utf8')),context);
  let store='';
  try{store=await readFile(new URL('../../plan-store.js',import.meta.url),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  vm.runInContext(strip(store),context);
  vm.runInContext(strip(await readFile(new URL('../../ai-actions.js',import.meta.url),'utf8')),context);
  return {context,writes,data:()=>structuredClone(stored),setData:value=>stored=structuredClone(value),setFail:value=>fail=value,setUserData:value=>userStored=structuredClone(value),events:()=>events,
    execute:(action,options)=>context.executeKairosAction(action,options)};
}
