import {taskDetailValues,buildScheduleChange,buildRecurringInspectorCommand,buildInspectorDelete} from './task-list-model.js?v=25';
import {recurringEditPreview} from './recurrence-edit.js?v=5';
import {bindTaskFocus} from './task-focus.js?v=6';
import {bindDeadlineImpact} from './deadline-impact.js?v=6';
import { confirmDialog } from './ui-dialogs.js?v=1';
import { normalizeTaskMetadata, scheduleFieldsFromDuration, taskDurationMinutes, toDateKey } from './schedule-utils.js?v=5';
import { recurrenceFieldsMarkup, bindRecurrenceFields, readRecurrenceFields, showRecurrenceScopeDialog } from './schedule-recurrence-ui.js?v=12';
import { projectStoredOccurrence, generateTaskOccurrences, formatRecurrenceSummary } from './recurrence-utils.js?v=14';

import {createScheduleInspectorSession} from './schedule-inspector-session.js?v=3';

import {assignmentProgressIndex,assignmentProgressMarkup,refreshAssignmentProgress} from './assignment-progress.js?v=7';
import {planningClock} from './planning-model.js?v=1';
let session;
const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const validTaskColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null;
const makeId=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

function entries(){
  const out=[];for(const board of bridge()?.getBoards?.()||[]){if(board?.archived)continue;for(const section of board?.sections||[]){if(section?.archived)continue;for(const task of section?.tasks||[]){if(!task?.archived)out.push({task,board,section})}}}return out;
}
function findTask(id){return entries().find(x=>String(x.task.id)===String(id))||null}
function showToast(message){document.querySelector('.ks-toast')?.remove();const el=document.createElement('div');el.className='ks-toast';el.setAttribute('role','status');el.textContent=message;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('is-visible'));setTimeout(()=>{el.classList.remove('is-visible');setTimeout(()=>el.remove(),180)},2800)}
function inspectorState(){return {boards:bridge()?.getBoards?.()||[]}}
function createInspectorCommit(){
  let retained,inFlight=false;
  const inspector=document.getElementById('schedule-inspector');
  const same=(a,b)=>a?.ownerId===b?.ownerId&&a?.planId===b?.planId&&a?.operationId===b?.operationId&&a?.createdAt===b?.createdAt;
  const currentScope=()=>retained&&retained.editor?.isConnected&&inspector.contains(retained.editor)&&retained.identity.ownerId===bridge()?.getOwnerId?.()&&retained.identity.planId===bridge()?.getPlanId?.();
  function clear(){retained=null;inspector.querySelector('[data-inspector-recovery]')?.remove();}
  function confirmed(){const saved=retained;clear();saved.onSaved?.();if(saved.submitted)session?.acknowledge(saved.submitted);bridge()?.refreshAppViews?.();}
  inspector.__mutationRecovery=(identity,status)=>{
    if(!retained||!currentScope()||!same(identity,retained.identity))return;
    if(status==='discarded'){clear();return;}
    if(status==='saved'&&!inFlight){confirmed();showToast('Saved task changes.');}
  };
  function controls(){
    if(!retained||!currentScope())return;
    let box=inspector.querySelector('[data-inspector-recovery]');
    if(!box){box=document.createElement('div');box.dataset.inspectorRecovery='';box.innerHTML='<p role="status">This action is unconfirmed. Retry checks its original operation. Your edits are still here.</p><button type="button" data-inspector-retry>Retry save</button><button type="button" data-inspector-clear>Clear recovery</button>';inspector.appendChild(box);
      box.querySelector('[data-inspector-retry]').addEventListener('click',()=>void session.run(current=>submit(current)));
      box.querySelector('[data-inspector-clear]').addEventListener('click',async()=>{const saved=retained;if(!saved||!await confirmDialog('This action may already have saved. Check the planner before clearing recovery. Clearing does not undo saved work.',{confirmText:'Clear recovery'})||retained!==saved||!currentScope())return;bridge()?.discardScheduleRecovery?.(saved.identity);clear();});
    }
  }
  async function submit(current){
    if(!retained||!currentScope())throw Error('The signed-in account or planner changed.');
    if(typeof bridge()?.commitScheduleCommand!=='function')throw Error('Schedule saving is unavailable. Your edits are still here.');
    const saved=retained;inFlight=true;
    try{await bridge().commitScheduleCommand(saved.command,saved.expected,saved.identity);if(!current())return false;confirmed();showToast(saved.message);return true;}
    catch(error){controls();throw error;}
    finally{inFlight=false;}
  }
  return async(op,message,current,onSaved,saveDraft=false)=>{
    const intent=JSON.stringify({...op.command,timestamp:undefined,newTaskId:undefined});
    const ownerId=bridge()?.getOwnerId?.(),planId=bridge()?.getPlanId?.();
    if(retained&&!currentScope())clear();
    if(retained&&retained.intent!==intent)throw Error('Retry or clear the interrupted change before submitting another action.');
    if(!retained)retained={...structuredClone(op),editor:inspector.querySelector('form,[data-ks-occurrence-inspector]'),intent,message,onSaved,submitted:saveDraft?session?.capture():null,identity:{ownerId,planId,operationId:makeId('inspector'),createdAt:Date.now()}};
    return submit(current);
  };
}
function boardOptions(currentId){return (bridge()?.getBoards?.()||[]).filter(b=>!b.archived).map(b=>`<option value="${esc(b.id)}" ${String(b.id)===String(currentId)?'selected':''}>${esc(b.title)}</option>`).join('')}
function sectionOptions(board,currentId){return (board?.sections||[]).filter(s=>!s.archived).map(s=>`<option value="${esc(s.id)}" ${String(s.id)===String(currentId)?'selected':''}>${esc(s.title)}</option>`).join('')}

