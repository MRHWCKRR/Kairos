import {findTaskTimes,assertFindTimePlacement,findTimeTask} from './schedule-find-time-model.js?v=1';
import {planningClock} from './planning-model.js?v=1';
import {planningDefaults} from './weekly-availability.js';
import {normalisePlanningPreferences} from './planning-preferences.js?v=1';
import {schedulePlanningAvailability} from './schedule-planning-availability.js?v=1';
import {parseTime,formatTime} from './schedule-utils.js';
import {stableStringify} from './plan-merge.js';

export function mountFindTime({root,getWorkspace,getBridge,getController,now=Date.now}={}){
 const document=root.ownerDocument,window=document.defaultView;
 let panel=null,session=null,chosen=null,key=null,saving=false,disposed=false,renderedGrids=[];
 const scope=()=>[getBridge()?.getOwnerId?.()??null,getBridge()?.getPlanId?.()??null];
 const state=()=>({boards:getBridge()?.getBoards?.()||[],scheduleEvents:getBridge()?.getScheduleEvents?.()||[]});
 function context(){
  const workspace=getWorkspace(),selection=workspace?.state?.selected;
  if(!root.classList.contains('active')||workspace?.state.monthView||!scope()[0])return null;
  const target=selection?.type==='task'?{taskId:selection.id}:selection?.type==='occurrence'?{taskId:selection.seriesId,occurrenceDate:selection.occurrenceDate}:null;
  if(!target)return null;
  let task;try{task=findTimeTask(state(),target).task}catch{return null}
  const dates=[...root.querySelectorAll('.ks-day-column[data-date]')].map(column=>column.dataset.date).sort();
  return dates.length?{target,dates,title:task.title||'Task'}:null;
 }
 function options(current){
  const bridge=getBridge(),availability=schedulePlanningAvailability(bridge);
  return {from:current.dates[0],to:current.dates.at(-1),timezone:availability.timezone,...planningDefaults(availability.weeklyAvailability),...normalisePlanningPreferences(bridge?.getPlanningPreferences?.()||{})};
 }
 const clock=opts=>planningClock(now(),opts.timezone);
 function blocked(){const editor=getWorkspace()?.inspectorSession;return saving||getController()?.isBlocked?.()||editor?.isBusy?.()||editor?.hasDraft?.()}
 function clearSlots(){root.querySelectorAll('.ks-find-time-slot').forEach(button=>button.remove())}
 function message(text){const status=panel?.querySelector('[data-find-status]');if(status)status.textContent=text}
 function label(slot){
  const date=new Date(slot.date+'T12:00:00Z').toLocaleDateString(document.documentElement.lang||'en',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}),hour12=getBridge()?.getTimeFormat?.()!=='24';
  return date+' · '+formatTime(parseTime(slot.startTime),hour12)+'–'+formatTime(parseTime(slot.endTime),hour12);
 }
 function reset(){session=null;chosen=null;clearSlots();panel?.querySelector('[data-find-results]')?.replaceChildren()}
 function select(index){
  if(!session||saving)return;chosen=index;
  for(const button of root.querySelectorAll('[data-find-slot]'))button.setAttribute('aria-pressed',String(Number(button.dataset.findSlot)===index));
  const slot=session.slots[index],preview=panel.querySelector('[data-find-preview]');
  preview.textContent=label(slot)+' · '+session.duration+' min'+(session.target.occurrenceDate?' · This occurrence':'');
  panel.querySelector('[data-find-confirm]').disabled=false;
 }
 function markers(){
  clearSlots();renderedGrids=[...root.querySelectorAll('.ks-day-grid')];
  session.slots.forEach((slot,index)=>{
   const grid=[...root.querySelectorAll('.ks-day-column')].find(column=>column.dataset.date===slot.date)?.querySelector('.ks-day-grid');
   if(!grid)return;
   const marker=document.createElement('button');marker.type='button';marker.dataset.findSlot=index;marker.textContent=label(slot);marker.setAttribute('aria-pressed',String(index===chosen));
   marker.className='ks-block ks-find-time-slot';marker.style.top=(parseTime(slot.startTime)*56/60)+'px';marker.style.height=Math.max(24,session.duration*56/60)+'px';marker.setAttribute('aria-label','Preview '+label(slot)+', '+session.duration+' minutes');marker.addEventListener('click',event=>{event.stopPropagation();select(index);panel.querySelector('[data-find-confirm]')?.focus()});marker.addEventListener('dblclick',event=>event.stopPropagation());grid.appendChild(marker);
  });
 }
 function results(){
  const host=panel.querySelector('[data-find-results]');host.innerHTML='<div class="ks-find-time-options" role="group" aria-label="Suggested task times"></div><p data-find-preview aria-live="polite">Choose a time to review it.</p><div class="ks-find-time-actions"><button type="button" data-find-confirm disabled>Schedule task</button><button type="button" data-find-cancel>Cancel</button></div>';
  const list=host.querySelector('.ks-find-time-options');
  session.slots.forEach((slot,index)=>{
   const button=document.createElement('button');button.type='button';button.dataset.findSlot=index;button.setAttribute('aria-pressed','false');button.textContent=label(slot);button.addEventListener('click',()=>select(index));list.appendChild(button);
  });
  markers();
  host.querySelector('[data-find-cancel]').addEventListener('click',()=>{reset();message('');panel.querySelector('[data-find-start]')?.focus()});
  host.querySelector('[data-find-confirm]').addEventListener('click',()=>void confirm());
 }
 function start(){
  if(blocked()){message('Save or discard task edits, or finish the previous schedule change first.');return}
  reset();const current=context();if(!current)return;
  try{
   const input=options(current),report=findTaskTimes(state(),current.target,input,clock(input));
   session={...report,options:input,scope:scope(),contextKey:stableStringify(current)};
   message(report.slots.length?report.duration+' min · '+(input.availabilitySource==='saved'?'Saved work hours':'07:00–22:00 (no saved work hours)')+' · '+input.timezone+'. Showing the earliest placement in each suitable gap.': 'No suitable time in these dates. Check the task deadline, work hours or daily assignment limit, or view later dates.');
   if(report.slots.length)results();
  }catch(error){message(error.message||'Could not find a time. Review your planning settings.')}
 }
 async function confirm(){
  if(!session||chosen===null||blocked())return;
  const reviewed=session,slot=reviewed.slots[chosen],current=context();
  try{
   if(!current||stableStringify(scope())!==stableStringify(reviewed.scope)||stableStringify(current)!==reviewed.contextKey||stableStringify(options(current))!==stableStringify(reviewed.options))throw Error('The task or planning settings changed. Find a time again.');
   assertFindTimePlacement(state(),reviewed.target,slot,reviewed,clock(reviewed.options));
  }catch(error){reset();message(error.message);return}
  saving=true;panel.querySelector('[data-find-confirm]').disabled=true;message('Saving schedule.');
  const fields={...slot,...(reviewed.target.occurrenceDate?{durationMinutes:reviewed.duration}:{lastScheduledMinutes:reviewed.duration})};
  try{const saved=await getController().save(reviewed.target,fields,{options:reviewed.options,signature:reviewed.signature});if(disposed||stableStringify(scope())!==stableStringify(reviewed.scope))return;if(saved){reset();message('Scheduled. Undo is available in the save message.')}else{reset();message('Review the save message to retry or dismiss this change.')}}catch(error){reset();message(error.message||'Could not schedule this task.')}
  finally{saving=false;sync()}
 }
 function sync(){
  if(disposed)return;
  const current=context(),next=current?stableStringify({scope:scope(),...current}):null;
  if(next===key&&(!current||panel?.isConnected)){
   const grids=[...root.querySelectorAll('.ks-day-grid')];
   if(session&&!saving&&(grids.length!==renderedGrids.length||grids.some((grid,index)=>grid!==renderedGrids[index])))markers();
   return;
  }
  key=next;reset();panel?.remove();panel=null;if(!current)return;
  panel=document.createElement('section');panel.className='ks-find-time-panel';panel.setAttribute('aria-label','Find a time');
  panel.innerHTML='<div class="ks-find-time-heading"><span data-find-title></span><button type="button" data-find-start>Find a time</button></div><p data-find-status role="status" aria-live="polite"></p><div data-find-results></div>';
  panel.querySelector('[data-find-title]').textContent=current.title;
  panel.querySelector('[data-find-start]').addEventListener('click',start);
  root.insertBefore(panel,root.querySelector('.schedule-workspace-shell'));
 }
 const observer=new window.MutationObserver(sync);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 const changed=()=>{key=null;sync()};window.addEventListener('kairos-data-changed',changed);
 const escape=event=>{if(event.key==='Escape'&&session){event.preventDefault();event.stopPropagation();reset();message('');panel?.querySelector('[data-find-start]')?.focus()}};
 root.addEventListener('keydown',escape);sync();
 return {sync,dispose(){disposed=true;observer.disconnect();window.removeEventListener('kairos-data-changed',changed);root.removeEventListener('keydown',escape);reset();panel?.remove()}};
}

function boot(){
 const root=document.getElementById('schedule-page');
 if(!root||!window.__kairosScheduleWorkspace||window.__kairosFindTime)return;
 window.__kairosFindTime=mountFindTime({root,getWorkspace:()=>window.__kairosScheduleWorkspace,getBridge:()=>window.__kairosScheduleBridge,getController:()=>window.__kairosScheduleInteractions});
}
if(typeof window!=='undefined'){window.addEventListener('kairos-schedule-bridge-ready',boot);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
