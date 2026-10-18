import {assignmentFeasibility,feasibilityAssignments,FEASIBILITY_LIMIT} from './deadline-feasibility.js';
import {deadlineSummary,weeklyReview,planningTasks,planningClock,planningWeekStart,shiftPlanningDate} from './planning-model.js';
import {planningConflicts,planningAvailability} from './planning-slots.js';
import {previewSessions,previewCarryover,previewSessionRevision} from './planning-commands.js?v=3';
import {taskDurationMinutes} from './schedule-utils.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const VIEWS={deadlines:'Deadlines',sessions:'Assignment sessions',plans:'Session plans',conflicts:'Conflicts',review:'Weekly review'};
export function mountPlanningHub({document=globalThis.document,window=globalThis.window,getBridge=()=>window.__kairosScheduleBridge,now=()=>Date.now(),storage}={}){
 const toolbar=document.getElementById('schedule-toolbar');if(!toolbar)return null;
 if(!storage)try{storage=window.sessionStorage}catch{}
 let dialog=null,scope=null,pending=null,persisted=false,busy=false,view='deadlines',filters=null,week=null,revision=0,status='';
 const memory=new Map();
 const bridge=()=>getBridge(),identity=()=>({ownerId:bridge()?.getOwnerId?.()||null,planId:bridge()?.getPlanId?.()||null}),scopeKey=value=>JSON.stringify([value?.ownerId,value?.planId]);
 const data=()=>({boards:bridge()?.getBoards?.()||[],scheduleEvents:bridge()?.getScheduleEvents?.()||[]});
 const timezone=()=>bridge()?.getTimezone?.()||'UTC',clock=()=>planningClock(now(),timezone());
 const storageKey=value=>'kairos-planning-preview:'+scopeKey(value);
 const action=(name,label,disabled=false)=>`<button type="button" data-planning-action="${name}" ${disabled?'disabled':''}>${label}</button>`;
 function read(){try{const value=JSON.parse(storage?.getItem(storageKey(scope))||'null');if(value?.version===1&&value.ownerId===scope.ownerId&&value.planId===scope.planId&&typeof value.operationId==='string'&&Number.isFinite(value.createdAt)&&value.command?.type==='planning_batch'&&Array.isArray(value.command.rows)&&value.command.rows.length<=40)return value}catch{}return null}
 function persist(){persisted=false;memory.set(scopeKey(scope),pending);try{if(!storage)throw Error();storage.setItem(storageKey(scope),JSON.stringify(pending));persisted=true}catch{}}
 function clearRecord(){memory.delete(scopeKey(scope));try{const stored=read();if(stored?.operationId===pending?.operationId)storage?.removeItem(storageKey(scope))}catch{}}
 function ensureButton(){
  let button=toolbar.querySelector('[data-planning-open]');if(!button){button=document.createElement('button');button.type='button';button.dataset.planningOpen='';button.textContent='Planning';button.addEventListener('click',open);toolbar.appendChild(button)}
  const current=identity();button.disabled=!current.ownerId||!current.planId;
 }
 function close(force=false){if(busy&&!force)return;revision++;dialog?.close?.();dialog?.remove();dialog=null;busy=false;if(!force)toolbar.querySelector('[data-planning-open]')?.focus()}
 function sync(){const next=identity();if(dialog&&scopeKey(next)!==scopeKey(scope))close(true);ensureButton()}
 function setStatus(message){status=message;const el=dialog?.querySelector('[data-planning-status]');if(el)el.textContent=message}
 function availability(){return `<fieldset class="planning-availability"><legend>Placement range and daily availability</legend><label>From<input type="date" name="from" value="${esc(filters.from)}" required></label><label>Through<input type="date" name="to" value="${esc(filters.to)}" required></label><label>Daily start<input type="time" name="dayStart" value="${esc(filters.dayStart)}" step="300" required></label><label>Daily end<input type="time" name="dayEnd" value="${esc(filters.dayEnd)}" step="300" required></label></fieldset><p class="planning-hint">Times use ${esc(timezone())}. Existing commitments, locks, preferences, and deadlines stay in force.</p>`}
 function capture(){const next={...filters,timezone:timezone()};for(const name of ['from','to','dayStart','dayEnd']){const input=dialog.querySelector('[name="'+name+'"]');if(input)next[name]=input.value}planningAvailability(next);filters=next;return next}
 const taskButton=(id,label='Edit deadline')=>`<button type="button" data-planning-task="${esc(id)}">${label}</button>`;
 function capacity(){
  const state=data(),parents=feasibilityAssignments(state),labels={fits:'Fits',shortfall:'Not enough time','needs-review':'Needs review',overdue:'Overdue','no-deadline':'No deadline','outside-range':'Outside check range','no-work':'No unfinished sessions'};
  return '<h4>Assignment capacity</h4><p class="planning-hint">Each assignment is checked separately against saved commitments, from now to its deadline (up to 31 days). Assignments may compete for time. Fits means a candidate plan exists; it may require rescheduling. This measures planned effort, not completion. Check capacity refreshes after edits. Times use '+esc(timezone())+'.</p><fieldset class="planning-availability planning-capacity-availability"><legend>Daily availability for capacity checks</legend><label>Daily start<input type="time" name="dayStart" value="'+esc(filters.dayStart)+'" step="300"></label><label>Daily end<input type="time" name="dayEnd" value="'+esc(filters.dayEnd)+'" step="300"></label></fieldset>'+action('check-capacity','Check capacity')+'<ul class="planning-list">'+parents.slice(0,FEASIBILITY_LIMIT).map(task=>{
   const r=assignmentFeasibility(state,task.id,{...filters,timezone:timezone()},clock());
   return '<li><div><strong>'+esc(task.title)+' — '+esc(labels[r.status])+'</strong><span>'+r.remainingMinutes+' minutes remaining'+(r.availableMinutes!==null?' · Up to '+r.availableMinutes+' free minutes for '+r.movableMinutes+' movable minutes':'')+(r.shortfallMinutes?' · At least '+r.shortfallMinutes+' minutes short':'')+'</span><small>'+esc(r.dueDate?'Due '+r.dueDate+'. ':'')+esc(r.reason)+'</small></div>'+(r.canPreview?'<button type="button" data-planning-capacity="'+esc(task.id)+'">Preview session reschedule</button>':taskButton(task.id,'Review assignment'))+'</li>';
  }).join('')+'</ul>'+(parents.length>FEASIBILITY_LIMIT?'<p>Showing the 10 nearest assignment deadlines. Other assignments have not been checked.</p>':'')+(!parents.length?'<p>Create assignment sessions to compare remaining effort with free time.</p>':'');
 }
 function deadlines(){
  const rows=deadlineSummary(data(),clock().date);
  return `<h3>Deadlines and overdue work</h3><p>A deadline is when work is due; the scheduled date is when you plan to work on it. Recurring work is managed by occurrence in Schedule.</p>${capacity()}<h4>All unfinished deadlines</h4>${rows.length?'<ul class="planning-list">'+rows.map(row=>`<li><div><strong>${esc(row.task.title)}</strong><span>${row.dueDate?'Due '+esc(row.dueDate)+' · '+esc(row.status):'No deadline'}${row.afterDeadline?' · Scheduled after deadline':''}</span><small>${esc(row.board.title)} / ${esc(row.section.title)}${row.task.date?' · Planned '+esc(row.task.date):' · Not scheduled'}</small></div>${taskButton(row.task.id)}</li>`).join('')+'</ul>':'<p>No unfinished tasks. Add a task in Routines & Tasks to start planning.</p>'}`;
 }
 function sessions(){
  const entries=planningTasks(data()).filter(({task})=>!task.completed&&!task.recurrence?.enabled&&!task.scheduleLocked&&!task.startTime&&!task.assignmentId&&!planningTasks(data()).some(entry=>entry.task.assignmentId===task.id));
  return `<h3>Break an assignment into work sessions</h3><p>The original task and checklist stay intact. Each reviewed session becomes a separate task linked to that assignment; finishing a session does not finish the assignment.</p>${entries.length?`<label>Assignment<select name="taskId">${entries.map(({task},i)=>`<option value="${esc(task.id)}" ${i===0?'selected':''}>${esc(task.title)}${task.dueDate?' · Due '+esc(task.dueDate):' · No deadline'}</option>`).join('')}</select></label><div class="planning-fields"><label>Total effort (minutes)<input name="totalMinutes" type="number" min="15" max="2400" value="120"></label><label>Minutes per session<input name="sessionMinutes" type="number" min="15" max="120" value="30"></label></div><label><input type="checkbox" name="ordered"> Keep numbered session order (optional)</label><label>Session titles, optional; listed in session order<textarea name="labels" rows="3" placeholder="Research\nOutline\nDraft\nReview"></textarea></label><p class="planning-hint">One title per generated session, or leave blank for numbered sessions. At most 40 sessions. Tasks without deadlines use the range end.</p>${availability()}${action('preview-sessions','Preview sessions')}`:'<p>No eligible assignments. Choose an unfinished ordinary task without a scheduled start or existing sessions. Locked tasks and recurring series are managed in Schedule.</p>'}`;
 }
 function sessionPlans(){
  const all=(data().boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>section.tasks||[]));
  const parents=planningTasks(data()).filter(({task})=>!task.completed&&!task.assignmentId&&!task.recurrence?.enabled&&all.some(child=>child.assignmentId===task.id));
  if(!parents.length)return '<h3>Manage session plans</h3><p>No active assignments with session plans. Create sessions in Assignment sessions first.</p>';
  const pending=planningTasks(data()).filter(({task})=>task.assignmentId===parents[0].task.id&&!task.completed).map(entry=>entry.task);
  return `<h3>Manage session plans</h3><p>Completed sessions, notes and checklists stay intact. Adjusting remaining effort reuses unfinished tasks, adds sessions when needed, and archives surplus sessions for recovery in Archive.</p><label>Assignment<select name="revisionTaskId">${parents.map(({task},index)=>`<option value="${esc(task.id)}" ${index===0?'selected':''}>${esc(task.title)}</option>`).join('')}</select></label><div class="planning-fields"><label>Remaining planned effort (minutes)<input name="remainingMinutes" type="number" min="0" max="2400" value="${pending.reduce((sum,task)=>sum+taskDurationMinutes(task),0)}"></label><label>Minutes per session<input name="revisionSessionMinutes" type="number" min="15" max="120" value="30"></label></div><label><input type="checkbox" name="revisionOrdered" ${parents[0].task.sessionOrder==='sequential'?'checked':''}> Keep numbered session order</label><p class="planning-hint">Ordering changes apply with Preview effort changes. Reschedule uses the saved ordering setting and includes affected later sessions in its preview. Remaining effort excludes completed sessions. Zero archives every unfinished session; it does not complete the assignment. Unlock unfinished sessions before changing effort. Reschedule moves unfinished, unlocked ordinary sessions and preserves their durations.</p>${availability()}${action('preview-session-revision','Preview effort changes')}${action('preview-session-reschedule','Preview reschedule')}`;
 }
 function conflicts(){
  const pairs=planningConflicts(data(),filters.from,filters.to),movable=item=>item.kind==='task'&&!item.locked;
  return `<h3>Schedule conflicts</h3>${availability()}${action('check-conflicts','Check range')}<p>${pairs.length?pairs.length+' overlap'+(pairs.length===1?'':'s')+' in this range. Choose the task you want to move; fixed and recurring commitments stay put.':'No overlaps in this range.'}</p><ul class="planning-list">${pairs.map(pair=>`<li><div><strong>${esc(pair.a.title)} / ${esc(pair.b.title)}</strong><span>${esc(pair.date)} · Overlapping times</span><small>${pair.a.locked||pair.b.locked?'Includes a locked, recurring, or fixed commitment.':''}</small></div><div>${[pair.a,pair.b].filter(movable).map(item=>`<button type="button" data-planning-resolve="${esc(item.taskId)}">Find time for ${esc(item.title)}</button>`).join('')||'Edit these commitments in Schedule.'}</div></li>`).join('')}</ul>`;
 }
 function review(){
  const r=weeklyReview(data(),week,clock().date);
  return `<h3>Weekly review</h3><label>Week containing<input type="date" name="week" value="${esc(week)}"></label>${action('review-week','Review week')}<p>${esc(r.from)} through ${esc(r.to)}: ${r.completed.length} completed, ${r.pending.length} unfinished, ${r.slipped.length} slipped.</p><p class="planning-hint">Current completion status of work dated/scheduled in this week, including recurring occurrences. These are not completion-date statistics.</p><details><summary>Completed work (${r.completed.length})</summary><ul>${r.completed.map(item=>`<li>${esc(item.title)} · ${esc(item.date)}</li>`).join('')||'<li>No completed dated work.</li>'}</ul></details><h4>Choose unfinished work to reschedule</h4><ul class="planning-list">${r.pending.map(item=>`<li><label><input type="checkbox" name="carryover" value="${esc(item.task.id)}" ${item.occurrenceDate||item.task.scheduleLocked?'disabled':''}><span><strong>${esc(item.title)}</strong> · ${esc(item.date)}${item.date<clock().date?' · Slipped':''}${item.occurrenceDate?' · Edit occurrence in Schedule':item.task.scheduleLocked?' · Locked':''}</span></label></li>`).join('')||'<li>No unfinished work in this week.</li>'}</ul>${availability()}${action('preview-carryover','Preview selected carry-over')}<h4>Deadlines in the following week</h4><ul class="planning-list">${r.nextDeadlines.map(item=>`<li><span>${esc(item.task.title)} · Due ${esc(item.dueDate)}</span>${taskButton(item.task.id)}</li>`).join('')||'<li>No upcoming deadlines in the following week.</li>'}</ul>`;
 }
 function preview(){return `${pending.command.ordered!==undefined?'<p>Session order: '+(pending.command.ordered?'numbered sequence (earlier work first)':'independent placement')+'.</p>':''}${pending.notice?'<p>'+esc(pending.notice)+'</p>':''}${pending.archivedRows?.length?'<h3>Sessions to archive ('+pending.archivedRows.length+')</h3><ul>'+pending.archivedRows.map(row=>'<li>'+esc(row.title)+'</li>').join('')+'</ul><p>These sessions leave the active plan. Their notes and checklists remain in Archive.</p>':''}${pending.command.mode==='revise-sessions'?'<p>Review revised remaining effort. Existing unfinished sessions may change duration, new sessions may be added, and completed work stays intact.</p>':''}<h3>Review ${pending.command.mode==='sessions'?'new work sessions':'schedule changes'}</h3><p>${pending.command.mode==='sessions'?'New tasks will be added; your assignment stays intact.':pending.command.mode==='revise-sessions'?'Listed sessions will be resized, added, or archived as shown. The assignment and completed sessions stay intact.':'Only the listed tasks will move; their durations and deadlines stay intact.'} Nothing changes until you Apply.</p><div class="planning-table-wrap"><table><caption>Proposed work in ${esc(pending.command.options?.timezone)}</caption><thead><tr><th>Task</th><th>Date</th><th>Time</th><th>Minutes</th></tr></thead><tbody>${pending.command.rows.map(row=>`<tr data-planning-preview-row><th scope="row">${esc(row.title)}</th><td>${esc(row.date)}</td><td>${esc(row.startTime)}–${esc(row.endTime)}</td><td>${esc(row.minutes)}</td></tr>`).join('')}</tbody></table></div>${pending.phase==='uncertain'?'<p>Retry uses the same operation and session IDs. Discarding a preview does not undo a save that may already have reached the cloud.</p>':''}`}
 function render(){
  if(!dialog)return;
  dialog.innerHTML=`<header><h2 id="planning-title" tabindex="-1">Planning</h2>${action('close','Close',busy)}</header><nav aria-label="Planning views">${Object.entries(VIEWS).map(([id,label])=>`<button type="button" data-planning-tab="${id}" aria-pressed="${view===id}" ${pending?'disabled':''}>${label}</button>`).join('')}</nav><div class="planning-content">${pending?preview():({deadlines,sessions,plans:sessionPlans,conflicts,review}[view])()}</div><p data-planning-status role="status" aria-live="polite"></p><footer>${pending?action('discard','Discard preview',busy)+action('apply',busy?'Saving…':pending.phase==='uncertain'?'Retry same changes':'Apply changes',busy):''}</footer>`;
  setStatus(status);if(busy)dialog.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
 }
 function open(){
  if(dialog)return;scope=identity();if(!scope.ownerId||!scope.planId)return;
  const current=clock();filters={from:current.date,to:shiftPlanningDate(current.date,6),dayStart:'07:00',dayEnd:'22:00'};week=planningWeekStart(current.date);
  const stored=read();pending=stored||memory.get(scopeKey(scope))||null;persisted=!!stored;status=pending?'Recovered a planning preview. Review it before applying or retrying.'+(persisted?'':' Keep this tab open: recovery storage is unavailable.'):'';
  dialog=document.createElement('dialog');dialog.className='planning-hub';dialog.setAttribute('aria-labelledby','planning-title');dialog.addEventListener('click',click);dialog.addEventListener('change',event=>{if(event.target.name==='revisionTaskId'){const selected=event.target.value;dialog.querySelector('[name="revisionOrdered"]').checked=planningTasks(data()).find(({task})=>task.id===selected)?.task.sessionOrder==='sequential';dialog.querySelector('[name="remainingMinutes"]').value=planningTasks(data()).filter(({task})=>task.assignmentId===selected&&!task.completed).reduce((sum,{task})=>sum+taskDurationMinutes(task),0)}});dialog.addEventListener('cancel',event=>{event.preventDefault();close()});document.body.appendChild(dialog);render();if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('h2').focus();
 }
 function prepare(result){
  pending={version:1,...scope,operationId:'planning-'+globalThis.crypto.randomUUID(),createdAt:now(),command:result.command,expected:result.expected,notice:result.notice||'',archivedRows:(result.command.archiveIds||[]).map(id=>({id,title:planningTasks(data()).find(entry=>entry.task.id===id)?.task.title||id})),phase:'preview'};persist();status=persisted?'Preview ready. Review every row, then Apply changes.':'Preview recovery is unavailable. Keep this tab open until the save is confirmed.';render();dialog.querySelector('h3')?.scrollIntoView?.({block:'nearest'});
 }
 async function apply(){
  if(!pending||busy)return;const attempt=pending,ticket=++revision,actor=scopeKey(scope);busy=true;pending.phase='uncertain';persist();status=persisted?'Saving reviewed changes…':'Saving reviewed changes. Keep this tab open until confirmed.';render();
  try{
   if(typeof bridge()?.commitTaskCommand!=='function')throw Error('Planner storage is unavailable.');
   await bridge().commitTaskCommand(attempt.command,attempt.expected,{ownerId:attempt.ownerId,planId:attempt.planId,operationId:attempt.operationId,createdAt:attempt.createdAt});
   if(ticket!==revision||scopeKey(identity())!==actor)return;
   clearRecord();pending=null;status='Saved the reviewed planning changes.';
  }catch(error){if(ticket!==revision||scopeKey(identity())!==actor)return;status='Could not confirm this save. '+String(error?.message||'Try again.')+' Retry the same changes, or check the planner before discarding.'+(persisted?'':' Keep this tab open: recovery storage is unavailable.');}
  finally{if(ticket===revision&&scopeKey(identity())===actor){busy=false;render();dialog?.querySelector('[data-planning-status]')?.scrollIntoView?.({block:'nearest'})}}
 }
 function click(event){
  if(scopeKey(identity())!==scopeKey(scope)){sync();return}if(busy)return;
  const tab=event.target.closest('[data-planning-tab]')?.dataset.planningTab;if(tab&&!pending&&Object.hasOwn(VIEWS,tab)){view=tab;status='';render();return}
  const task=event.target.closest('[data-planning-task]')?.dataset.planningTask;if(task){close();void bridge()?.openTaskEditor?.({taskId:task});return}
  const resolve=event.target.closest('[data-planning-resolve]')?.dataset.planningResolve;
  const name=event.target.closest('[data-planning-action]')?.dataset.planningAction;
  const capacityId=event.target.closest('[data-planning-capacity]')?.dataset.planningCapacity;
  try{
   if(name==='check-capacity'){capture();render();setStatus('Capacity checked against the current planner.');return}
   if(capacityId){
    const input=capture(),state=data(),current=clock(),r=assignmentFeasibility(state,capacityId,input,current);if(!r.canPreview)throw Error(r.reason);
    const taskIds=planningTasks(state).filter(({task})=>task.assignmentId===capacityId&&!task.completed&&!task.scheduleLocked).map(({task})=>task.id);
    prepare(previewCarryover(state,{...input,from:current.date,to:r.dueDate,taskIds},current));return;
   }
   if(resolve){prepare(previewCarryover(data(),{...capture(),taskIds:[resolve]},clock()));return}
   if(name==='close'){close();return}
   if(name==='discard'){clearRecord();pending=null;status='Preview discarded. No undo was performed.';render();return}
   if(name==='apply'){void apply();return}
   if(name==='preview-session-revision'){prepare(previewSessionRevision(data(),{...capture(),ordered:dialog.querySelector('[name="revisionOrdered"]').checked,taskId:dialog.querySelector('[name="revisionTaskId"]').value,remainingMinutes:dialog.querySelector('[name="remainingMinutes"]').value,sessionMinutes:Number(dialog.querySelector('[name="revisionSessionMinutes"]').value)},clock()));return}
   if(name==='preview-session-reschedule'){
    const parentId=dialog.querySelector('[name="revisionTaskId"]').value,sessions=planningTasks(data()).map(entry=>entry.task).filter(task=>task.assignmentId===parentId&&!task.completed),movable=sessions.filter(task=>!task.scheduleLocked&&!task.recurrence?.enabled),result=previewCarryover(data(),{...capture(),taskIds:movable.map(task=>task.id)},clock());
    result.notice=[result.notice,sessions.length>movable.length?(sessions.length-movable.length)+' locked or recurring sessions stay at their current times.':''].filter(Boolean).join(' ');prepare(result);return;
   }
   if(name==='preview-sessions'){const input=n=>dialog.querySelector('[name="'+n+'"]').value;prepare(previewSessions(data(),{...capture(),ordered:dialog.querySelector('[name="ordered"]').checked,taskId:input('taskId'),totalMinutes:Number(input('totalMinutes')),sessionMinutes:Number(input('sessionMinutes')),labels:input('labels').trim()?input('labels').split('\n').map(value=>value.trim()).filter(Boolean):[]},clock()));return}
   if(name==='preview-carryover'){prepare(previewCarryover(data(),{...capture(),taskIds:[...dialog.querySelectorAll('[name="carryover"]')].filter(el=>el.checked&&!el.disabled).map(el=>el.value)},clock()));return}
   if(name==='check-conflicts'){capture();render();return}
   if(name==='review-week'){week=planningWeekStart(dialog.querySelector('[name="week"]').value);capture();render()}
  }catch(error){setStatus(String(error?.message||'Review the planning inputs.'))}
 }
 function unload(event){if(pending&&!persisted){event.preventDefault();event.returnValue=''}}
 const observer=window.MutationObserver?new window.MutationObserver(sync):null;observer?.observe(toolbar,{childList:true});
 window.addEventListener('kairos-data-changed',sync);window.addEventListener('kairos-page-ready',sync);window.addEventListener('beforeunload',unload);ensureButton();
 return {open,dispose(){close(true);observer?.disconnect();window.removeEventListener('kairos-data-changed',sync);window.removeEventListener('kairos-page-ready',sync);window.removeEventListener('beforeunload',unload);toolbar.querySelector('[data-planning-open]')?.remove()}};
}
function boot(){if(typeof document==='undefined'||typeof window==='undefined'||window.__kairosPlanningHub||!window.__kairosScheduleBridge)return;window.__kairosPlanningHub=mountPlanningHub()}
if(typeof window!=='undefined'){window.addEventListener('kairos-schedule-bridge-ready',boot);boot()}