function lockCompletedSchedule(form,completed){
  if(!form)return;const locked=completed&&!bridge()?.getAllowCompletedReschedule?.();
  for(const name of ['date','start','duration']){const input=form.querySelector('[name="'+name+'"]');if(input)input.disabled=!!(locked||session?.isBusy());}
  const unschedule=form.querySelector('[data-unschedule]');if(unschedule)unschedule.disabled=!!(locked||session?.isBusy());
}
function richMarkup(found){
  const {task,board,section}=found;normalizeTaskMetadata(task);const duration=taskDurationMinutes(task),color=validTaskColor(task.color)||'#a855f7';
  return `<div class="ks-inspector-head"><span>Task</span><button type="button" data-close aria-label="Close inspector">×</button></div><form class="ks-inspector-form" data-ks-rich-inspector><div data-assignment-detail>${assignmentProgressMarkup(assignmentProgressIndex({boards:bridge()?.getBoards?.()||[]},planningClock(Date.now(),bridge()?.getTimezone?.()||'UTC').date).get(task.id),{details:true})}</div>
    <div data-task-focus></div><label>Title<input name="title" maxlength="180" value="${esc(task.title)}"></label>
    <div class="ks-form-grid"><label>Date<input name="date" type="date" value="${esc(task.date||'')}"></label><label>Start<input name="start" type="time" step="60" value="${esc(task.startTime||'')}"></label></div>
    <div class="ks-form-grid"><label>Duration (min)<input name="duration" type="number" min="1" step="1" value="${duration}"></label><label>Due date<input name="dueDate" type="date" value="${esc(task.dueDate||'')}"></label></div><div data-deadline-impact></div>
    ${recurrenceFieldsMarkup(task,{fallbackDate:task.date||null})}
    <div class="ks-inspector-location"><span>${esc(board.title)} / ${esc(section.title)}</span><button type="button" data-toggle-move>Move</button></div>
    <div class="ks-move-fields" hidden><label>Board<select name="board">${boardOptions(board.id)}</select></label><label>Section<select name="section">${sectionOptions(board,section.id)}</select></label><button type="button" data-move>Move task</button></div>
    <details><summary>More details</summary><div class="ks-details-body"><div class="ks-form-grid"><label>Priority<select name="priority"><option value="">None</option><option value="low" ${task.priority==='low'?'selected':''}>Low</option><option value="medium" ${task.priority==='medium'?'selected':''}>Medium</option><option value="high" ${task.priority==='high'?'selected':''}>High</option></select></label><label>Estimate (min)<input name="estimate" type="number" min="1" step="1" value="${task.estimatedMinutes??''}"></label></div>
      <label>Task color<div class="ks-color-control"><input name="color" type="color" value="${color}" aria-label="Task color"><button type="button" data-reset-color>${task.color?'Use theme color':'Theme color'}</button></div></label><label>Notes<textarea name="notes" rows="4" maxlength="3000">${esc(task.notes||'')}</textarea></label>
      <div class="ks-form-grid"><label>Reminder<select name="reminder">${Number.isInteger(task.reminderMinutes)&&task.reminderMinutes>0&&task.reminderMinutes<=10080&&![5,15,30,60].includes(task.reminderMinutes)?'<option value="'+task.reminderMinutes+'" selected>'+task.reminderMinutes+' min before</option>':''}<option value="">None</option><option value="5" ${task.reminderMinutes===5?'selected':''}>5 min before</option><option value="15" ${task.reminderMinutes===15?'selected':''}>15 min before</option><option value="30" ${task.reminderMinutes===30?'selected':''}>30 min before</option><option value="60" ${task.reminderMinutes===60?'selected':''}>1 hour before</option></select></label><label>Preferred time<select name="preference"><option value="">No preference</option><option value="morning" ${task.schedulingPreference==='morning'?'selected':''}>Morning</option><option value="afternoon" ${task.schedulingPreference==='afternoon'?'selected':''}>Afternoon</option><option value="evening" ${task.schedulingPreference==='evening'?'selected':''}>Evening</option></select></label></div><label class="ks-check-row"><input name="locked" type="checkbox" ${task.scheduleLocked?'checked':''}> Keep this time fixed for AI planning</label></div></details>
    <div class="ks-inspector-actions ks-inspector-primary"><button type="submit" class="ks-primary">Save</button><button type="button" data-complete>${task.completed?'Mark incomplete':'Complete'}</button><button type="button" data-unschedule ${!task.date&&!task.startTime?'disabled':''}>Unschedule</button><button type="button" data-ask-ai>Ask AI</button></div><button type="button" class="ks-delete-task" data-delete>Delete task</button></form>`;
}

