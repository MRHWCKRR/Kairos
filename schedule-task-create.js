import {buildScheduleCreate} from './task-list-model.js?v=21';
import { scheduleFieldsFromDuration, parseTime } from './schedule-utils.js?v=3';
import { recurrenceFieldsMarkup, bindRecurrenceFields, readRecurrenceFields } from './schedule-recurrence-ui.js?v=12';

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;
let activeCreator=null;
const sameCreatorScope=form=>form?.__scope?.ownerId===bridge()?.getOwnerId?.()&&form?.__scope?.planId===bridge()?.getPlanId?.();
const sameOperation=(a,b)=>a?.ownerId===b?.ownerId&&a?.planId===b?.planId&&a?.operationId===b?.operationId&&a?.createdAt===b?.createdAt;
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

async function openCreator(){
  const actor=[bridge()?.getOwnerId?.(),bridge()?.getPlanId?.()];
  if(!await (workspace()?.inspectorSession?.requestLeave()??true)||JSON.stringify(actor)!==JSON.stringify([bridge()?.getOwnerId?.(),bridge()?.getPlanId?.()]))return;
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
    ${recurrenceFieldsMarkup({}, {})}
    <div class="ks-form-grid"><label>Priority<select name="priority"><option value="">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Estimate (min)<input name="estimate" type="number" min="1" step="1" placeholder="Optional"></label></div>
    <div class="ks-form-grid"><label>Preferred time<select name="preference"><option value="">No preference</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label><label>Reminder<select name="reminder"><option value="">None</option><option value="5">5 min before</option><option value="15">15 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option></select></label></div>
    <label>Task color<div class="ks-color-control"><input name="color" type="color" value="#a855f7" aria-label="Task color"><button type="button" data-create-reset-color>Use theme color</button></div></label>
    <label>Notes<textarea name="notes" rows="4" maxlength="3000" placeholder="Optional notes"></textarea></label>
    <label class="ks-check-row"><input name="locked" type="checkbox"> Keep this time fixed for AI planning</label>
    <div class="ks-inspector-actions ks-inspector-primary"><button type="submit" class="ks-primary" ${boards.length?'':'disabled'}>Create task</button><button type="button" data-create-cancel>Cancel</button></div>
  </form>`;
  const form=inspector.querySelector('[data-ks-create-task]');if(!form)return;
  form.dataset.colorCustom='0';form.__scope={ownerId:actor[0],planId:actor[1]};activeCreator=form;bindRecurrenceFields(form);
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

function creatorValues(form){return JSON.stringify([...form.querySelectorAll('[name]')].map(input=>[input.name,input.type==='checkbox'?input.checked:input.value]).concat([['colorCustom',form.dataset.colorCustom]]))}
function creatorConfirmed(form,saved){
  if(form.__pendingCreate!==saved||!form.isConnected||!sameCreatorScope(form))return;
  form.__pendingCreate=null;form.querySelector('[data-create-recovery]')?.remove();bridge()?.refreshAppViews?.();showToast('Task created.');
  if(creatorValues(form)===saved.draft){if(saved.command.task.date&&saved.command.task.startTime)workspace()?.focusDateTime?.(saved.command.task.date,saved.command.task.startTime);workspace()?.selectItem?.('task',saved.command.task.id)}
}
window.addEventListener('kairos-schedule-mutation-resolved',event=>{
  const form=activeCreator,saved=form?.__pendingCreate;
  if(!saved||!form.isConnected||!sameCreatorScope(form)||!sameOperation(saved.identity,event.detail?.identity))return;
  if(event.detail.status==='discarded'){form.__pendingCreate=null;form.querySelector('[data-create-recovery]')?.remove()}
  else if(event.detail.status==='saved'&&!form.__creating)creatorConfirmed(form,saved);
});
async function createTask(form){
  if(form.__creating)return false;
  if(!sameCreatorScope(form)){showToast('The signed-in account or planner changed. Your draft is still here.');return false}
  try{
    if(!form.__pendingCreate){
      const date=form.elements.date.value||null,start=form.elements.start.value||null,duration=Number(form.elements.duration.value||60),estimate=form.elements.estimate.value||'';
      if(!Number.isInteger(duration)||duration<1||duration>1440||start&&(!date||parseTime(start)===null||parseTime(start)+duration>1440))throw Error('Choose a valid date and duration that ends by midnight.');
      const task={id:makeId('task'),title:form.elements.title.value.trim(),...scheduleFieldsFromDuration(date,start,duration),dueDate:form.elements.dueDate.value||null,estimatedMinutes:estimate?Number(estimate):(!start?duration:null),priority:form.elements.priority.value||null,notes:form.elements.notes.value.trim(),reminderMinutes:form.elements.reminder.value?Number(form.elements.reminder.value):null,scheduleLocked:form.elements.locked.checked===true,schedulingPreference:form.elements.preference.value||null,color:form.dataset.colorCustom==='1'?validTaskColor(form.elements.color.value):null,recurrence:readRecurrenceFields(form,date)||null};
      const op=buildScheduleCreate({boards:bridge()?.getBoards?.()||[]},{boardId:form.elements.board.value,sectionId:form.elements.section.value||null},task,{defaultSectionId:makeId('section')});
      form.__pendingCreate={...structuredClone(op),draft:creatorValues(form),identity:{...form.__scope,operationId:makeId('schedule-create'),createdAt:Date.now()}};
    }
    const saved=form.__pendingCreate;form.__creating=true;form.querySelector('[type=submit]').disabled=true;
    if(typeof bridge()?.commitScheduleCommand!=='function')throw Error('Schedule saving is unavailable.');
    await bridge().commitScheduleCommand(saved.command,saved.expected,saved.identity);
    if(!sameCreatorScope(form))return false;creatorConfirmed(form,saved);return true;
  }catch(error){
    if(sameCreatorScope(form)&&form.isConnected){if(form.__pendingCreate&&!form.querySelector('[data-create-recovery]')){const feedback=document.createElement('p');feedback.dataset.createRecovery='';feedback.setAttribute('role','status');feedback.textContent='This create is unconfirmed. Press Create task to retry the original save, or use Clear recovery to keep editing.';form.appendChild(feedback)}showToast(error.message||"Couldn't create the task. Your draft is still here.")}
    console.error('[Kairos Schedule] Task creation failed.',error);return false;
  }finally{form.__creating=false;const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=false}
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
