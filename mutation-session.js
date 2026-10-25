import {stableStringify} from './plan-merge.js';

export function createMutationSession({getIdentity,commit,storage,uuid=()=>globalThis.crypto.randomUUID(),now=Date.now,onChange=()=>{},onResolve=()=>{}}={}){
 if(!storage)try{storage=globalThis.localStorage}catch{}
 const listeners=new Set();
 let actor=null,generation=0,busy=false,pending=null,message='',status='idle',disposed=false;
 const identity=()=>{const id=getIdentity?.();return id?.ownerId&&id.planId?{ownerId:id.ownerId,planId:id.planId}:null;};
 const scope=id=>id?JSON.stringify([id.ownerId,id.planId]):null,key=id=>'kairos-mutation:'+scope(id);
 const sameIdentity=(a,b)=>!!a&&!!b&&scope(a)===scope(b)&&a.operationId===b.operationId&&a.createdAt===b.createdAt;
 const validIdentity=(r,id)=>r?.ownerId===id?.ownerId&&r?.planId===id?.planId&&typeof r?.operationId==='string'&&r.operationId.length>0&&r.operationId.length<=160&&Number.isFinite(r.createdAt)&&r.createdAt>0;
 const valid=(r,id)=>r?.version===1&&validIdentity(r.identity,id)&&r.command&&typeof r.command.type==='string'&&r.expected&&typeof r.expected==='object'&&!Array.isArray(r.expected);
 function read(id){
  if(!id)return null;
  if(!storage)throw Error('Could not access recovery data. Nothing was submitted.');
  let raw;try{raw=storage.getItem(key(id))}catch{throw Error('Could not access recovery data. Nothing was submitted.');}
  if(!raw)return null;
  let record;try{record=JSON.parse(raw)}catch{}
  if(!valid(record,id))throw Error('Invalid recovery data. Review this planner before clearing browser recovery data.');
  return record;
 }
 const sameRecord=(a,b)=>sameIdentity(a?.identity,b?.identity)&&stableStringify({command:a.command,expected:a.expected})===stableStringify({command:b.command,expected:b.expected});
 const state=()=>({busy,pending:!!pending,message,status,identity:actor&&{...actor},pendingIdentity:pending&&{...pending.identity}});
 const emit=()=>{if(disposed)return;onChange(state());for(const listener of listeners)listener(state());};
 function resolved(record,value){try{onResolve(structuredClone(record.identity),value)}catch(error){console.warn('[Kairos] Recovery view update failed.',error)}}
 function sync(){
  if(disposed)return;
  const id=identity(),changed=scope(id)!==scope(actor);
  if(changed){actor=id;generation++;busy=false;pending=null;message='';status='idle';}
  try{
   const stored=id?read(id):null;
   if(!sameRecord(stored,pending)&&!(stored===null&&pending===null)){
    pending=stored;status=pending?.status==='conflict'?'conflict':pending?'unconfirmed':'idle';
    message=pending?'A previous save is unconfirmed. Retry checks the same operation.':'';
   }
  }catch(error){status='unconfirmed';message=error.message;}
  emit();
 }
 async function save(){
  if(disposed||busy||!pending||!actor)throw Error('Resolve the pending save before making another change.');
  const ticket=generation,id={...actor},attempt=structuredClone(pending);busy=true;message='Saving.';status='pending';emit();
  const current=()=>!disposed&&ticket===generation&&scope(identity())===scope(id);
  try{
   const result=await commit(attempt.command,attempt.expected,attempt.identity);
   if(!current())throw Error('The signed-in account or planner changed.');
   // Compare the whole payload too: another tab may have replaced this record.
   if(sameRecord(read(id),attempt))storage.removeItem(key(id));
   pending=read(id);resolved(attempt,'saved');status=pending?'unconfirmed':'saved';
   message=pending?'Another save needs review. Retry to check its status.':'Saved.';return result??true;
  }catch(error){
   if(current()){
    const conflict=/changed|conflict|invalid|no longer|too old|expired|unavailable or already|cannot|not allowed|another account/i.test(error.message||'');
    status=conflict?'conflict':'unconfirmed';
    message=(conflict?'This save conflicts with the planner. Your edits are retained. Review or clear recovery. ':'Could not confirm this save. Retry checks the same operation. ')+(error.message||'');
    try{const stored=read(id);if(sameRecord(stored,attempt)){pending={...attempt,status};storage.setItem(key(id),JSON.stringify(pending))}else pending=stored;}catch{}
   }
   throw error;
  }finally{if(current()){busy=false;emit();}}
 }
 async function submit(command,expected={},callerIdentity){
  if(disposed)throw Error('The save session is closed.');
  sync();
  if(!actor)throw Error('The signed-in account or planner changed.');
  const operationIdentity=callerIdentity||{...actor,operationId:'mutation-'+uuid(),createdAt:now()};
  if(!validIdentity(operationIdentity,actor))throw Error('Invalid operation identity or the signed-in account or planner changed.');
  if(busy)throw Error('Resolve the pending save before making another change.');
  const record={version:1,command:structuredClone(command),expected:structuredClone(expected),identity:structuredClone(operationIdentity)};
  if(!valid(record,actor))throw Error('Invalid save command or expected fields.');
  try{
   pending=read(actor);
   if(pending){
    if(!sameIdentity(pending.identity,record.identity))throw Error('Resolve the previous save before making another change.');
    if(!sameRecord(pending,record))throw Error('This operation identity has a different payload. Retry the retained save or clear recovery.');
   }else{
    storage.setItem(key(actor),JSON.stringify(record));
    // Verify retention before any network request, including unusual storage implementations.
    if(!sameRecord(read(actor),record))throw Error('Could not retain recovery data. Nothing was submitted.');
    pending=record;
   }
  }catch(error){
   if(!/previous|payload|Invalid recovery|access recovery|retain recovery/i.test(error.message||''))error=Error('Could not retain recovery data. Nothing was submitted.');
   message=error.message;emit();throw error;
  }
  return save();
 }
 async function run(command,expected={}){try{return await submit(command,expected)}catch{return false}}
 async function retry(){sync();try{if(!pending)return false;return await save()}catch{return false}}
 function discard(expectedIdentity){
  sync();if(disposed||busy||!pending||expectedIdentity&&!sameIdentity(expectedIdentity,pending.identity))return false;
  const attempt=structuredClone(pending);
  try{
   if(!sameRecord(read(actor),attempt))return false;
   storage.removeItem(key(actor));pending=read(actor);resolved(attempt,'discarded');status=pending?'unconfirmed':'idle';message='Recovery cleared. Your draft is still available. Saved work was not changed.';emit();return true;
  }catch{message='Could not clear recovery.';emit();return false;}
 }
 sync();return {submit,run,retry,sync,state,discard,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},dispose(){disposed=true;generation++;busy=false;listeners.clear();onChange=()=>{};onResolve=()=>{};}};
}