function enhanceTask(inspector,selected){
  const found=findTask(selected.id);if(!found)return;lockCompletedSchedule(inspector.querySelector("form"),found.task.completed);if(inspector.dataset.enhancedFor===String(selected.id)&&inspector.querySelector('[data-ks-rich-inspector]')){inspector.__deadlineImpact?.refresh();inspector.__taskFocus?.refresh();refreshAssignmentProgress(inspector.querySelector('[data-assignment-detail]'),assignmentProgressIndex({boards:bridge()?.getBoards?.()||[]},planningClock(Date.now(),bridge()?.getTimezone?.()||'UTC').date).get(found.task.id),{details:true});return;}
  inspector.dataset.enhancedFor=String(selected.id);inspector.innerHTML=richMarkup(found);const form=inspector.querySelector('form');let {task,section}=found;form.dataset.colorCustom=validTaskColor(task.color)?'1':'0';const refreshRecurrence=bindRecurrenceFields(form,{fallbackDate:task.date||task.recurrence?.startDate||null});
  inspector.querySelector('[data-close]')?.addEventListener('click',()=>workspace()?.clearSelection?.());form.elements.board?.addEventListener('change',()=>{const target=(bridge()?.getBoards?.()||[]).find(b=>String(b.id)===String(form.elements.board.value));form.elements.section.innerHTML=sectionOptions(target,'')});inspector.querySelector('[data-toggle-move]')?.addEventListener('click',()=>{const box=inspector.querySelector('.ks-move-fields');box.hidden=!box.hidden});form.elements.color?.addEventListener('input',()=>{form.dataset.colorCustom='1';const reset=inspector.querySelector('[data-reset-color]');if(reset)reset.textContent='Use theme color'});inspector.querySelector('[data-reset-color]')?.addEventListener('click',event=>{form.dataset.colorCustom='0';event.currentTarget.textContent='Theme color'});
  form.addEventListener('click',event=>{const button=event.target.closest('[data-assignment-open]');if(button)void workspace()?.selectItem?.('task',button.dataset.assignmentOpen)});
  inspector.__deadlineImpact?.dispose();inspector.__deadlineImpact=bindDeadlineImpact({root:form,taskId:task.id,getState:()=>({boards:bridge()?.getBoards?.()||[]}),isBlocked:()=>!!session?.isBusy(),onReview:async id=>{if(typeof window.__kairosPlanningHub?.openAssignmentReview!=='function'){showToast('Planning is still loading. Try again shortly.');return}const actor=bridge()?.getOwnerId?.(),planId=bridge()?.getPlanId?.();if(await workspace()?.clearSelection?.()&&actor===bridge()?.getOwnerId?.()&&planId===bridge()?.getPlanId?.())window.__kairosPlanningHub?.openAssignmentReview(id,{ownerId:actor,planId})}});
  inspector.__taskFocus?.dispose();inspector.__taskFocus=bindTaskFocus({root:form,taskId:task.id,getState:()=>({boards:bridge()?.getBoards?.()||[]}),isBlocked:()=>!!session?.isBusy(),onStart:id=>bridge()?.startTaskFocus?.(id)});
  lockCompletedSchedule(form,task.completed);
  let initialValues=formValues();const baseline=structuredClone(taskDetailValues(task)),location={boardId:found.board.id,sectionId:found.section.id},commit=createInspectorCommit();
  const run=(action,save=false)=>session.run(current=>{const latest=findTask(selected.id);if(!latest){showToast('This task is no longer available.');return false}({task,section}=latest);return action(current)},{save});session.track(form,()=>run(saveForm,true),{onRestore:refreshRecurrence});
  form.addEventListener('submit',event=>{event.preventDefault();void run(saveForm,true)});inspector.querySelector('[data-complete]')?.addEventListener('click',()=>void run(toggleComplete));inspector.querySelector('[data-unschedule]')?.addEventListener('click',()=>void run(unschedule));inspector.querySelector('[data-move]')?.addEventListener('click',()=>void run(moveTask));inspector.querySelector('[data-ask-ai]')?.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('kairos-schedule-ai-task',{detail:{taskId:task.id}})));inspector.querySelector('[data-delete]')?.addEventListener('click',()=>{const owner=bridge()?.getOwnerId?.(),plan=bridge()?.getPlanId?.();void run(deleteTask).then(saved=>{if(saved&&owner===bridge()?.getOwnerId?.()&&plan===bridge()?.getPlanId?.()){session.reset();void workspace()?.clearSelection?.()}})});
  function formValues(){const duration=Math.max(1,Number(form.elements.duration.value)||60),recurrence=readRecurrenceFields(form,form.elements.date.value||task.recurrence?.startDate||null);return Object.assign({durationMinutes:duration},scheduleFieldsFromDuration(form.elements.date.value,form.elements.start.value,duration),{title:form.elements.title.value.trim()||task.title,dueDate:form.elements.dueDate.value||null,priority:form.elements.priority.value||null,estimatedMinutes:form.elements.estimate.value?Math.max(1,Number(form.elements.estimate.value)):null,notes:form.elements.notes.value.trim(),reminderMinutes:form.elements.reminder.value?Number(form.elements.reminder.value):null,schedulingPreference:form.elements.preference.value||null,scheduleLocked:form.elements.locked.checked,color:form.dataset.colorCustom==='1'?validTaskColor(form.elements.color.value):null,recurrence})}
  async function saveForm(current){
    const values=formValues();if(values.recurrence?.mode==='fixed'&&!form.elements.start.value){showToast('Fixed recurring tasks need a start time.');return false}
    const changes=Object.fromEntries(Object.entries(values).filter(([name,value])=>name!=='endTime'&&JSON.stringify(value)!==JSON.stringify(initialValues[name])));
    if(!Object.keys(changes).length)return true;
    const fields=Object.fromEntries(Object.keys(changes).map(key=>[key,baseline[key]]));
    if(['startTime','durationMinutes'].some(key=>Object.hasOwn(changes,key)))for(const key of ['date','startTime','durationMinutes'])fields[key]=baseline[key];
    const saved=await commit({command:{type:'edit_task',target:{taskId:task.id},changes},expected:{...location,fields}},'Saved task changes.',current,()=>{initialValues=values;Object.assign(baseline,taskDetailValues(findTask(task.id)?.task||task))},true);
    return saved;
  }
  async function toggleComplete(current){const value=task.completed===true;return commit({command:{type:'complete_task',target:{taskId:task.id},value:!value},expected:{...location,value}},value?'Task reopened.':'Task completed.',current)}
  async function unschedule(current){
    const op=buildScheduleChange(inspectorState(),{taskId:task.id},{date:null,startTime:null,endTime:null,lastScheduledMinutes:taskDurationMinutes(task)},{allowCompleted:bridge()?.getAllowCompletedReschedule?.()===true});
    return commit(op,'Task moved to Unscheduled.',current);
  }
  async function moveTask(current){
    const boards=bridge()?.getBoards?.()||[],destBoard=boards.find(b=>String(b.id)===String(form.elements.board.value)),destSection=destBoard?.sections?.find(s=>String(s.id)===String(form.elements.section.value));
    if(!destSection){showToast('Choose a destination section.');return false}if(destSection===section){showToast('Task is already in that section.');return false}
    const latest=findTask(task.id),op={command:{type:'move_task',target:{taskId:task.id},destination:{boardId:destBoard.id,sectionId:destSection.id,index:destSection.tasks?.length||0}},expected:{...location,sourceOrder:latest.section.tasks.map(task=>task.id),destinationOrder:(destSection.tasks||[]).map(task=>task.id)}};
    const saved=await commit(op,'Task moved.',current,()=>Object.assign(location,{boardId:destBoard.id,sectionId:destSection.id}));return saved;
  }
  async function deleteTask(current){
    const owner=bridge()?.getOwnerId?.(),plan=bridge()?.getPlanId?.(),op=buildInspectorDelete(inspectorState(),task.id);
    if(!await confirmDialog(`Delete "${task.title}"?`,{destructive:true,confirmText:'Delete'}))return false;
    if(!current()||owner!==bridge()?.getOwnerId?.()||plan!==bridge()?.getPlanId?.())return false;
    return commit(op,'Task deleted.',current);
  }
}

