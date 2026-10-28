import {buildReviewedSchedule} from './task-list-model.js?v=26';
import {schedulePlanningAvailability,schedulePlanningClock,sameScheduleAvailability,scheduleProposalFits,scheduleAvailabilityText} from './schedule-planning-availability.js?v=6';
import {shiftPlanningDate} from './planning-model.js?v=1';
import { eventCommitmentsForRange, validateScheduleProposals, parseTime, formatTime, taskDurationMinutes, toDateKey, getVisibleDates, blockGeometry, addDays } from './schedule-utils.js?v=6';
import { generateTaskOccurrences, generateTaskOccurrencesThrough } from './recurrence-utils.js?v=14';
import { aiErrorMessage } from './ai-request.js';
import {dayChangeCandidates,prepareDayChange,proposalStillMatches} from './schedule-day-change.js?v=6';
import {mountDayChange} from './schedule-day-change-ui.js?v=7';

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
const PLANNING_HORIZON_DAYS=7;
let proposals=[];
let planning=false;
let applying=false;
let dayChange=null;
let proposalIdentity=null;
let proposalSourceState=null;
let proposalDate=null;
let retainedApply=null;
let proposalAvailability=null;
let dayChangeUi=null;
let syncQueued=false;
let reviewIndex=null;
let proposalInspector=null;
let applyingControls=null;
let activeProposalView=null;
const proposalViews=new Map();
function rememberProposalView(){
 if(activeProposalView)Object.assign(activeProposalView,{proposals,planning,applying,dayChange,proposalIdentity,proposalSourceState,proposalDate,retainedApply,proposalAvailability,reviewIndex,proposalInspector,applyingControls});
}
function syncProposalScope(){
 const scope=identity(),key=JSON.stringify([scope.owner,scope.plan]);
 if(activeProposalView?.key===key)return activeProposalView;
 rememberProposalView();closeProposalInspector();
 activeProposalView=proposalViews.get(key)||{key,scope,proposals:[],planning:false,applying:false,dayChange:null,proposalIdentity:null,proposalSourceState:null,proposalDate:null,retainedApply:null,proposalAvailability:null,reviewIndex:null,proposalInspector:null,applyingControls:null};
 proposalViews.set(key,activeProposalView);
 ({proposals,planning,applying,dayChange,proposalIdentity,proposalSourceState,proposalDate,retainedApply,proposalAvailability,reviewIndex,proposalInspector,applyingControls}=activeProposalView);
 document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());
 if(workspace()?.state)workspace().state.proposals=[...proposals];
 return activeProposalView;
}
const currentProposalView=view=>activeProposalView===view&&sameIdentity(view?.scope);
function ownsProposalInspector(root=proposalInspector){return !!root&&root===proposalInspector&&root.isConnected&&document.getElementById('schedule-inspector')?.contains(root)}
function applyControlState(){
 if(!applying||!applyingControls)return;
 const roots=[document.getElementById('schedule-ai-review'),...(ownsProposalInspector()?[proposalInspector]:[])];
 for(const root of roots)for(const button of root?.querySelectorAll('button')||[]){if(!applyingControls.has(button))applyingControls.set(button,{disabled:button.disabled,root});button.disabled=true}
}
function restoreApplyControls(controls){for(const [button,{disabled,root}] of controls||[])if(button.isConnected&&root.isConnected&&root.contains(button)&&(root===document.getElementById('schedule-ai-review')||ownsProposalInspector(root)))button.disabled=disabled}


