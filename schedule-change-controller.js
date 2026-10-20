import {buildScheduleChange} from './schedule-change-model.js?v=1';

// Owns only feedback and operation identities; the shared command store owns data.
export function createScheduleChangeController({document=globalThis.document,getScope,getState,ensurePlan,commit,isEditorBlocked=()=>false,now=Date.now,idFactory=()=>globalThis.crypto.randomUUID()}){
 let pending=null,undoSource=null,feedback=null,feedbackScope=null,timer=null;
 const same=(a,b)=>a?.ownerId===b?.ownerId&&a?.planId===b?.planId;
 function clearFeedback(){clearTimeout(timer);timer=null;feedback?.remove();feedback=null;feedbackScope=null}
 function render(message,actions=[]){
  clearFeedback();feedbackScope={...getScope()};feedback=document.createElement('div');feedback.className='ks-toast ks-schedule-feedback is-visible';
  const text=document.createElement('span');text.setAttribute('role','status');text.textContent=message;feedback.appendChild(text);
  for(const {label,key,run} of actions){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('data-schedule-'+key,'');button.addEventListener('click',()=>void run());feedback.appendChild(button)}
  document.body.appendChild(feedback);
 }
 function sync(){
  const current=getScope();
  if(pending&&!same(current,pending.scope)&&!(pending.initializing&&current.ownerId===pending.scope.ownerId&&current.planId===pending.expectedPlanId))pending=null;
  if(undoSource&&!same(current,undoSource.scope))undoSource=null;
  if(feedbackScope&&!same(current,feedbackScope))clearFeedback();
 }
 const identity=scope=>({...scope,operationId:idFactory(),createdAt:now()});
 function showSaved(){
  if(!undoSource||now()>=undoSource.expiresAt){undoSource=null;render('Schedule saved.');timer=setTimeout(clearFeedback,3200);return}
  render(undoSource.occurrence?'Occurrence saved.':'Schedule saved.',[{label:'Undo',key:'undo',run:undo}]);
  timer=setTimeout(()=>{if(undoSource&&now()>=undoSource.expiresAt){undoSource=null;render('Schedule saved.');timer=setTimeout(clearFeedback,3200)}},Math.max(1,undoSource.expiresAt-now()));
 }
 async function run(){
  sync();const work=pending;if(!work||work.busy)return false;work.busy=true;
  render(work.undo?'Undoing schedule change…':'Saving schedule…');
  try{
   if(!work.identity){
    if(work.needsInitialization){
     work.initializing=true;
     const plan=await ensurePlan();
     if(pending!==work||getScope().ownerId!==work.scope.ownerId||plan!==work.expectedPlanId||getScope().planId!==plan){sync();return false}
     work.scope={...getScope()};work.initializing=false;
     // Initialization can await a cloud read. Never adopt a newer task as the
     // baseline for an older gesture while the first planner is being created.
     let latest;try{latest=buildScheduleChange(getState(),work.command.target,work.command.changes)}catch{pending=null;render('The task changed while the planner opened. Review its current time.');return false}
     if(JSON.stringify(latest.expected)!==JSON.stringify(work.expected)){pending=null;render('The task changed while the planner opened. Review its current time.');return false}
    }
    work.identity=identity(work.scope);
   }
   const result=await commit(work.command,work.expected,work.identity);
   if(pending!==work||!same(getScope(),work.scope)){sync();return false}
   pending=null;
   if(work.undo){undoSource=null;render('Previous schedule restored.');timer=setTimeout(clearFeedback,3200)}
   else{undoSource=result?.scheduleUndo?{scope:{...work.scope},sourceOperationId:work.identity.operationId,expiresAt:now()+10000,occurrence:!!work.command.target.occurrenceDate}:null;showSaved()}
   return true;
  }catch(error){
   if(pending===work&&work.initializing&&getScope().ownerId===work.scope.ownerId&&getScope().planId===work.expectedPlanId){work.scope={...getScope()};work.initializing=false;}
   if(pending!==work||!same(getScope(),work.scope)){sync();return false}
   render("Couldn't confirm the change. Retry to check its saved result.",[{label:'Retry',key:'retry',run},{label:'Dismiss',key:'dismiss',run:()=>{if(pending===work){pending=null;undoSource=null;clearFeedback()}}}]);
   return false;
  }finally{work.busy=false}
 }
 async function save(target,changes){
  sync();if(pending||!getScope().ownerId)return false;
  let request;try{request=buildScheduleChange(getState(),target,changes)}catch(error){render(error.message||'Review the current task before changing its time.');return false}
  const scope={...getScope()};undoSource=null;pending={...request,scope,expectedPlanId:scope.planId||'plan-'+scope.ownerId,identity:null,busy:false,initializing:false,needsInitialization:!scope.planId};return run();
 }
 async function undo(){
  sync();if(pending||!undoSource)return false;
  if(now()>=undoSource.expiresAt){undoSource=null;showSaved();return false}
  if(isEditorBlocked()){render('Save or discard your task edits before using Undo.',[{label:'Undo',key:'undo',run:undo}]);return false}
  const source=undoSource;undoSource=null;
  pending={scope:source.scope,identity:identity(source.scope),command:{type:'schedule_undo',sourceOperationId:source.sourceOperationId,expiresAt:source.expiresAt},expected:{sourceOperationId:source.sourceOperationId},undo:true,busy:false};return run();
 }
 return {save,undo,sync,isBlocked:()=>{sync();return !!pending}};
}
