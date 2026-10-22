import { applyResize, snapMinutes, formatTime, parseTime, taskDurationMinutes, blockGeometry } from './schedule-utils.js';
import { projectStoredOccurrence, generateTaskOccurrences } from './recurrence-utils.js?v=14';
import {createScheduleChangeController} from './schedule-change-controller.js?v=4';

const DAY_MINUTES=1440;
const HOUR_HEIGHT=56;
const SNAP_MINUTES=5;
const RESIZE_SNAP_MINUTES=5;
let interaction=null;
let suppressClickUntil=0;
let changeController=null;

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
const pointerScope=()=>({ownerId:bridge()?.getOwnerId?.()??null,planId:bridge()?.getPlanId?.()??null});
function currentGesture(value=interaction){
  if(!value?.scope)return false;
  const now=pointerScope();if(value.scope.ownerId!==now.ownerId||value.scope.planId!==now.planId||!document.getElementById('schedule-page')?.classList.contains('active')||!value.originElement?.isConnected)return false;
  const occurrence=value.isOccurrence?findOccurrence(value.seriesId,value.occurrenceDate)?.occurrence:null;
  const task=value.isOccurrence?occurrence?.task:findTask(value.taskId)?.task;return !!task&&(!occurrence||occurrence.status==='pending'||bridge()?.getAllowCompletedReschedule?.()&&occurrence.status==='completed')&&JSON.stringify(snapshot(task))===JSON.stringify(value.original);
}
function changes(){
  if(!changeController)changeController=createScheduleChangeController({document,getAllowCompleted:()=>bridge()?.getAllowCompletedReschedule?.()===true,getScope:pointerScope,getState:()=>({boards:bridge()?.getBoards?.()||[],scheduleEvents:bridge()?.getScheduleEvents?.()||[]}),
    ensurePlan:()=>bridge().ensureSchedulePlan(),commit:(...args)=>bridge().commitScheduleCommand(...args),
    isEditorBlocked:()=>!!(workspace()?.inspectorSession?.isBusy()||workspace()?.inspectorSession?.hasDraft())});
  return changeController;
}
function canBegin(){
  if(changes().isBlocked()){showToast('Confirm or dismiss the previous schedule change before dragging again.');return false}
  const editor=workspace()?.inspectorSession;
  if(editor?.isBusy()||editor?.hasDraft()){showToast(editor.isBusy()?'Wait for the current save.':'Save or discard your edits before dragging tasks.');return false}
  return document.getElementById('schedule-page')?.classList.contains('active')&&(!bridge()?.getOwnerId||!!bridge().getOwnerId());
}
function releaseCapture(value){try{value?.originElement?.releasePointerCapture?.(value.pointerId)}catch{}}


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
  const occurrence=found.task.recurrence?.exceptions?.[occurrenceDate]?.status==='completed'?projectStoredOccurrence(found.task,occurrenceDate):generateTaskOccurrences(found.task,occurrenceDate,occurrenceDate,{today:occurrenceDate})[0];
  return occurrence?{...found,occurrence}:null;
}
function snapshot(task){return {date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null,estimatedMinutes:task.estimatedMinutes??null,lastScheduledMinutes:task.lastScheduledMinutes??null,completed:task.completed===true,archived:task.archived===true,scheduleLocked:task.scheduleLocked===true}}
function formatClock(mins){return formatTime(mins,bridge()?.getTimeFormat?.()!=='24')}
function validTaskColor(value){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null}

function showToast(message){
  document.querySelector('.ks-toast:not(.ks-schedule-feedback)')?.remove();
  const toast=document.createElement('div');toast.className='ks-toast';toast.setAttribute('role','status');toast.textContent=message;
  document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('is-visible'));
  setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>toast.remove(),180)},3200);
}

