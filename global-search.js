import {buildSearchIndex,searchPlanner} from './global-search-model.js?v=1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountGlobalSearch({document=globalThis.document,window=globalThis.window,getIdentity,getState,getToday,onNavigate}={}){
 const dialog=document.createElement('dialog');dialog.className='global-search-dialog';dialog.setAttribute('aria-labelledby','global-search-title');
 dialog.innerHTML='<header><h2 id="global-search-title">Search planner</h2><button type="button" data-search-close aria-label="Close search">Close</button></header><label class="global-search-label" for="global-search-query">Find tasks, assignments or boards</label><input id="global-search-query" data-search-query type="search" maxlength="500" autocomplete="off" placeholder="Search titles, locations or notes" aria-controls="global-search-results"><div class="global-search-filters" role="group" aria-label="Filter work">'+['all','unfinished','overdue','completed'].map(value=>'<button type="button" data-search-filter="'+value+'" aria-pressed="'+(value==='all')+'">'+value[0].toUpperCase()+value.slice(1)+'</button>').join('')+'</div><p data-search-status role="status" aria-live="polite"></p><ul id="global-search-results" data-search-results aria-label="Search results"></ul><footer><p data-search-range></p><span>↑ ↓ Navigate · Enter Open · Esc Close</span></footer>';
 document.body.appendChild(dialog);
 const find=selector=>dialog.querySelector(selector),input=find('[data-search-query]'),results=find('[data-search-results]');
 let identity=null,generation=0,opener=null,index=null,rows=[],filter='all',busy=false,disposed=false;
 const identityKey=()=>{const value=getIdentity();return JSON.stringify([value?.ownerId||null,value?.planId||null])};
 const visible=()=>dialog.hasAttribute('open');
 const otherModal=()=>[...document.querySelectorAll('dialog[open]')].some(element=>element!==dialog);
 function status(text){find('[data-search-status]').textContent=text}
 function close(restore=true){if(visible()){if(dialog.close)dialog.close();else dialog.removeAttribute('open');if(restore&&opener?.isConnected)opener.focus?.()}}
 function clear(){index=null;rows=[];filter='all';input.value='';results.replaceChildren();find('[data-search-range]').textContent='';status('')}
 function render(){
  for(const button of dialog.querySelectorAll('[data-search-filter]'))button.setAttribute('aria-pressed',String(button.dataset.searchFilter===filter));
  if(!index){results.replaceChildren();return}
  const found=searchPlanner(index,{query:input.value,status:filter});rows=found.rows;
  status(found.total>rows.length?'Showing '+rows.length+' of '+found.total+' matches. Refine your search.':found.total+' result'+(found.total===1?'':'s')+'.');
  results.innerHTML=rows.length?rows.map((row,n)=>'<li><button type="button" data-search-result="'+n+'"><strong>'+esc(row.title)+'</strong><small>'+esc(row.path)+(row.assignmentTitle?' · '+esc(row.assignmentTitle):'')+'</small><span>'+esc(row.label)+(row.date?' · '+esc(row.date):'')+(row.occurrenceDate&&row.date!==row.occurrenceDate?' · Original '+esc(row.occurrenceDate):'')+(row.kind==='board'||row.kind==='series'?'':row.completed?' · Completed':row.overdue?' · Overdue':' · Unfinished')+'</span></button></li>').join(''):'<li class="global-search-empty">No matching work. Try another search or filter.</li>';
  find('[data-search-range]').textContent='Current planner · Active boards and tasks. Recurring occurrences: original dates '+index.from+' to '+index.to+'.';
 }
 function rebuild(){
  const actor=getIdentity();
  if(!actor?.ownerId||!actor.planId){index=null;render();status(actor?.ownerId?'Select a planner to search.':'Sign in to search your planner.');return}
  try{index=buildSearchIndex(getState(),{today:getToday()});render()}catch{index=null;render();status('Search is unavailable. Close and try again.')}
 }
 function sync(){if(disposed)return;const next=identityKey();if(next!==identity){generation++;identity=next;busy=false;close(false);clear()}if(visible())rebuild()}
 function open(){
  if(disposed||busy||otherModal())return false;sync();if(!getIdentity()?.ownerId)return false;
  if(!visible()){opener=document.activeElement;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')}
  rebuild();input.focus?.();input.select?.();return true;
 }
 async function select(position){
  if(busy||!visible())return false;const row=rows[position];if(!row)return false;
  const actor=identity,ticket=generation;if(actor!==identityKey()){sync();return false}
  let fresh;try{fresh=buildSearchIndex(getState(),{today:getToday()}).rows.some(item=>JSON.stringify(item.target)===JSON.stringify(row.target))}catch{}
  if(!fresh){status('This result changed or is unavailable. Search again.');return false}
  const isCurrent=()=>!disposed&&ticket===generation&&identityKey()===actor;
  busy=true;close(false);
  try{const ok=await onNavigate(structuredClone(row.target),{isCurrent});if(!isCurrent())return false;if(!ok){busy=false;open();status('Result not opened. Review your current task or try again.')}return !!ok}
  catch{if(isCurrent()){busy=false;open();status('Could not open this result. Try again.')}return false}
  finally{if(isCurrent())busy=false}
 }
 function keydown(event){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&!event.repeat&&event.key?.toLowerCase()==='k'){if(open()){event.preventDefault();event.stopPropagation()}return}
  if(!visible()||!dialog.contains(event.target))return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
  const buttons=[...dialog.querySelectorAll('[data-search-result]')];
  if(['ArrowDown','ArrowUp'].includes(event.key)&&buttons.length&&(event.target===input||event.target.closest('[data-search-result]'))){event.preventDefault();const current=buttons.indexOf(event.target.closest('[data-search-result]')),n=current<0?(event.key==='ArrowDown'?0:buttons.length-1):(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[n].focus?.();buttons[n].scrollIntoView?.({block:'nearest'});return}
  if(event.key==='Enter'&&event.target===input){event.preventDefault();void select(0)}
  if(event.key==='Tab'){const controls=[...dialog.querySelectorAll('input,button')].filter(el=>!el.disabled),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus?.()}}
 }
 function click(event){if(event.target.closest('[data-global-search-open]')){event.preventDefault();open();return}if(!dialog.contains(event.target))return;const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-search-close'))close();if(button.hasAttribute('data-search-filter')){filter=button.dataset.searchFilter;render()}if(button.hasAttribute('data-search-result'))void select(Number(button.dataset.searchResult))}
 function onInput(event){if(event.target===input)render()}
 function cancel(event){event.preventDefault();close()}
 document.addEventListener('keydown',keydown);document.addEventListener('click',click);dialog.addEventListener('input',onInput);dialog.addEventListener('cancel',cancel);window.addEventListener('kairos-data-changed',sync);sync();
 return {open,close,sync,dispose(){disposed=true;generation++;close();document.removeEventListener('keydown',keydown);document.removeEventListener('click',click);dialog.removeEventListener('input',onInput);dialog.removeEventListener('cancel',cancel);window.removeEventListener('kairos-data-changed',sync);clear();dialog.remove()}};
}
