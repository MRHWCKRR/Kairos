import { scheduleFieldsFromDuration } from './schedule-utils.js';

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const validTaskColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null;
const makeId=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;

function showToast(message){
  document.querySelector('.ks-toast')?.remove();
  const el=document.createElement('div');el.className='ks-toast';el.setAttribute('role','status');el.textContent=message;
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('is-visible'));
  setTimeout(()=>{el.classList.remove('is-visible');setTimeout(()=>el.remove(),180)},2800);
}
function activeBoards(){return (bridge()?.getBoards?.()||[]).filter(board=>!board?.archived)}
function activeSections(board){return (board?.sections||[]).filter(section=>!section?.archived)}
function boardOptions(selectedId=''){return activeBoards().map(board=>`<option value="${esc(board.id)}" ${String(board.id)===String(selectedId)?'selected':''}>${esc(board.title)}</option>`).join('')}
function sectionOptions(board,selectedId=''){return activeSections(board).map(section=>`<option value="${esc(section.id)}" ${String(section.id)===String(selectedId)?'selected':''}>${esc(section.title)}</option>`).join('')}

function closeCreator(){
  const inspector=document.getElementById('schedule-inspector'),shell=document.querySelector('.schedule-workspace-shell');
  if(inspector){inspector.hidden=true;inspector.innerHTML='';inspector.dataset.enhancedFor=''}
  shell?.classList.remove('inspector-open');
}

function openCreator(){
  const inspector=document.getElementById('schedule-inspector'),shell=document.querySelector('.schedule-workspace-shell');if(!inspector)return;
  const boards=activeBoards(),firstBoard=boards[0]||null,firstSection=activeSections(firstBoard)[0]||null;
  if(workspace()?.state)workspace().state.selected={type:null,id:null};
  shell?.classList.add('inspector-open');inspector.hidden=false;inspector.dataset.enhancedFor='';
  inspector.innerHTML=`<div class="ks-inspector-head"><span>New task</span><button type="button" data-create-close aria-label="Close new task">×</button></div>
  <form class="ks-inspector-form" data-ks-create-task>
    <label>Title<input name="title" maxlength="180" autocomplete="off" placeholder="What needs doing?" required></label>
    <div class="ks-form-grid"><label>Board<select name="board" ${boards.length?'':'disabled'}>${boards.length?boardOptions(firstBoard?.id):'<option value="">No boards available</option>'}</select></label><label>Section<select name="section" ${firstBoard?'':'disabled'}>${firstBoard?sectionOptions(firstBoard,firstSection?.id):'<option value="">No section</option>'}</select></label></div>
    <div class="ks-form-grid"><label>Date<input name="date" type="date"></label><label>Start<input name="start" type="time" step="60"></label></div>
    <div class="ks-form-grid"><label>Duration (min)<input name="duration" type="number" min="1" step="1" value="60"></label><label>Due date<input name="dueDate" type="date"></label></div>
    <div class="ks-form-grid"><label>Priority<select name="priority"><option value="">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Estimate (min)<input name="estimate" type="number" min="1" step="1" placeholder="Optional"></label></div>
    <div class="ks-form-grid"><label>Preferred time<select name="preference"><option value="">No preference</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label><label>Reminder<select name="reminder"><option value="">None</option><option value="5">5 min before</option><option value="15">15 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option></select></label></div>
    <label>Task color<div class="ks-color-control"><input name="color" type="color" value="#a855f7" aria-label="Task color"><button type="button" data-create-reset-color>Use theme color</button></div></label>
    <label>Notes<textarea name="notes" rows="4" maxlength="3000" placeholder="Optional notes"></textarea></label>
    <label class="ks-check-row"><input name="locked" type="checkbox"> Keep this time fixed for AI planning</label>
    <div class="ks-inspector-actions ks-inspector-primary"><button type="submit" class="ks-primary" ${boards.length?'':'disabled'}>Create task</button><button type="button" data-create-cancel>Cancel</button></div>
  </form>`;
  const form=inspector.querySelector('[data-ks-create-task]');if(!form)return;
  form.dataset.colorCustom='0';
  inspector.querySelector('[data-create-close]')?.addEventListener('click',closeCreator);
  inspector.querySelector('[data-create-cancel]')?.addEventListener('click',closeCreator);
  form.elements.board?.addEventListener('change',()=>{
    const board=activeBoards().find(item=>String(item.id)===String(form.elements.board.value));
    form.elements.section.innerHTML=board?sectionOptions(board,activeSections(board)[0]?.id):'<option value="">No section</option>';
  });
  form.elements.color?.addEventListener('input',()=>{form.dataset.colorCustom='1';const button=inspector.querySelector('[data-create-reset-color]');if(button)button.textContent='Use theme color'});
  inspector.querySelector('[data-create-reset-color]')?.addEventListener('click',event=>{form.dataset.colorCustom='0';event.currentTarget.textContent='Theme color'});
  form.addEventListener('submit',event=>{event.preventDefault();void createTask(form)});
  requestAnimationFrame(()=>form.elements.title?.focus());
}

