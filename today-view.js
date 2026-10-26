import {buildToday,todayTaskCommand} from './today-model.js?v=4';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountMutationFeedback({root,session,window=globalThis.window,confirmClear=async()=>false}={}){
 if(!root)return {sync(){},dispose(){}};
 root.classList.add('mutation-feedback');
 root.innerHTML='<p data-mutation-message role="status" aria-live="polite"></p><button type="button" data-mutation-retry hidden>Retry save</button><button type="button" data-mutation-clear hidden>Clear recovery…</button>';
 const sync=()=>{
  const state=session.state(),offline=window?.navigator?.onLine===false;
  root.querySelector('[data-mutation-message]').textContent=state.message||(offline?'You are offline. Changes need a connection to save.':'');
  for(const name of ['retry','clear']){const button=root.querySelector('[data-mutation-'+name+']');button.hidden=!state.pending;button.disabled=state.busy||offline&&name==='retry';}
  root.hidden=!state.message&&!offline;root.setAttribute('aria-busy',String(state.busy));
 };
 const retry=()=>void session.retry();
 const clear=async()=>{const state=session.state(),actor=JSON.stringify(state.identity),pendingIdentity=state.pendingIdentity;if(await confirmClear('This change may already have saved. Check the planner before clearing recovery. Clearing does not undo saved work.')&&JSON.stringify(session.state().identity)===actor)session.discard(pendingIdentity);};
 root.querySelector('[data-mutation-retry]').addEventListener('click',retry);root.querySelector('[data-mutation-clear]').addEventListener('click',clear);
 const storageChanged=event=>{if(event.key===null||event.key?.startsWith('kairos-mutation:'))session.sync();};
 const unsub=session.subscribe(sync);window?.addEventListener('storage',storageChanged);window?.addEventListener('online',sync);window?.addEventListener('offline',sync);sync();
 return {sync,dispose(){unsub();window?.removeEventListener('storage',storageChanged);window?.removeEventListener('online',sync);window?.removeEventListener('offline',sync);root.replaceChildren();}};
}
export function mountTodayView({root,document=globalThis.document,window=globalThis.window,getState,getIdentity,getToday,session,onOpen=()=>{},onCapture=()=>{},confirmClear}={}){
 if(!root)return {sync(){},dispose(){}};
 let rows=new Map(),disposed=false,counts={overdue:20,today:20,unscheduled:20};
 root.classList.add('today-view');
 root.innerHTML='<header class="today-heading"><div><h3 tabindex="-1">Today</h3><p data-today-date class="text-muted"></p></div><button type="button" data-today-capture class="action-btn small-btn">New task</button></header><div data-today-feedback></div><div data-today-groups></div>';
 const feedback=mountMutationFeedback({root:root.querySelector('[data-today-feedback]'),session,window,confirmClear});
 function sync(){
  if(disposed)return;
  session.sync();const ready=!!getIdentity()?.ownerId&&!!getIdentity()?.planId,container=root.querySelector('[data-today-groups]');
  root.querySelector('[data-today-capture]').disabled=!ready;
  if(!ready){container.innerHTML='<p class="text-muted">Your planner is loading.</p>';rows=new Map();return;}
  const date=getToday(),view=buildToday(getState(),date);rows=new Map();
  root.querySelector('[data-today-date]').textContent='Overdue work, today’s schedule and tasks to plan.';
  container.innerHTML=['overdue','today','unscheduled'].map(group=>{
   const label={overdue:'Needs attention',today:'On today',unscheduled:'To plan'}[group],items=view[group];
   return '<section class="today-group" aria-label="'+label+'"><h4>'+label+' <span>'+items.length+'</span></h4>'+(items.length?'<ul>'+items.slice(0,counts[group]).map(row=>{
    const key=group+':'+row.id;rows.set(key,row);
    const when=(row.start?row.start+(row.end?'–'+row.end:''):row.dueDate===date?'Due today':row.dueDate?'Due '+row.dueDate:row.date||'No date');
    return '<li data-today-row="'+esc(key)+'"><div class="today-row-main"><button type="button" class="today-task-title" data-today-action="open" data-key="'+esc(key)+'">'+esc(row.title)+'</button><span class="today-task-meta">'+esc(row.path)+' · '+esc(when)+'</span></div><div class="today-row-actions">'+(row.canComplete?'<button type="button" data-today-action="complete" data-key="'+esc(key)+'" aria-label="Complete '+esc(row.title)+'">Complete</button>':'')+(row.kind==='task'&&!row.occurrenceDate&&row.date!==date?'<button type="button" data-today-action="plan" data-key="'+esc(key)+'">Plan today</button>':'')+'<button type="button" data-today-action="schedule" data-key="'+esc(key)+'">'+(row.occurrenceDate?'Open occurrence':'Schedule')+'</button></div></li>';
   }).join('')+'</ul>':'<p class="text-muted today-empty">'+({overdue:'No overdue work.',today:'No work or events planned for today.',unscheduled:'No unscheduled tasks.'})[group]+'</p>')+(items.length>counts[group]?'<button type="button" data-today-more="'+group+'">Show more</button>':'')+'</section>';
  }).join('');
  updateBusy();
 }
 function updateBusy(){const state=session.state();for(const button of root.querySelectorAll('[data-today-action="complete"],[data-today-action="plan"]'))button.disabled=state.busy||state.pending;feedback.sync();}
 const unsub=session.subscribe(updateBusy);
 const click=async event=>{
  const more=event.target.closest('[data-today-more]');if(more){counts[more.dataset.todayMore]+=20;sync();return;}
  if(event.target.closest('[data-today-capture]')){onCapture({date:getToday()});return;}
  const button=event.target.closest('[data-today-action]');if(!button||button.disabled)return;
  const row=rows.get(button.dataset.key);if(!row)return;
  const actor=JSON.stringify(getIdentity()),action=button.dataset.todayAction;
  if(action==='open'||action==='schedule'){await onOpen(row,action,button);return;}
  try{
   const {command,expected}=todayTaskCommand(getState(),row,action,getToday());
   await session.run(command,expected);
   if(!disposed&&JSON.stringify(getIdentity())===actor){sync();const next=[...root.querySelectorAll('[data-key]')].find(b=>b.dataset.key===button.dataset.key&&b.dataset.todayAction===action);(next||root.querySelector('h3')).focus?.();}
  }catch(error){root.querySelector('[data-mutation-message]').textContent=error.message;root.querySelector('[data-today-feedback]').hidden=false;}
 };
 root.addEventListener('click',click);
 const clock=()=>{const page=root.closest('.page-view');if(!page||page.classList.contains('active'))sync();};window?.addEventListener('focus',clock);const timer=window?.setInterval?.(clock,60000);
 sync();return {sync,dispose(){disposed=true;unsub();feedback.dispose();root.removeEventListener('click',click);window?.removeEventListener('focus',clock);if(timer)window.clearInterval(timer);}};
}

