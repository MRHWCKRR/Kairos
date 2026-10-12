const prefix='kairos_ai_message_pending:';
export function createUsageOutbox({storage,getUser,write,makeId,clock=Date.now,schedule=setTimeout}) {
  const memory=new Map(),running=new Map(),timers=new Map();
  function restore(uid) {
    try {
      for(let index=0;index<storage.length;index++) {
        const key=storage.key(index);if(!key?.startsWith(prefix+uid+':'))continue;
        try {
          const event=JSON.parse(storage.getItem(key));
          if(event.uid===uid && typeof event.id==='string' && Number.isFinite(event.time) && event.time<=clock())memory.set(key,event);
        } catch {}
      }
    } catch {}
  }
  function flush(uid) {
    if(running.has(uid))return running.get(uid);
    if(getUser()?.uid!==uid || !getUser().emailVerified)return Promise.resolve();
    restore(uid);
    const task=(async()=>{
      for(const [key,event] of [...memory].filter(([,e])=>e.uid===uid).sort((a,b)=>a[1].time-b[1].time)) {
        if(getUser()?.uid!==uid || !getUser().emailVerified)break;
        try {
          await write(uid,event.baseline,event);
          // Auth changes during a transaction leave the event for next sign-in.
          if(getUser()?.uid!==uid || !getUser().emailVerified)break;
          memory.delete(key);try {storage.removeItem(key);}catch{}
        } catch {
          if(!timers.has(uid)) {
            const timer=schedule(()=>{timers.delete(uid);void flush(uid);},30000);timer?.unref?.();timers.set(uid,timer);
          }
          break;
        }
      }
    })().finally(()=>running.delete(uid));
    running.set(uid,task);return task;
  }
  function record(uid,baseline,id=makeId()) {
    const event={uid,baseline,id,time:clock()},key=prefix+uid+':'+event.id;
    memory.set(key,event);try {storage.setItem(key,JSON.stringify(event));}catch{}
    // A prior drain may already have captured its batch. Drain new arrivals
    // after it completes, preserving every concurrently accepted send.
    return flush(uid).then(()=>{if([...memory.values()].some(e=>e.uid===uid) && !timers.has(uid))return flush(uid);});
  }
  return {record,flush};
}