function taskEntries(){
  const out=[];
  for(const board of bridge()?.getBoards?.()||[]){
    if(board?.archived)continue;
    for(const section of board?.sections||[]){
      if(section?.archived)continue;
      for(const task of section?.tasks||[]){if(!task?.archived)out.push({task,board,section})}
    }
  }
  return out;
}
function taskMap(){return new Map(taskEntries().filter(({task})=>!task.recurrence?.enabled).map(({task})=>[String(task.id),task]))}
function findTask(id){return taskEntries().find(x=>String(x.task.id)===String(id))||null}
function splitOccurrenceId(value){
  const text=String(value||''),index=text.lastIndexOf('::');
  if(index<1)return null;
  const seriesId=text.slice(0,index),occurrenceDate=text.slice(index+2);
  return /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)?{seriesId,occurrenceId:text,occurrenceDate}:null;
}
function occurrenceTarget(value){
  const identity=splitOccurrenceId(value);if(!identity)return null;
  const entry=findTask(identity.seriesId);if(!entry?.task?.recurrence?.enabled)return null;
  const occurrence=generateTaskOccurrences(entry.task,identity.occurrenceDate,identity.occurrenceDate,{today:identity.occurrenceDate})[0];
  return occurrence?{...entry,...identity,occurrence,task:occurrence.task}:null;
}
function proposalEntry(value){return occurrenceTarget(value)||findTask(value)}
function formatClock(value){const mins=parseTime(value);return mins===null?String(value||''):formatTime(mins,bridge()?.getTimeFormat?.()!=='24')}
function validTaskColor(value){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null}
function showToast(message){document.querySelector('.ks-toast')?.remove();const el=document.createElement('div');el.className='ks-toast';el.setAttribute('role','status');el.textContent=message;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('is-visible'));setTimeout(()=>{el.classList.remove('is-visible');setTimeout(()=>el.remove(),180)},3200)}
function syncPlanButton(){dayChangeUi?.setBusy();const button=document.querySelector('#schedule-toolbar [data-plan]');if(!button)return;button.disabled=planning||applying;button.setAttribute('aria-busy',planning?'true':'false');const label=planning?'Planning…':applying?'Applying…':'Plan';if(button.textContent!==label)button.textContent=label}
function planningConstraints(){const current=schedulePlanningClock(bridge());return {minDate:current.date,minTime:current.time}}
function availabilityMatches(value){try{return sameScheduleAvailability(value,schedulePlanningAvailability(bridge()))}catch{return false}}
function hoursMarkup(){return proposalAvailability?'<details class="ks-proposal-hours"><summary>Work hours used</summary><p>'+escapeHtml(scheduleAvailabilityText(proposalAvailability))+'</p></details>':''}
function proposalDurationMinutes(proposal,task){const start=parseTime(proposal?.to?.startTime),rawEnd=parseTime(proposal?.to?.endTime),end=rawEnd===0&&start>0?1440:rawEnd;if(start!==null&&end!==null&&end>start)return end-start;return taskDurationMinutes(task)}
function proposalMetadata(proposal,task){
  const metadata=proposal?.metadata||{},has=key=>Object.prototype.hasOwnProperty.call(metadata,key);
  return {priority:has('priority')?metadata.priority:(task.priority??null),estimatedMinutes:has('estimatedMinutes')?metadata.estimatedMinutes:(task.estimatedMinutes??null),schedulingPreference:has('schedulingPreference')?metadata.schedulingPreference:(task.schedulingPreference??null),color:has('color')?metadata.color:(task.color??null)};
}
function dateFromKey(key){const [y,m,d]=String(key).split('-').map(Number);return new Date(y,m-1,d,12)}
function recurrenceRangeFor(items=[],context=null){
  const constraints=planningConstraints(),base=context?.currentDate||constraints.minDate;
  let start=base,end=toDateKey(addDays(dateFromKey(base),Math.max(PLANNING_HORIZON_DAYS,Number(context?.planningHorizonDays)||0)));
  for(const item of items){const identity=splitOccurrenceId(item?.taskId);if(identity&&identity.occurrenceDate<start)start=identity.occurrenceDate;const date=item?.to?.date;if(/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))&&date>end)end=date}
  return {start,end};
}
function validationTaskMap(items=[],context=null){
  const map=new Map([...taskMap()].map(([id,task])=>[id,{...task}])),range=recurrenceRangeFor(items,context);
  for(const {task} of taskEntries()){
    if(!task.recurrence?.enabled)continue;
    for(const occurrence of generateTaskOccurrences(task,range.start,range.end,{today:context?.currentDate||range.start})){
      if(occurrence.status!=='pending')continue;
      map.set(occurrence.occurrenceId,{...occurrence.task,id:occurrence.occurrenceId,date:occurrence.displayDate,startTime:occurrence.startTime,endTime:occurrence.endTime,estimatedMinutes:occurrence.durationMinutes,lastScheduledMinutes:occurrence.durationMinutes,dueDate:null,completed:false,archived:false,scheduleLocked:!!task.scheduleLocked||occurrence.mode==='fixed'});
    }
  }
  return map;
}
function validateGeneratedProposals(raw,context,{allowOccurrenceDateChange=false}={}){
  const allowed=new Set((context?.tasks||[]).map(task=>String(task.id)));
  const eligible=(Array.isArray(raw)?raw:[]).filter(item=>{
    if(!allowed.has(String(item?.taskId)))return false;
    const identity=splitOccurrenceId(item?.taskId);
    return !identity||allowOccurrenceDateChange||item?.to?.date===identity.occurrenceDate;
  });
  const validationTasks=validationTaskMap(eligible,context),candidates=eligible.filter(item=>scheduleProposalFits(item,context?.availability,taskDurationMinutes(validationTasks.get(String(item?.taskId))||{})));
  return validateScheduleProposals(candidates,validationTasks,bridge()?.getScheduleEvents?.()||[],{minDate:context?.currentDate||planningConstraints().minDate,minTime:context?.currentTime||planningConstraints().minTime,maxDate:context?.mode==='replan-day'?context.currentDate:null,blockedWindows:context?.dayChange?.blockedWindows||[]});
}
function validateProposalDrafts(items){
  if(proposalAvailability&&!availabilityMatches(proposalAvailability))return null;
  const hours=proposalAvailability||schedulePlanningAvailability(bridge());
  if(items.some(item=>!scheduleProposalFits(item,hours)))return null;
  const validationTasks=validationTaskMap(items);
  for(const item of items){
    const id=String(item?.taskId??''),task=validationTasks.get(id);if(!task||task.scheduleLocked||task.completed||task.archived)return null;
    const start=parseTime(item?.to?.startTime),rawEnd=parseTime(item?.to?.endTime),end=rawEnd===0&&start>0?1440:rawEnd,duration=start!==null&&end!==null&&end>start?end-start:taskDurationMinutes(task);
    validationTasks.set(id,{...task,startTime:null,endTime:null,estimatedMinutes:duration,lastScheduledMinutes:duration,scheduleLocked:false});
  }
  const valid=validateScheduleProposals(items,validationTasks,bridge()?.getScheduleEvents?.()||[],{...planningConstraints(),maxDate:dayChange?.currentDate||null,blockedWindows:dayChange?.blockedWindows||[]});
  if(valid.length!==items.length)return null;
  const drafts=new Map(items.map(item=>[String(item.taskId),item]));
  return valid.map(item=>{const source=drafts.get(String(item.taskId));return {...item,from:{...source.from},...(source?.metadata?{metadata:{...source.metadata}}:{})}});
}

