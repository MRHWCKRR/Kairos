import {focusBreakdown} from './focus-breakdown-model.js?v=4';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function focusDuration(seconds){
 if(seconds===null)return '—';
 const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return [h?h+'h':'',m?m+'m':'',s?s+'s':''].filter(Boolean).join(' ')||'0m';
}
const minutes=value=>value===null?'—':focusDuration(value*60);

export function mountFocusBreakdown({root,getIdentity,getState,onOpen}={}){
 let identity=null,view='boards',query='',board=null,report=null,links=new Map(),busy=false,generation=0;
 const status=text=>{const host=root.querySelector('[data-focus-status]');if(host)host.textContent=text};
 function shell(){
  root.innerHTML='<header><h3>Focus breakdown</h3><span>Lifetime · Current planner</span></header><p>Includes archived work. General focus, deleted tasks and other planners remain in your account totals above.</p><div class="focus-breakdown-controls"><div role="group" aria-label="Group focus time">'+['boards','assignments','tasks'].map(name=>'<button type="button" data-focus-view="'+name+'" aria-pressed="'+(view===name)+'">'+name[0].toUpperCase()+name.slice(1)+'</button>').join('')+'</div><label>Find work<input type="search" data-focus-search placeholder="Board, section or task"></label><button type="button" data-focus-all hidden>All boards</button></div><p data-focus-status role="status" aria-live="polite"></p><div class="focus-breakdown-results"></div><details class="focus-breakdown-note"><summary>How totals work</summary><p>Estimates are current saved values. Remaining work is kept separate from logged time. Assignment rollups include archived session time but use active sessions for estimates. Recurring series have no lifetime estimate; expand recorded dates for occurrence values. — means unavailable or not applicable.</p></details>';
 }
 function openButton(row,label){if(!row.openable)return '<strong>'+esc(label)+'</strong>';links.set(row.key,row);return '<button type="button" class="focus-work-link" data-focus-open="'+esc(row.key)+'">'+esc(label)+'</button>'}
 function occurrenceMarkup(row){return '<li>'+openButton(row,row.occurrenceDate)+(row.displayDate!==row.occurrenceDate?' · Moved to '+esc(row.displayDate):'')+' · Logged '+focusDuration(row.loggedSeconds)+' · Estimate '+minutes(row.estimatedMinutes)+' · Remaining '+minutes(row.remainingMinutes)+(!row.openable?' · Unavailable':'')+'</li>'}
 function renderRows(){
  if(!report)return;links=new Map();
  const host=root.querySelector('.focus-breakdown-results'),rows=(view==='boards'?report.boards:view==='assignments'?report.assignments:report.tasks).filter(row=>(board===null||row.boardKey===board)&&[row.title,row.boardTitle,row.sectionTitle,row.taskId].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.loggedSeconds-a.loggedSeconds||a.title.localeCompare(b.title));
  for(const button of root.querySelectorAll('[data-focus-view]'))button.setAttribute('aria-pressed',String(button.dataset.focusView===view));
  root.querySelector('[data-focus-all]').hidden=board===null;
  if(!rows.length){host.innerHTML='<p>'+(query?'No matching work. Try another search.':!report.tasks.length?'No tasks in this planner yet.':view==='assignments'?'No assignments with linked sessions.':'No work in this board.')+'</p>';return}
  const heading=view==='boards'?'<th scope="col">Board</th><th scope="col">Logged</th><th scope="col">Tasks</th><th scope="col">Actions</th>':'<th scope="col">Work</th><th scope="col">Estimate</th><th scope="col">Logged</th><th scope="col">Remaining</th><th scope="col">Comparison</th>';
  host.innerHTML='<div class="focus-breakdown-scroll" tabindex="0" role="region" aria-label="Focus breakdown table"><table><caption class="focus-breakdown-caption">'+(board===null?'Planner total: '+focusDuration(report.totalSeconds):esc(report.boards.find(row=>row.key===board)?.title||'Board'))+' · '+rows.length+' '+view+'</caption><thead><tr>'+heading+'</tr></thead><tbody>'+rows.map(row=>view==='boards'?'<tr><th scope="row">'+esc(row.title)+(row.archived?'<small>Archived</small>':'')+'</th><td>'+focusDuration(row.loggedSeconds)+'</td><td>'+row.taskCount+'</td><td><button type="button" data-focus-board="'+esc(row.key)+'">View tasks</button></td></tr>':'<tr><th scope="row">'+openButton(row,row.title)+'<small>'+esc(row.boardTitle)+' / '+esc(row.sectionTitle)+' · '+(row.kind==='assignment-direct'?'Direct assignment time':row.kind==='series'?'Recurring series':row.kind==='session'?'Assignment session':row.kind==='assignment'?row.sessionCount+' sessions':'Task')+(row.archived?' · Archived':'')+(!row.openable&&!row.archived?' · Unavailable':'')+'</small>'+(row.occurrences?.length?'<details><summary>Recorded occurrences ('+row.occurrences.length+')</summary><ul>'+row.occurrences.map(occurrenceMarkup).join('')+'</ul></details>':'')+'</th><td>'+minutes(row.estimatedMinutes)+'</td><td>'+focusDuration(row.loggedSeconds)+'</td><td>'+minutes(row.remainingMinutes)+'</td><td>'+(row.overEstimateSeconds?focusDuration(row.overEstimateSeconds)+' over estimate':'—')+'</td></tr>').join('')+'</tbody></table></div>';
 }
 function refresh(){
  const next=getIdentity(),key=JSON.stringify([next?.ownerId||null,next?.planId||null]);
  if(identity!==key){identity=key;generation++;view='boards';query='';board=null;busy=false;report=null;shell()}
  if(!next?.ownerId){root.querySelector('.focus-breakdown-results').innerHTML='<p>Sign in to see your focus breakdown.</p>';return}
  if(!next.planId){root.querySelector('.focus-breakdown-results').innerHTML='<p>Select a planner to see its focus breakdown.</p>';return}
  report=focusBreakdown(getState());renderRows();
 }
 async function open(key,source){
  if(busy)return;const row=links.get(key);if(!row)return;
  const actor=identity,ticket=generation,current=JSON.stringify([getIdentity()?.ownerId||null,getIdentity()?.planId||null]);
  if(current!==actor){refresh();return}
  // Recheck only the selected identity; the app adapter validates its occurrence
  // again after page loading. Navigation must not rebuild every series ledger.
  const matches=(getState().boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).filter(task=>task.id===row.taskId).map(task=>({board,section,task}))));
  if(matches.length!==1||matches[0].board.archived||matches[0].section.archived||matches[0].task.archived){status('This task changed or is unavailable. Refresh the report and try again.');return}
  busy=true;status('Opening task…');
  try{const ok=await onOpen({taskId:row.taskId,...(row.occurrenceDate?{occurrenceDate:row.occurrenceDate}:{})},source);if(actor===identity&&ticket===generation)status(ok?'':'Could not open this task. Try again.')}catch{if(actor===identity&&ticket===generation)status('Could not open this task. Try again.')}finally{if(actor===identity&&ticket===generation)busy=false}
 }
 function click(event){const button=event.target.closest('button');if(!button||!root.contains(button))return;
  if(button.hasAttribute('data-focus-view')){view=button.dataset.focusView;board=null;status('');renderRows()}
  if(button.hasAttribute('data-focus-board')){view='tasks';board=button.dataset.focusBoard;query='';root.querySelector('[data-focus-search]').value='';status('');renderRows()}
  if(button.hasAttribute('data-focus-all')){board=null;renderRows()}
  if(button.hasAttribute('data-focus-open'))void open(button.dataset.focusOpen,button);
 }
 function input(event){if(event.target.matches('[data-focus-search]')){query=event.target.value;renderRows()}}
 root.addEventListener('click',click);root.addEventListener('input',input);refresh();
 return {refresh,dispose(){generation++;root.removeEventListener('click',click);root.removeEventListener('input',input);root.replaceChildren()}};
}
