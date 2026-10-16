// Owns transient pointer feedback only. The editor applies a draft move on drop.
export function mountChecklistReorder({root,list,getItems,onReorder,isEnabled=()=>true,document=root.ownerDocument,window=document.defaultView,requestFrame=fn=>window.requestAnimationFrame(fn),cancelFrame=id=>window.cancelAnimationFrame(id)}) {
  let drag=null,frame=null,disposed=false;
  const order=()=>JSON.stringify(getItems().map(item=>item.id));
  const active=()=>!disposed&&isEnabled()&&root.isConnected&&!root.closest('[hidden],[inert]')&&document.visibilityState!=='hidden'&&(!root.closest('.page-view')||root.closest('.page-view').classList.contains('active'));
  const valid=()=>drag&&active()&&drag.row.isConnected&&list.contains(drag.row)&&drag.order===order();
  function clearMarkers(){for(const row of list.querySelectorAll('.checklist-drop-before,.checklist-drop-after'))row.classList.remove('checklist-drop-before','checklist-drop-after')}
  function cancel(){
    const saved=drag;drag=null;if(frame!==null)cancelFrame(frame);frame=null;clearMarkers();saved?.row.classList.remove('checklist-dragging');saved?.preview?.remove();
    if(saved)try{root.releasePointerCapture?.(saved.pointerId)}catch{}
  }
  function targetAt(x,y){
    clearMarkers();drag.drop=null;
    const hit=document.elementFromPoint?.(x,y),row=hit?.closest?.('[data-step-row]');
    if(!row||!list.contains(row)||row===drag.row||row.closest('[hidden],[inert]'))return;
    const rect=row.getBoundingClientRect(),after=y>rect.top+rect.height/2;
    row.classList.add(after?'checklist-drop-after':'checklist-drop-before');drag.drop={stepId:drag.id,anchorId:row.dataset.stepRow,after};
  }
  function scroll(){
    frame=null;if(!valid()){cancel();return}
    const pane=root.closest('.task-detail-pane')||root.closest('dialog')||root,rect=pane.getBoundingClientRect();
    const distance=drag.y<rect.top+40?-12:drag.y>rect.bottom-40?12:0;
    if(distance){pane.scrollTop+=distance;targetAt(drag.x,drag.y)}
    frame=requestFrame(scroll);
  }
  function down(event){
    if(event.defaultPrevented||event.button!==0||event.isPrimary===false||!active())return;
    const grip=event.target.closest?.('[data-step-grip]'),row=grip?.closest('[data-step-row]');
    if(!grip||grip.disabled||!row||!list.contains(row))return;
    cancel();event.preventDefault();event.stopPropagation();grip.focus?.({preventScroll:true});
    drag={row,id:row.dataset.stepRow,order:order(),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false,drop:null,preview:null};
    try{root.setPointerCapture?.(event.pointerId)}catch{}
  }
  function move(event){
    if(!drag||event.pointerId!==drag.pointerId)return;if(!valid()){cancel();return}
    if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<4)return;
    if(!drag.active){
      drag.active=true;drag.row.classList.add('checklist-dragging');
      const preview=document.createElement('div');preview.dataset.checklistDragPreview='';preview.className='task-checklist-drag-preview';preview.setAttribute('aria-hidden','true');preview.textContent=getItems().find(item=>item.id===drag.id)?.title||'';(root.closest('dialog')||document.body).appendChild(preview);drag.preview=preview;
    }
    event.preventDefault();event.stopPropagation();drag.x=event.clientX;drag.y=event.clientY;
    drag.preview.style.left=Math.max(8,Math.min(event.clientX+16,(window.innerWidth||800)-220))+'px';drag.preview.style.top=Math.max(8,Math.min(event.clientY+16,(window.innerHeight||600)-48))+'px';targetAt(drag.x,drag.y);
    if(frame===null)frame=requestFrame(scroll);
  }
  function up(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!valid()){cancel();return}if(drag.active)targetAt(event.clientX,event.clientY);
    const saved=drag,drop=drag.active&&drag.drop;cancel();if(!drop)return;
    event.preventDefault();event.stopPropagation();
    const ids=getItems().map(item=>item.id),next=ids.filter(id=>id!==saved.id),index=next.indexOf(drop.anchorId);if(index<0)return;
    next.splice(index+(drop.after?1:0),0,saved.id);if(JSON.stringify(next)!==saved.order)onReorder(drop);
  }
  function abort(event){if(drag&&(event.pointerId===undefined||event.pointerId===drag.pointerId))cancel()}
  function key(event){if(drag&&event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel()}}
  function visibility(){if(document.visibilityState==='hidden')cancel()}
  root.addEventListener('pointerdown',down);root.addEventListener('lostpointercapture',abort);root.addEventListener('keydown',key,true);
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',visibility);document.addEventListener('contextmenu',cancel,true);window.addEventListener('blur',cancel);
  return {cancel,dispose(){disposed=true;cancel();root.removeEventListener('pointerdown',down);root.removeEventListener('lostpointercapture',abort);root.removeEventListener('keydown',key,true);for(const [type,handler,capture] of [['pointermove',move],['pointerup',up],['pointercancel',abort],['keydown',key,true],['visibilitychange',visibility],['contextmenu',cancel,true]])document.removeEventListener(type,handler,capture);window.removeEventListener('blur',cancel)}};
}
