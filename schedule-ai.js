import { validateScheduleProposals, parseTime, formatTime, taskDurationMinutes, toDateKey, getVisibleDates, blockGeometry } from './schedule-utils.js';

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
let proposals=[];
let planning=false;
let syncQueued=false;

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
function taskMap(){return new Map(taskEntries().map(({task})=>[String(task.id),task]))}
function findTask(id){return taskEntries().find(x=>String(x.task.id)===String(id))||null}
function formatClock(value){const mins=parseTime(value);return mins===null?String(value||''):formatTime(mins,bridge()?.getTimeFormat?.()!=='24')}
function showToast(message){
  document.querySelector('.ks-toast')?.remove();const el=document.createElement('div');el.className='ks-toast';el.setAttribute('role','status');el.textContent=message;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('is-visible'));setTimeout(()=>{el.classList.remove('is-visible');setTimeout(()=>el.remove(),180)},3200);
}
function syncPlanButton(){
  const button=document.querySelector('#schedule-toolbar [data-plan]');if(!button)return;
  button.disabled=planning;button.setAttribute('aria-busy',planning?'true':'false');button.textContent=planning?'Planning…':'Plan';
}

function buildContext(targetTaskId=null){
  const now=new Date(),ws=workspace(),dates=getVisibleDates(ws?.state?.anchor||now,ws?.state?.view||'three-day');
  const eligible=taskEntries().filter(({task})=>!task.completed&&!task.scheduleLocked&&(!targetTaskId||String(task.id)===String(targetTaskId)));
  return {
    currentDate:toDateKey(now),
    currentTime:formatTime(now.getHours()*60+now.getMinutes(),false),
    visibleRange:{start:toDateKey(dates[0]),end:toDateKey(dates.at(-1))},
    planningHorizonDays:7,
    targetTaskId:targetTaskId||null,
    tasks:eligible.map(({task,board,section})=>({
      id:String(task.id),title:String(task.title||''),notes:String(task.notes||''),board:String(board.title||''),section:String(section.title||''),
      dueDate:task.dueDate||null,estimatedMinutes:task.estimatedMinutes||taskDurationMinutes(task),priority:task.priority||null,
      schedulingPreference:task.schedulingPreference||null,date:task.date||null,startTime:task.startTime||null,endTime:task.endTime||null,
      scheduleLocked:!!task.scheduleLocked,color:task.color||null
    })),
    fixedCommitments:(bridge()?.getScheduleEvents?.()||[]).map(ev=>({id:String(ev.id),title:String(ev.title||''),day:Number(ev.day),start:ev.start,end:ev.end,category:ev.category||'other'}))
  };
}

function visibleProposalCount(){return proposals.filter(p=>document.querySelector(`.ks-day-column[data-date="${CSS.escape(p.to.date)}"]`)).length}
function renderProposalOverlays(){
  if(!proposals.length){document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());return}
  const expected=visibleProposalCount(),existing=document.querySelectorAll('.ks-proposal-block').length;
  if(existing===expected)return;
  document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());
  proposals.forEach((proposal,index)=>{
    const grid=document.querySelector(`.ks-day-column[data-date="${CSS.escape(proposal.to.date)}"] .ks-day-grid`);if(!grid)return;
    const start=parseTime(proposal.to.startTime),end=parseTime(proposal.to.endTime);if(start===null||end===null)return;
    const geometry=blockGeometry(start,end,56,22);
    const entry=findTask(proposal.taskId),button=document.createElement('button');
    button.type='button';button.className='ks-proposal-block';button.dataset.proposalIndex=String(index);
    button.style.top=`${geometry.topPx}px`;button.style.height=`${geometry.heightPx}px`;
    if(/^#[0-9a-f]{6}$/i.test(String(entry?.task?.color||'')))button.style.setProperty('--ks-task-color',entry.task.color);
    button.setAttribute('aria-label',`Proposed: ${entry?.task.title||'Task'}, ${formatClock(proposal.to.startTime)} to ${formatClock(proposal.to.endTime)}`);
    const title=document.createElement('strong');title.textContent=entry?.task.title||'Task';const time=document.createElement('span');time.textContent=`Proposed · ${formatClock(proposal.to.startTime)}–${formatClock(proposal.to.endTime)}`;button.append(title,time);
    button.addEventListener('click',event=>{event.stopPropagation();renderProposalInspector(index)});grid.appendChild(button);
  });
}
function renderReview(){
  const review=document.getElementById('schedule-ai-review');if(!review)return;
  if(!proposals.length){review.hidden=true;review.innerHTML='';review.dataset.count='0';return}
  if(review.dataset.count===String(proposals.length)&&review.querySelector('[data-apply-all]')){review.hidden=false;return}
  review.dataset.count=String(proposals.length);review.hidden=false;
  review.innerHTML=`<span>Kairos proposes <strong>${proposals.length}</strong> change${proposals.length===1?'':'s'}</span><div><button type="button" data-apply-all>Apply all</button><button type="button" data-review>Review</button><button type="button" data-dismiss>Dismiss</button></div>`;
  review.querySelector('[data-apply-all]').onclick=()=>void applyAll();review.querySelector('[data-review]').onclick=()=>renderProposalInspector(0);review.querySelector('[data-dismiss]').onclick=dismissAll;
}
function renderProposalInspector(index){
  const proposal=proposals[index],entry=findTask(proposal?.taskId),inspector=document.getElementById('schedule-inspector'),shell=document.querySelector('.schedule-workspace-shell');if(!proposal||!entry||!inspector)return;
  if(workspace()?.state)workspace().state.selected={type:null,id:null};shell?.classList.add('inspector-open');inspector.hidden=false;inspector.dataset.enhancedFor='';
  inspector.innerHTML=`<div class="ks-inspector-head"><span>AI proposal</span><button type="button" data-close aria-label="Close proposal">×</button></div><div class="ks-proposal-inspector"><h3>${escapeHtml(entry.task.title)}</h3><dl><div><dt>From</dt><dd>${proposal.from?.date?`${escapeHtml(proposal.from.date)}${proposal.from.startTime?` · ${escapeHtml(formatClock(proposal.from.startTime))}`:''}`:'Unscheduled'}</dd></div><div><dt>To</dt><dd>${escapeHtml(proposal.to.date)} · ${escapeHtml(formatClock(proposal.to.startTime))}–${escapeHtml(formatClock(proposal.to.endTime))}</dd></div></dl><h4>Why this slot</h4><p>${escapeHtml(proposal.reason)}</p><div class="ks-inspector-actions"><button type="button" class="ks-primary" data-apply>Apply</button><button type="button" data-change>Change</button></div></div>`;
  inspector.querySelector('[data-close]').onclick=closeProposalInspector;inspector.querySelector('[data-apply]').onclick=()=>void applyOne(index);inspector.querySelector('[data-change]').onclick=()=>changeProposal(index);
}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function closeProposalInspector(){const inspector=document.getElementById('schedule-inspector'),shell=document.querySelector('.schedule-workspace-shell');if(inspector){inspector.hidden=true;inspector.innerHTML=''}shell?.classList.remove('inspector-open')}
function syncUi(){syncQueued=false;syncPlanButton();renderReview();renderProposalOverlays()}
function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(syncUi)}

