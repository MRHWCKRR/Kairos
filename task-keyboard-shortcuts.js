import {matchesShortcut,describeShortcut} from './shortcut-model.js?v=1';
const editing=element=>!!element?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-shortcut-editor]');

export function mountTaskKeyboardShortcuts({root,workspace,getIdentity,getShortcuts=()=>undefined,getViewKey=()=>workspace.getViewKey(),isBusy=()=>false,isBlocked=()=>false,document=root.ownerDocument,window=document.defaultView}={}){
 let scope,scopeState,epoch=0,lastSection=null,guide=null,guideScope=null,opener=null,opening=false,disposed=false;
 const scopeKey=()=>JSON.stringify([getIdentity().ownerId,getIdentity().planId,getViewKey(),root.classList.contains('active')]);
 const active=()=>!disposed&&root.classList.contains('active')&&!!getIdentity().ownerId;
 const button=document.createElement('button');button.type='button';button.className='task-shortcuts-button';button.dataset.taskShortcuts='';button.textContent='Keyboard shortcuts';button.setAttribute('aria-keyshortcuts','Shift+/');button.setAttribute('aria-haspopup','dialog');
 const heading=root.querySelector('h2');if(heading)heading.after(button);else root.prepend(button);
 const status=document.createElement('p');status.dataset.taskShortcutStatus='';status.className='task-shortcut-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');button.after(status);
 function closeGuide(restore=false){const source=opener,same=guideScope===scopeKey();guide?.remove();guide=null;opener=null;guideScope=null;if(restore&&same&&source?.isConnected)source.focus?.({preventScroll:true})}
 function sync(){button.setAttribute('aria-keyshortcuts',describeShortcut('showTaskShortcuts',getShortcuts()).replace('Mod','Control').replace('?','Shift+/'));const identity=getIdentity(),nextState={ownerId:identity.ownerId,planId:identity.planId,view:getViewKey(),active:root.classList.contains('active')},next=scopeKey();if(next===scope)return;
  const initialPlan=scopeState&&scopeState.ownerId===nextState.ownerId&&scopeState.planId===null&&nextState.planId!==null&&scopeState.view===nextState.view&&scopeState.active===nextState.active;
  if(!initialPlan)epoch++;scope=next;scopeState=nextState;lastSection=null;status.textContent='';closeGuide();
 }
 function sectionFor(element){const block=element?.closest?.('.board-section-block,[data-focused-section]');return block&&root.contains(block)&&!block.closest('[hidden]')?{boardId:block.dataset.boardId,sectionId:block.dataset.sectionId}:null}
 function remember(event){sync();if(active()){const section=sectionFor(event.target);if(section)lastSection=section}}
 function openGuide(){
  sync();if(!active()||isBlocked()||document.querySelector('dialog[open],[role="menu"],[data-site-context-menu],.kairos-select-popup:not([hidden]),[role="combobox"][aria-expanded="true"]'))return false;
  if(guide)return true;opener=document.activeElement;guideScope=scopeKey();guide=document.createElement('dialog');guide.dataset.taskShortcutGuide='';guide.className='task-shortcut-guide';guide.setAttribute('aria-labelledby','task-shortcut-title');
  guide.innerHTML='<h2 id="task-shortcut-title">Task keyboard shortcuts</h2><p>Shortcuts work in Tasks. Letter shortcuts pause while you type.</p><dl><dt><kbd>N</kbd></dt><dd>Add a task in the current section. Focus or click a section first.</dd><dt><kbd>Enter</kbd></dt><dd>Save a quick entry and add another.</dd><dt><kbd>Escape</kbd></dt><dd>Close a menu or this guide; cancel an unsaved quick entry.</dd><dt><kbd>?</kbd></dt><dd>Show this guide.</dd><dt><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></dt><dd>Reorder from a task or section grip; reorder a checklist step in its editor.</dd><dt><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd></dt><dd>Save in the task details editor.</dd></dl><button type="button" data-shortcuts-close>Close</button>';
  const terms=guide.querySelectorAll('dt');terms[0].textContent=describeShortcut('addTask',getShortcuts());terms[3].textContent=describeShortcut('showTaskShortcuts',getShortcuts());terms[5].textContent=describeShortcut('saveTaskDetails',getShortcuts());
  guide.querySelector('button').addEventListener('click',()=>closeGuide(true));guide.addEventListener('cancel',event=>{event.preventDefault();closeGuide(true)});
  root.appendChild(guide);if(guide.showModal)guide.showModal();else guide.setAttribute('open','');guide.querySelector('button').focus?.({preventScroll:true});return true;
 }
 async function add(){
  if(opening)return;const target=lastSection||workspace.getCurrentSection?.();
  if(!target){status.textContent='Choose a section first, then press '+describeShortcut('addTask',getShortcuts())+' to add a task.';return}
  if(isBusy()||workspace.hasPendingCapture()){status.textContent='Wait for the current save or resolve Retry/Discard first.';return}
  const ticket=scopeKey(),generation=epoch,identity=getIdentity(),view=getViewKey();const isCurrent=()=>{sync();return generation===epoch&&active()&&getIdentity().ownerId===identity.ownerId&&(identity.planId===null||getIdentity().planId===identity.planId)&&getViewKey()===view};opening=true;status.textContent='';
  try{if(await workspace.addTask(target,document.activeElement,{isCurrent})===false&&ticket===scopeKey())status.textContent='This section is unavailable. Choose another section.'}
  catch(error){if(ticket===scopeKey())status.textContent=error.message||'Could not open task entry.'}
  finally{opening=false}
 }
 function onKey(event){
  sync();if(event.defaultPrevented||!active()||event.isComposing||event.keyCode===229||event.repeat)return;
  if(guide){
   if(!guide.contains(event.target))return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeGuide(true)}
   else if(event.key==='Tab'){const controls=[...guide.querySelectorAll('button,[href],input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex!==-1),first=controls[0],last=controls.at(-1);if(first&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus()}}
   return;
  }
  if(isBlocked()||document.querySelector('dialog[open],[role="menu"],[data-site-context-menu],.kairos-select-popup:not([hidden]),[role="combobox"][aria-expanded="true"]'))return;
  if(event.key==='Escape'){
   if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
   if(editing(event.target)&&!event.target.closest('.task-quick-add'))return;
   if(workspace.cancelCapture?.()){event.preventDefault();event.stopPropagation()}return;
  }
  if(editing(event.target)||editing(document.activeElement))return;
  if(matchesShortcut(event,'showTaskShortcuts',getShortcuts())){event.preventDefault();event.stopPropagation();openGuide()}
  else if(matchesShortcut(event,'addTask',getShortcuts())){event.preventDefault();event.stopPropagation();void add()}
 }
 const onButton=()=>openGuide();button.addEventListener('click',onButton);document.addEventListener('keydown',onKey);root.addEventListener('focusin',remember);root.addEventListener('pointerdown',remember);
 const observer=window.MutationObserver?new window.MutationObserver(records=>{if(records.some(record=>(record.oldValue||'').split(/\s+/).includes('active')!==root.classList.contains('active'))){epoch++;lastSection=null;closeGuide()}sync()}):null;observer?.observe(root,{attributes:true,attributeFilter:['class'],attributeOldValue:true});sync();
 return {sync,openGuide,dispose(){disposed=true;observer?.disconnect();closeGuide();document.removeEventListener('keydown',onKey);root.removeEventListener('focusin',remember);root.removeEventListener('pointerdown',remember);button.removeEventListener('click',onButton);button.remove();status.remove()}};
}
