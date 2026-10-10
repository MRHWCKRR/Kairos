import { applyResize, applyScheduledMove, clearScheduledFields, snapMinutes, formatTime, parseTime, taskDurationMinutes, preserveScheduledDuration, blockGeometry } from './schedule-utils.js';
import { generateTaskOccurrences, applyOccurrenceOverride } from './recurrence-utils.js';

const DAY_MINUTES=1440;
const HOUR_HEIGHT=56;
const SNAP_MINUTES=1;
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
function findOccurrence(seriesId,occurrenceDate){
  const found=findTask(seriesId);if(!found)return null;
  const occurrence=generateTaskOccurrences(found.task,occurrenceDate,occurrenceDate,{today:occurrenceDate})[0];
  return occurrence?{...found,occurrence}:null;
}
function snapshot(task){return {date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null,estimatedMinutes:task.estimatedMinutes??null,lastScheduledMinutes:task.lastScheduledMinutes??null}}
function formatClock(mins){return formatTime(mins,bridge()?.getTimeFormat?.()!=='24')}
function validTaskColor(value){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null}

function showToast(message){
  document.querySelector('.ks-toast')?.remove();
  const toast=document.createElement('div');toast.className='ks-toast';toast.setAttribute('role','status');toast.textContent=message;
  document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('is-visible'));
  setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>toast.remove(),180)},3200);
}

async function persistMutation(task,original,next){
  Object.assign(task,next);workspace()?.render?.();
  try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.()}
  catch(error){Object.assign(task,original);workspace()?.render?.();showToast("Couldn't save your change. Restored the previous time.");console.error('[Kairos Schedule] Save failed; task schedule rolled back.',error)}
}
async function persistOccurrenceMutation(seriesId,occurrenceDate,changes){
  const found=findTask(seriesId);if(!found)return;
  const index=found.section.tasks.indexOf(found.task),before=structuredClone(found.task),updated=applyOccurrenceOverride(found.task,occurrenceDate,changes);
  found.section.tasks[index]=updated;workspace()?.render?.();
  try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.()}
  catch(error){found.section.tasks[index]=before;workspace()?.render?.();showToast("Couldn't save this occurrence. Restored its previous time.");console.error('[Kairos Schedule] Occurrence save failed; override rolled back.',error)}
}