function occurrenceSelection(selected){const occurrenceId=selected?.occurrenceId||selected?.id||'',parts=String(occurrenceId).split('::');return {seriesId:selected?.seriesId||parts[0]||null,occurrenceId,occurrenceDate:selected?.occurrenceDate||parts[1]||null}}
function effectiveOccurrence(found,selection){return (['completed','skipped'].includes(found.task.recurrence?.exceptions?.[selection.occurrenceDate]?.status)?projectStoredOccurrence(found.task,selection.occurrenceDate):generateTaskOccurrences(found.task,selection.occurrenceDate,selection.occurrenceDate,{today:toDateKey(new Date())})[0])||null}
function skippedOccurrencesMarkup(task){const dates=Object.entries(task.recurrence?.exceptions||{}).filter(([,value])=>value?.status==='skipped').map(([date])=>date).sort().reverse().slice(0,5);return dates.length?'<details class="ks-skipped-occurrences"><summary>Recent skipped dates</summary>'+dates.map(date=>'<button type="button" data-skipped-date="'+esc(date)+'">'+esc(date)+'</button>').join('')+'</details>':''}
function occurrenceViewMarkup(found,occurrence){const time=occurrence.startTime?`${esc(occurrence.startTime)}${occurrence.endTime?`–${esc(occurrence.endTime)}`:''}`:'Unscheduled';return `<div class="ks-inspector-head"><span>Recurring task</span><button type="button" data-close aria-label="Close inspector">×</button></div><div class="ks-inspector-body" data-ks-occurrence-inspector><h3>${esc(occurrence.task.title)}</h3><p>${esc(formatRecurrenceSummary(found.task))}</p><dl><div><dt>Occurrence</dt><dd>${esc(occurrence.displayDate)}</dd></div><div><dt>Time</dt><dd>${time}</dd></div><div><dt>Status</dt><dd>${esc(occurrence.status)}</dd></div></dl><p class="ks-occurrence-status-note">${occurrence.status==='completed'?'Completed: this date counts as done. Restore returns it to pending.':occurrence.status==='skipped'?'Skipped: this date is left out of planning. Restore keeps its custom time and progress.':'Complete marks this date done. Skip leaves it out of planning without completing it.'}</p><div data-task-focus></div><div class="ks-inspector-actions"><button type="button" class="ks-primary" data-occurrence-complete ${occurrence.status!=='pending'?'disabled':''}>Complete occurrence</button><button type="button" data-occurrence-skip ${occurrence.status!=='pending'?'disabled':''}>Skip occurrence</button>${['completed','skipped'].includes(occurrence.status)?'<button type="button" data-occurrence-restore>Restore occurrence</button>':''}<button type="button" data-occurrence-edit>Edit</button><button type="button" data-occurrence-ask-ai>Ask AI</button></div>${skippedOccurrencesMarkup(found.task)}<button type="button" class="ks-delete-task" data-occurrence-delete>Delete…</button></div>`}
function occurrenceEditMarkup(found,occurrence){const task=occurrence.task,color=validTaskColor(task.color)||'#a855f7';return `<div class="ks-inspector-head"><span>Edit recurring task</span><button type="button" data-occurrence-cancel aria-label="Cancel editing">×</button></div><form class="ks-inspector-form" data-ks-occurrence-edit><label>Title<input name="title" maxlength="180" value="${esc(task.title)}"></label><div class="ks-form-grid"><label>Date<input name="date" type="date" value="${esc(occurrence.displayDate)}"></label><label>Start<input name="start" type="time" step="60" value="${esc(occurrence.startTime||'')}"></label></div><div class="ks-form-grid"><label>Duration (min)<input name="duration" type="number" min="1" step="1" value="${occurrence.durationMinutes}"></label><label>Due date<input name="dueDate" type="date" value="${esc(task.dueDate||'')}"></label></div>${recurrenceFieldsMarkup(found.task,{fallbackDate:occurrence.occurrenceDate})}<div class="ks-form-grid"><label>Priority<select name="priority"><option value="">None</option><option value="low" ${task.priority==='low'?'selected':''}>Low</option><option value="medium" ${task.priority==='medium'?'selected':''}>Medium</option><option value="high" ${task.priority==='high'?'selected':''}>High</option></select></label><label>Estimate (min)<input name="estimate" type="number" min="1" value="${task.estimatedMinutes??''}"></label></div><label>Notes<textarea name="notes" rows="4">${esc(task.notes||'')}</textarea></label><div class="ks-color-control"><input name="color" type="color" value="${color}"><button type="button" data-occurrence-reset-color>${task.color?'Use theme color':'Theme color'}</button></div><div class="ks-inspector-actions"><button type="submit" class="ks-primary">Save</button><button type="button" data-occurrence-cancel>Cancel</button></div></form>`}