function placement(task,dateKey,minutes,duration=taskDurationMinutes(task)){
  // Clamp the start to a snapped boundary, preserving the complete duration.
  const start=Math.min(snapMinutes(minutes,SNAP_MINUTES),Math.max(0,Math.floor((DAY_MINUTES-duration)/SNAP_MINUTES)*SNAP_MINUTES));
  return {date:dateKey,startTime:formatTime(start,false),endTime:formatTime((start+duration)%DAY_MINUTES,false)};
}
function rangeLabel(start,end){return `${formatClock(start)} – ${formatClock(end>=1440?0:end)}${end>=1440?' (+1 day)':''} · ${end-start} min`}
function pointerDuration(task){const remembered=Number(task.lastScheduledMinutes);return parseTime(task.startTime)===null&&Number.isInteger(remembered)&&remembered>0&&remembered<=1440?remembered:taskDurationMinutes(task)}
function grabOffset(element,event,task){const rect=element.closest('.ks-day-grid')?.getBoundingClientRect(),start=parseTime(task.startTime);return rect?.height&&start!==null?((event.clientY-rect.top)/rect.height)*DAY_MINUTES-start:0}

function makeGhost(task,mode){
  const el=document.createElement('div');el.className='ks-drag-ghost';
  const strong=document.createElement('strong');strong.textContent=task.title||'Task';
  const span=document.createElement('span');span.textContent=mode==='resize'?'Resize task':'Move task';
  el.append(strong,span);document.body.appendChild(el);return el;
}
function moveGhost(x,y){if(interaction?.ghost){const ghost=interaction.ghost,left=Math.max(8,Math.min(x+12,(window.innerWidth||1024)-(ghost.offsetWidth||260)-8)),top=Math.max(8,Math.min(y+12,(window.innerHeight||900)-(ghost.offsetHeight||70)-8));ghost.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`}}
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
  el.querySelector('span').textContent=rangeLabel(startMin,endMin);
}
function gridAtPoint(x,y){
  const grid=document.elementFromPoint(x,y)?.closest?.('.ks-day-grid');if(!grid)return null;
  const column=grid.closest('.ks-day-column'),rect=grid.getBoundingClientRect();if(!column||!rect.height)return null;
  return {dateKey:column.dataset.date,minutes:((y-rect.top)/rect.height)*DAY_MINUTES,grid,rect};
}
function begin(mode,taskId,event,element){
  if(event.button!==0||!canBegin())return;cancel();const found=findTask(taskId);if(!found)return;if(mode==='resize'&&!found.task.startTime)return;
  event.preventDefault();event.stopPropagation();if(found.task.completed&&!bridge()?.getAllowCompletedReschedule?.()){showToast('Enable rescheduling completed tasks in Planning & Schedule settings.');return}element.setPointerCapture?.(event.pointerId);
  interaction={scope:pointerScope(),grabOffsetMinutes:mode==='move'?grabOffset(element,event,found.task):0,durationMinutes:pointerDuration(found.task),gridTop:element.closest('.ks-day-grid')?.getBoundingClientRect().top,mode,taskId:String(taskId),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,original:snapshot(found.task),preview:null,overBacklog:false,originElement:element,ghost:makeGhost(found.task,mode),previewElement:null,moved:false,isOccurrence:false};
  element.classList.add(mode==='resize'?'is-resizing':'is-dragging');moveGhost(event.clientX,event.clientY);
}
function beginOccurrence(mode,event,element){
  if(event.button!==0||!canBegin())return;cancel();
  const seriesId=element.dataset.seriesId,occurrenceDate=element.dataset.occurrenceDate,found=findOccurrence(seriesId,occurrenceDate);if(!found)return;
  const task=found.occurrence.task;if(found.occurrence.status==='completed'&&!bridge()?.getAllowCompletedReschedule?.()){showToast('Enable rescheduling completed tasks in Planning & Schedule settings.');return}if(mode==='resize'&&!found.occurrence.startTime)return;
  event.preventDefault();event.stopPropagation();element.setPointerCapture?.(event.pointerId);
  interaction={scope:pointerScope(),grabOffsetMinutes:mode==='move'?grabOffset(element,event,task):0,original:snapshot(task),gridTop:element.closest('.ks-day-grid')?.getBoundingClientRect().top,mode,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,preview:null,overBacklog:false,originElement:element,ghost:makeGhost(task,mode),previewElement:null,moved:false,isOccurrence:true,seriesId,occurrenceId:element.dataset.occurrenceId,occurrenceDate,effectiveTask:task,durationMinutes:found.occurrence.durationMinutes};
  element.classList.add(mode==='resize'?'is-resizing':'is-dragging');moveGhost(event.clientX,event.clientY);
}
function onMove(event){
  if(!interaction||event.pointerId!==interaction.pointerId)return;if(!currentGesture()){cancel();return}moveGhost(event.clientX,event.clientY);
  if(interaction.mode!=='resize'&&Math.hypot(event.clientX-interaction.startX,event.clientY-interaction.startY)>4)interaction.moved=true;
  const task=interaction.isOccurrence?interaction.effectiveTask:findTask(interaction.taskId)?.task;if(!task)return;
  if(interaction.mode==='resize'){
    const grid=interaction.originElement.closest('.ks-day-grid'),rect=grid?.getBoundingClientRect(),start=parseTime(task.startTime);
    if(rect?.height&&start!==null){
      const delta=event.clientY-interaction.startY+(interaction.gridTop??rect.top)-rect.top;if(Math.abs(delta)>4)interaction.moved=true;
      const original=interaction.original||task,originalEnd=parseTime(original.startTime)+(interaction.durationMinutes??taskDurationMinutes(original));
      const rawEnd=Math.max(Math.ceil((start+1)/RESIZE_SNAP_MINUTES)*RESIZE_SNAP_MINUTES,snapMinutes(originalEnd+(delta/rect.height)*DAY_MINUTES,RESIZE_SNAP_MINUTES)),resized=applyResize(task,rawEnd,RESIZE_SNAP_MINUTES),parsed=parseTime(resized.endTime),end=parsed===0&&rawEnd>=1440?1440:parsed;
      if(end!==null){interaction.preview={endMin:end};placePreview(grid,task,start,end);interaction.ghost.querySelector('span').textContent=rangeLabel(start,end)+(interaction.isOccurrence?' · This occurrence':'')}
    }
    return;
  }
  const point=document.elementFromPoint(event.clientX,event.clientY);interaction.overBacklog=!!point?.closest?.('#schedule-backlog');
  if(interaction.overBacklog){interaction.preview=null;removePreview();interaction.ghost.querySelector('span').textContent=interaction.isOccurrence?'Unschedule · This occurrence':'Unschedule';return}
  const slot=gridAtPoint(event.clientX,event.clientY);if(!slot){interaction.preview=null;removePreview();return}
  const duration=interaction.durationMinutes??taskDurationMinutes(task),moved=placement(task,slot.dateKey,slot.minutes-(interaction.grabOffsetMinutes||0),duration),start=parseTime(moved.startTime),end=start===null?null:Math.min(DAY_MINUTES,start+duration);
  if(start===null||end===null){interaction.preview=null;removePreview();return}
  interaction.preview={dateKey:slot.dateKey,startMin:start};placePreview(slot.grid,task,start,end);interaction.ghost.querySelector('span').textContent=`${slot.dateKey} · ${rangeLabel(start,end)}${interaction.isOccurrence?' · This occurrence':''}`;
}
async function finish(event,cancel=false){
  if(!interaction||event.pointerId!==interaction.pointerId)return;
  if(!cancel&&currentGesture())onMove(event);else if(!currentGesture())cancel=true;
  const current=interaction;interaction=null;releaseCapture(current);current.originElement?.classList.remove('is-dragging','is-resizing');current.ghost?.remove();removePreview(current);
  if(cancel||!current.moved)return;suppressClickUntil=Date.now()+300;
  const task=current.isOccurrence?current.effectiveTask:findTask(current.taskId)?.task;if(!task)return;
  const target={taskId:current.isOccurrence?current.seriesId:current.taskId,...(current.isOccurrence?{occurrenceDate:current.occurrenceDate}:{})};
  let next,duration=current.durationMinutes??taskDurationMinutes(task);
  if(current.mode==='resize'){
    if(!current.preview)return;
    const resized=applyResize(task,current.preview.endMin,RESIZE_SNAP_MINUTES);if(resized.endTime===task.endTime)return;
    next={date:task.date,startTime:task.startTime,endTime:resized.endTime};duration=current.preview.endMin-parseTime(task.startTime);
  }else if(current.mode==='move'&&current.overBacklog){next={date:current.isOccurrence?current.occurrenceDate:null,startTime:null,endTime:null,...(!current.isOccurrence?{lastScheduledMinutes:duration}:{})}}
  else{if(!current.preview)return;next=placement(task,current.preview.dateKey,current.preview.startMin,duration);if(next.date===task.date&&next.startTime===task.startTime&&next.endTime===task.endTime)return}
  if(current.isOccurrence)next.durationMinutes=duration;
  await changes().save(target,next);
}
function cancel(){if(!interaction)return;const current=interaction;interaction=null;current.originElement?.classList.remove('is-dragging','is-resizing');current.ghost?.remove();removePreview(current);releaseCapture(current)}

function decorate(){
  changeController?.sync();
  if(interaction&&!currentGesture())cancel();
  document.querySelectorAll('.ks-task-block[data-task-id]').forEach(el=>{
    if(!el.querySelector('[data-resize-handle]')){const h=document.createElement('span');h.className='ks-resize-handle';h.dataset.resizeHandle='';h.title='Drag to change duration';h.setAttribute('aria-hidden','true');el.appendChild(h)}
    if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>begin(event.target.closest('[data-resize-handle]')?'resize':'move',el.dataset.taskId,event,el));
  });
  document.querySelectorAll('.ks-task-block[data-occurrence-id]').forEach(el=>{
    if(!el.querySelector('[data-resize-handle]')){const h=document.createElement('span');h.className='ks-resize-handle';h.dataset.resizeHandle='';h.title='Drag to change duration';h.setAttribute('aria-hidden','true');el.appendChild(h)}
    if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>beginOccurrence(event.target.closest('[data-resize-handle]')?'resize':'move',event,el));
  });
  document.querySelectorAll('.ks-backlog-row[data-task-id]').forEach(el=>{if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>begin('backlog',el.dataset.taskId,event,el))});
  document.querySelectorAll('.ks-backlog-row[data-occurrence-id]').forEach(el=>{if(el.dataset.pointerBound)return;el.dataset.pointerBound='1';el.addEventListener('pointerdown',event=>beginOccurrence('backlog',event,el))});
}

function boot(){
  if(window.__kairosScheduleInteractionsBooted||!bridge())return;window.__kairosScheduleInteractionsBooted=true;decorate();
  window.__kairosScheduleInteractions={sync:()=>{cancel();changeController?.sync()},save:(target,fields,placement)=>changes().save(target,fields,{placement}),isBlocked:()=>changes().isBlocked()};
  const root=document.getElementById('schedule-page');if(root)new MutationObserver(records=>{if(records.some(record=>record.target===root&&record.attributeName==='class'&&(record.oldValue||'').split(/\s+/).includes('active')!==root.classList.contains('active')))cancel();decorate()}).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
  document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',event=>void finish(event,false));document.addEventListener('pointercancel',event=>void finish(event,true));
  document.addEventListener('lostpointercapture',event=>{if(interaction?.pointerId===event.pointerId)cancel()});
  window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancel()});document.addEventListener('contextmenu',cancel,true);
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.target.closest?.('.ks-task-block,.ks-backlog-row')){event.preventDefault();event.stopImmediatePropagation()}},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&interaction){event.preventDefault();cancel()}});
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
