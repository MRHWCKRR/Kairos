// This entry has no Firebase imports, so blocked mobile clients never download
// the desktop application's module graph.
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
  try {await import('./app.js?v=38');}
  catch(error) {
    console.error('[Kairos] Application could not start.',error);
    const root=document.getElementById('app-loading-screen');
    if(!root)return;
    const message=document.createElement('p');message.textContent='Kairos could not load. Check your connection and try again.';
    const reload=document.createElement('button');reload.type='button';reload.className='action-btn';reload.textContent='Try again';reload.addEventListener('click',()=>location.reload());
    root.append(message,reload);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
