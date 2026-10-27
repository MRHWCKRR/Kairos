import {mountDialogWindow} from './dialog-window.js?v=2';
import {buildSearchIndex,searchPlanner} from './global-search-model.js?v=3';
import {matchesShortcut} from './shortcut-model.js?v=1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountGlobalSearch({document=globalThis.document,window=globalThis.window,getIdentity,getState,getToday,onNavigate,getShortcuts=()=>undefined,getLocale=()=>undefined}={}){
 const dialog=document.createElement('dialog');dialog.className='global-search-dialog';dialog.setAttribute('aria-labelledby','global-search-title');
 dialog.innerHTML='<header><h2 id="global-search-title">Search planner</h2><button type="button" data-search-close aria-label="Close search">Close</button></header><label class="global-search-label" for="global-search-query">Find tasks, assignments or boards</label><input id="global-search-query" data-search-query type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" maxlength="500" autocomplete="off" placeholder="Search titles, locations or notes" aria-controls="global-search-results"><div class="global-search-filters" role="group" aria-label="Filter work">'+['all','unfinished','overdue','completed'].map(value=>'<button type="button" data-search-filter="'+value+'" aria-pressed="'+(value==='all')+'">'+value[0].toUpperCase()+value.slice(1)+'</button>').join('')+'</div><p data-search-status role="status" aria-live="polite"></p><ul id="global-search-results" data-search-results role="listbox" aria-label="Search results"></ul><div data-search-empty></div><footer><span class="global-search-keys"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></span><p data-search-range></p></footer>';
 document.body.appendChild(dialog);
 const dialogWindow=mountDialogWindow({dialog,window});
 const find=selector=>dialog.querySelector(selector),input=find('[data-search-query]'),results=find('[data-search-results]');
 let identity=null,generation=0,opener=null,index=null,rows=[],active=-1,filter='all',busy=false,disposed=false;
 const identityKey=()=>{const value=getIdentity();return JSON.stringify([value?.ownerId||null,value?.planId||null])};
 const visible=()=>dialog.hasAttribute('open');
 const otherModal=()=>[...document.querySelectorAll('dialog[open]')].some(element=>element!==dialog);
 function status(text){find('[data-search-status]').textContent=text}
 function close(restore=true){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');if(visible()){dialogWindow.stop();if(dialog.close)dialog.close();else dialog.removeAttribute('open');if(restore&&opener?.isConnected)opener.focus?.()}}
 function clear(){index=null;rows=[];active=-1;input.removeAttribute('aria-activedescendant');find('[data-search-empty]').replaceChildren();filter='all';input.value='';results.replaceChildren();find('[data-search-range]').textContent='';status('')}
 function activate(position,scroll=false){
  active=rows.length?Math.max(0,Math.min(rows.length-1,position)):-1;
  const buttons=[...results.querySelectorAll('[data-search-result]')];
  for(const [n,button]of buttons.entries())button.setAttribute('aria-selected',String(n===active));
  const selected=buttons[active];
  if(selected&&visible()){input.setAttribute('aria-activedescendant',selected.id);if(scroll)selected.scrollIntoView?.({block:'nearest'})}
  else input.removeAttribute('aria-activedescendant');
 }
 function dateText(date){return new Intl.DateTimeFormat(getLocale(),{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}
 function resultMarkup(row,n){
  const hasStatus=row.kind!=='board'&&row.kind!=='series',state=hasStatus?(row.completed?'Completed':row.overdue?'Overdue':'Unfinished'):'';
  const date=row.date?'<span>'+esc(row.dateKind)+' <time datetime="'+esc(row.date)+'">'+esc(dateText(row.date))+'</time></span>':hasStatus?'<span>No date</span>':'';
  return '<li role="presentation"><button type="button" role="option" tabindex="-1" id="global-search-result-'+n+'" data-search-result="'+n+'" aria-selected="false"><span class="global-search-result-heading"><strong>'+esc(row.title)+'</strong>'+(state?'<span class="global-search-result-state" data-state="'+state.toLowerCase()+'">'+state+'</span>':'')+'</span><small>'+esc(row.path)+'</small><span class="global-search-result-meta"><span>'+esc(row.label)+'</span>'+date+(row.assignmentTitle?'<span>For '+esc(row.assignmentTitle)+'</span>':'')+(row.occurrenceDate&&row.date!==row.occurrenceDate?'<span>Originally '+esc(dateText(row.occurrenceDate))+'</span>':'')+'</span></button></li>';
 }
 function renderEmpty(){
  const query=input.value.trim(),noWork=!index.rows.length;
  const title=noWork?'No active work yet':query?'No matching work for “'+query+'”':'No '+filter+' work';
  const hint=noWork?'Create a task or board to start searching.':filter!=='all'?'The '+filter[0].toUpperCase()+filter.slice(1)+' filter is on. Try searching all work.':'Try a shorter title, board name or a word from your notes.';
  find('[data-search-empty]').innerHTML='<div class="global-search-empty"><strong>'+esc(title)+'</strong><p>'+esc(hint)+'</p>'+(!noWork?(filter!=='all'?'<button type="button" data-search-reset-filter>Search all work</button>':query?'<button type="button" data-search-clear-query>Clear search</button>':''):'')+'</div>';
 }
 function render({reset=false}={}){
  const selected=reset?null:rows[active]?JSON.stringify(rows[active].target):null;
  for(const button of dialog.querySelectorAll('[data-search-filter]'))button.setAttribute('aria-pressed',String(button.dataset.searchFilter===filter));
  find('[data-search-empty]').replaceChildren();
  if(!index){rows=[];results.replaceChildren();activate(-1);find('[data-search-range]').textContent='';return}
  const found=searchPlanner(index,{query:input.value,status:filter});rows=found.rows;
  status(found.total>rows.length?'Showing '+rows.length+' of '+found.total+' matches. Refine your search.':found.total+' result'+(found.total===1?'':'s')+'.');
  results.innerHTML=rows.map(resultMarkup).join('');
  if(!rows.length)renderEmpty();
  const previous=rows.findIndex(row=>JSON.stringify(row.target)===selected);activate(previous<0?0:previous);
  find('[data-search-range]').textContent='Active work in this planner. Recurring dates: '+dateText(index.from)+' – '+dateText(index.to)+'.';
 }
 function rebuild(){
  const actor=getIdentity();
  if(!actor?.ownerId||!actor.planId){index=null;render();status(actor?.ownerId?'Select a planner to search.':'Sign in to search your planner.');return}
  try{index=buildSearchIndex(getState(),{today:getToday()});render()}catch{index=null;render();status('Search is unavailable. Close and try again.')}
 }
 function sync(){if(disposed)return;const next=identityKey();if(next!==identity){generation++;identity=next;busy=false;close(false);clear()}if(visible())rebuild()}
 function open(){
  if(disposed||busy||otherModal())return false;sync();if(!getIdentity()?.ownerId)return false;
  const opening=!visible();
  if(opening){opener=document.activeElement;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')}
  input.setAttribute('aria-expanded','true');rebuild();if(opening)dialogWindow.reset();input.focus?.();input.select?.();return true;
 }
 async function select(position){
  if(busy||!visible())return false;const row=rows[position];if(!row)return false;
  const actor=identity,ticket=generation;if(actor!==identityKey()){sync();return false}
  let fresh;try{fresh=buildSearchIndex(getState(),{today:getToday()}).rows.some(item=>JSON.stringify(item.target)===JSON.stringify(row.target))}catch{}
  if(!fresh){rebuild();status('This result changed or is unavailable. Search again.');return false}
  const isCurrent=()=>!disposed&&ticket===generation&&identityKey()===actor;
  busy=true;close(false);
  try{const ok=await onNavigate(structuredClone(row.target),{isCurrent});if(!isCurrent())return false;if(!ok){busy=false;open();status('Result not opened. Review your current task or try again.')}return !!ok}
  catch{if(isCurrent()){busy=false;open();status('Could not open this result. Try again.')}return false}
  finally{if(isCurrent())busy=false}
 }
 function keydown(event){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
  if(matchesShortcut(event,'search',getShortcuts(),{allowInEditor:true,activeElement:document.activeElement})){if(open()){event.preventDefault();event.stopPropagation()}return}
  if(!visible()||!dialog.contains(event.target))return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
  const result=event.target.closest('[data-search-result]');
  if(['ArrowDown','ArrowUp'].includes(event.key)&&rows.length&&(event.target===input||result)){
   event.preventDefault();const current=result?Number(result.dataset.searchResult):active;
   activate((current+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length,true);input.focus?.();return;
  }
  if(event.key==='Enter'&&(event.target===input||result)){event.preventDefault();void select(result?Number(result.dataset.searchResult):active);return}
  if(event.key==='Tab'){const controls=[...dialog.querySelectorAll('input,button,[tabindex="0"]')].filter(el=>!el.disabled&&el.tabIndex!==-1),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus?.()}}
 }
 function click(event){if(event.target.closest('[data-global-search-open]')){event.preventDefault();open();return}if(!dialog.contains(event.target))return;const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-search-close'))close();if(button.hasAttribute('data-search-filter')){filter=button.dataset.searchFilter;render({reset:true})}if(button.hasAttribute('data-search-reset-filter')){filter='all';render({reset:true});input.focus?.()}if(button.hasAttribute('data-search-clear-query')){input.value='';render({reset:true});input.focus?.()}if(button.hasAttribute('data-search-result'))void select(Number(button.dataset.searchResult))}
 function onInput(event){if(event.target===input)render({reset:true})}
 function cancel(event){event.preventDefault();close()}
 document.addEventListener('keydown',keydown);document.addEventListener('click',click);dialog.addEventListener('input',onInput);dialog.addEventListener('cancel',cancel);window.addEventListener('kairos-data-changed',sync);sync();
 return {open,close,sync,dispose(){disposed=true;generation++;close();dialogWindow.dispose();document.removeEventListener('keydown',keydown);document.removeEventListener('click',click);dialog.removeEventListener('input',onInput);dialog.removeEventListener('cancel',cancel);window.removeEventListener('kairos-data-changed',sync);clear();dialog.remove()}};
}
