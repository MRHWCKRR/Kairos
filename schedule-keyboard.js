import {keyboardScheduleStep,keyboardScheduleFields,readKeyboardSchedule} from './schedule-keyboard-model.js?v=6';
import {formatTime,blockGeometry} from './schedule-utils.js?v=5';

const help='Up/Down: move 5 minutes. Shift+Up/Down: resize 5 minutes. Enter: confirm. Escape: cancel.';
const editing=element=>!!element?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');

export function mountScheduleKeyboard({root,getWorkspace,getBridge,getController}={}){
 const document=root.ownerDocument,window=document.defaultView;
 let session=null,saving=false,disposed=false;
 const state=()=>({boards:getBridge()?.getBoards?.()||[]});
 const allowed=()=>getBridge()?.getAllowCompletedReschedule?.()===true;
 const active=()=>!disposed&&root.classList.contains('active')&&!getWorkspace()?.state.monthView&&!!getBridge()?.getOwnerId?.();
 const context=()=>JSON.stringify([getBridge()?.getOwnerId?.(),getBridge()?.getPlanId?.(),getWorkspace()?.state.view,getWorkspace()?.state.focusDate,getWorkspace()?.state.selected]);
 const busy=()=>saving||getController()?.isBlocked?.()||getWorkspace()?.inspectorSession?.hasDraft?.()||getWorkspace()?.inspectorSession?.isBusy?.();
 const modal=()=>[...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"],[role="menu"],[data-site-context-menu],.kairos-select-popup:not([hidden])')].some(element=>{
  if(element.closest('[hidden],[inert],[aria-hidden="true"],.modal-overlay:not(.active),dialog:not([open])'))return false;
  if(window.getComputedStyle){const style=window.getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return false;}
  return !element.getClientRects||element.getClientRects().length>0;
 });
 const targetFor=block=>block?.dataset.occurrenceDate?{taskId:block.dataset.seriesId,occurrenceDate:block.dataset.occurrenceDate}:block?.dataset.taskId?{taskId:block.dataset.taskId}:null;
 const sameTarget=(a,b)=>a&&b&&String(a.taskId)===String(b.taskId)&&a.occurrenceDate===b.occurrenceDate;
 const blockFor=target=>[...root.querySelectorAll('.ks-task-block')].find(block=>sameTarget(targetFor(block),target));
 function notice(text){
  let host=root.querySelector('[data-keyboard-status]');
  if(!host){host=document.createElement('p');host.dataset.keyboardStatus='';host.className='ks-keyboard-status';host.setAttribute('role','status');root.querySelector('#schedule-toolbar')?.after(host)}
  host.textContent=text;
 }
 function cancel(restore=false){
  const old=session;if(!old)return;session=null;old.panel.remove();old.marker?.remove();old.block?.classList.remove('is-keyboard-adjusting');
  if(restore&&active()&&context()===old.context)blockFor(old.target)?.focus?.({preventScroll:true});
 }
 function current(){
  if(!session||!active()||context()!==session.context)return false;
  try{return JSON.stringify(readKeyboardSchedule(state(),session.target,allowed()).expected)===JSON.stringify(session.expected)}catch{return false}
 }
 function preview(){
  if(!session)return;const block=blockFor(session.target),grid=block?.closest('.ks-day-grid');if(!grid)return cancel();
  if(session.block!==block){session.block?.classList.remove('is-keyboard-adjusting');session.block=block}
  if(!block.classList.contains('is-keyboard-adjusting'))block.classList.add('is-keyboard-adjusting');
  if(!session.marker?.isConnected){session.marker=document.createElement('div');session.marker.className='ks-drag-preview ks-keyboard-preview';session.marker.setAttribute('aria-hidden','true');session.marker.innerHTML='<strong></strong><span></span>';grid.appendChild(session.marker)}
  const {startMin,duration,date}=session.value,end=startMin+duration,hour12=getBridge()?.getTimeFormat?.()!=='24',range=formatTime(startMin,hour12)+'–'+formatTime(end%1440,hour12)+(end===1440?' (+1 day)':'')+' · '+duration+' min'+(session.target.occurrenceDate?' · This occurrence':'');
  const geometry=blockGeometry(startMin,end,56,20);session.marker.style.top=geometry.topPx+'px';session.marker.style.height=geometry.heightPx+'px';
  session.marker.querySelector('strong').textContent=session.title;session.marker.querySelector('span').textContent=range;
  session.panel.querySelector('[data-keyboard-preview]').textContent='Proposed '+date+' · '+range;
  session.panel.querySelector('[data-keyboard-confirm]').disabled=JSON.stringify(session.value)===JSON.stringify(session.original);
 }
 function begin(block){
  if(!active()||modal()||root.querySelector('.is-dragging,.is-resizing'))return false;
  if(busy()){notice('Save or discard task edits, or finish the previous schedule change first.');return false}
  const target=targetFor(block);if(!target)return false;
  let task;try{task=readKeyboardSchedule(state(),target,allowed())}catch(error){notice(error.message);return false}
  cancel();notice('');const panel=document.createElement('section');panel.className='ks-keyboard-panel';panel.dataset.keyboardPanel='';panel.setAttribute('aria-label','Adjust schedule with keyboard');panel.tabIndex=-1;
  panel.innerHTML='<strong data-keyboard-title></strong><p></p><p data-keyboard-preview role="status" aria-live="polite"></p><div><button type="button" data-keyboard-confirm disabled>Save time</button><button type="button" data-keyboard-cancel>Cancel</button></div>';
  panel.querySelector('[data-keyboard-title]').textContent=task.title;panel.querySelector('p').textContent=help;
  panel.querySelector('[data-keyboard-confirm]').addEventListener('click',()=>void confirm());panel.querySelector('[data-keyboard-cancel]').addEventListener('click',()=>cancel(true));
  session={target,context:context(),expected:task.expected,title:task.title,original:task.value,value:{...task.value},block,panel,marker:null};
  root.insertBefore(panel,root.querySelector('.schedule-workspace-shell'));preview();return true;
 }
 async function confirm(){
  if(!session||saving)return;
  if(!current()||busy()){cancel();notice('The task or planner changed. Review the current schedule before adjusting it.');return}
  if(JSON.stringify(session.value)===JSON.stringify(session.original)){cancel(true);return}
  const old=session,fields=keyboardScheduleFields(old.value,old.target),restore=!document.activeElement||old.panel.contains(document.activeElement)||document.activeElement===old.block;
  cancel();saving=true;
  try{await getController().save(old.target,fields)}catch(error){if(active()&&context()===old.context)notice(error.message||'Could not save this schedule.')}
  finally{saving=false;if(restore&&active()&&context()===old.context&&(!document.activeElement||document.activeElement===document.body||document.activeElement===old.block))blockFor(old.target)?.focus?.({preventScroll:true});sync()}
 }
 function sync(){
  if(disposed)return;
  if(session){if(!current())cancel();else if(!session.marker?.isConnected||session.block!==blockFor(session.target))preview()}
  for(const block of root.querySelectorAll('.ks-task-block')){if(block.getAttribute('aria-description')!==help){block.setAttribute('aria-description',help);block.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown')}}
  const selected=getWorkspace()?.state.selected,target=selected?.type==='task'?{taskId:selected.id}:selected?.type==='occurrence'?{taskId:selected.seriesId,occurrenceDate:selected.occurrenceDate}:null,block=target&&blockFor(target),actions=root.querySelector('#schedule-inspector .ks-inspector-actions');
  const form=root.querySelector('#schedule-inspector form');
  let eligible=false;try{eligible=!!(active()&&block&&actions&&(!form||form.matches('[data-ks-rich-inspector]'))&&readKeyboardSchedule(state(),target,allowed()))}catch{}
  const existing=root.querySelector('[data-keyboard-adjust]');
  if(!eligible){existing?.remove();return}
  if(existing)return;const button=document.createElement('button');button.type='button';button.dataset.keyboardAdjust='';button.textContent='Adjust with keyboard';button.addEventListener('click',()=>{const latest=blockFor(target);if(latest&&begin(latest))session.panel.focus()});actions.appendChild(button);
 }
 function onKey(event){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||editing(event.target)||modal()||!active())return;
  const block=event.target.closest?.('.ks-task-block');
  if(session&&!current()){cancel();notice('The task changed. Review its current time.');if(event.key==='Enter'){event.preventDefault();event.stopPropagation()}return}
  if(event.key==='Escape'&&session){event.preventDefault();event.stopPropagation();cancel(true);return}
  if(event.key==='Enter'&&session){if(event.target.closest?.('[data-keyboard-cancel]'))return;event.preventDefault();event.stopPropagation();if(!event.repeat)void confirm();return}
  if(event.key==='Enter'&&block&&!session){
   event.preventDefault();event.stopPropagation();if(event.repeat||saving)return;
   const target=targetFor(block),workspace=getWorkspace(),actor=JSON.stringify([getBridge()?.getOwnerId?.(),getBridge()?.getPlanId?.()]);
   const opened=target.occurrenceDate?workspace.selectOccurrence?.({seriesId:target.taskId,occurrenceDate:target.occurrenceDate,occurrenceId:block.dataset.occurrenceId}):workspace.selectItem?.('task',target.taskId);
   Promise.resolve(opened).then(ok=>{if(ok&&active()&&actor===JSON.stringify([getBridge()?.getOwnerId?.(),getBridge()?.getPlanId?.()]))blockFor(target)?.focus?.({preventScroll:true})});
   return;
  }
  if(!['ArrowUp','ArrowDown'].includes(event.key)||!session&&!block)return;
  if(session&&!session.panel.contains(event.target)&&!sameTarget(targetFor(block),session.target))return;
  event.preventDefault();event.stopPropagation();
  if(!session&&!begin(block))return;
  if(busy()){cancel();notice('Save or discard task edits, or finish the previous schedule change first.');return}
  session.value=keyboardScheduleStep(session.value,event.key,event.shiftKey);preview();session?.marker?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 }
 function focus(event){if(session&&!session.panel.contains(event.target)&&!sameTarget(targetFor(event.target.closest?.('.ks-task-block')),session.target))cancel()}
 function pointer(event){if(session&&!session.panel.contains(event.target))cancel()}
 const observer=new window.MutationObserver(sync);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 root.addEventListener('keydown',onKey,true);document.addEventListener('focusin',focus);root.addEventListener('pointerdown',pointer,true);
 const blur=()=>cancel(),changed=()=>sync();window.addEventListener('blur',blur);window.addEventListener('kairos-data-changed',changed);
 sync();return {sync,dispose(){disposed=true;cancel();observer.disconnect();root.removeEventListener('keydown',onKey,true);document.removeEventListener('focusin',focus);root.removeEventListener('pointerdown',pointer,true);window.removeEventListener('blur',blur);window.removeEventListener('kairos-data-changed',changed);root.querySelector('[data-keyboard-adjust]')?.remove();root.querySelector('[data-keyboard-status]')?.remove()}};
}
function boot(){const root=document.getElementById('schedule-page');if(!root||!window.__kairosScheduleWorkspace||window.__kairosScheduleKeyboard)return;window.__kairosScheduleKeyboard=mountScheduleKeyboard({root,getWorkspace:()=>window.__kairosScheduleWorkspace,getBridge:()=>window.__kairosScheduleBridge,getController:()=>window.__kairosScheduleInteractions})}
if(typeof window!=='undefined'){window.addEventListener('kairos-schedule-bridge-ready',boot);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
