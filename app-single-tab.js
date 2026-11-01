// One cooperative workspace per origin/browser profile. Never steal a live lock:
// the other document may own drafts, pending writes or reminder delivery.
export function createWorkspaceTabGuard({locks=globalThis.navigator?.locks,onStart,onBlocked=()=>{},onError=()=>{},graceMs=400}={}){
 let status='idle',pending=null,release=null,disposed=false;
 function attempt(){return new Promise(resolve=>{
  const failed=error=>{if(!disposed){status='unavailable';onError('unavailable',error);}resolve('failed');};
  try{Promise.resolve(locks.request('kairos-workspace-v1',{mode:'exclusive',ifAvailable:true},async lock=>{
   if(disposed){resolve('failed');return;}
   if(!lock){resolve('busy');return;}
   const lifetime=new Promise(done=>{release=done;});status='starting';
   try{await onStart();if(!disposed){status='active';resolve('started');}else resolve('failed');}
   catch(error){if(!disposed){status='failed';onError('startup',error);}resolve('failed');}
   // Keep ownership after a failed import too: its dependencies may have started.
   await lifetime;release=null;
  })).catch(failed);}catch(error){failed(error);}
 });}
 function enter(){
  if(disposed)return Promise.resolve(false);
  if(pending)return pending;
  if(status==='active')return Promise.resolve(true);
  if(status==='failed')return Promise.resolve(false);
  status='acquiring';
  pending=Promise.resolve().then(async()=>{
   if(!locks?.request){status='unavailable';onError('unavailable',Error('Web Locks unavailable.'));return false;}
   const deadline=Date.now()+graceMs;
   while(!disposed){
    const result=await attempt();if(result!=='busy')return result==='started';
    if(Date.now()>=deadline)break;
    await new Promise(resolve=>setTimeout(resolve,Math.min(80,deadline-Date.now())));
   }
   if(!disposed){status='blocked';onBlocked();}return false;
  }).finally(()=>{pending=null;});
  return pending;
 }
 return {enter,state:()=>status,dispose(){disposed=true;status='disposed';release?.();}};
}

export function createWorkspaceTabView({document=globalThis.document,onRetry,onReload}={}){
 let root;const inert=new Map();
 function hide(){
  root?.remove();root=null;for(const [element,hadInert] of inert){if(!hadInert)element.removeAttribute('inert');}inert.clear();
 }
 function show(reason='blocked'){
  if(!root){
   root=document.createElement('section');root.id='workspace-tab-gate';root.className='workspace-tab-gate';root.setAttribute('role','region');root.setAttribute('aria-labelledby','workspace-tab-title');
   root.innerHTML='<div class="workspace-tab-content"><p class="workspace-tab-brand">Kairos</p><h1 id="workspace-tab-title" tabindex="-1"></h1><p data-tab-message></p><button type="button" class="action-btn" data-tab-retry></button></div>';
   for(const element of document.body.children){inert.set(element,element.hasAttribute('inert'));element.setAttribute('inert','');}document.body.appendChild(root);
  }
  const title=root.querySelector('h1'),message=root.querySelector('[data-tab-message]'),button=root.querySelector('button');root.dataset.reason=reason;
  title.textContent=reason==='blocked'?'Kairos is already open':reason==='startup'?'Kairos could not load':'This browser cannot open Kairos safely';
  message.textContent=reason==='blocked'?'Finish in the other Kairos tab, close it, then continue here.':reason==='startup'?'Check your connection, then reload to try again.':'Kairos needs browser tab coordination to protect your planner. Update your browser or use a current desktop browser, then reload.';
  button.textContent=reason==='blocked'?'Use Kairos here':'Reload';button.disabled=false;
  button.onclick=async()=>{button.disabled=true;if(reason==='blocked'){await onRetry();if(root===button.closest('#workspace-tab-gate'))button.disabled=false;}else onReload();};
  title.focus?.();
 }
 return {show,hide};
}
