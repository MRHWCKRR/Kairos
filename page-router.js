export const PAGE_ROUTES={dashboard:'home-page',ai:'ai-page',tasks:'tasks-page',schedule:'schedule-page',calendar:'calendar-page',achievements:'achievements-page',statistics:'statistics-page',settings:'settings-page',plans:'plans-page'};

export function pageFromUrl(href) {
  const route=new URL(href).searchParams.get('page');
  return Object.hasOwn(PAGE_ROUTES,route)?PAGE_ROUTES[route]:'home-page';
}

export function pageUrl(href,page) {
  const url=new URL(href),route=Object.keys(PAGE_ROUTES).find(key=>PAGE_ROUTES[key]===page);
  if(!route)throw Error('Unknown Kairos page');
  url.searchParams.set('page',route);
  return url;
}

export function mountPageRouter({document=globalThis.document,window=globalThis.window,preparePage=async()=>{},onNavigate=()=>{}}={}) {
  const nav=[...document.querySelectorAll('.nav-item[data-target]')],pages=[...document.querySelectorAll('.page-view')];
  let current=null,revision=0,warmStarted=false;
  const idle=callback=>window.requestIdleCallback?window.requestIdleCallback(callback,{timeout:4000}):window.setTimeout(callback,250);
  const report=error=>console.warn('[Kairos] Could not prepare page.',error);

  function status(root,text,error=false) {
    root.querySelector('.page-load-status')?.remove();
    root.inert=!error;root.setAttribute('aria-busy',String(!error));
    const panel=document.createElement('div');panel.className='page-load-status';panel.setAttribute('role','status');
    const message=document.createElement('p');message.textContent=text;panel.appendChild(message);
    if(error) {
      const reload=document.createElement('button');reload.type='button';reload.className='action-btn';reload.textContent='Reload page';
      reload.addEventListener('click',()=>window.location.reload());panel.appendChild(reload);
    }
    root.appendChild(panel);
  }

  async function navigate(page,{history='push'}={}) {
    const root=document.getElementById(page);
    if(!root||!Object.values(PAGE_ROUTES).includes(page))return;
    if(current===page)return;
    const ticket=++revision;current=page;
    if(history!=='none') {
      const url=pageUrl(window.location.href,page);
      // Preserve billing return parameters and the state owned by other code.
      window.history[history==='replace'?'replaceState':'pushState'](window.history.state,'',url.href);
    }
    for(const item of nav) {
      const active=item.dataset.target===page;item.classList.toggle('active',active);
      if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
    }
    for(const view of pages)view.classList.toggle('active',view===root);
    root.inert=true;
    onNavigate(page);
    // Show feedback only for a cold load, never flash it on a warmed page.
    const feedback=window.setTimeout(()=>{if(ticket===revision)status(root,'Loading this page…');},120);
    try {
      await preparePage(page);
      if(ticket!==revision)return;
      root.querySelector('.page-load-status')?.remove();root.inert=false;root.removeAttribute('aria-busy');
      window.dispatchEvent(new window.CustomEvent('kairos-page-ready',{detail:{page}}));
    } catch(error) {
      report(error);
      if(ticket===revision)status(root,'This page could not load. Your work in other pages is still available.',true);
    } finally {window.clearTimeout(feedback);}
  }

  for(const item of nav) {
    item.addEventListener('click',event=>{
      if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();void navigate(item.dataset.target);
    });
    const prepare=()=>void preparePage(item.dataset.target).catch(report);
    item.addEventListener('pointerenter',prepare);item.addEventListener('focus',prepare);
  }
  window.addEventListener('popstate',()=>void navigate(pageFromUrl(window.location.href),{history:'none'}));

  function warm() {
    if(warmStarted)return;warmStarted=true;
    // Explicit hover/focus still prepares a page on constrained connections.
    const connection=window.navigator.connection;
    if(connection?.saveData||/^(slow-)?2g$/.test(connection?.effectiveType||''))return;
    const queue=['schedule-page','ai-page'];
    const next=()=>{
      if(!queue.length)return;
      idle(()=>{
        if(document.hidden){window.setTimeout(next,1000);return;}
        const page=queue.shift();
        void preparePage(page).catch(report).finally(next);
      });
    };
    // Give the first visible page a paint before background preparation.
    window.requestAnimationFrame(next);
  }
  return {start:()=>navigate(pageFromUrl(window.location.href),{history:'replace'}),warm,navigate};
}
