// This entry has no Firebase imports, so blocked mobile clients never download
// the desktop application's module graph.
import {createWorkspaceTabGuard,createWorkspaceTabView} from './app-single-tab.js?v=1';
async function boot() {
  if(window.__kairosMobileDevice) {
    document.getElementById('mobile-access-screen')?.setAttribute('aria-hidden','false');
    return;
  }
  const url=new URL(location.href);
  if(url.searchParams.get('page')==='plans' || ['return','canceled'].includes(url.searchParams.get('billing'))) {
    url.pathname=url.pathname.replace(/app\.html$/, 'plans.html');
    url.searchParams.delete('page');
    location.replace(url.href);
    return;
  }
  // Restored documents must pass startup/ownership again, rather than resume an
  // old workspace while another document may have acquired the browser lock.
  window.addEventListener('pageshow',event=>{if(event.persisted){document.documentElement.setAttribute('inert','');location.reload();}});
  let locks=null;try{locks=navigator.locks||null;}catch{}
  const view=createWorkspaceTabView({document,onRetry:()=>guard.enter(),onReload:()=>location.reload()});
  const guard=createWorkspaceTabGuard({locks,
    onStart:async()=>{view.hide();await import('./app.js?v=114');},
    onBlocked:()=>view.show('blocked'),
    onError:(reason,error)=>{console.error('[Kairos] Workspace startup failed.',error);view.show(reason);}
  });
  await guard.enter();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
