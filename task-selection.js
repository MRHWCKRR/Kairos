// Selection is transient UI state; canonical tasks remain owned by the planner.
export function createTaskSelection(){
 let rows=[],scope=null,selected=new Set(),anchor=null;
 const section=row=>JSON.stringify([row.boardId,row.sectionId]);
 const ids=()=>rows.filter(row=>selected.has(row.taskId)).map(row=>row.taskId);
 function sync({rows:next,identity,viewKey}){
  const before=JSON.stringify(ids()),nextScope=JSON.stringify([identity.ownerId,identity.planId,viewKey]);
  if(scope!==nextScope){selected.clear();anchor=null;scope=nextScope}
  rows=identity.ownerId?next:[];const valid=new Set(rows.map(row=>row.taskId));
  selected=new Set([...selected].filter(id=>valid.has(id)));if(anchor&&!valid.has(anchor.taskId))anchor=null;
  return before!==JSON.stringify(ids());
 }
 function select(taskId,{toggle=false,range=false,add=false}={}){
  const row=rows.find(row=>row.taskId===taskId);if(!row)return false;
  const original=anchor&&rows.find(row=>row.taskId===anchor.taskId&&section(row)===anchor.section);
  if(range&&original&&section(row)===section(original)){
   const sectionRows=rows.filter(item=>section(item)===section(row)),a=sectionRows.indexOf(original),b=sectionRows.indexOf(row);
   selected=new Set([...(add?selected:[]),...sectionRows.slice(Math.min(a,b),Math.max(a,b)+1).map(item=>item.taskId)]);
  }else{if(!toggle||range)selected=new Set([taskId]);else if(selected.has(taskId))selected.delete(taskId);else selected.add(taskId);anchor={taskId,section:section(row)}}
  return true;
 }
 return {sync,select,ids,has:id=>selected.has(id),selectAll(){selected=new Set(rows.map(row=>row.taskId));anchor=null},clear(){selected.clear();anchor=null}};
}