function buildContext(target=null,change=null){
  const now=new Date(),availability=schedulePlanningAvailability(bridge()),current=schedulePlanningClock(bridge(),now.getTime()),currentDate=current.date,targetTaskId=typeof target==='string'?target:(target?.taskId||null),targetOccurrenceId=target?.occurrenceId||null,ws=workspace(),dates=getVisibleDates(ws?.state?.anchor||now,ws?.state?.view||'three-day'),all=taskEntries(),ordinary=all.filter(({task})=>!task.recurrence?.enabled);
  const movable=new Set(change?dayChangeCandidates(bridge()?.getBoards?.()||[],currentDate,current.time).map(t=>t.id):[]),selected=new Set(change?.taskIds||[]);
  const eligible=ordinary.filter(({task})=>!task.completed&&!task.scheduleLocked&&(change?(selected.has(String(task.id))&&movable.has(String(task.id))):(targetTaskId?String(task.id)===String(targetTaskId):(!task.date||!task.startTime))));
  const scheduledCommitments=ordinary.filter(({task})=>!task.completed&&task.date&&task.startTime&&(!targetTaskId||String(task.id)!==String(targetTaskId))&&!eligible.some(entry=>String(entry.task.id)===String(task.id))).map(({task})=>({id:String(task.id),title:String(task.title||''),date:task.date,startTime:task.startTime,endTime:task.endTime||formatTime(Math.min(1440,(parseTime(task.startTime)??0)+taskDurationMinutes(task))%1440,false)}));
  const horizonEnd=shiftPlanningDate(currentDate,PLANNING_HORIZON_DAYS),recurring=[];
  for(const entry of all){
    if(!entry.task.recurrence?.enabled)continue;
    const generated=generateTaskOccurrencesThrough(entry.task,horizonEnd,{today:currentDate});
    for(const occurrence of generated)recurring.push({...occurrence,board:entry.board,section:entry.section});
  }
  if(targetOccurrenceId&&!recurring.some(item=>item.occurrenceId===targetOccurrenceId)){
    const identity=splitOccurrenceId(targetOccurrenceId),entry=identity?findTask(identity.seriesId):null;
    const occurrence=identity&&entry?generateTaskOccurrences(entry.task,identity.occurrenceDate,identity.occurrenceDate,{today:currentDate})[0]:null;
    if(occurrence)recurring.push({...occurrence,board:entry.board,section:entry.section});
  }
  const pending=recurring.filter(item=>item.status==='pending');
  const recurringCandidates=pending.filter(item=>item.mode==='flexible'&&!item.task.scheduleLocked&&(change?(selected.has(item.occurrenceId)&&movable.has(item.occurrenceId)):(targetOccurrenceId?item.occurrenceId===targetOccurrenceId:(!item.startTime))));
  scheduledCommitments.push(...pending.filter(item=>(item.mode==='fixed'||!!item.startTime)&&item.occurrenceId!==targetOccurrenceId&&!recurringCandidates.some(candidate=>candidate.occurrenceId===item.occurrenceId)).map(item=>({id:item.occurrenceId,seriesId:item.seriesId,occurrenceId:item.occurrenceId,occurrenceDate:item.occurrenceDate,title:String(item.task.title||''),date:item.displayDate,startTime:item.startTime,endTime:item.endTime,mode:item.mode})));
  const ordinaryTasks=eligible.map(({task,board,section})=>({id:String(task.id),title:String(task.title||''),notes:String(task.notes||''),board:String(board.title||''),section:String(section.title||''),dueDate:task.dueDate||null,estimatedMinutes:task.estimatedMinutes||null,lastScheduledMinutes:task.lastScheduledMinutes||null,plannedMinutes:taskDurationMinutes(task),priority:task.priority||null,schedulingPreference:task.schedulingPreference||null,date:task.date||null,startTime:task.startTime||null,endTime:task.endTime||null,scheduleLocked:!!task.scheduleLocked,color:task.color||null}));
  const recurringTasks=recurringCandidates.map(item=>({id:item.occurrenceId,taskId:item.occurrenceId,seriesId:item.seriesId,occurrenceId:item.occurrenceId,occurrenceDate:item.occurrenceDate,title:String(item.task.title||''),notes:String(item.task.notes||''),board:String(item.board?.title||''),section:String(item.section?.title||''),dueDate:null,estimatedMinutes:item.task.estimatedMinutes||null,lastScheduledMinutes:item.task.lastScheduledMinutes||null,plannedMinutes:item.durationMinutes,priority:item.task.priority||null,schedulingPreference:item.task.schedulingPreference||null,date:item.occurrenceDate,startTime:item.startTime,endTime:item.endTime,scheduleLocked:false,color:item.task.color||null,isOverdue:item.isOverdue,mode:item.mode}));
  return {mode:change?'replan-day':'plan',dayChange:change||null,availability,currentDate,currentTime:current.time,visibleRange:{start:toDateKey(dates[0]),end:toDateKey(dates.at(-1))},planningHorizonDays:PLANNING_HORIZON_DAYS,targetTaskId:targetOccurrenceId||targetTaskId||null,targetOccurrenceId:targetOccurrenceId||null,tasks:[...ordinaryTasks,...recurringTasks],scheduledCommitments,fixedCommitments:eventCommitmentsForRange(bridge()?.getScheduleEvents?.()||[],currentDate,horizonEnd)};
}