function occurrenceFocusVersion(occurrence){return JSON.stringify([occurrence.status,occurrence.displayDate,occurrence.startTime,occurrence.endTime,occurrence.durationMinutes,occurrence.task.title,occurrence.task.focusLoggedSeconds,occurrence.task.remainingMinutes])}
function enhanceOccurrence(inspector,selected){
  const selection=occurrenceSelection(selected);let found=findTask(selection.seriesId);if(!found||!selection.occurrenceDate)return;const occurrence=effectiveOccurrence(found,selection);if(!occurrence)return;
  const key=`${selection.occurrenceId}:view`;if(inspector.dataset.enhancedFor===key&&inspector.querySelector('[data-ks-occurrence-inspector]')&&inspector.dataset.focusVersion===occurrenceFocusVersion(occurrence)){inspector.__taskFocus?.refresh();return;}inspector.dataset.enhancedFor=key;renderView();
  const run=(action,save=false)=>session.run(action,{save}),commit=createInspectorCommit(),location={boardId:found.board.id,sectionId:found.section.id};
  function recurringCommand(intent){const op=buildRecurringInspectorCommand(inspectorState(),{taskId:selection.seriesId,occurrenceDate:selection.occurrenceDate},intent);Object.assign(op.expected,location);return op}
  function renderView(){found=findTask(selection.seriesId);if(!found){void workspace()?.clearSelection?.();return}const current=effectiveOccurrence(found,selection);if(!current){workspace()?.clearSelection?.();return}inspector.__taskFocus?.dispose();inspector.innerHTML=occurrenceViewMarkup(found,current);inspector.dataset.focusVersion=occurrenceFocusVersion(current);inspector.__taskFocus=bindTaskFocus({root:inspector,taskId:selection.seriesId,occurrenceDate:selection.occurrenceDate,getState:()=>({boards:bridge()?.getBoards?.()||[]}),isBlocked:()=>!!session?.isBusy(),onStart:(id,date)=>bridge()?.startTaskFocus?.(id,date)});inspector.dataset.enhancedFor=`${selection.occurrenceId}:view`;inspector.querySelector('[data-close]')?.addEventListener('click',()=>workspace()?.clearSelection?.());inspector.querySelector('[data-occurrence-complete]')?.addEventListener('click',()=>void run(current=>status('completed',current)));inspector.querySelector('[data-occurrence-skip]')?.addEventListener('click',()=>void run(current=>status('skipped',current)));inspector.querySelectorAll('[data-skipped-date]').forEach(button=>button.addEventListener('click',()=>void workspace()?.selectOccurrence({seriesId:selection.seriesId,occurrenceId:selection.seriesId+'::'+button.dataset.skippedDate,occurrenceDate:button.dataset.skippedDate})));inspector.querySelector('[data-occurrence-restore]')?.addEventListener('click',()=>void run(current=>status('pending',current)));inspector.querySelector('[data-occurrence-edit]')?.addEventListener('click',renderEdit);inspector.querySelector('[data-occurrence-delete]')?.addEventListener('click',()=>{const owner=bridge()?.getOwnerId?.(),plan=bridge()?.getPlanId?.();void run(deleteOccurrence).then(saved=>{if(saved&&owner===bridge()?.getOwnerId?.()&&plan===bridge()?.getPlanId?.()){session.reset();void workspace()?.clearSelection?.()}})});inspector.querySelector('[data-occurrence-ask-ai]')?.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('kairos-schedule-ai-task',{detail:{taskId:found.task.id,occurrenceId:selection.occurrenceId,occurrenceDate:selection.occurrenceDate}})));session.track(inspector.querySelector('[data-ks-occurrence-inspector]'),async()=>true);if(session.hasRecovery('occurrence-edit'))renderEdit()}
  async function status(value,current){
    found=findTask(selection.seriesId);if(!found)return false;
    const op=recurringCommand({action:'status',status:value,timestamp:new Date().toISOString()});
    return commit(op,value==='completed'?'Occurrence completed.':value==='pending'?'Occurrence restored to pending.':'Occurrence skipped.',current);
  }
  function renderEdit(){inspector.__taskFocus?.dispose();const current=structuredClone(effectiveOccurrence(found,selection));inspector.innerHTML=occurrenceEditMarkup(found,current);inspector.dataset.enhancedFor=`${selection.occurrenceId}:edit`;const form=inspector.querySelector('[data-ks-occurrence-edit]');form.dataset.colorCustom=validTaskColor(current.task.color)?'1':'0';const refreshRecurrence=bindRecurrenceFields(form,{fallbackDate:selection.occurrenceDate});lockCompletedSchedule(form,current.status==='completed');const never=form.querySelector('[data-recurrence-preset] option[value="never"]');if(never)never.disabled=true;if(current.status!=='pending')form.querySelectorAll('[data-recurrence-fields] input,[data-recurrence-fields] select').forEach(input=>input.disabled=true);inspector.querySelectorAll('[data-occurrence-cancel]').forEach(button=>button.addEventListener('click',async()=>{if(await session.requestLeave())renderView()}));form.elements.color?.addEventListener('input',()=>form.dataset.colorCustom='1');inspector.querySelector('[data-occurrence-reset-color]')?.addEventListener('click',()=>form.dataset.colorCustom='0');session.track(form,()=>run(valid=>saveEdit(form,current,valid),true),{onRestore:refreshRecurrence});form.addEventListener('submit',event=>{event.preventDefault();void run(valid=>saveEdit(form,current,valid),true)})}
  async function saveEdit(form,current,valid){
    const duration=Number(form.elements.duration.value)||current.durationMinutes,schedule=scheduleFieldsFromDuration(form.elements.date.value,form.elements.start.value,duration),recurrence=readRecurrenceFields(form,selection.occurrenceDate);
    if(recurrence&&found.task.recurrence?.startDate)recurrence.startDate=found.task.recurrence.startDate;
    const values={title:form.elements.title.value.trim()||current.task.title,date:schedule.date,startTime:schedule.startTime,endTime:schedule.endTime,durationMinutes:duration,dueDate:form.elements.dueDate.value||null,priority:form.elements.priority.value||null,estimatedMinutes:form.elements.estimate.value?Number(form.elements.estimate.value):null,notes:form.elements.notes.value.trim(),color:form.dataset.colorCustom==='1'?validTaskColor(form.elements.color.value):null};
    const original={...current.task,date:current.displayDate,startTime:current.startTime,endTime:current.endTime,durationMinutes:current.durationMinutes,notes:current.task.notes||''};
    const changes=Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(original[key]??null)));
    if(['date','startTime','endTime','durationMinutes'].some(key=>Object.hasOwn(changes,key)))for(const key of ['date','startTime','endTime','durationMinutes'])changes[key]=values[key];
    found=findTask(selection.seriesId);if(!found)return false;
    if(JSON.stringify({...current.task.recurrence,exceptions:null})!==JSON.stringify({...found.task.recurrence,exceptions:null})){showToast('The repeat rule changed. Review the current series before saving.');return false}
    const live=effectiveOccurrence(found,selection),liveValues={...live.task,date:live.displayDate,startTime:live.startTime,endTime:live.endTime,durationMinutes:live.durationMinutes,notes:live.task.notes||''};
    if(Object.keys(changes).some(key=>JSON.stringify(original[key]??null)!==JSON.stringify(liveValues[key]??null))){showToast('This occurrence changed. Review it before saving.');return false}
    const snapshot=JSON.stringify(found.task),onlyOccurrence=live.status!=='pending',previewOptions={changes,recurrence,allowCompleted:bridge()?.getAllowCompletedReschedule?.()===true};
    let scope=await showRecurrenceScopeDialog({title:'Review recurring changes',actionLabel:'Save changes',allowFuture:!onlyOccurrence,allowEntireSeries:!onlyOccurrence,getPreview:scope=>recurringEditPreview(found.task,selection.occurrenceDate,{...previewOptions,scope})});
    if(scope==='cancel'||!valid())return false;found=findTask(selection.seriesId);if(!found)return false;
    if(JSON.stringify(found.task)!==snapshot){showToast('This recurring task changed while you reviewed it. Review the current dates and save again.');return false}
    if(onlyOccurrence)scope='occurrence';const preview=recurringEditPreview(found.task,selection.occurrenceDate,{...previewOptions,scope});if(preview.error){showToast(preview.error);return false}
    const op=recurringCommand({action:'edit',scope,changes,recurrence,...(scope==='future'?{newTaskId:makeId('task')}:{})});
    return commit(op,'Recurring task updated.',valid,()=>{
      // Advance only the acknowledged fields. The retained form still displays
      // its older untouched values, and newer remote edits must keep their guards.
      for(const [key,value] of Object.entries(op.command.changes)){
        current.task[key]=structuredClone(value);
        if(key==='date')current.displayDate=value;
        else if(['startTime','endTime','durationMinutes'].includes(key))current[key]=value;
      }
      if(scope!=='occurrence'&&op.command.recurrence)current.task.recurrence=structuredClone(op.command.recurrence);
    },true);
  }
  async function deleteOccurrence(valid){found=findTask(selection.seriesId);if(!found)return false;const snapshot=JSON.stringify(found.task),scope=await showRecurrenceScopeDialog({title:'Delete recurring task',actionLabel:'Delete',getPreview:scope=>recurringEditPreview(found.task,selection.occurrenceDate,{scope,deleting:true})});if(scope==='cancel'||!valid())return false;found=findTask(selection.seriesId);if(!found)return false;if(JSON.stringify(found.task)!==snapshot){showToast('This recurring task changed. Review the dates before deleting.');return false;}const op=recurringCommand({action:'delete',scope,timestamp:new Date().toISOString()});return commit(op,scope==='occurrence'?'Occurrence deleted.':'Recurring series updated.',valid)}

}

