import { getVisibleDates, shiftAnchor, toDateKey } from './schedule-utils.js';

const HOUR_HEIGHT = 56;

export function initScheduleWorkspace(options){
  const root=document.getElementById('schedule-page');
  if(!root) return null;
  const toolbar=document.getElementById('schedule-toolbar');
  const backlog=document.getElementById('schedule-backlog');
  const calendar=document.getElementById('schedule-calendar');
  const inspector=document.getElementById('schedule-inspector');
  const review=document.getElementById('schedule-ai-review');
  const state={view:'three-day',anchor:new Date(),selected:{type:null,id:null},backlogCollapsed:false,inspectorOpen:false,proposals:[],interaction:null};
  let clockTimer=null;

  const locale=()=>options.getLocale?.()||document.documentElement.lang||'en';
  const visibleDates=()=>getVisibleDates(state.anchor,state.view);
  const rangeLabel=()=>{
    const dates=visibleDates();
    const first=dates[0],last=dates.at(-1);
    if(dates.length===1) return first.toLocaleDateString(locale(),{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    if(first.getFullYear()===last.getFullYear()&&first.getMonth()===last.getMonth()) return `${first.toLocaleDateString(locale(),{month:'short',day:'numeric'})}–${last.getDate()}, ${last.getFullYear()}`;
    return `${first.toLocaleDateString(locale(),{month:'short',day:'numeric'})} – ${last.toLocaleDateString(locale(),{month:'short',day:'numeric',year:'numeric'})}`;
  };

  function renderToolbar(){
    toolbar.innerHTML=`<div class="ks-toolbar-nav"><button type="button" data-nav="prev" aria-label="Previous period">‹</button><button type="button" data-nav="today">Today</button><button type="button" data-nav="next" aria-label="Next period">›</button><strong>${rangeLabel()}</strong></div><div class="ks-toolbar-actions"><div class="ks-view-switch" role="group" aria-label="Schedule view"><button data-view="day" aria-pressed="${state.view==='day'}">Day</button><button data-view="three-day" aria-pressed="${state.view==='three-day'}">3 Day</button><button data-view="week" aria-pressed="${state.view==='week'}">Week</button></div><button type="button" data-filter>Filter</button><button type="button" data-plan class="ks-plan-btn">Plan</button><button type="button" data-event>+ Event</button></div>`;
    toolbar.querySelector('[data-nav="prev"]').onclick=()=>{state.anchor=shiftAnchor(state.anchor,state.view,-1);render()};
    toolbar.querySelector('[data-nav="today"]').onclick=()=>{state.anchor=new Date();render()};
    toolbar.querySelector('[data-nav="next"]').onclick=()=>{state.anchor=shiftAnchor(state.anchor,state.view,1);render()};
    toolbar.querySelectorAll('[data-view]').forEach(btn=>btn.onclick=()=>{state.view=btn.dataset.view;render()});
    toolbar.querySelector('[data-event]').onclick=()=>options.openRecurringEventEditor?.();
  }

  function render(){
    renderToolbar();
    backlog.innerHTML='<div class="ks-panel-title"><strong>Unscheduled</strong><span>0</span></div><p class="ks-panel-empty">Loading tasks…</p>';
    calendar.innerHTML='<div class="ks-calendar-loading" aria-label="Loading schedule"></div>';
    inspector.hidden=true;
    review.hidden=true;
  }

  function activate(){
    render();
    requestAnimationFrame(()=>{const scroller=calendar.querySelector('.ks-timeline-scroll');if(scroller&&!scroller.dataset.initialScroll){scroller.scrollTop=7*HOUR_HEIGHT;scroller.dataset.initialScroll='1'}});
  }

  function destroy(){ if(clockTimer) clearInterval(clockTimer); }
  render();
  return {render,activate,destroy,state};
}

function boot(){
  if(window.__kairosMobileDevice||document.documentElement.classList.contains('kairos-mobile-blocked')) return;
  const bridge=window.__kairosScheduleBridge;
  if(!bridge) return;
  if(window.__kairosScheduleWorkspace) return;
  window.__kairosScheduleWorkspace=initScheduleWorkspace(bridge);
}

window.addEventListener('kairos-schedule-bridge-ready',boot);
window.addEventListener('kairos-data-changed',()=>setTimeout(()=>window.__kairosScheduleWorkspace?.render(),0));
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
