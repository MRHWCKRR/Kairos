import { normalizeTaskMetadata, scheduleFieldsFromDuration, taskDurationMinutes, clearScheduledFields, preserveScheduledDuration, toDateKey } from './schedule-utils.js';

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const validTaskColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null;

function entries(){
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
function findTask(id){return entries().find(x=>String(x.task.id)===String(id))||null}
function showToast(message){
  document.querySelector('.ks-toast')?.remove();const el=document.createElement('div');el.className='ks-toast';el.setAttribute('role','status');el.textContent=message;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('is-visible'));setTimeout(()=>{el.classList.remove('is-visible');setTimeout(()=>el.remove(),180)},2800);
}
function snapshotTask(task){
  const fields=['title','completed','date','startTime','endTime','dueDate','estimatedMinutes','priority','notes','reminderMinutes','scheduleLocked','schedulingPreference','color'];
  return Object.fromEntries(fields.map(k=>[k,task[k]??(k==='notes'?'':k==='scheduleLocked'?false:null)]));
}
async function persistTask(task,before,successMessage='Saved task changes.'){
  workspace()?.render?.();
  try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.();showToast(successMessage)}
  catch(error){Object.assign(task,before);workspace()?.render?.();showToast("Couldn't save your change. Restored the previous values.");console.error('[Kairos Schedule] Inspector save failed.',error)}
}
function boardOptions(currentId){return (bridge()?.getBoards?.()||[]).filter(b=>!b.archived).map(b=>`<option value="${esc(b.id)}" ${String(b.id)===String(currentId)?'selected':''}>${esc(b.title)}</option>`).join('')}
function sectionOptions(board,currentId){return (board?.sections||[]).filter(s=>!s.archived).map(s=>`<option value="${esc(s.id)}" ${String(s.id)===String(currentId)?'selected':''}>${esc(s.title)}</option>`).join('')}

function richMarkup(found){
  const {task,board,section}=found;normalizeTaskMetadata(task);
  const duration=task.startTime?taskDurationMinutes(task):(task.estimatedMinutes||60),color=validTaskColor(task.color)||'#a855f7';
  return `<div class="ks-inspector-head"><span>Task</span><button type="button" data-close aria-label="Close inspector">×</button></div>
  <form class="ks-inspector-form" data-ks-rich-inspector>
    <label>Title<input name="title" maxlength="180" value="${esc(task.title)}"></label>
    <div class="ks-form-grid"><label>Date<input name="date" type="date" value="${esc(task.date||'')}"></label><label>Start<input name="start" type="time" step="60" value="${esc(task.startTime||'')}"></label></div>
    <div class="ks-form-grid"><label>Duration (min)<input name="duration" type="number" min="1" step="1" value="${duration}"></label><label>Due date<input name="dueDate" type="date" value="${esc(task.dueDate||'')}"></label></div>
    <div class="ks-inspector-location"><span>${esc(board.title)} / ${esc(section.title)}</span><button type="button" data-toggle-move>Move</button></div>
    <div class="ks-move-fields" hidden><label>Board<select name="board">${boardOptions(board.id)}</select></label><label>Section<select name="section">${sectionOptions(board,section.id)}</select></label><button type="button" data-move>Move task</button></div>
    <details><summary>More details</summary><div class="ks-details-body">
      <div class="ks-form-grid"><label>Priority<select name="priority"><option value="">None</option><option value="low" ${task.priority==='low'?'selected':''}>Low</option><option value="medium" ${task.priority==='medium'?'selected':''}>Medium</option><option value="high" ${task.priority==='high'?'selected':''}>High</option></select></label><label>Estimate (min)<input name="estimate" type="number" min="1" step="1" value="${task.estimatedMinutes??''}"></label></div>
      <label>Task color<div class="ks-color-control"><input name="color" type="color" value="${color}" aria-label="Task color"><button type="button" data-reset-color>${task.color?'Use theme color':'Theme color'}</button></div></label>
      <label>Notes<textarea name="notes" rows="4" maxlength="3000">${esc(task.notes||'')}</textarea></label>
      <div class="ks-form-grid"><label>Reminder<select name="reminder"><option value="">None</option><option value="5" ${task.reminderMinutes===5?'selected':''}>5 min before</option><option value="15" ${task.reminderMinutes===15?'selected':''}>15 min before</option><option value="30" ${task.reminderMinutes===30?'selected':''}>30 min before</option><option value="60" ${task.reminderMinutes===60?'selected':''}>1 hour before</option></select></label><label>Preferred time<select name="preference"><option value="">No preference</option><option value="morning" ${task.schedulingPreference==='morning'?'selected':''}>Morning</option><option value="afternoon" ${task.schedulingPreference==='afternoon'?'selected':''}>Afternoon</option><option value="evening" ${task.schedulingPreference==='evening'?'selected':''}>Evening</option></select></label></div>
      <label class="ks-check-row"><input name="locked" type="checkbox" ${task.scheduleLocked?'checked':''}> Keep this time fixed for AI planning</label>
    </div></details>
    <div class="ks-inspector-actions ks-inspector-primary"><button type="submit" class="ks-primary">Save</button><button type="button" data-complete>${task.completed?'Mark incomplete':'Complete'}</button><button type="button" data-unschedule ${!task.date&&!task.startTime?'disabled':''}>Unschedule</button><button type="button" data-ask-ai>Ask AI</button></div>
    <button type="button" class="ks-delete-task" data-delete>Delete task</button>
  </form>`;
}

