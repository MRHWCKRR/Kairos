import {validateChecklist} from './task-list-model.js?v=28';
import {mountChecklistReorder} from './task-checklist-reorder.js?v=2';

const labels={step_hide_completed:'Hide completed',step_show_completed:'Show completed',step_drag:'Drag to reorder step (Alt+Up/Down)',step_moved:'Step moved to position',checklist:'Checklist',steps:'steps completed',step_title:'Step title',step_complete:'Complete step',step_add:'Add step',step_up:'Move step up',step_down:'Move step down',step_remove:'Remove step',step_required:'Enter a step title up to 180 characters.',step_limit:'A checklist supports up to 100 steps.',step_entry_hint:'Enter adds a step. Paste multiple lines to add several. Save applies your changes.',unsaved:'Unsaved changes'};

export function mountTaskChecklistEditor({root,items=[],canToggle=true,disabled=false,isActive=()=>true,hint='',onChange=()=>{},onStatus=()=>{},copy,uuid,document=root.ownerDocument,window=document.defaultView}) {
  let draft=structuredClone(items),disposed=false,showCompleted=true;
  const emptyLabels={step_empty:'No steps yet. Add the first one below.',step_all_completed:'All steps completed. Show completed to review them.'};
  const rows=new Map(),text=key=>{const value=copy?.(key);return value&&value!==key&&value!=='task_detail_'+key?value:labels[key]||emptyLabels[key]||key};
  uuid??=()=>window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const element=(tag,attribute)=>{const el=document.createElement(tag);if(attribute)el.setAttribute(attribute,'');return el};
  const heading=element('header'),title=element('h3'),progress=element('span','data-checklist-progress'),viewTools=element('div'),visibility=element('button','data-checklist-completed-toggle');visibility.type='button';viewTools.className='task-checklist-view-tools';title.textContent=text('checklist');progress.setAttribute('aria-live','polite');viewTools.append(progress,visibility);heading.append(title,viewTools);
  const description=element('p');description.className='task-detail-hint';description.textContent=hint;description.hidden=!hint;
  const list=element('ul','data-checklist-list'),entry=element('div');entry.className='task-checklist-add';
  const composer=element('input','data-checklist-new');composer.type='text';composer.maxLength=180;composer.placeholder=text('step_add');composer.setAttribute('aria-label',text('step_add'));
  const add=element('button','data-checklist-add');add.type='button';add.textContent=text('step_add');entry.append(composer,add);
  const entryHint=element('p');entryHint.className='task-detail-hint';entryHint.textContent=text('step_entry_hint');
  const empty=element('p','data-checklist-empty');empty.className='task-checklist-empty';root.replaceChildren(heading,description,list,empty,entry,entryHint);
  const read=()=>structuredClone(draft);
  const visibleItems=()=>draft.filter(item=>showCompleted||!item.completed);
  const reorder=mountChecklistReorder({root,list,getItems:()=>draft,isEnabled:()=>!disposed&&!disabled&&isActive(),onReorder:({stepId,anchorId,after})=>{const rest=draft.filter(item=>item.id!==stepId),index=rest.findIndex(item=>item.id===anchorId);if(index>=0)moveStep(stepId,index+(after?1:0),{stepId,control:'grip'})},document,window});
  function rowFor(id) {return rows.get(id)}
  function captureFocus() {
    const active=document.activeElement;if(!root.contains(active))return null;
    const row=active.closest('[data-step-row]');let control;
    if(active===composer)control='new';else if(active===add)control='add';else if(active===visibility)control='visibility';else if(active.matches('[data-step-grip]'))control='grip';
    else if(active.matches('[data-step-title]'))control='title';else if(active.matches('[data-step-check]'))control='check';else control=active.dataset.stepAction;
    if(!control)return null;
    return {...(row?{stepId:row.dataset.stepRow}:{}),control,...(['title','new'].includes(control)?{start:active.selectionStart??0,end:active.selectionEnd??0}:{})};
  }
  function restoreFocus(snapshot) {
    if(disposed||!snapshot)return false;const row=rowFor(snapshot.stepId);
    let target=snapshot.control==='new'?composer:snapshot.control==='add'?add:snapshot.control==='visibility'?visibility:row?.querySelector(snapshot.control==='title'?'[data-step-title]':snapshot.control==='check'?'[data-step-check]':snapshot.control==='grip'?'[data-step-grip]':'[data-step-action="'+snapshot.control+'"]');
    if(row?.hidden)return focusNearest(snapshot.stepId);
    if(!target||target.disabled)target=row?.querySelector('[data-step-title]')||composer;
    if(target.disabled)return false;target.focus?.({preventScroll:true});
    if(Number.isInteger(snapshot.start)&&Number.isInteger(snapshot.end))try{target.setSelectionRange?.(snapshot.start,snapshot.end)}catch{}
    return true;
  }
  function focusNearest(id){
    const index=draft.findIndex(item=>item.id===id),item=[...draft.slice(index+1),...draft.slice(0,index).reverse()].find(item=>showCompleted||!item.completed);
    return restoreFocus(item?{stepId:item.id,control:'title'}:{control:'new'});
  }
  function createRow(item) {
    const row=element('li');row.dataset.stepRow=item.id;
    const grip=element('button','data-step-grip');grip.type='button';grip.setAttribute('aria-label',text('step_drag'));grip.title=text('step_drag');grip.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');
    const dots=document.createElementNS('http://www.w3.org/2000/svg','svg');dots.setAttribute('viewBox','0 0 24 24');dots.setAttribute('aria-hidden','true');for(const x of [9,15])for(const y of [6,12,18]){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','1');dots.appendChild(dot)}grip.appendChild(dots);row.appendChild(grip);
    const label=element('label');label.className='task-checklist-check';const check=element('input','data-step-check');check.type='checkbox';label.appendChild(check);
    const title=element('input','data-step-title');title.type='text';title.maxLength=180;title.setAttribute('aria-label',text('step_title'));row.append(label,title);
    for(const action of ['up','down','remove']){
      const button=element('button');button.type='button';button.dataset.stepAction=action;button.setAttribute('aria-label',text('step_'+action));button.title=text('step_'+action);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',({up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',remove:'m6 6 12 12M6 18 18 6'})[action]);svg.appendChild(path);button.appendChild(svg);row.appendChild(button);
    }
    return row;
  }
  function render() {
    const focused=document.activeElement?.closest?.('[data-step-row]'),focusedId=focused&&list.contains(focused)?focused.dataset.stepRow:null,visible=visibleItems();
    const valid=new Set(draft.map(item=>item.id));for(const [id,row] of rows)if(!valid.has(id)){row.remove();rows.delete(id)}
    draft.forEach((item,index)=>{
      let row=rows.get(item.id);if(!row){row=createRow(item);rows.set(item.id,row)}
      if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
      row.hidden=!showCompleted&&item.completed;
      row.dataset.completed=String(item.completed===true);
      const input=row.querySelector('[data-step-title]'),check=row.querySelector('[data-step-check]');if(input.value!==item.title)input.value=item.title;input.disabled=disabled;
      check.checked=item.completed;check.disabled=disabled||!canToggle;check.setAttribute('aria-label',text('step_complete')+' '+item.title);
      row.querySelector('[data-step-grip]').disabled=disabled;
      const position=visible.findIndex(step=>step.id===item.id);
      for(const button of row.querySelectorAll('[data-step-action]'))button.disabled=disabled||(button.dataset.stepAction==='up'&&position<=0)||(button.dataset.stepAction==='down'&&position===visible.length-1);
    });
    composer.disabled=disabled;add.disabled=disabled;visibility.disabled=disabled;visibility.textContent=text(showCompleted?'step_hide_completed':'step_show_completed');progress.textContent=draft.filter(item=>item.completed).length+' / '+draft.length+' '+text('steps');
    empty.hidden=visible.length>0;empty.textContent=text(draft.length?'step_all_completed':'step_empty');
    if(focusedId&&rows.get(focusedId)?.hidden&&!disabled)focusNearest(focusedId);
  }
  function changed() {render();onChange(read());onStatus(text('unsaved'))}
  function moveStep(id,index,focus=captureFocus()) {
    if(disposed||disabled)return false;const from=draft.findIndex(item=>item.id===id);if(from<0||index<0||index>=draft.length||from===index)return false;
    const [item]=draft.splice(from,1);draft.splice(index,0,item);changed();restoreFocus(focus);onStatus(text('unsaved')+' · '+text('step_moved')+' '+(index+1)+' / '+draft.length);return true;
  }
  function moveAdjacent(id,direction,focus=captureFocus()){
    const visible=visibleItems(),index=visible.findIndex(item=>item.id===id),other=visible[index+direction];if(index>=0&&other)moveStep(id,draft.findIndex(item=>item.id===other.id),focus);
  }
  function append(titles) {
    if(disposed||disabled)return false;
    if(draft.length+titles.length>100){onStatus(text('step_limit'),true);composer.focus?.({preventScroll:true});return false}
    if(titles.some(title=>!title||title.length>180)){onStatus(text('step_required'),true);composer.focus?.({preventScroll:true});return false}
    try {
      validateChecklist(draft);
      const next=[...draft,...titles.map(title=>({id:'step-'+uuid(),title,completed:false}))];validateChecklist(next);
      draft=next;composer.value='';changed();composer.focus?.({preventScroll:true});return true;
    }catch(error){onStatus(error.message,true);composer.focus?.({preventScroll:true});return false}
  }
  const addStep=()=>append([composer.value.trim()]);
  const onInput=event=>{
    if(disposed||disabled)return;const row=event.target.closest('[data-step-row]'),item=draft.find(item=>item.id===row?.dataset.stepRow);
    if(item&&event.target.matches('[data-step-title]')){item.title=event.target.value;changed()}
    else if(event.target===composer)onStatus(text('unsaved'));
  };
  const onChangeInput=event=>{
    if(disposed||disabled||!canToggle||!event.target.matches('[data-step-check]'))return;
    const item=draft.find(item=>item.id===event.target.closest('[data-step-row]')?.dataset.stepRow);if(item){item.completed=event.target.checked===true;changed()}
  };
  const onClick=event=>{
    if(disposed||disabled)return;const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button===visibility){reorder.cancel();showCompleted=!showCompleted;render();return}
    if(button===add){addStep();return}
    const row=button.closest('[data-step-row]'),index=draft.findIndex(item=>item.id===row?.dataset.stepRow),action=button.dataset.stepAction;if(row?.hidden||index<0||!['up','down','remove'].includes(action))return;
    const focus=captureFocus(),ownsFocus=row.contains(document.activeElement);
    if(action==='remove'){draft.splice(index,1);changed();if(ownsFocus)restoreFocus(draft.length?{stepId:draft[Math.min(index,draft.length-1)].id,control:'title'}:{control:'new'})}
    else moveAdjacent(draft[index].id,action==='up'?-1:1,focus);
  };
  const onKey=event=>{
    if(event.target.closest?.('[hidden]'))return;
    if(!disposed&&!event.defaultPrevented&&!event.isComposing&&event.keyCode!==229&&event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)&&event.target.matches('[data-step-title],[data-step-grip]')){
      event.preventDefault();event.stopPropagation();const id=event.target.closest('[data-step-row]')?.dataset.stepRow;moveAdjacent(id,event.key==='ArrowUp'?-1:1);return;
    }
    if(disposed||disabled||event.defaultPrevented||event.key!=='Enter'||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.target===composer){event.preventDefault();event.stopPropagation();if(!event.shiftKey&&composer.value.trim())addStep();return}
    if(event.target.matches('[data-step-title]')){
      const visible=visibleItems(),index=visible.findIndex(item=>item.id===event.target.closest('[data-step-row]')?.dataset.stepRow);if(index<0)return;
      event.preventDefault();event.stopPropagation();const next=index+(event.shiftKey?-1:1);
      restoreFocus(next>=visible.length?{control:'new'}:{stepId:visible[Math.max(0,next)].id,control:'title'});
    }
  };
  const onPaste=event=>{
    if(disposed||disabled||event.defaultPrevented||event.target!==composer)return;
    const pasted=event.type==='beforeinput'?(event.inputType==='insertFromPaste'?event.data:null):event.clipboardData?.getData('text/plain');if(!pasted||!/[\r\n]/.test(pasted))return;
    event.preventDefault();event.stopPropagation();
    const start=composer.selectionStart??composer.value.length,end=composer.selectionEnd??start;
    const titles=(composer.value.slice(0,start)+pasted+composer.value.slice(end)).replace(/\r\n?/g,'\n').split('\n').map(value=>value.trim()).filter(Boolean);
    if(titles.length)append(titles);
  };
  // The site menu sends beforeinput; native clipboard paste sends paste.
  root.addEventListener('beforeinput',onPaste);root.addEventListener('input',onInput);root.addEventListener('change',onChangeInput);root.addEventListener('click',onClick);root.addEventListener('keydown',onKey);root.addEventListener('paste',onPaste);render();
  return {read,setDisabled(value){disabled=!!value;if(disabled)reorder.cancel();render()},cancelReorder:reorder.cancel,captureView:()=>({showCompleted}),restoreView(view){if(!disposed&&typeof view?.showCompleted==='boolean'&&view.showCompleted!==showCompleted){reorder.cancel();showCompleted=view.showCompleted;render()}},hasPendingEntry:()=>!!composer.value.trim(),flushEntry:()=>!composer.value.trim()||addStep(),captureFocus,restoreFocus,dispose(){disposed=true;reorder.dispose();for(const [name,handler] of [['beforeinput',onPaste],['input',onInput],['change',onChangeInput],['click',onClick],['keydown',onKey],['paste',onPaste]])root.removeEventListener(name,handler)}};
}
