import { formatRecurrenceSummary, nextOccurrenceDate } from './recurrence-utils.js';

const bridge=()=>window.__kairosScheduleBridge;
const workspace=()=>window.__kairosScheduleWorkspace;

function allEntries(){
  const out=[];
  for(const board of bridge()?.getBoards?.()||[]){
    if(board?.archived)continue;
    for(const section of board?.sections||[]){
      if(section?.archived)continue;
      for(const task of section?.tasks||[]) if(!task?.archived) out.push({task,board,section});
    }
  }
  return out;
}
function yesterdayKey(){
  const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()-1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function formatNext(key){
  if(!key)return 'No future occurrence';
  const [y,m,d]=key.split('-').map(Number);
  return new Date(y,m-1,d,12).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function openSeriesEditor(taskId){
  document.querySelector('.nav-item[data-target="schedule-page"]')?.click();
  requestAnimationFrame(()=>workspace()?.selectItem?.('task',taskId));
}
function decorate(){
  const tasks=new Map(allEntries().filter(({task})=>task.recurrence?.enabled).map(entry=>[String(entry.task.id),entry]));
  for(const input of document.querySelectorAll('.task-item [data-task]')){
    const id=String(input.getAttribute('data-task')||''),entry=tasks.get(id);if(!entry)continue;
    const row=input.closest('.task-item');if(!row||row.querySelector('[data-recurrence-series-meta]'))continue;
    row.classList.add('is-recurring-series');
    const checkbox=row.querySelector(`input[type="checkbox"][data-task="${CSS.escape(id)}"]`);
    if(checkbox){checkbox.disabled = true;checkbox.title='Recurring series — complete individual occurrences from Schedule';checkbox.setAttribute('aria-label','Recurring series. Complete individual occurrences from Schedule.')}
    const summary=formatRecurrenceSummary(entry.task),next=nextOccurrenceDate(entry.task,yesterdayKey());
    const meta=document.createElement('span');meta.setAttribute('data-recurrence-series-meta','');meta.className='task-recurrence-meta';meta.textContent=`↻ ${summary} · Next: ${formatNext(next)}`;
    const edit=document.createElement('button');edit.type='button';edit.setAttribute('data-edit-recurrence','');edit.className='task-recurrence-edit-btn';edit.textContent='Repeat';edit.title='Edit recurring series';edit.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openSeriesEditor(id)});
    row.append(meta,edit);
  }
}
function boot(){
  if(window.__kairosBoardsRecurrenceBooted||!bridge())return;window.__kairosBoardsRecurrenceBooted=true;decorate();
  const manager=document.getElementById('tasks-manager-container');if(manager)new MutationObserver(decorate).observe(manager,{subtree:true,childList:true});
  const focus=document.getElementById('dashboard-focus-container');if(focus)new MutationObserver(decorate).observe(focus,{subtree:true,childList:true});
}
window.addEventListener('kairos-schedule-bridge-ready',boot);
window.addEventListener('kairos-data-changed',()=>setTimeout(decorate,30));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
