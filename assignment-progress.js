import {taskRemainingMinutes} from './remaining-work.js?v=4';
import {planningTasks,validPlanningDate} from './planning-model.js?v=1';
import {taskDurationMinutes} from './schedule-utils.js?v=4';
import {assignmentReadiness} from './assignment-order.js?v=3';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function assignmentProgressIndex(state,today){
 const entries=planningTasks(state),byId=new Map(),counts=new Map(),groups=new Map(),result=new Map(),readiness=assignmentReadiness(state);
 for(const board of state.boards||[])for(const section of board.sections||[])for(const task of section.tasks||[])counts.set(task.id,(counts.get(task.id)||0)+1);
 for(const entry of entries)if(counts.get(entry.task.id)===1)byId.set(entry.task.id,entry.task);
 for(const {task} of entries)if(task.assignmentId&&byId.has(task.id)&&byId.has(task.assignmentId)){
  if(!groups.has(task.assignmentId))groups.set(task.assignmentId,[]);groups.get(task.assignmentId).push(task);
 }
 for(const [parentId,sessions] of groups){
  const parent=byId.get(parentId);if(parent.assignmentId||parent.recurrence?.enabled)continue;
  sessions.sort((a,b)=>(a.sessionIndex||0)-(b.sessionIndex||0)||String(a.id).localeCompare(String(b.id)));
  const dueDate=validPlanningDate(parent.dueDate)?parent.dueDate:null;
  const summary={parentId,parentTitle:String(parent.title||'Assignment'),total:sessions.length,completed:sessions.filter(task=>task.completed).length,remainingMinutes:sessions.filter(task=>!task.completed).reduce((sum,task)=>sum+taskRemainingMinutes(task),0),dueDate,status:parent.completed?'Assignment marked complete':!dueDate?'No deadline':dueDate<today?'Overdue':dueDate===today?'Due today':'Due '+dueDate,lateSessions:sessions.filter(task=>!task.completed&&dueDate&&task.date>dueDate).length,sessions:sessions.map(task=>({id:task.id,title:String(task.title||'Session'),completed:!!task.completed,date:task.date||null,startTime:task.startTime||null,minutes:taskDurationMinutes(task)}))};
  summary.ordered=parent.sessionOrder==='sequential';summary.readyCount=sessions.filter(task=>readiness.get(task.id)?.state==='ready').length;summary.waitingCount=sessions.filter(task=>readiness.get(task.id)?.state==='waiting').length;
  summary.orderNeedsReview=sessions.some(task=>readiness.get(task.id)?.needsReschedule||readiness.get(task.id)?.state==='review');
  for(const row of summary.sessions)row.readiness=readiness.get(row.id)||null;
  result.set(parentId,summary);for(const task of sessions)result.set(task.id,{...summary,sessionIndex:task.sessionIndex||null,isSession:true,readiness:readiness.get(task.id)||null});
 }
 return result;
}
export function assignmentProgressMarkup(summary,{details=false}={}){
 if(!summary)return '';
 const parent=summary.isSession?`<button type="button" data-assignment-open="${esc(summary.parentId)}">${esc(summary.parentTitle)}</button>`:'';
 const readiness=row=>!row?'':row.state==='ready'?'Ready':row.state==='waiting'?'Waiting for '+row.waitingTitle:row.state==='review'?'Review session order':'Completed';
 return `<div class="assignment-progress" data-assignment-progress><span>${summary.isSession?'Session '+esc(summary.sessionIndex||'')+' · ':''}${summary.completed} of ${summary.total} sessions done · ${summary.remainingMinutes} min remaining estimate</span>${parent}${summary.orderNeedsReview?'<small>Session order needs rescheduling. Review the session plan.</small>':''}${summary.ordered?'<small class="assignment-order-status">'+esc(summary.isSession?readiness(summary.readiness):'Ordered sessions · '+summary.readyCount+' ready · '+summary.waitingCount+' waiting')+'</small>':''}<small>${esc(summary.status)}${summary.lateSessions?' · Scheduled after deadline: '+summary.lateSessions:''}</small>${details?`<details><summary>Linked sessions (${summary.total})</summary>${summary.ordered?'<p>Ready means earlier active sessions are complete. Scheduled times remain unchanged.</p>':''}<ul>${summary.sessions.map(task=>`<li><button type="button" data-assignment-open="${esc(task.id)}">${esc(task.title)}</button><span>${task.completed?'Completed':task.date?esc(task.date)+(task.startTime?' '+esc(task.startTime):''):'Unscheduled'} · ${task.minutes} min${task.readiness&&!task.completed?' · '+esc(readiness(task.readiness)):''}</span></li>`).join('')}</ul></details>`:''}</div>`;
}
export function refreshAssignmentProgress(root,summary,{details=false}={}){
 if(!root)return;
 const html=assignmentProgressMarkup(summary,{details});if(root.__assignmentHTML===html)return;
 const opened=root.querySelector('details')?.open,active=root.ownerDocument.activeElement,focused=root.contains(active)?active?.closest('[data-assignment-open]')?.dataset.assignmentOpen:null;
 root.__assignmentHTML=html;root.innerHTML=html;
 if(opened!==undefined&&root.querySelector('details'))root.querySelector('details').open=opened;
 if(focused){const replacement=[...root.querySelectorAll('[data-assignment-open]')].find(button=>button.dataset.assignmentOpen===focused);(replacement||root.querySelector('summary'))?.focus?.({preventScroll:true})}
}