async function createTask(form){
  const boards=activeBoards(),targetBoard=boards.find(board=>String(board.id)===String(form.elements.board.value));
  if(!targetBoard){showToast('Choose a board first.');return}
  let targetSection=activeSections(targetBoard).find(section=>String(section.id)===String(form.elements.section.value));
  let createdSection=false;
  if(!targetSection){
    targetSection={id:makeId('section'),title:'General',archived:false,tasks:[]};
    targetBoard.sections=Array.isArray(targetBoard.sections)?targetBoard.sections:[];targetBoard.sections.push(targetSection);createdSection=true;
  }
  const title=form.elements.title.value.trim();if(!title){showToast('Enter a task title.');return}
  const date=form.elements.date.value||'',start=form.elements.start.value||'',duration=Math.max(1,Math.round(Number(form.elements.duration.value)||60));
  if(start&&!date){showToast('Choose a date when setting a start time.');return}
  const schedule=scheduleFieldsFromDuration(date,start,duration),estimateValue=form.elements.estimate.value||'';
  const task={
    id:makeId('task'),title,completed:false,archived:false,
    ...schedule,
    dueDate:form.elements.dueDate.value||null,
    estimatedMinutes:estimateValue?Math.max(1,Math.round(Number(estimateValue)||1)):(!start?duration:null),
    lastScheduledMinutes:null,
    priority:form.elements.priority.value||null,
    notes:form.elements.notes.value.trim(),
    reminderMinutes:form.elements.reminder.value?Number(form.elements.reminder.value):null,
    scheduleLocked:form.elements.locked.checked,
    schedulingPreference:form.elements.preference.value||null,
    color:form.dataset.colorCustom==='1'?validTaskColor(form.elements.color.value):null
  };
  targetSection.tasks=Array.isArray(targetSection.tasks)?targetSection.tasks:[];targetSection.tasks.push(task);workspace()?.render?.();
  try{
    await bridge()?.persistPlan?.();bridge()?.refreshAppViews?.();showToast('Task created.');
    if(task.date&&task.startTime)workspace()?.focusDateTime?.(task.date,task.startTime);
    workspace()?.selectItem?.('task',task.id);
  }catch(error){
    targetSection.tasks=targetSection.tasks.filter(item=>item!==task);
    if(createdSection&&targetSection.tasks.length===0)targetBoard.sections=targetBoard.sections.filter(section=>section!==targetSection);
    workspace()?.render?.();openCreator();showToast("Couldn't create the task. Restored your schedule.");console.error('[Kairos Schedule] Task creation failed.',error);
  }
}

function decorateToolbar(){
  const toolbar=document.getElementById('schedule-toolbar');if(!toolbar)return;
  const existing=toolbar.querySelector('[data-event]');if(!existing)return;
  const button=existing.cloneNode(true);button.removeAttribute('data-event');button.setAttribute('data-add-task','');button.textContent='+ Task';button.setAttribute('aria-label','Add task');
  button.addEventListener('click',event=>{event.preventDefault();openCreator()});existing.replaceWith(button);
}

function boot(){
  if(window.__kairosScheduleTaskCreateBooted||!bridge())return;window.__kairosScheduleTaskCreateBooted=true;
  decorateToolbar();
  const toolbar=document.getElementById('schedule-toolbar');if(toolbar)new MutationObserver(decorateToolbar).observe(toolbar,{childList:true,subtree:true});
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