function visibleProposalCount(){return proposals.filter(p=>document.querySelector(`.ks-day-column[data-date="${CSS.escape(p.to.date)}"]`)).length}
function markReviewedProposal(){document.querySelectorAll('.ks-proposal-block').forEach(el=>el.classList.toggle('is-reviewing',reviewIndex!==null&&Number(el.dataset.proposalIndex)===reviewIndex))}
function renderProposalOverlays(){
  if(!proposals.length){document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());return}
  const expected=visibleProposalCount(),existing=document.querySelectorAll('.ks-proposal-block').length;
  if(existing===expected){proposals.forEach((proposal,index)=>{const entry=proposalEntry(proposal.taskId),button=document.querySelector(`.ks-proposal-block[data-proposal-index="${index}"]`);if(!button)return;const color=proposal.metadata&&Object.prototype.hasOwnProperty.call(proposal.metadata,'color')?proposal.metadata.color:entry?.task?.color;if(validTaskColor(color))button.style.setProperty('--ks-task-color',color);else button.style.removeProperty('--ks-task-color')});markReviewedProposal();return}
  document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());
  proposals.forEach((proposal,index)=>{const grid=document.querySelector(`.ks-day-column[data-date="${CSS.escape(proposal.to.date)}"] .ks-day-grid`);if(!grid)return;const start=parseTime(proposal.to.startTime),rawEnd=parseTime(proposal.to.endTime),end=rawEnd===0&&start>0?1440:rawEnd;if(start===null||end===null)return;const geometry=blockGeometry(start,end,56,22),entry=proposalEntry(proposal.taskId),button=document.createElement('button');button.type='button';button.className='ks-proposal-block';button.dataset.proposalIndex=String(index);button.style.top=`${geometry.topPx}px`;button.style.height=`${geometry.heightPx}px`;const color=proposal.metadata&&Object.prototype.hasOwnProperty.call(proposal.metadata,'color')?proposal.metadata.color:entry?.task?.color;if(validTaskColor(color))button.style.setProperty('--ks-task-color',color);button.setAttribute('aria-label',`Proposed: ${entry?.task.title||'Task'}, ${formatClock(proposal.to.startTime)} to ${formatClock(proposal.to.endTime)}`);const title=document.createElement('strong');title.textContent=entry?.task.title||'Task';const time=document.createElement('span');time.textContent=`Proposed · ${formatClock(proposal.to.startTime)}–${formatClock(proposal.to.endTime)}`;button.append(title,time);button.addEventListener('click',event=>{event.stopPropagation();focusProposal(index)});grid.appendChild(button)});markReviewedProposal();
}
function renderReview(){const review=document.getElementById('schedule-ai-review');if(!review)return;if(!proposals.length){review.hidden=true;review.innerHTML='';review.dataset.count='0';return}if(review.dataset.scope===activeProposalView?.key&&review.dataset.count===String(proposals.length)&&review.dataset.mode===(dayChange?'day-change':'plan')&&review.dataset.availability===JSON.stringify(proposalAvailability)&&review.querySelector('[data-apply-all]')){review.hidden=false;return}review.dataset.scope=activeProposalView?.key||'';review.dataset.count=String(proposals.length);review.dataset.availability=JSON.stringify(proposalAvailability);review.dataset.mode=dayChange?'day-change':'plan';review.hidden=false;review.innerHTML=`<span>${dayChange?'Today:':'Kairos proposes'} <strong>${proposals.length}</strong> change${proposals.length===1?'':'s'}${dayChange?' · fixed commitments stay put':''}<small class="ks-review-hours">${escapeHtml(proposalAvailability?.weeklyAvailability?'Saved weekly hours · '+proposalAvailability.timezone:'Times use '+(proposalAvailability?.timezone||''))}</small></span><div><button type="button" data-apply-all>Apply all</button><button type="button" data-review>Review</button><button type="button" data-dismiss>Dismiss</button></div>`;review.querySelector('[data-apply-all]').onclick=()=>void applyAll();review.querySelector('[data-review]').onclick=()=>focusProposal(reviewIndex??0);review.querySelector('[data-dismiss]').onclick=dismissAll}
function proposalNavMarkup(index){return `<div class="ks-proposal-nav"><button type="button" data-prev-proposal ${index<=0?'disabled':''} aria-label="Previous proposal">←</button><span>${index+1} of ${proposals.length}</span><button type="button" data-next-proposal ${index>=proposals.length-1?'disabled':''} aria-label="Next proposal">→</button></div>`}
function bindProposalNavigation(inspector,index){inspector.querySelector('[data-prev-proposal]')?.addEventListener('click',()=>focusProposal(index-1));inspector.querySelector('[data-next-proposal]')?.addEventListener('click',()=>focusProposal(index+1))}
function renderProposalInspector(index){
  const proposal=proposals[index],entry=proposalEntry(proposal?.taskId),inspector=document.getElementById('schedule-inspector'),shell=document.querySelector('.schedule-workspace-shell');if(!proposal||!entry||!inspector)return;if(workspace()?.state)workspace().state.selected={type:null,id:null};shell?.classList.add('inspector-open');inspector.hidden=false;inspector.dataset.enhancedFor='';const metadata=proposalMetadata(proposal,entry.task),importance=metadata.priority?metadata.priority[0].toUpperCase()+metadata.priority.slice(1):'None';
  inspector.innerHTML=`<div class="ks-inspector-head"><span>AI proposal</span><button type="button" data-close aria-label="Close proposal">×</button></div><div class="ks-proposal-inspector">${proposalNavMarkup(index)}<h3>${escapeHtml(entry.task.title)}</h3><dl><div><dt>From</dt><dd>${proposal.from?.date?`${escapeHtml(proposal.from.date)}${proposal.from.startTime?` · ${escapeHtml(formatClock(proposal.from.startTime))}`:''}`:'Unscheduled'}</dd></div><div><dt>To</dt><dd>${escapeHtml(proposal.to.date)} · ${escapeHtml(formatClock(proposal.to.startTime))}–${escapeHtml(formatClock(proposal.to.endTime))}</dd></div><div><dt>Duration</dt><dd>${proposalDurationMinutes(proposal,entry.task)} min</dd></div><div><dt>Importance</dt><dd>${escapeHtml(importance)}</dd></div></dl>${hoursMarkup()}<h4>Why this slot</h4><p>${escapeHtml(proposal.reason)}</p><div class="ks-inspector-actions"><button type="button" class="ks-primary" data-apply>Apply</button><button type="button" data-change>Change</button></div></div>`;proposalInspector=inspector.querySelector('.ks-proposal-inspector');inspector.querySelector('[data-close]').onclick=()=>closeProposalInspector();inspector.querySelector('[data-apply]').onclick=()=>void applyOne(index);inspector.querySelector('[data-change]').onclick=()=>changeProposal(index);bindProposalNavigation(inspector,index);
}
async function focusProposal(index){syncProposalScope();if(applying||!proposals.length)return;const actor=identity(),pendingProposals=proposals;if(!await (workspace()?.inspectorSession?.requestLeave()??true)||!sameIdentity(actor)||pendingProposals!==proposals||applying||!proposals.length)return;const safeIndex=Math.max(0,Math.min(proposals.length-1,Number(index)||0)),proposal=proposals[safeIndex],ws=workspace();reviewIndex=safeIndex;if(ws?.state)ws.state.selected={type:null,id:null};ws?.focusDateTime?.(proposal.to.date,proposal.to.startTime);renderProposalOverlays();renderProposalInspector(safeIndex);markReviewedProposal();requestAnimationFrame(()=>document.querySelector(`.ks-proposal-block[data-proposal-index="${safeIndex}"]`)?.focus({preventScroll:true}))}
function proposalEditState(form){if(!form)return '';const theme=form.querySelector('[data-proposal-theme-color]')?.checked;return JSON.stringify({date:form.querySelector('[data-proposal-date]')?.value||'',start:form.querySelector('[data-proposal-start]')?.value||'',duration:form.querySelector('[data-proposal-duration]')?.value||'',priority:form.querySelector('[data-proposal-priority]')?.value||'',estimate:form.querySelector('[data-proposal-estimate]')?.value||'',preference:form.querySelector('[data-proposal-preference]')?.value||'',color:theme?'theme':(form.querySelector('[data-proposal-color]')?.value||'')})}
function changeProposal(index){
  syncProposalScope();if(applying||retainedApply)return;
  const proposal=proposals[index],entry=proposalEntry(proposal?.taskId),inspector=document.getElementById('schedule-inspector');if(!proposal||!entry||!inspector)return;reviewIndex=index;const metadata=proposalMetadata(proposal,entry.task),duration=proposalDurationMinutes(proposal,entry.task),color=validTaskColor(metadata.color)||'#a855f7',customColor=!!validTaskColor(metadata.color);
  inspector.innerHTML=`<div class="ks-inspector-head"><span>Change proposal</span><button type="button" data-close aria-label="Close proposal">×</button></div><form class="ks-proposal-inspector ks-proposal-edit" data-proposal-edit>${proposalNavMarkup(index)}<h3>${escapeHtml(entry.task.title)}</h3><div class="ks-proposal-edit-grid"><label>Date<input type="date" data-proposal-date value="${escapeHtml(proposal.to.date)}"></label><label>Start<input type="time" step="60" data-proposal-start value="${escapeHtml(proposal.to.startTime)}"></label><label>Duration (min)<input type="number" min="1" step="1" data-proposal-duration value="${duration}"></label><label>Importance<select data-proposal-priority><option value="" ${!metadata.priority?'selected':''}>None</option><option value="low" ${metadata.priority==='low'?'selected':''}>Low</option><option value="medium" ${metadata.priority==='medium'?'selected':''}>Medium</option><option value="high" ${metadata.priority==='high'?'selected':''}>High</option></select></label><label>Estimate (min)<input type="number" min="1" step="1" data-proposal-estimate value="${metadata.estimatedMinutes??''}" placeholder="None"></label><label>Preferred time<select data-proposal-preference><option value="" ${!metadata.schedulingPreference?'selected':''}>No preference</option><option value="morning" ${metadata.schedulingPreference==='morning'?'selected':''}>Morning</option><option value="afternoon" ${metadata.schedulingPreference==='afternoon'?'selected':''}>Afternoon</option><option value="evening" ${metadata.schedulingPreference==='evening'?'selected':''}>Evening</option></select></label></div><label>Task color<div class="ks-proposal-color-row"><input type="color" data-proposal-color value="${color}" aria-label="Task color"><label class="ks-proposal-theme-color"><input type="checkbox" data-proposal-theme-color ${customColor?'':'checked'}> Use theme color</label></div></label>${hoursMarkup()}<p class="ks-proposal-edit-note">These changes stay in this proposal until you press Apply.</p><div class="ks-inspector-actions"><button type="submit" class="ks-primary" data-save-proposal-change disabled>Save change</button><button type="button" data-cancel-proposal-change>Cancel</button></div></form>`;
  proposalInspector=inspector.querySelector('.ks-proposal-inspector');const form=inspector.querySelector('[data-proposal-edit]'),saveButton=inspector.querySelector('[data-save-proposal-change]'),initialProposalEditState=proposalEditState(form),syncProposalSaveState=()=>{if(saveButton)saveButton.disabled=proposalEditState(form)===initialProposalEditState};inspector.querySelector('[data-close]').onclick=()=>closeProposalInspector();inspector.querySelector('[data-cancel-proposal-change]').onclick=()=>renderProposalInspector(index);bindProposalNavigation(inspector,index);form?.addEventListener('input',syncProposalSaveState);form?.addEventListener('change',syncProposalSaveState);form?.addEventListener('submit',event=>{event.preventDefault();if(saveButton?.disabled)return;saveProposalChange(index)});syncProposalSaveState();
}
function saveProposalChange(index){
  syncProposalScope();if(applying||retainedApply)return;
  const proposal=proposals[index],entry=proposalEntry(proposal?.taskId),inspector=document.getElementById('schedule-inspector');if(!proposal||!entry||!inspector)return;const date=inspector.querySelector('[data-proposal-date]')?.value||'',startTime=inspector.querySelector('[data-proposal-start]')?.value||'',start=parseTime(startTime),duration=Math.max(1,Math.round(Number(inspector.querySelector('[data-proposal-duration]')?.value)||proposalDurationMinutes(proposal,entry.task))),estimateValue=inspector.querySelector('[data-proposal-estimate]')?.value||'',estimate=estimateValue?Math.max(1,Math.round(Number(estimateValue)||1)):null;if(!date||start===null||start+duration>1440){showToast('Choose a valid time and duration that fit before midnight.');return}
  const metadata={priority:inspector.querySelector('[data-proposal-priority]')?.value||null,estimatedMinutes:estimate,schedulingPreference:inspector.querySelector('[data-proposal-preference]')?.value||null,color:inspector.querySelector('[data-proposal-theme-color]')?.checked?null:validTaskColor(inspector.querySelector('[data-proposal-color]')?.value)},candidate={...proposal,to:{date,startTime:formatTime(start,false),endTime:formatTime(start+duration,false)},metadata,reason:proposal.reason},raw=proposals.map((item,i)=>i===index?candidate:item),valid=validateProposalDrafts(raw);if(!valid){showToast('That time does not fit the reviewed work hours or current commitments. If settings changed, dismiss and preview again.');return}proposals=valid;if(workspace()?.state)workspace().state.proposals=[...valid];workspace()?.render?.();syncUi();focusProposal(Math.min(index,proposals.length-1));
}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function closeProposalInspector(){
 const inspector=document.getElementById('schedule-inspector'),owned=ownsProposalInspector();reviewIndex=null;markReviewedProposal();
 if(owned){inspector.hidden=true;inspector.innerHTML='';document.querySelector('.schedule-workspace-shell')?.classList.remove('inspector-open')}
 proposalInspector=null;
}
function syncUi(){syncProposalScope();syncQueued=false;syncPlanButton();renderReview();renderProposalOverlays();applyControlState()}
function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(syncUi)}