async function requestPlan(targetTaskId=null){
  if(planning)return;planning=true;syncPlanButton();
  try{
    const context=buildContext(targetTaskId);if(!context.tasks.length){showToast(targetTaskId?'That task cannot be automatically planned.':'No flexible incomplete tasks are available to plan.');return}
    const raw=await bridge()?.requestAiPlan?.(context);const valid=validateScheduleProposals(raw,taskMap(),bridge()?.getScheduleEvents?.()||[],{minDate:context.currentDate,minTime:context.currentTime});
    if(!valid.length){showToast('Kairos did not find a safe future schedule change to propose.');return}
    proposals=valid;if(workspace()?.state)workspace().state.proposals=valid;workspace()?.render?.();syncUi();
  }catch(error){console.error('[Kairos Schedule] AI planning failed.',error);showToast('Kairos could not create a schedule proposal right now.')}
  finally{planning=false;syncPlanButton()}
}
function snapshotsFor(items){const map=new Map();items.forEach(p=>{const task=findTask(p.taskId)?.task;if(task&&!map.has(String(task.id)))map.set(String(task.id),{task,date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null})});return map}
async function applySet(items){
  const snapshots=snapshotsFor(items);items.forEach(p=>{const task=findTask(p.taskId)?.task;if(task)Object.assign(task,p.to)});workspace()?.render?.();
  try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.();return true}
  catch(error){snapshots.forEach(s=>Object.assign(s.task,{date:s.date,startTime:s.startTime,endTime:s.endTime}));workspace()?.render?.();console.error('[Kairos Schedule] Proposal apply failed.',error);showToast("Couldn't apply the proposed schedule. Restored the previous times.");return false}
}
async function applyAll(){if(!proposals.length)return;if(await applySet(proposals)){showToast(`Applied ${proposals.length} schedule change${proposals.length===1?'':'s'}.`);dismissAll()}}
async function applyOne(index){const proposal=proposals[index];if(!proposal)return;if(await applySet([proposal])){proposals.splice(index,1);if(workspace()?.state)workspace().state.proposals=[...proposals];workspace()?.render?.();closeProposalInspector();syncUi();showToast('Schedule change applied.')}}
function changeProposal(index){const proposal=proposals[index];if(!proposal)return;proposals.splice(index,1);if(workspace()?.state)workspace().state.proposals=[...proposals];closeProposalInspector();workspace()?.selectItem?.('task',proposal.taskId);syncUi()}
function dismissAll(){proposals=[];if(workspace()?.state)workspace().state.proposals=[];document.querySelectorAll('.ks-proposal-block').forEach(el=>el.remove());closeProposalInspector();renderReview()}

function boot(){
  if(window.__kairosScheduleAiBooted||!bridge()||!workspace())return;window.__kairosScheduleAiBooted=true;
  const root=document.getElementById('schedule-page');if(root)new MutationObserver(queueSync).observe(root,{subtree:true,childList:true});
  document.addEventListener('click',event=>{if(event.target.closest?.('#schedule-toolbar [data-plan]')){event.preventDefault();void requestPlan()}},true);
  window.addEventListener('kairos-schedule-ai-task',event=>void requestPlan(event.detail?.taskId||null));
  syncPlanButton();
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
