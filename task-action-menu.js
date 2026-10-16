export function positionTaskMenu({anchorRect,point,menuSize,viewport,padding=8}){
 const left=viewport.left||0,top=viewport.top||0,right=left+viewport.width-padding,bottom=top+viewport.height-padding;
 const width=Math.min(menuSize.width,Math.max(0,viewport.width-padding*2)),maxHeight=Math.max(0,viewport.height-padding*2),height=Math.min(menuSize.height,maxHeight);
 let x=point?.x??anchorRect?.left??left+padding,y=point?.y??anchorRect?.bottom??top+padding;
 if(x+width>right)x=point?x-width:(anchorRect?.right??x)-width;
 if(y+height>bottom)y=point?y-height:(anchorRect?.top??y)-height;
 return {left:Math.max(left+padding,Math.min(x,right-width)),top:Math.max(top+padding,Math.min(y,bottom-height)),maxHeight};
}

export function mountTaskActionMenu({root,actions,getIdentity,resolveRow,resolveSection,sectionActions,sectionLabel='Section actions',getContext,getLabel,getViewKey=()=>'',label='Task actions',document=root.ownerDocument,window=document.defaultView,onError=()=>{}}={}){
 let popup=null,current=null,source=null,point=null,disposed=false,lastItems='',view;
 const nativeTarget=el=>!!el?.closest?.('input,textarea,select,a,[contenteditable]:not([contenteditable="false"])');
 const rowFor=id=>[...root.querySelectorAll('[data-detail-row]')].find(row=>row.dataset.detailRow===id&&!row.closest('[hidden]'));
 const registry=context=>context?.scope==='section'?sectionActions:actions;
 const targetFor=context=>context?.scope==='section'?[...root.querySelectorAll('.board-section-block,[data-focused-section],[data-board-id][data-section-id]')].find(el=>!el.closest('[hidden]')&&el.dataset.boardId===context.section?.boardId&&el.dataset.sectionId===context.section?.sectionId):rowFor(context?.primaryTaskId||context?.taskIds?.[0]);
 const same=context=>{const identity=getIdentity();return !!context&&!!identity.ownerId&&context.ownerId===identity.ownerId&&context.planId===identity.planId};
 const markSource=expanded=>{if(source?.matches?.('[data-task-menu],[data-selection-action="more"]'))source.setAttribute('aria-expanded',String(expanded))};
 function close({restoreFocus=false}={}){
  const returnTo=source?.isConnected?source:targetFor(current);
  markSource(false);popup?.remove();popup=null;current=null;source=null;point=null;lastItems='';
  if(restoreFocus&&returnTo?.isConnected)returnTo.focus?.({preventScroll:true});
 }
 function place(){
  if(!popup)return;const viewport=window.visualViewport,rect=popup.getBoundingClientRect?.()||{};
  const bounds={width:viewport?.width||window.innerWidth||document.documentElement.clientWidth||800,height:viewport?.height||window.innerHeight||document.documentElement.clientHeight||600,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0};
  const position=positionTaskMenu({anchorRect:source?.getBoundingClientRect?.(),point,menuSize:{width:rect.width||272,height:rect.height||popup.scrollHeight||400},viewport:bounds,padding:8});
  popup.style.left=position.left+'px';popup.style.top=position.top+'px';popup.style.maxHeight=position.maxHeight+'px';popup.style.maxWidth=Math.max(0,bounds.width-16)+'px';
 }
 function focusItem(button){
  button?.focus?.({preventScroll:true});if(!button||!popup)return;
  const item=button.getBoundingClientRect(),bounds=popup.getBoundingClientRect();
  if(item.top<bounds.top)popup.scrollTop+=item.top-bounds.top;
  else if(item.bottom>bounds.bottom)popup.scrollTop+=item.bottom-bounds.bottom;
 }
 function render(items){
  const heading=current?.scope==='section'?sectionLabel:getLabel?.(current)||label,fingerprint=JSON.stringify([items,heading]);if(lastItems===fingerprint)return;lastItems=fingerprint;popup.setAttribute('aria-label',heading);
  const focused=popup.contains(document.activeElement)?document.activeElement?.dataset.taskMenuAction:null;popup.replaceChildren();let group;
  if(getLabel){const title=document.createElement('div');title.className='task-menu-heading';title.textContent=heading;popup.appendChild(title)}
  for(const item of items){
   if(group&&item.group!==group){const separator=document.createElement('div');separator.className='task-menu-separator';separator.setAttribute('role','separator');popup.appendChild(separator)}group=item.group;
   const button=document.createElement('button');button.type='button';button.dataset.taskMenuAction=item.id;button.setAttribute('role',typeof item.checked==='boolean'?'menuitemcheckbox':'menuitem');if(typeof item.checked==='boolean')button.setAttribute('aria-checked',String(item.checked));button.tabIndex=-1;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
   path.setAttribute('d',({details:'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',rename:'m4 16 12-12 4 4L8 20H4z',schedule:'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4',complete:'m5 12 4 4L19 6',up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',move:'M4 12h16m-5-5 5 5-5 5','copy-title':'M8 8h12v12H8z M4 16V4h12',archive:'M3 4h18v5H3z M5 9v11h14V9 M10 13h4'})[item.id]||'M5 12h14');svg.appendChild(path);button.appendChild(svg);const caption=document.createElement('span');caption.textContent=item.label;button.appendChild(caption);
   if(!item.enabled){button.setAttribute('aria-disabled','true');button.title=item.disabledReason;button.setAttribute('aria-label',item.label+'. '+item.disabledReason)}
   if(item.id==='archive')button.className='task-menu-danger';popup.appendChild(button);
  }
  if(focused){const button=[...popup.querySelectorAll('[data-task-menu-action]')].find(el=>el.dataset.taskMenuAction===focused)||popup.querySelector('[data-task-menu-action]');focusItem(button)}
 }
 function sync(){
  if(!popup)return;const row=targetFor(current);
  if(disposed||!root.classList.contains('active')||view!==getViewKey()||!same(current)||!row||!(current.scope==='section'?resolveSection?.(row):resolveRow(row))){close();return}
  const items=registry(current)?.items(current)||[];if(!items.length){close();return}markSource(true);render(items);place();
 }
 function activate(button){
  if(!button||button.getAttribute('aria-disabled')==='true')return;
  const id=button.dataset.taskMenuAction,context=current,invoker=source,activeView=view;
  const active=()=>!disposed&&root.classList.contains('active')&&activeView===getViewKey()&&same(context)&&!!targetFor(context);
  if(!active()){close();return}
  close({restoreFocus:true});Promise.resolve().then(()=>{if(active())return registry(context)?.invoke(id,context,invoker)}).catch(error=>{if(active())onError(error.message)});
 }
 function menuClick(event){event.preventDefault();event.stopPropagation();activate(event.target.closest?.('[data-task-menu-action]'))}
 function menuKey(event){
  event.stopPropagation();const items=[...popup.querySelectorAll('[data-task-menu-action]')],index=items.indexOf(document.activeElement);let next;
  if(event.key==='Escape'){event.preventDefault();close({restoreFocus:true});return}
  if(event.key==='Tab'){close({restoreFocus:true});return}
  if(event.key==='ArrowDown')next=(index+1)%items.length;else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(event.target.closest?.('[data-task-menu-action]'));return}
  if(next!==undefined){event.preventDefault();focusItem(items[next])}
 }
 function open({context,sourceElement,point:position}={}){
  if(disposed||!root.classList.contains('active')||!same(context)||(context.scope==='section'?!targetFor(context):!context.taskIds?.length))return false;
  const items=registry(context)?.items(context)||[];if(!items.length)return false;close();
  document.dispatchEvent(new window.CustomEvent('kairos-context-menu-open',{detail:{owner:'task'}}));
  current={...context,taskIds:[...context.taskIds]};source=sourceElement;point=position;view=getViewKey();
  popup=document.createElement('div');popup.className='task-action-menu';popup.dataset.taskActionMenu='';popup.setAttribute('role','menu');popup.setAttribute('aria-label',label);
  markSource(true);render(items);document.body.appendChild(popup);place();popup.addEventListener('click',menuClick);popup.addEventListener('keydown',menuKey);popup.querySelector('[role="menuitem"]')?.focus?.({preventScroll:true});return true;
 }
 function contextFor(element,options){const found=resolveRow(element),identity=getIdentity();return found?(getContext?getContext(found,options):{taskIds:[found.taskId],...identity}):null}
 function onClick(event){const sectionButton=event.target.closest?.('[data-section-menu]');if(sectionButton&&root.contains(sectionButton)){event.preventDefault();event.stopPropagation();const entry=sectionEntry(sectionButton);if(entry)open({...entry,sourceElement:sectionButton});return}const button=event.target.closest?.('[data-task-menu]');if(!button||!root.contains(button))return;event.preventDefault();event.stopPropagation();if(popup&&source===button){close({restoreFocus:true});return}open({context:contextFor(button),sourceElement:button})}
 function sectionEntry(element){const found=resolveSection?.(element);return found?{context:{...getIdentity(),scope:'section',section:{...found.section},taskIds:[]},sourceElement:found.element.querySelector('button')||found.element}:null}
 function onContext(event){if(event.shiftKey){close();return}if(nativeTarget(event.target))return;const found=resolveRow(event.target),entry=found?{context:contextFor(found.row,{replaceSelection:true}),sourceElement:found.row.querySelector('[data-task-menu]')||found.row}:event.target.closest?.('button,label,[data-detail-row]')?null:sectionEntry(event.target);if(entry&&open({...entry,point:{x:event.clientX,y:event.clientY}})){event.preventDefault();event.stopPropagation()}}
 function onKey(event){if(nativeTarget(event.target)||!(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey)))return;const found=resolveRow(event.target),entry=found?{context:contextFor(found.row),sourceElement:found.row.querySelector('[data-task-menu]')||found.row}:sectionEntry(event.target);if(entry&&open(entry)){event.preventDefault();event.stopPropagation()}}
 const outside=event=>{if(popup&&!popup.contains(event.target)&&!source?.contains?.(event.target))close()};
 const onScroll=event=>{if(popup&&!popup.contains(event.target))close()};const onResize=()=>close();
 const otherMenu=event=>{if(event.detail?.owner!=='task')close()};document.addEventListener('kairos-context-menu-open',otherMenu);
 root.addEventListener('click',onClick);root.addEventListener('contextmenu',onContext);root.addEventListener('keydown',onKey);document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',onScroll,true);window.addEventListener('resize',onResize);window.visualViewport?.addEventListener('resize',onResize);
 return {open,close,sync,isOpen:()=>!!popup,dispose(){disposed=true;close();document.removeEventListener('kairos-context-menu-open',otherMenu);root.removeEventListener('click',onClick);root.removeEventListener('contextmenu',onContext);root.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('resize',onResize)}};
}