function identity(){return {owner:bridge()?.getOwnerId?.()??null,plan:bridge()?.getPlanId?.()??null};}
function sameIdentity(value){const current=identity();return current.owner===value?.owner&&current.plan===value?.plan;}
async function requestPlan(target=null,change=null){
  const origin=syncProposalScope();
  if(planning||applying||retainedApply)return {ok:false,message:'Finish the current schedule operation first.'};planning=true;syncPlanButton();
  try{
    const requestIdentity=identity(),current=schedulePlanningClock(bridge());
    if(change){
      if(change.currentDate!==current.date)throw Error('The day has changed. Reopen My day changed.');
      change=prepareDayChange({...change,blockedFrom:change.blockedWindows?.[0]?.startTime,blockedUntil:change.blockedWindows?.[0]?.endTime},dayChangeCandidates(bridge()?.getBoards?.()||[],current.date,current.time),current.date);
    }
    const context=buildContext(target,change),sourceState=structuredClone({boards:bridge()?.getBoards?.()||[],scheduleEvents:bridge()?.getScheduleEvents?.()||[]});
    if(!context.tasks.length){const message=change?'No selected tasks are still available to move.':target?'That task cannot be automatically planned.':'No unscheduled flexible tasks are available to plan.';if(!change)showToast(message);return {ok:false,message};}
    const raw=await bridge()?.requestAiPlan?.(context);
    if(!availabilityMatches(context.availability))return {ok:false,message:'Your saved work hours or timezone changed while planning. Preview again.'};
    if(!currentProposalView(origin)||!sameIdentity(requestIdentity))return {ok:false,message:'The workspace changed. Preview again in the current plan.'};
    const latest=validationTaskMap([],context);
    if(context.tasks.some(task=>!proposalStillMatches({from:task},latest.get(String(task.id)))))return {ok:false,message:'Tasks changed while planning. Preview again.'};
    const valid=validateGeneratedProposals(raw,context).filter(p=>['date','startTime','endTime'].some(key=>(p.from?.[key]??null)!==(p.to?.[key]??null)));
    if(!valid.length){const message='No safe future changes were found. Try a different time window or task selection.';if(!change)showToast(message);return {ok:false,message};}
    dayChange=change;proposalIdentity=requestIdentity;proposalSourceState=sourceState;proposalDate=context.currentDate;proposalAvailability=context.availability;
    proposals=valid.sort((a,b)=>a.to.date.localeCompare(b.to.date)||String(a.to.startTime).localeCompare(String(b.to.startTime)));reviewIndex=null;
    if(workspace()?.state)workspace().state.proposals=[...proposals];
    if(change&&workspace()?.state){workspace().state.anchor=dateFromKey(current.date);workspace().state.view='day';}
    workspace()?.render?.();syncUi();
    return {ok:true};
  }catch(error){console.error('[Kairos Schedule] AI planning failed.',error);const message=error.code==='ai-protection'?aiErrorMessage(error):error.message?.startsWith('The day')||error.message?.startsWith('A selected')||/availability|work window|weekly/i.test(error.message||'')?error.message:'Kairos could not create a schedule proposal right now.';if(!change&&currentProposalView(origin))showToast(message);return {ok:false,message};}
  finally{origin.planning=false;if(activeProposalView===origin)planning=false;if(currentProposalView(origin))syncPlanButton()}
}
function applyScope(saved){return saved&&sameIdentity(saved.scope)}
function finishApplied(saved){
  if(retainedApply!==saved||!applyScope(saved))return;
  const applied=new Set(saved.items.map(p=>p.taskId));retainedApply=null;proposals=proposals.filter(p=>!applied.has(p.taskId));
  if(workspace()?.state)workspace().state.proposals=[...proposals];bridge()?.refreshAppViews?.();const inspector=document.getElementById('schedule-inspector');if(!inspector||inspector.hidden||!inspector.childElementCount||ownsProposalInspector())workspace()?.render?.();
  if(!proposals.length)dismissAll();else{reviewIndex=null;closeProposalInspector();syncUi()}
}
window.addEventListener('kairos-schedule-mutation-resolved',event=>{
 syncProposalScope();const saved=retainedApply,id=event.detail?.identity;
 if(!saved||!applyScope(saved)||!id||['ownerId','planId','operationId','createdAt'].some(k=>id[k]!==saved.identity[k]))return;
 if(event.detail.status==='discarded'){retainedApply=null;syncUi()}
 else if(event.detail.status==='saved'&&!applying){finishApplied(saved);showToast('Schedule changes applied.')}
});
async function applySet(items){
  const origin=syncProposalScope();let controls=null;
  if(applying||planning)return false;
  if(!sameIdentity(proposalIdentity)){showToast('The workspace changed. Your reviewed proposals are still here.');return false}
  try{
    if(!retainedApply){
      if(!availabilityMatches(proposalAvailability))throw Error('Your saved work hours or timezone changed. Preview again.');
      const op=buildReviewedSchedule(proposalSourceState,items,{availability:proposalAvailability,currentDate:proposalDate,dayChange:dayChange?{currentDate:dayChange.currentDate,taskIds:dayChange.taskIds,blockedWindows:dayChange.blockedWindows}:null});
      retainedApply={...structuredClone(op),items:structuredClone(items),scope:identity(),identity:{ownerId:proposalIdentity.owner,planId:proposalIdentity.plan,operationId:'schedule-proposal-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),createdAt:Date.now()}};
    }else if(JSON.stringify(items.map(p=>p.taskId))!==JSON.stringify(retainedApply.items.map(p=>p.taskId)))throw Error('Retry the original batch or clear its recovery before applying another change.');
    const saved=retainedApply;if(!applyScope(saved))return false;
    applying=true;applyingControls=controls=new Map();syncUi();
    if(typeof bridge()?.commitScheduleCommand!=='function')throw Error('Schedule saving is unavailable.');
    await bridge().commitScheduleCommand(saved.command,saved.expected,saved.identity);
    if(!currentProposalView(origin)||!applyScope(saved))return false;finishApplied(saved);showToast('Schedule changes applied.');return true;
  }catch(error){if(currentProposalView(origin)&&sameIdentity(proposalIdentity)){showToast((error.message||"Couldn't apply the proposed schedule.")+' Your review is retained. Retry Apply or use Clear recovery.');}console.error('[Kairos Schedule] Proposal apply failed.',error);return false}
  finally{origin.applying=false;origin.applyingControls=null;if(activeProposalView===origin){applying=false;applyingControls=null}if(currentProposalView(origin)){restoreApplyControls(controls);syncUi()}}
}
async function applyAll(){syncProposalScope();if(proposals.length)await applySet(proposals)}
async function applyOne(index){syncProposalScope();const proposal=proposals[index];if(proposal)await applySet([proposal])}

function dismissAll(){syncProposalScope();if(retainedApply)return;dayChange=null;proposalIdentity=null;proposalAvailability=null;proposals=[];reviewIndex=null;if(workspace()?.state)workspace().state.proposals=[];document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());closeProposalInspector();renderReview()}

function boot(){
  if(window.__kairosScheduleAiBooted||!bridge()||!workspace())return;window.__kairosScheduleAiBooted=true;dayChangeUi=mountDayChange({document,window,getBoards:()=>bridge()?.getBoards?.()||[],getTimeFormat:()=>bridge()?.getTimeFormat?.()||'24',getPlanningContext:()=>({...schedulePlanningClock(bridge()),availability:schedulePlanningAvailability(bridge()),scope:identity(),description:scheduleAvailabilityText(schedulePlanningAvailability(bridge()))}),isBusy:()=>planning||applying,onSubmit:change=>requestPlan(null,change),onPreviewReady:()=>focusProposal(0)});const root=document.getElementById('schedule-page');if(root)new MutationObserver(queueSync).observe(root,{subtree:true,childList:true});document.addEventListener('click',event=>{if(event.target.closest?.('#schedule-toolbar [data-plan]')){event.preventDefault();void requestPlan()}},true);window.addEventListener('kairos-schedule-ai-task',event=>void requestPlan(event.detail||event.detail?.taskId||null));syncPlanButton();
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
