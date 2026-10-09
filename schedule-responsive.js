const workspace=()=>window.__kairosScheduleWorkspace;
let sidebarAutoCollapsed=false;
let forcedView=null;
let resizeObserver=null;

function scheduleActive(){return document.getElementById('schedule-page')?.classList.contains('active')}
function sidebar(){return document.getElementById('sidebar')}

function applyResponsive(){
  const root=document.getElementById('schedule-page'),ws=workspace();if(!root||!ws||!scheduleActive())return;
  const width=root.getBoundingClientRect().width||window.innerWidth;
  const nav=sidebar();
  if(width<1320&&nav&&!nav.classList.contains('collapsed')){nav.classList.add('collapsed');sidebarAutoCollapsed=true}
  if(width>=1380&&sidebarAutoCollapsed&&nav?.classList.contains('collapsed')){nav.classList.remove('collapsed');sidebarAutoCollapsed=false}

  if(width<720&&ws.state.view!=='day'){
    if(!forcedView)forcedView=ws.state.view;
    ws.state.view='day';ws.render();return;
  }
  if(width>=760&&forcedView&&ws.state.view==='day'){
    const restore=forcedView;forcedView=null;ws.state.view=restore;ws.render();
  }
}

function leaveSchedule(){
  const nav=sidebar();
  if(sidebarAutoCollapsed&&nav?.classList.contains('collapsed'))nav.classList.remove('collapsed');
  sidebarAutoCollapsed=false;forcedView=null;
}

function boot(){
  if(window.__kairosScheduleResponsiveBooted||!workspace())return;window.__kairosScheduleResponsiveBooted=true;
  const root=document.getElementById('schedule-page');if(!root)return;
  resizeObserver=new ResizeObserver(()=>applyResponsive());resizeObserver.observe(root);
  document.addEventListener('click',event=>{
    const nav=event.target.closest?.('[data-target]');if(!nav)return;
    if(nav.dataset.target==='schedule-page')setTimeout(applyResponsive,0);else if(scheduleActive())setTimeout(leaveSchedule,0);
  },true);
  root.addEventListener('click',event=>{const view=event.target.closest?.('[data-view]');if(view?.dataset.view==='day'&&forcedView)forcedView=null},true);
  const eventModal=document.getElementById('schedule-event-modal');
  if(eventModal){let wasActive=eventModal.classList.contains('active');new MutationObserver(()=>{const active=eventModal.classList.contains('active');if(wasActive&&!active)setTimeout(()=>workspace()?.render?.(),0);wasActive=active}).observe(eventModal,{attributes:true,attributeFilter:['class']})}
  window.addEventListener('kairos-data-changed',()=>setTimeout(()=>workspace()?.render?.(),500));
  applyResponsive();
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
