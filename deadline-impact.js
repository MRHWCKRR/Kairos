import {taskRemainingMinutes} from './remaining-work.js?v=2';
import {planningTasks,validPlanningDate} from './planning-model.js?v=1';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function deadlineImpact(state,parentId,dueDate){
 const entries=planningTasks(state),parents=entries.filter(({task})=>task.id===parentId),parent=parents[0]?.task;
 const all=(state.boards||[]).flatMap(b=>(b.sections||[]).flatMap(s=>s.tasks||[]));
 if(parents.length!==1||all.filter(t=>t.id===parentId).length!==1||parent.assignmentId||parent.completed||parent.recurrence?.enabled)return null;
 const sessions=entries.map(e=>e.task).filter(t=>t.assignmentId===parentId&&!t.completed);if(!sessions.length)return null;
 const changed=(dueDate||null)!==(parent.dueDate||null),valid=validPlanningDate(dueDate),late=valid?sessions.filter(t=>validPlanningDate(t.date)&&t.date>dueDate):[];
 return {parentId,dueDate:dueDate||null,changed,valid,remainingMinutes:sessions.reduce((sum,t)=>sum+taskRemainingMinutes(t),0),unscheduled:sessions.filter(t=>!validPlanningDate(t.date)||!t.startTime).length,late:late.map(t=>({id:t.id,title:String(t.title||'Session'),date:t.date,locked:!!t.scheduleLocked,recurring:!!t.recurrence?.enabled})),canReview:valid&&!changed&&late.length>0};
}
export function deadlineImpactMarkup(report,{blocked=false}={}){
 if(!report||!report.changed&&!report.late.length)return '';
 const rows=report.late,headline=!report.dueDate?'This assignment will have no deadline.':!report.valid?'Enter a valid deadline to review its impact.':rows.length?rows.length+' unfinished session'+(rows.length===1?' is':'s are')+' scheduled after '+report.dueDate+'.':'No unfinished sessions are scheduled after '+report.dueDate+'.';
 return '<section class="deadline-impact" aria-label="Deadline impact"><p aria-live="polite">'+esc(headline)+'</p>'+(rows.length?'<ul>'+rows.map(row=>'<li><strong>'+esc(row.title)+'</strong> · '+esc(row.date)+(row.locked?' · Locked':row.recurring?' · Recurring':'')+'</li>').join('')+'</ul>':'')+'<p>'+report.remainingMinutes+' minutes of unfinished session effort.'+(report.unscheduled?' '+report.unscheduled+' sessions have no complete placement.':'')+' Completed work stays unchanged. Locked sessions stay fixed.</p>'+(report.changed?'<p>Save the deadline before reviewing a revised schedule. No session times have changed.</p>':rows.length?'<button type="button" data-deadline-review="'+esc(report.parentId)+'" '+(!report.canReview||blocked?'disabled':'')+'>Review revised schedule</button><p>Checks saved availability and planning limits. Review every change before Apply.</p>':'')+'</section>';
}
// Local feedback only: capacity is checked on demand by the existing Planning flow.
export function bindDeadlineImpact({root,taskId,getState,onReview,isBlocked=()=>false}){
 const host=root.querySelector('[data-deadline-impact]'),input=root.querySelector('[name="dueDate"]');if(!host||!input)return {refresh(){},dispose(){}};
 function refresh(){const html=deadlineImpactMarkup(deadlineImpact(getState(),taskId,input.value),{blocked:isBlocked()});if(host.__impactHTML!==html){host.__impactHTML=html;host.innerHTML=html}}
 function click(event){const id=event.target.closest('[data-deadline-review]')?.dataset.deadlineReview;if(!id||isBlocked())return;event.preventDefault();const report=deadlineImpact(getState(),taskId,input.value);if(report?.canReview&&id===report.parentId)void onReview(id)}
 input.addEventListener('input',refresh);input.addEventListener('change',refresh);host.addEventListener('click',click);refresh();
 return {refresh,dispose(){input.removeEventListener('input',refresh);input.removeEventListener('change',refresh);host.removeEventListener('click',click)}};
}