function enhance(){
  const inspector=document.getElementById('schedule-inspector'),selected=workspace()?.state?.selected;
  if(!inspector||inspector.hidden||selected?.type!=='task')return;
  const found=findTask(selected.id);if(!found)return;
  if(inspector.dataset.enhancedFor===String(selected.id)&&inspector.querySelector('[data-ks-rich-inspector]'))return;
  inspector.dataset.enhancedFor=String(selected.id);inspector.innerHTML=richMarkup(found);
  const form=inspector.querySelector('form');const {task,board,section}=found;form.dataset.colorCustom=validTaskColor(task.color)?'1':'0';
  inspector.querySelector('[data-close]')?.addEventListener('click',()=>workspace()?.clearSelection?.());
  form.elements.board?.addEventListener('change',()=>{const target=(bridge()?.getBoards?.()||[]).find(b=>String(b.id)===String(form.elements.board.value));form.elements.section.innerHTML=sectionOptions(target,'')});
  inspector.querySelector('[data-toggle-move]')?.addEventListener('click',()=>{const box=inspector.querySelector('.ks-move-fields');box.hidden=!box.hidden});
  form.elements.color?.addEventListener('input',()=>{form.dataset.colorCustom='1';const reset=inspector.querySelector('[data-reset-color]');if(reset)reset.textContent='Use theme color'});
  inspector.querySelector('[data-reset-color]')?.addEventListener('click',event=>{form.dataset.colorCustom='0';event.currentTarget.textContent='Theme color'});
  form.addEventListener('submit',event=>{event.preventDefault();void saveForm()});
  inspector.querySelector('[data-complete]')?.addEventListener('click',()=>void toggleComplete());
  inspector.querySelector('[data-unschedule]')?.addEventListener('click',()=>void unschedule());
  inspector.querySelector('[data-move]')?.addEventListener('click',()=>void moveTask());
  inspector.querySelector('[data-ask-ai]')?.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('kairos-schedule-ai-task',{detail:{taskId:task.id}})));
  inspector.querySelector('[data-delete]')?.addEventListener('click',()=>void deleteTask());

  async function saveForm(){
    const before=snapshotTask(task);
    const duration=Math.max(1,Number(form.elements.duration.value)||60);
    Object.assign(task,scheduleFieldsFromDuration(form.elements.date.value,form.elements.start.value,duration),{
      title:form.elements.title.value.trim()||before.title,
      dueDate:form.elements.dueDate.value||null,
      priority:form.elements.priority.value||null,
      estimatedMinutes:form.elements.estimate.value?Math.max(1,Number(form.elements.estimate.value)):null,
      notes:form.elements.notes.value.trim(),
      reminderMinutes:form.elements.reminder.value?Number(form.elements.reminder.value):null,
      schedulingPreference:form.elements.preference.value||null,
      scheduleLocked:form.elements.locked.checked,
      color:form.dataset.colorCustom==='1'?validTaskColor(form.elements.color.value):null
    });
    await persistTask(task,before);
  }
  async function toggleComplete(){const before=snapshotTask(task);task.completed=!task.completed;await persistTask(task,before,task.completed?'Task completed.':'Task reopened.')}
  async function unschedule(){const before=snapshotTask(task);preserveScheduledDuration(task);clearScheduledFields(task);await persistTask(task,before,'Task moved to Unscheduled.')}
  async function moveTask(){
    const boards=bridge()?.getBoards?.()||[],destBoard=boards.find(b=>String(b.id)===String(form.elements.board.value)),destSection=destBoard?.sections?.find(s=>String(s.id)===String(form.elements.section.value));
    if(!destSection){showToast('Choose a destination section.');return}
    if(destSection===section){showToast('Task is already in that section.');return}
    const oldIndex=section.tasks.indexOf(task);section.tasks.splice(oldIndex,1);destSection.tasks=destSection.tasks||[];destSection.tasks.push(task);workspace()?.render?.();
    try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.();showToast('Task moved.')}
    catch(error){destSection.tasks=destSection.tasks.filter(t=>t!==task);section.tasks.splice(Math.max(0,oldIndex),0,task);workspace()?.render?.();showToast("Couldn't move the task. Restored its previous location.");console.error(error)}
  }
  async function deleteTask(){
    if(!confirm(`Delete “${task.title}”?`))return;const index=section.tasks.indexOf(task);if(index<0)return;section.tasks.splice(index,1);workspace()?.clearSelection?.();
    try{await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.();showToast('Task deleted.')}
    catch(error){section.tasks.splice(index,0,task);workspace()?.render?.();showToast("Couldn't delete the task. Restored it.");console.error(error)}
  }
}

function markStates(){
  const today=toDateKey(new Date());
  for(const {task} of entries()){
    normalizeTaskMetadata(task);
    const overdue=!!task.dueDate&&!task.completed&&task.dueDate<today;
    document.querySelectorAll(`.ks-task-block[data-task-id="${CSS.escape(String(task.id))}"],.ks-backlog-row[data-task-id="${CSS.escape(String(task.id))}"]`).forEach(el=>el.classList.toggle('is-overdue',overdue));
  }
}
function boot(){
  if(window.__kairosScheduleInspectorBooted||!bridge())return;window.__kairosScheduleInspectorBooted=true;entries().forEach(({task})=>normalizeTaskMetadata(task));
  const root=document.getElementById('schedule-page');if(root)new MutationObserver(()=>{enhance();markStates()}).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  enhance();markStates();
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
window.addEventListener('kairos-data-changed',()=>setTimeout(()=>{entries().forEach(({task})=>normalizeTaskMetadata(task));enhance();markStates()},40));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
