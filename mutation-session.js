export function createMutationSession({getIdentity,commit,storage,uuid=()=>globalThis.crypto.randomUUID(),now=Date.now,onChange=()=>{}}={}){
 if(!storage)try{storage=globalThis.localStorage}catch{}
 const listeners=new Set();
 let actor=null,generation=0,busy=false,pending=null,message='';
 const identity=()=>{const id=getIdentity?.();return id?.ownerId&&id.planId?{ownerId:id.ownerId,planId:id.planId}:null;};
 const scope=id=>id?JSON.stringify([id.ownerId,id.planId]):null,key=id=>'kairos-mutation:'+scope(id);
 const valid=(r,id)=>r?.version===1&&r.identity?.ownerId===id?.ownerId&&r.identity?.planId===id?.planId&&typeof r.identity.operationId==='string'&&r.identity.operationId.startsWith('mutation-')&&Number.isFinite(r.identity.createdAt)&&r.identity.createdAt>0&&r.command&&typeof r.command.type==='string'&&r.expected&&typeof r.expected==='object';
 const read=id=>{try{const r=JSON.parse(storage?.getItem(key(id))||'null');return valid(r,id)?r:null}catch{return null}};
 const state=()=>({busy,pending:!!pending,message,identity:actor});
 const emit=()=>{onChange(state());for(const listener of listeners)listener(state());};
 function sync(){const id=identity();if(scope(id)!==scope(actor)){actor=id;generation++;busy=false;pending=id?read(id):null;message=pending?'A previous save is unconfirmed. Retry checks the same operation.':'';}emit();}
 async function save(){
  if(busy||!pending||!actor)return false;
  const ticket=generation,id={...actor},attempt=structuredClone(pending);busy=true;message='Saving…';emit();
  try{
   const result=await commit(attempt.command,attempt.expected,attempt.identity);
   if(ticket!==generation||scope(identity())!==scope(id))return false;
   if(read(id)?.identity.operationId===attempt.identity.operationId)storage.removeItem(key(id));
   pending=read(id);message=pending?'Another save needs review. Retry to check its status.':'Saved.';return result??true;
  }catch(error){if(ticket===generation&&scope(identity())===scope(id))message='Could not confirm this save. Retry checks the same operation. '+(error.message||'');return false;}
  finally{if(ticket===generation&&scope(identity())===scope(id)){busy=false;emit();}}
 }
 async function run(command,expected={}){
  sync();if(busy||pending||!actor)return false;
  const record={version:1,command:structuredClone(command),expected:structuredClone(expected),identity:{...actor,operationId:'mutation-'+uuid(),createdAt:now()}};
  try{
   const existing=read(actor);if(existing){pending=existing;message='Resolve the previous save before making another change.';emit();return false;}
   if(!storage)throw Error('Unavailable');storage.setItem(key(actor),JSON.stringify(record));pending=record;
  }catch{message='Could not retain recovery data. Nothing was submitted.';emit();return false;}
  return save();
 }
 async function retry(){sync();if(!pending&&actor)pending=read(actor);return save();}
 function discard(){sync();if(busy||!pending)return false;try{if(read(actor)?.identity.operationId===pending.identity.operationId)storage.removeItem(key(actor));pending=read(actor);message='Recovery cleared. Saved work was not changed.';emit();return true}catch{message='Could not clear recovery.';emit();return false;}}
 sync();return {run,retry,sync,state,discard,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},dispose(){generation++;busy=false;listeners.clear();onChange=()=>{};}};
}