function recoverDraftSelection(){
  const ws=workspace();if(!session||!ws||ws.state?.selected?.type)return;
  const selected=session.takeRecoverySelection();if(!selected)return;
  if(selected.type==='task'&&findTask(selected.id))void ws.selectItem('task',selected.id);
  else if(selected.type==='occurrence'){const selection=occurrenceSelection(selected),found=findTask(selection.seriesId);if(found?.task.recurrence?.enabled&&effectiveOccurrence(found,selection))void ws.selectOccurrence(selected);}
}
function enhance(){recoverDraftSelection();{const current=workspace()?.state?.selected,root=document.getElementById('schedule-inspector');if(current?.type==='task'&&root?.dataset.enhancedFor===String(current.id))refreshAssignmentProgress(root.querySelector('[data-assignment-detail]'),assignmentProgressIndex({boards:bridge()?.getBoards?.()||[]},planningClock(Date.now(),bridge()?.getTimezone?.()||'UTC').date).get(current.id),{details:true});}if(session?.preserve(workspace()?.state?.selected))return;const inspector=document.getElementById('schedule-inspector'),selected=workspace()?.state?.selected;if(!inspector||inspector.hidden||!selected?.type)return;if(selected?.type==='occurrence'){enhanceOccurrence(inspector,selected);return}if(selected.type==='task')enhanceTask(inspector,selected)}
function markStates(){const today=toDateKey(new Date());for(const {task} of entries()){normalizeTaskMetadata(task);const overdue=!!task.dueDate&&!task.completed&&task.dueDate<today;document.querySelectorAll(`.ks-task-block[data-task-id="${CSS.escape(String(task.id))}"],.ks-backlog-row[data-task-id="${CSS.escape(String(task.id))}"]`).forEach(el=>el.classList.toggle('is-overdue',overdue))}}
window.__kairosScheduleMutationResolved=(identity,status)=>document.getElementById('schedule-inspector')?.__mutationRecovery?.(identity,status);
function boot(){if(window.__kairosScheduleInspectorBooted||!bridge())return;window.__kairosScheduleInspectorBooted=true;session=createScheduleInspectorSession({inspector:document.getElementById('schedule-inspector'),getIdentity:()=>[bridge()?.getOwnerId?.(),bridge()?.getPlanId?.()],getSelection:()=>workspace()?.state?.selected,render:()=>workspace()?.render?.()});workspace()?.setInspectorSession?.(session);entries().forEach(({task})=>normalizeTaskMetadata(task));const root=document.getElementById('schedule-page');if(root)new MutationObserver(()=>{enhance();markStates()}).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});enhance();markStates()}
window.addEventListener('kairos-schedule-bridge-ready',boot);window.addEventListener('kairos-data-changed',()=>setTimeout(()=>{entries().forEach(({task})=>normalizeTaskMetadata(task));enhance();markStates()},40));if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
