import {sectionBoard,sectionOrder} from './task-section-model.js?v=1';

// All writes use the task interaction host's durable operation and recovery path.
export function mountSectionOrganisation({root,getState,getIdentity,getViewKey,blocked,execute,reportError,scrollElement,document=root.ownerDocument,window=document.defaultView,requestFrame=fn=>window.requestAnimationFrame(fn),cancelFrame=id=>window.cancelAnimationFrame(id)}){
 let drag=null,frame=null,dialog=null,dialogScope=null,disposed=false;
 const scope=()=>JSON.stringify([getIdentity(),getViewKey(),root.classList.contains('active')]);
 const visible=element=>element&&root.contains(element)&&!element.closest('[hidden]');
 const targetFor=element=>{const block=element?.closest?.('.board-section-block,[data-focused-section]');return visible(block)?{boardId:block.dataset.boardId,sectionId:block.dataset.sectionId}:null};
 function source(target,state=getState()){
  const board=sectionBoard(state,target?.boardId),matches=(board.sections||[]).filter(section=>section.id===target.sectionId);
  if(matches.length!==1||matches[0].archived)throw Error('This section is no longer available.');
  return {board,section:matches[0]};
 }
 function state(target){
  try{const {board,section}=source(target),visible=(board.sections||[]).filter(item=>!item.archived),index=visible.indexOf(section);return {blocked:blocked(),canUp:index>0,canDown:index<visible.length-1,canMove:(getState().boards||[]).some(item=>item.id!==board.id&&!item.archived)}}catch{return {blocked:true}}
 }
 function reorder(target,direction,snapshot=getState()){
  const {board,section}=source(target,snapshot),all=sectionOrder(board),visible=(board.sections||[]).filter(item=>!item.archived),index=visible.indexOf(section),other=visible[index+direction];if(!other)return null;
  const order=[...all],a=order.indexOf(section.id),b=order.indexOf(other.id);[order[a],order[b]]=[order[b],order[a]];
  return {command:{type:'reorder_sections',target:{boardId:board.id},sectionIds:order},expected:{order:all}};
 }
 function move(target,boardId,index,snapshot=getState()){
  const {board}=source(target,snapshot),destination=sectionBoard(snapshot,boardId);
  return {command:{type:'move_section',target:{...target},destination:{boardId,index:index??sectionOrder(destination).length}},expected:{sourceOrder:sectionOrder(board),destinationOrder:sectionOrder(destination)}};
 }
 function closeDialog(restore=false){const button=dialogScope?.opener,oldScope=dialogScope?.scope;dialog?.remove();dialog=null;dialogScope=null;if(restore&&oldScope===scope()&&button?.isConnected)button.focus?.({preventScroll:true})}
 async function run(id,target,opener){
  if(disposed||blocked()||!root.classList.contains('active'))return false;
  try{
   const found=source(target);
   if(id==='section-up'||id==='section-down'){const action=reorder(target,id==='section-up'?-1:1);return action?execute(action.command,action.expected):false}
   if(id!=='section-move')return false;
   closeDialog();const snapshot=structuredClone(getState());dialog=document.createElement('dialog');dialog.dataset.sectionMoveDialog='';dialog.className='task-move-dialog';
   const title=document.createElement('h3');title.id='section-move-title';title.textContent='Move section: '+found.section.title;dialog.setAttribute('aria-labelledby',title.id);dialog.appendChild(title);
   const hint=document.createElement('p');hint.textContent='Choose a board. The section and its tasks move together.';dialog.appendChild(hint);
   for(const board of snapshot.boards||[])if(!board.archived&&board.id!==target.boardId){const button=document.createElement('button');button.type='button';button.dataset.sectionDestination=board.id;button.textContent=board.title||'Untitled board';dialog.appendChild(button);button.addEventListener('click',()=>{if(!dialog||dialogScope?.scope!==scope()||blocked()){closeDialog();return}const action=move(target,board.id,undefined,snapshot);closeDialog(true);void execute(action.command,action.expected)})}
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.addEventListener('click',()=>closeDialog(true));dialog.appendChild(cancel);
   dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(true)});dialogScope={scope:scope(),opener};root.appendChild(dialog);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('button')?.focus?.();return true;
  }catch(error){reportError(error.message);return false}
 }
 function clearMarks(){for(const element of root.querySelectorAll('.section-drop-before,.section-drop-after,.section-drop-empty'))element.classList.remove('section-drop-before','section-drop-after','section-drop-empty')}
 function cancel(){if(frame!==null)cancelFrame(frame);frame=null;const old=drag;drag=null;if(old){old.block.classList.remove('section-dragging');try{root.releasePointerCapture?.(old.pointerId)}catch{}}clearMarks()}
 function decorate(){
  if(dialog&&dialogScope?.scope!==scope())closeDialog();
  if(drag&&(drag.scope!==scope()||!drag.block.isConnected||blocked()))cancel();
  for(const block of root.querySelectorAll('.board-section-block')){
   const header=block.querySelector('.section-title-row');if(!header)continue;
   if(!header.querySelector('[data-section-drag]')){const grip=document.createElement('button');grip.type='button';grip.dataset.sectionDrag='';grip.className='task-section-grip';grip.setAttribute('aria-label','Drag section; Alt + Up or Down to reorder');grip.title='Drag section · Alt + ↑ / ↓';grip.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1"/></svg>';header.prepend(grip)}
   if(!header.querySelector('[data-section-menu]')){const menu=document.createElement('button');menu.type='button';menu.dataset.sectionMenu='';menu.className='task-section-control';menu.textContent='Organise';menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-label','Organise section');header.appendChild(menu)}
   const unavailable=state({boardId:block.dataset.boardId,sectionId:block.dataset.sectionId}).blocked;header.querySelector('[data-section-drag]').disabled=unavailable;header.querySelector('[data-section-menu]').disabled=unavailable;
  }
 }
 function down(event){const grip=event.target.closest?.('[data-section-drag]');if(!grip||grip.disabled||event.button!==0||blocked())return;cancel();const target=targetFor(grip);if(!target)return;try{source(target);event.preventDefault();grip.focus?.({preventScroll:true});drag={block:grip.closest('.board-section-block'),target,snapshot:structuredClone(getState()),scope:scope(),pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,active:false,drop:null};try{root.setPointerCapture?.(event.pointerId)}catch{}}catch(error){reportError(error.message)}}
 function dropAt(x,y){
  clearMarks();drag.drop=null;const element=document.elementFromPoint?.(x,y),target=targetFor(element);
  if(target){if(target.boardId===drag.target.boardId&&target.sectionId===drag.target.sectionId)return;const block=element.closest('.board-section-block'),rect=block?.getBoundingClientRect();if(!rect)return;const after=y>rect.top+rect.height/2;block.classList.add(after?'section-drop-after':'section-drop-before');drag.drop={boardId:target.boardId,sectionId:target.sectionId,after};return}
  const board=element?.closest?.('.board-card');if(visible(board)&&board.dataset.boardId!==drag.target.boardId){board.classList.add('section-drop-empty');drag.drop={boardId:board.dataset.boardId}}
 }
 function autoScroll(){frame=null;if(!drag?.active)return;if(drag.scope!==scope()||!drag.block.isConnected||blocked()){cancel();return}const rect=scrollElement.getBoundingClientRect(),distance=drag.y<rect.top+40?-12:drag.y>rect.bottom-40?12:0;if(distance){scrollElement.scrollTop+=distance;dropAt(drag.x,drag.y)}frame=requestFrame(autoScroll)}
 function pointerMove(event){if(!drag||event.pointerId!==drag.pointerId)return;if(drag.scope!==scope()||blocked()){cancel();return}if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<4)return;drag.active=true;drag.x=event.clientX;drag.y=event.clientY;drag.block.classList.add('section-dragging');dropAt(drag.x,drag.y);if(frame===null)frame=requestFrame(autoScroll);event.preventDefault()}
 function up(event){
  if(!drag||event.pointerId!==drag.pointerId)return;if(drag.active)dropAt(event.clientX,event.clientY);const old=drag;cancel();if(!old.active||!old.drop||old.scope!==scope()||blocked())return;
  try{const {board}=source(old.target,old.snapshot),destination=sectionBoard(old.snapshot,old.drop.boardId),before=sectionOrder(board),order=sectionOrder(destination),anchor=old.drop.sectionId;let index=anchor?order.indexOf(anchor)+(old.drop.after?1:0):order.length;if(anchor&&order.indexOf(anchor)<0)throw Error('The target section changed.');
   let action;if(board===destination){const visible=board.sections.filter(s=>!s.archived).map(s=>s.id),sourceIndex=visible.indexOf(old.target.sectionId),anchorIndex=visible.indexOf(anchor);if(anchorIndex<0)return;visible.splice(sourceIndex,1);visible.splice(visible.indexOf(anchor)+(old.drop.after?1:0),0,old.target.sectionId);let n=0;const sectionIds=board.sections.map(s=>s.archived?s.id:visible[n++]);if(sectionIds.every((id,i)=>id===before[i]))return;action={command:{type:'reorder_sections',target:{boardId:board.id},sectionIds},expected:{order:before}}}
   else action=move(old.target,destination.id,index,old.snapshot);void execute(action.command,action.expected);
  }catch(error){reportError(error.message)}
 }
 function key(event){if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();cancel();return}if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!event.target.closest?.('[data-section-drag]'))return;event.preventDefault();event.stopPropagation();const target=targetFor(event.target);if(target)void run(event.key==='ArrowUp'?'section-up':'section-down',target,event.target)}
 const blur=()=>cancel(),listeners=[['pointerdown',down],['pointermove',pointerMove],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['keydown',key]];
 for(const [type,handler]of listeners)root.addEventListener(type,handler);window.addEventListener('blur',blur);
 return {decorate,state,run,cancel,isDragging:()=>!!drag,dispose(){disposed=true;cancel();closeDialog();for(const [type,handler]of listeners)root.removeEventListener(type,handler);window.removeEventListener('blur',blur)}};
}