function makeGhost(task,mode){
  const el=document.createElement('div');el.className='ks-drag-ghost';
  const strong=document.createElement('strong');strong.textContent=task.title||'Task';
  const span=document.createElement('span');span.textContent=mode==='resize'?'Resize task':'Move task';
  el.append(strong,span);document.body.appendChild(el);return el;
}
function moveGhost(x,y){if(interaction?.ghost)interaction.ghost.style.transform=`translate(${Math.round(x+12)}px,${Math.round(y+12)}px)`}
function removePreview(target=interaction){if(target?.previewElement){target.previewElement.remove();target.previewElement=null}}
function ensurePreview(task){
  if(interaction?.previewElement)return interaction.previewElement;
  const el=document.createElement('div');el.className='ks-drag-preview';el.setAttribute('aria-hidden','true');
  const strong=document.createElement('strong');strong.textContent=task.title||'Task';
  const span=document.createElement('span');el.append(strong,span);
  const color=validTaskColor(task.color);if(color)el.style.setProperty('--ks-task-color',color);
  interaction.previewElement=el;return el;
}
function placePreview(grid,task,startMin,endMin){
  if(!interaction||!grid)return;
  const el=ensurePreview(task);if(el.parentElement!==grid)grid.appendChild(el);
  const geometry=blockGeometry(startMin,endMin,HOUR_HEIGHT,20);
  el.style.top=`${geometry.topPx}px`;el.style.height=`${geometry.heightPx}px`;
  el.querySelector('span').textContent=`${formatClock(startMin)}–${formatClock(endMin>=1440?0:endMin)}`;
}
function gridAtPoint(x,y){
  const grid=document.elementFromPoint(x,y)?.closest?.('.ks-day-grid');if(!grid)return null;
  const column=grid.closest('.ks-day-column'),rect=grid.getBoundingClientRect();if(!column||!rect.height)return null;
  return {dateKey:column.dataset.date,minutes:snapMinutes(((y-rect.top)/rect.height)*DAY_MINUTES,SNAP_MINUTES),grid,rect};
}
function begin(mode,taskId,event,element){
  if(event.button!==0)return;const found=findTask(taskId);if(!found)return;if(mode==='resize'&&!found.task.startTime)return;
  event.preventDefault();event.stopPropagation();element.setPointerCapture?.(event.pointerId);
  interaction={mode,taskId:String(taskId),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,original:snapshot(found.task),preview:null,overBacklog:false,originElement:element,ghost:makeGhost(found.task,mode),previewElement:null,moved:false,isOccurrence:false};
  element.classList.add(mode==='resize'?'is-resizing':'is-dragging');moveGhost(event.clientX,event.clientY);
}
function beginOccurrence(mode,event,element){
  if(event.button!==0)return;
  const seriesId=element.dataset.seriesId,occurrenceDate=element.dataset.occurrenceDate,found=findOccurrence(seriesId,occurrenceDate);if(!found)return;
  const task=found.occurrence.task;if(mode==='resize'&&!found.occurrence.startTime)return;
  event.preventDefault();event.stopPropagation();element.setPointerCapture?.(event.pointerId);
  interaction={mode,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,preview:null,overBacklog:false,originElement:element,ghost:makeGhost(task,mode),previewElement:null,moved:false,isOccurrence:true,seriesId,occurrenceId:element.dataset.occurrenceId,occurrenceDate,effectiveTask:task,durationMinutes:found.occurrence.durationMinutes};
  element.classList.add(mode==='resize'?'is-resizing':'is-dragging');moveGhost(event.clientX,event.clientY);
}
function onMove(event){
  if(!interaction||event.pointerId!==interaction.pointerId)return;moveGhost(event.clientX,event.clientY);
  if(Math.hypot(event.clientX-interaction.startX,event.clientY-interaction.startY)>4)interaction.moved=true;
  const task=interaction.isOccurrence?interaction.effectiveTask:findTask(interaction.taskId)?.task;if(!task)return;
  if(interaction.mode==='resize'){
    const grid=interaction.originElement.closest('.ks-day-grid'),rect=grid?.getBoundingClientRect(),start=parseTime(task.startTime);
    if(rect?.height&&start!==null){
      const rawEnd=snapMinutes(((event.clientY-rect.top)/rect.height)*DAY_MINUTES,SNAP_MINUTES),resized=applyResize(task,rawEnd,SNAP_MINUTES),parsed=parseTime(resized.endTime),end=parsed===0&&start>0?1440:parsed;
      if(end!==null){interaction.preview={endMin:end};placePreview(grid,task,start,end);interaction.ghost.querySelector('span').textContent=`End ${formatClock(end>=1440?0:end)}`}
    }
    return;
  }
  const point=document.elementFromPoint(event.clientX,event.clientY);interaction.overBacklog=!!point?.closest?.('#schedule-backlog');
  if(interaction.overBacklog){interaction.preview=null;removePreview();interaction.ghost.querySelector('span').textContent='Unschedule';return}
  const slot=gridAtPoint(event.clientX,event.clientY);if(!slot){interaction.preview=null;removePreview();return}
  const base=interaction.mode==='backlog'?{...task,startTime:null,endTime:null}:task,moved=applyScheduledMove(base,slot.dateKey,slot.minutes,SNAP_MINUTES),start=parseTime(moved.startTime),duration=interaction.isOccurrence?interaction.durationMinutes:taskDurationMinutes(base),end=start===null?null:Math.min(DAY_MINUTES,start+duration);
  if(start===null||end===null){interaction.preview=null;removePreview();return}
  interaction.preview={dateKey:slot.dateKey,startMin:start};placePreview(slot.grid,task,start,end);interaction.ghost.querySelector('span').textContent=`${slot.dateKey} · ${formatClock(start)}`;
}
async function finish(event,cancel=false){
  if(!interaction||event.pointerId!==interaction.pointerId)return;
  const current=interaction;interaction=null;current.originElement?.classList.remove('is-dragging','is-resizing');current.ghost?.remove();removePreview(current);
  if(cancel||!current.moved)return;suppressClickUntil=Date.now()+300;
  if(current.isOccurrence){
    const task=current.effectiveTask;
    if(current.mode==='resize'&&current.preview){
      const next=applyResize(task,current.preview.endMin,SNAP_MINUTES);await persistOccurrenceMutation(current.seriesId,current.occurrenceDate,{startTime:next.startTime,endTime:next.endTime,durationMinutes:taskDurationMinutes(next)});return;
    }
    if(current.mode==='move'&&current.overBacklog){await persistOccurrenceMutation(current.seriesId,current.occurrenceDate,{date:current.occurrenceDate,startTime:null,endTime:null,durationMinutes:current.durationMinutes});return}
    if(!current.preview)return;
    const base=current.mode==='backlog'?{...task,startTime:null,endTime:null}:task,next=applyScheduledMove(base,current.preview.dateKey,current.preview.startMin,SNAP_MINUTES);
    await persistOccurrenceMutation(current.seriesId,current.occurrenceDate,{date:next.date,startTime:next.startTime,endTime:next.endTime,durationMinutes:current.durationMinutes});return;
  }
  const found=findTask(current.taskId);if(!found)return;const task=found.task;
  if(current.mode==='resize'){if(current.preview)await persistMutation(task,current.original,applyResize(task,current.preview.endMin,SNAP_MINUTES));return}
  if(current.mode==='move'&&current.overBacklog){const next={...task};preserveScheduledDuration(next);clearScheduledFields(next);await persistMutation(task,current.original,next);return}
  if(!current.preview)return;
  const base=current.mode==='backlog'?{...task,startTime:null,endTime:null}:task;await persistMutation(task,current.original,applyScheduledMove(base,current.preview.dateKey,current.preview.startMin,SNAP_MINUTES));
}
function cancel(){if(!interaction)return;interaction.originElement?.classList.remove('is-dragging','is-resizing');interaction.ghost?.remove();removePreview(interaction);interaction=null}