const copy={count:'{n} tasks selected',one:'1 task selected',more:'More',clear:'Clear selection',heading:'Selected task actions'};
export function mountTaskSelection({root,getIdentity,getViewKey,resolveTarget,isBlocked=()=>false,translate,onChange=()=>{},document=root.ownerDocument,window=document.defaultView}={}){
 const state=createTaskSelection(),text=(key,n)=>{const name='task_selection_'+key,value=translate?.(name);return (value&&value!==name?value:copy[key]||key).replace('{n}',String(n??''))};
 let disposed=false,actions=null,openMenu=null,last='',visible=[];
 const bar=document.createElement('div');bar.className='task-selection-toolbar';bar.dataset.taskSelectionToolbar='';bar.setAttribute('role','group');bar.setAttribute('aria-label',text('heading'));bar.hidden=true;
 const count=document.createElement('span');count.dataset.taskSelectionCount='';bar.appendChild(count);
 const buttons=new Map();for(const id of ['details','complete','bulk-complete','bulk-incomplete','bulk-move','copy-title','copy-titles','more','clear']){const button=document.createElement('button');button.type='button';button.dataset.selectionAction=id;if(id==='more'){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false')}buttons.set(id,button);bar.appendChild(button)}
 const announcement=document.createElement('span');announcement.className='task-selection-announcement';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');root.prepend(bar,announcement);
 const native=el=>!!el?.closest?.('input,textarea,select,button,label,a,[contenteditable]:not([contenteditable="false"]),.task-detail-pane,.task-quick-add');
 const rowFor=el=>{const row=el?.closest?.('[data-detail-row]');return row&&root.contains(row)&&!row.closest('[hidden]')?row:null};
 function context(primaryTaskId){return {...getIdentity(),taskIds:state.ids(),primaryTaskId:primaryTaskId||state.ids()[0]}}
 function render(){
  const ids=state.ids(),label=text(ids.length===1?'one':'count',ids.length);bar.hidden=!ids.length;count.textContent=label;
  for(const row of root.querySelectorAll('[data-detail-row]')){const selected=ids.includes(row.dataset.detailRow)&&!row.closest('[hidden]');row.classList.toggle('is-selected',selected);row.dataset.taskSelected=String(selected)}
  const available=ids.length&&actions?actions.items(context()):[];
  for(const [id,button] of buttons){const item=available.find(item=>item.id===id);button.hidden=!['more','clear'].includes(id)&&!item;button.disabled=!!item&&!item.enabled;button.textContent=item?.label||text(id);button.title=item?.disabledReason||''}
  const fingerprint=JSON.stringify(ids);if(fingerprint!==last){last=fingerprint;announcement.textContent=label;onChange(ids)}
 }
 function sync(){
  if(disposed)return false;visible=[];
  if(root.classList.contains('active'))for(const row of root.querySelectorAll('[data-detail-row]')){
   if(row.closest('[hidden]'))continue;let found;try{found=resolveTarget({taskId:row.dataset.detailRow})}catch{continue}
   if(!found||found.task.archived||found.board.archived||found.section.archived||visible.some(item=>item.taskId===found.task.id))continue;
   visible.push({taskId:found.task.id,boardId:found.board.id,sectionId:found.section.id});
  }
  const changed=state.sync({rows:visible,identity:getIdentity(),viewKey:getViewKey()});render();return changed;
 }
 function change(fn){if(disposed)return false;sync();fn();render();return true}
 const clear=()=>change(()=>state.clear()),toggle=id=>change(()=>state.select(id,{toggle:true}));
 function contextFor(id,{replaceSelection=false}={}){
  sync();if(!visible.some(row=>row.taskId===id))return null;
  if(replaceSelection&&!state.has(id))change(()=>state.select(id));
  return state.has(id)?context(id):{...getIdentity(),taskIds:[id],primaryTaskId:id};
 }
 const onClick=event=>{
  const control=event.target.closest?.('[data-selection-action]');
  if(control&&bar.contains(control)){
   event.preventDefault();event.stopPropagation();sync();if(control.disabled)return;const id=control.dataset.selectionAction;
   if(id==='clear'){const row=root.querySelector('[data-detail-row].is-selected');clear();row?.focus?.({preventScroll:true});return}
   if(id==='more'){const value=context();if(value.taskIds.length)openMenu?.({context:value,sourceElement:control});return}
   const value=context();if(value.taskIds.length){const saving=actions?.invoke(id,value,control);sync();void saving?.then(()=>sync())}return;
  }
  if(event.defaultPrevented||native(event.target))return;const row=rowFor(event.target);if(!row)return;
  const toggle=event.ctrlKey||event.metaKey;change(()=>state.select(row.dataset.detailRow,{toggle,range:event.shiftKey,add:toggle}));row.focus?.({preventScroll:true});
 };
 const onKey=event=>{
  if(event.defaultPrevented||event.target.closest?.('input:not([type="checkbox"]),textarea,select,dialog,.task-detail-pane,[contenteditable]:not([contenteditable="false"])')||!root.classList.contains('active'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'&&!event.altKey){event.preventDefault();event.stopPropagation();change(()=>state.selectAll())}
  else if(event.key==='Escape'&&!isBlocked()){event.preventDefault();event.stopPropagation();clear()}
 };
 const onDown=event=>{if(event.shiftKey&&!native(event.target)&&rowFor(event.target))event.preventDefault()};
 root.addEventListener('click',onClick);root.addEventListener('keydown',onKey);root.addEventListener('pointerdown',onDown);sync();
 return {sync,ids:()=>state.ids(),has:id=>state.has(id),toggle,clear,contextFor,setActions(registry,open){actions=registry;openMenu=open;sync()},dispose(){disposed=true;state.clear();for(const row of root.querySelectorAll('[data-detail-row]')){row.classList.remove('is-selected');delete row.dataset.taskSelected}bar.remove();announcement.remove();root.removeEventListener('click',onClick);root.removeEventListener('keydown',onKey);root.removeEventListener('pointerdown',onDown)}};
}
