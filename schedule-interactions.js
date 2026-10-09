import { applyResize, applyScheduledMove, clearScheduledFields, snapMinutes, formatTime } from './schedule-utils.js';

const DAY_MINUTES=1440;
let interaction=null;
let suppressClickUntil=0;

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;

function allTasks(){
  const out=[];
  for(const board of bridge()?.getBoards?.()||[]){
    for(const section of board?.sections||[]){
      for(const task of section?.tasks||[]) out.push({task,board,section});
    }
  }
  return out;
}
function findTask(id){return allTasks().find(x=>String(x.task.id)===String(id))||null}
function snapshot(task){return {date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null}}
function formatClock(mins){return formatTime(mins,bridge()?.getTimeFormat?.()!=='24')}

function showToast(message){
  document.querySelector('.ks-toast')?.remove();
  const toast=document.createElement('div');
  toast.className='ks-toast';toast.setAttribute('role','status');toast.textContent=message;
  document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('is-visible'));
  setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>toast.remove(),180)},3200);
}

async function persistMutation(task,original,next){
  Object.assign(task,next);workspace()?.render?.();
  try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.()}
  catch(error){Object.assign(task,original);workspace()?.render?.();showToast("Couldn't save your change. Restored the previous time.");console.error('[Kairos Schedule] Save failed; task schedule rolled back.',error)}
}

function makeGhost(task,mode){
  const el=document.createElement('div');el.className='ks-drag-ghost';
  const strong=document.createElement('strong');strong.textContent=task.title||'Task';
  const span=document.createElement('span');span.textContent=mode==='resize'?'Resize task':'Move task';
  el.append(strong,span);document.body.appendChild(el);return el;
}
function moveGhost(x,y){if(interaction?.ghost)interaction.ghost.style.transform=`translate(${Math.round(x+12)}px,${Math.round(y+12)}px)`}
function gridAtPoint(x,y){
  const grid=document.elementFromPoint(x,y)?.closest?.('.ks-day-grid');if(!grid)return null;
  const column=grid.closest('.ks-day-column'),rect=grid.getBoundingClientRect();if(!column||!rect.height)return null;
  return {dateKey:column.dataset.date,minutes:snapMinutes(((y-rect.top)/rect.height)*DAY_MINUTES,15),grid,rect};
}
function begin(mode,taskId,event,element){
  if(event.button!==0)return;const found=findTask(taskId);if(!found)return;if(mode==='resize'&&!found.task.startTime)return;
  event.preventDefault();event.stopPropagation();
  element.setPointerCapture?.(event.pointerId);
  interaction={mode,taskId:String(taskId),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,original:snapshot(found.task),preview:null,overBacklog:false,originElement:element,ghost:makeGhost(found.task,mode),moved:false};
  element.classList.add(mode==='resize'?'is-resizing':'is-dragging');moveGhost(event.clientX,event.clientY);
}
function onMove(event){
  if(!interaction||event.pointerId!==interaction.pointerId)return;moveGhost(event.clientX,event.clientY);
  if(Math.hypot(event.clientX-interaction.startX,event.clientY-interaction.startY)>4)interaction.moved=true;
  if(interaction.mode==='resize'){
    const grid=interaction.originElement.closest('.ks-day-grid'),rect=grid?.getBoundingClientRect();
    if(rect?.height){interaction.preview={endMin:snapMinutes(((event.clientY-rect.top)/rect.height)*DAY_MINUTES,15)};interaction.ghost.querySelector('span').textContent=`End ${formatClock(interaction.preview.endMin)}`}
    return;
  }
  const slot=gridAtPoint(event.clientX,event.clientY);interaction.preview=slot?{dateKey:slot.dateKey,startMin:slot.minutes}:null;
  interaction.overBacklog=!!document.elementFromPoint(event.clientX,event.clientY)?.closest?.('#schedule-backlog');
  const label=interaction.ghost.querySelector('span');if(slot)label.textContent=`${slot.dateKey} · ${formatClock(slot.minutes)}`;else if(interaction.overBacklog)label.textContent='Unscheduled';
}
async function finish(event,cancel=false){
  if(!interaction||event.pointerId!==interaction.pointerId)return;
  const current=interaction;interaction=null;current.originElement?.classList.remove('is-dragging','is-resizing');current.ghost?.remove();
  if(cancel||!current.moved)return;suppressClickUntil=Date.now()+300;
  const found=findTask(current.taskId);if(!found)return;const task=found.task;
  if(current.mode==='resize'){if(current.preview)await persistMutation(task,current.original,applyResize(task,current.preview.endMin,15));return}
  if(current.mode==='move'&&current.overBacklog){const next={...current.original};clearScheduledFields(next);await persistMutation(task,current.original,next);return}
  if(!current.preview)return;
  const base=current.mode==='backlog'?{...task,startTime:null,endTime:null,estimatedMinutes:task.estimatedMinutes||60}:task;
  await persistMutation(task,current.original,applyScheduledMove(base,current.preview.dateKey,current.preview.startMin,15));
}
function cancel(){if(!interaction)return;interaction.originElement?.classList.remove('is-dragging','is-resizing');interaction.ghost?.remove();interaction=null}

function decorate(){
  document.querySelectorAll('.ks-task-block[data-task-id]').forEach(el=>{
    if(!el.querySelector('[data-resize-handle]')){const h=document.createElement('span');h.className='ks-resize-handle';h.dataset.resizeHandle='';h.setAttribute('aria-hidden','true');el.appendChild(h)}
    if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';
    el.addEventListener('pointerdown',event=>begin(event.target.closest('[data-resize-handle]')?'resize':'move',el.dataset.taskId,event,el));
  });
  document.querySelectorAll('.ks-backlog-row[data-task-id]').forEach(el=>{if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>begin('backlog',el.dataset.taskId,event,el))});
}

function boot(){
  if(window.__kairosScheduleInteractionsBooted||!bridge())return;window.__kairosScheduleInteractionsBooted=true;
  decorate();
  const root=document.getElementById('schedule-page');if(root)new MutationObserver(decorate).observe(root,{subtree:true,childList:true});
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',event=>void finish(event,false));
  document.addEventListener('pointercancel',event=>void finish(event,true));
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.target.closest?.('.ks-task-block,.ks-backlog-row')){event.preventDefault();event.stopImmediatePropagation()}},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&interaction){event.preventDefault();cancel()}});
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