function decorate(){
  document.querySelectorAll('.ks-task-block[data-task-id]').forEach(el=>{
    if(!el.querySelector('[data-resize-handle]')){const h=document.createElement('span');h.className='ks-resize-handle';h.dataset.resizeHandle='';h.setAttribute('aria-hidden','true');el.appendChild(h)}
    if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>begin(event.target.closest('[data-resize-handle]')?'resize':'move',el.dataset.taskId,event,el));
  });
  document.querySelectorAll('.ks-task-block[data-occurrence-id]').forEach(el=>{
    if(!el.querySelector('[data-resize-handle]')){const h=document.createElement('span');h.className='ks-resize-handle';h.dataset.resizeHandle='';h.setAttribute('aria-hidden','true');el.appendChild(h)}
    if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>beginOccurrence(event.target.closest('[data-resize-handle]')?'resize':'move',event,el));
  });
  document.querySelectorAll('.ks-backlog-row[data-task-id]').forEach(el=>{if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>begin('backlog',el.dataset.taskId,event,el))});
  document.querySelectorAll('.ks-backlog-row[data-occurrence-id]').forEach(el=>{if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>beginOccurrence('backlog',event,el))});
}

function boot(){
  if(window.__kairosScheduleInteractionsBooted||!bridge())return;window.__kairosScheduleInteractionsBooted=true;decorate();
  const root=document.getElementById('schedule-page');if(root)new MutationObserver(decorate).observe(root,{subtree:true,childList:true});
  document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',event=>void finish(event,false));document.addEventListener('pointercancel',event=>void finish(event,true));
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.target.closest?.('.ks-task-block,.ks-backlog-row')){event.preventDefault();event.stopImmediatePropagation()}},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&interaction){event.preventDefault();cancel()}});
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();