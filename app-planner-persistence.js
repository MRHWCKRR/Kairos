import {planState,mergePlanEdits,stableStringify} from './plan-merge.js?v=1';
import {createPlannerSaveRecovery} from './planner-save-recovery.js?v=1';

/** One owner for ordinary saves, their confirmed baseline and durable recovery. */
export function createPlannerPersistence({writes,getOwnerId,getPlanId,getState,setState,setIdentity,readPlans,initialize,saveEdits,migrate,normalizeBoards,storage,onInvalidate=()=>{},onSaved=()=>{},onReminders=()=>{},onRender=()=>{},onLoadComplete=()=>{},onError=()=>{}}){
 const recoveryStore=createPlannerSaveRecovery(storage),listeners=new Set();let record,serial=0;
 const same=(a,b)=>stableStringify(a)===stableStringify(b);
 function currentRecord(){
  const ownerId=getOwnerId();
  if(record?.ownerId!==ownerId){const changed=!!record,stored=recoveryStore.inspect(ownerId);record={ownerId,raw:stored.raw,pending:stored.record||null,retained:!!stored.record,count:0,action:false,live:false,bound:false,conflict:!!stored.error,blocked:!!stored.error,message:stored.error||'',saved:false};if(changed)for(const listener of listeners)listener(state());}
  return record;
 }
 const current=r=>currentRecord()===r&&getOwnerId()===r.ownerId;
 function state(){const r=currentRecord();return {ownerId:r.ownerId,busy:r.count>0||r.action,pending:!!r.pending||r.blocked,retained:r.retained,conflict:r.conflict,status:r.count||r.action?'saving':r.conflict?'conflict':r.pending||r.blocked?'unconfirmed':r.saved?'saved':'idle',message:r.message,canRetry:!!r.pending&&!r.blocked,canDiscard:!!r.pending||r.blocked};}
 function notify(r){if(current(r))for(const listener of listeners)listener(state());}
 function scope(r){const plan=getPlanId();return !!r.pending&&(plan===r.pending.planId||!plan&&r.pending.newPlan);}
 function retain(r,pending){
  r.pending=pending;r.saved=false;r.retained=false;
  try{r.raw=recoveryStore.stage(r.ownerId,pending,r.raw);r.retained=true;r.message='Changes are saved on this device. Retry to sync them.';return true;}
  catch(error){r.message=error.message||'Recovery storage is unavailable. Keep this tab open.';return false;}
 }
 function stageLive(r,options={}){
  const old=r.pending,planId=old?.planId||getPlanId()||'plan-'+r.ownerId;
  if(old?.options?.scheduleAvailability&&options.scheduleAvailability&&!same(old.options.scheduleAvailability,options.scheduleAvailability))throw Error('Resolve the pending planner save before applying a different Schedule preview.');
  return retain(r,{version:1,id:Date.now().toString(36)+'-'+(++serial),ownerId:r.ownerId,planId,newPlan:old?.newPlan??!getPlanId(),base:structuredClone(old?.base||writes.snapshot||planState({})),local:planState(getState()),options:{...old?.options,...options}});
 }
 function fail(r,error){if(!current(r))return;r.message=error.message||'Planner changes could not be synced.';r.conflict=/changed|conflict|duplicate|review|missing|no longer/i.test(r.message);notify(r);onError('save',error);}
 async function save(options={},internal=false){
  const r=currentRecord();if(!r.ownerId||r.blocked||r.pending&&!r.live&&!internal)return false;
  if(r.pending&&!scope(r)){r.conflict=true;r.blocked=true;r.message='The planner changed. Review the pending changes.';notify(r);return false;}
  writes.markEdit();r.live=true;
  try{if(!stageLive(r,options)){notify(r);return false;}}catch(error){fail(r,error);return false;}
  if((r.action||r.conflict)&&!internal){notify(r);return false;}
  r.count++;notify(r);
  try{return await writes.enqueue(async()=>{
   if(!current(r))throw Error('The signed-in account changed.');
   if(!r.pending)return true;
   if(!scope(r)||r.blocked)throw Error('The planner changed. Review the pending changes.');
   // Retain the actual live collections at the network boundary, including a
   // newer queued submission, without advancing the confirmed merge baseline.
   if(!stageLive(r))throw Error(r.message);
   const attempt=structuredClone(r.pending),expectedPlan=getPlanId();
   if(!expectedPlan){if(!attempt.newPlan)throw Error('The planner is no longer available.');await initialize(r.ownerId);}
   if(!current(r)||!scope(r))throw Error('The signed-in account or planner changed.');
   const saved=await saveEdits(attempt.planId,r.ownerId,attempt.base,attempt.local,{...attempt.options,requireExisting:true});
   if(!current(r)||!scope(r))throw Error('The signed-in account or planner changed.');
   const live=planState(getState()),rebased=mergePlanEdits(attempt.local,live,saved),remoteChanges=!same(rebased,live),before=writes.snapshot;
   if(same(rebased,saved)){recoveryStore.clear(r.ownerId,r.raw);r.raw=null;r.pending=null;r.retained=false;r.saved=true;r.message='Saved';}
   else retain(r,{...r.pending,base:planState(saved),local:rebased,newPlan:false});
   r.conflict=false;r.bound=true;setState(rebased);writes.snapshot=planState(saved);setIdentity(r.ownerId,attempt.planId);
   onInvalidate({ownerId:r.ownerId,planId:attempt.planId,before,after:saved});onSaved();if(remoteChanges)onRender();onReminders();return true;
  });}catch(error){fail(r,error);return false;}finally{r.count--;notify(r);}
 }
 function confirmedPlan(plans){
  plans.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));const latest=plans[0];if(!latest)return {id:null,data:planState({})};
  const migrated=migrate(latest);return {id:latest.docId,data:planState({boards:normalizeBoards(migrated||getState().boards),dayInsights:latest.dayInsights||{},scheduleEvents:Array.isArray(latest.scheduleEvents)?latest.scheduleEvents:[],calendarSources:Array.isArray(latest.calendarSources)?latest.calendarSources:[]})};
 }
 function publish(r,remote,local=remote.data){const before=writes.snapshot;setState(local);writes.snapshot=planState(remote.data);setIdentity(remote.id?r.ownerId:null,remote.id);onInvalidate({ownerId:r.ownerId,planId:remote.id,before,after:remote.data});onRender();onReminders();}
 function restore(r,remote){
  r.bound=true;
  if(r.blocked){publish(r,remote);return;}
  if(!r.pending){publish(r,remote);return;}
  const pending=r.pending;
  if(remote.id!==pending.planId&&!(pending.newPlan&&!remote.id)){r.conflict=true;r.blocked=true;r.message='The saved planner is missing or was replaced. Review the retained changes.';publish(r,remote);return;}
  r.live=true;
  try{
   const merged=mergePlanEdits(pending.base,pending.local,remote.data);
   if(same(merged,remote.data)){recoveryStore.clear(r.ownerId,r.raw);r.raw=null;r.pending=null;r.retained=false;r.saved=true;r.message='Saved';}
   else retain(r,{...pending,base:remote.data,local:merged,newPlan:!remote.id});
   r.conflict=false;publish(r,remote,merged);
  }catch(error){r.conflict=true;r.message='Saved planner changes conflict with these pending edits. Review them before retrying.';publish(r,remote,pending.local);}
 }
 async function load(user){
  const r=currentRecord();if(r.live&&r.pending)return;
  const ticket=writes.beginLoad();ticket.edit=await writes.idle();
  const active=()=>current(r)&&getOwnerId()===user.uid&&writes.isCurrentLoad(ticket)&&!(r.live&&r.pending);
  if(!active())return;
  try{const plans=await readPlans(user.uid);if(!active())return;restore(r,confirmedPlan(plans));}
  catch(error){if(!active())return;if(r.pending&&!r.blocked){r.live=true;r.bound=true;setState(structuredClone(r.pending.local));writes.snapshot=planState(r.pending.base);setIdentity(r.ownerId,r.pending.planId);r.message='Changes are saved on this device. Reconnect, then review and retry.';}onError('load',error);onRender();}
  finally{if(current(r)&&getOwnerId()===user.uid&&writes.isCurrentLoad(ticket)){notify(r);onLoadComplete();}}
 }
 async function retry(){
  const r=currentRecord();if(!r.pending||r.count||r.action||r.blocked)return false;
  if(!scope(r)){r.blocked=true;r.conflict=true;r.message='The planner changed. Review the retained changes.';notify(r);return false;}
  r.action=true;notify(r);
  try{
   const plans=await readPlans(r.ownerId);if(!current(r)||!scope(r))return false;
   restore(r,confirmedPlan(plans));if(r.blocked||r.conflict)return false;if(!r.pending)return true;
   return await save(r.pending.options,true);
  }catch(error){fail(r,error);return false;}finally{r.action=false;notify(r);}
 }
 async function discard(expectedId){
  const r=currentRecord();if(r.count||r.action||!r.pending&&!r.blocked||expectedId!==undefined&&(r.pending?.id??null)!==expectedId)return false;r.action=true;notify(r);
  const live=planState(getState());
  try{const plans=await readPlans(r.ownerId);if(!current(r)||!same(live,planState(getState())))return false;const remote=confirmedPlan(plans);recoveryStore.clear(r.ownerId,r.raw);r.raw=null;r.pending=null;r.retained=false;r.conflict=false;r.blocked=false;r.saved=false;r.live=false;r.message='Pending changes discarded.';publish(r,remote);return true;}
  catch(error){if(current(r))r.message='Could not load the saved planner. Pending changes were kept.';return false;}finally{r.action=false;notify(r);}
 }
 return {save,load,retry,discard,state,clear:owner=>recoveryStore.clear(owner),recovery:()=>structuredClone(currentRecord().pending),assertReady(){const r=currentRecord();if(r.pending||r.blocked)throw Error('Review the pending planner save before submitting another change.');},subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}};
}
