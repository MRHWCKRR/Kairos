// Read existing save owners; this view never queues or automatically replays work.
export function plannerSyncSources({mutations,settings,persistence,navigate,reviewPlanner}){
 return [
  {state:()=>{const s=mutations.state();return {ownerId:s.pendingIdentity?.ownerId||s.identity?.ownerId,busy:s.busy,pending:s.pending,retained:true,conflict:s.status==='conflict',status:s.status}},subscribe:fn=>mutations.subscribe(fn),review:()=>navigate('home-page')},
  {state:()=>{const s=settings.state();return {ownerId:s.ownerId,busy:!!s.saving,pending:!!s.pending,retained:s.pending?.persisted===true,status:s.status}},subscribe:fn=>settings.subscribe(fn),review:()=>navigate('settings-page')},
  {state:()=>persistence.state(),subscribe:fn=>persistence.subscribe(fn),review:reviewPlanner||(()=>persistence.retry()),retry:!reviewPlanner,priority:true}
 ];
}

export function mountSyncStatus({root,window=globalThis.window,getOwnerId,sources}){
 if(!root)return {sync(){},dispose(){}};
 const document=root.ownerDocument,label=document.createElement('span'),button=document.createElement('button');
 label.setAttribute('role','status');label.setAttribute('aria-live','polite');button.type='button';button.hidden=true;
 root.replaceChildren(label,button);root.title='Submitted planner and settings saves';let action=null,disposed=false;
 const states=()=>{const owner=getOwnerId();return owner?sources.map(source=>({source,...source.state()})).filter(s=>s.ownerId===owner):[]};
 function sync(){
  if(disposed)return;
  const current=states(),offline=window.navigator?.onLine===false;
  const pending=current.filter(s=>s.pending||s.busy),review=pending.find(s=>s.source.priority)||pending.find(s=>s.retained===false)||pending.find(s=>s.conflict)||pending[0];
  let text='';action=null;button.hidden=true;button.textContent='';
  if(current.length){
   if(offline)text=pending.some(s=>s.retained===false)?'Offline — keep this tab open':pending.length?'Offline · changes pending':'Offline';
   else if(pending.some(s=>s.busy))text='Saving…';
   else if(pending.some(s=>s.conflict))text='Changes need review';
   else if(pending.length)text=pending.some(s=>s.retained===false)?'Not synced — keep this tab open':'Not synced';
   else if(current.some(s=>s.status==='saved'))text='Saved';
   if(review&&!pending.some(s=>s.busy)&&(!offline||!review.source.retry)){
    action=review.source.review;button.textContent=review.source.retry?'Retry save':'Review';button.hidden=!action;
   }
  }
  root.hidden=!text;label.textContent=text;
 }
 function activate(){if(!disposed)void action?.();}
 function leaving(event){if(states().some(s=>s.pending||s.busy)){event.preventDefault();event.returnValue='';}}
 function pagehide(event){if(!event.persisted)dispose();}
 function dispose(){if(disposed)return;disposed=true;for(const unsubscribe of subscriptions)unsubscribe();button.removeEventListener('click',activate);window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.removeEventListener('beforeunload',leaving);window.removeEventListener('pagehide',pagehide);}
 const subscriptions=sources.map(source=>source.subscribe(sync));
 button.addEventListener('click',activate);window.addEventListener('online',sync);window.addEventListener('offline',sync);window.addEventListener('beforeunload',leaving);window.addEventListener('pagehide',pagehide);sync();
 return {sync,dispose};
}
