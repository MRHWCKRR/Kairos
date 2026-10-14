import {applyTaskListCommand} from './task-list-model.js';
import {t} from './i18n.js';
import {confirmDialog} from './ui-dialogs.js?v=1';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sectionKey=target=>JSON.stringify([target.boardId,target.sectionId]);
export function renderTaskListRow(task,sectionId,copy=key=>t('task_list_'+key)){
    const id=esc(task.id),section=esc(sectionId),progress=Array.isArray(task.checklist)?task.checklist:[];
    return `<li class="task-item ${task.completed?'completed':''}" tabindex="0" data-detail-row="${id}">
      <label class="custom-checkbox"><input type="checkbox" data-section="${section}" data-task="${id}" aria-label="${esc(copy('complete')+' '+task.title)}" ${task.completed?'checked':''}><span class="checkmark"></span></label>
      <input type="text" class="task-text" data-section="${section}" data-task="${id}" value="${esc(task.title)}" aria-label="${esc(copy('title'))}" maxlength="180" style="text-decoration:${task.completed?'line-through':'none'}">
      <span class="task-scheduled-time" ${task.startTime?'':'hidden'}>${esc(task.startTime)}${task.endTime?' – '+esc(task.endTime):''}</span>
      <span class="task-checklist-count" ${progress.length?'':'hidden'}>${task.recurrence?.enabled?0:progress.filter(item=>item.completed).length}/${progress.length}</span>
      <input type="date" class="task-date-input" data-section="${section}" data-task="${id}" value="${esc(task.date)}" aria-label="${esc(copy('date'))}">
      <button type="button" class="task-delete-btn" data-section="${section}" data-task="${id}" aria-label="${esc(copy('archive')+' '+task.title)}" title="${esc(copy('archive'))}">×</button>
      <button type="button" class="task-detail-open" data-task-detail="${id}">${esc(t('task_detail_heading'))}</button></li>`;
}

export function mountTaskListWorkspace({root,overview,scrollElement=root.closest('.main-content')||root,getState,getOwnerId,getPlanId,commit,ensurePlan=async()=>true,requestCloseDetails=async()=>true,confirmDiscard=warning=>confirmDialog(warning),renderOverview=()=>{},document=root.ownerDocument,window=document.defaultView,storage}={}){
    const copy=key=>t('task_list_'+key,document.documentElement.lang||'en');
    try{storage??=window.sessionStorage}catch{}
    const surface=document.createElement('section');surface.dataset.focusedSection='';surface.className='task-section-focus';surface.hidden=true;overview.before(surface);
    surface.innerHTML=`<header class="task-section-heading"><button type="button" data-section-back>${esc(copy('back'))}</button><p data-section-breadcrumb></p><h2 data-section-heading tabindex="-1"></h2><div><span data-section-count></span><button type="button" data-show-completed aria-pressed="true">${esc(copy('show_completed'))}</button></div></header><p data-section-state role="status"></p><ul class="task-list" data-section-tasks></ul><form class="task-quick-add"><label>${esc(copy('quick_add'))}<input type="text" data-quick-title maxlength="180" autocomplete="off" placeholder="${esc(copy('quick_hint'))}"></label><button type="submit" data-quick-save>${esc(copy('add'))}</button><button type="button" data-quick-discard hidden>${esc(copy('discard'))}</button><p data-quick-status role="status" aria-live="polite"></p></form>`;
    const find=selector=>surface.querySelector(selector),input=find('[data-quick-title]'),list=find('[data-section-tasks]'),form=find('form');
    let owner,plan,current=null,entries=new Map(),preferences={},selected=new Map(),scrollBack=0,opener=null,returnTarget=null,generation=0,navigation=0,disposed=false;
    const pendingKey=()=> 'kairos-task-quick-pending:'+owner+':'+plan;
    const preferenceKey=()=> 'kairos-task-list-view:'+owner+':'+plan;
    const readStorage=key=>{try{return JSON.parse(storage?.getItem(key)||'null')}catch{return null}};
    function remember(){try{storage?.setItem(pendingKey(),JSON.stringify([...entries].filter(([,entry])=>entry.pending).map(([key,entry])=>[key,entry.pending])))}catch{}}
    function rememberView(){try{storage?.setItem(preferenceKey(),JSON.stringify(preferences))}catch{}}
    function sync(){
        if(owner===getOwnerId()&&plan===getPlanId())return false;
        generation++;navigation++;owner=getOwnerId();plan=getPlanId();current=null;entries=new Map();selected=new Map();const savedView=readStorage(preferenceKey());preferences=savedView&&typeof savedView==='object'&&!Array.isArray(savedView)?savedView:{};
        const savedPending=readStorage(pendingKey());
        if(owner&&plan)for(const pair of Array.isArray(savedPending)?savedPending:[]){
            if(!Array.isArray(pair)||pair.length!==2)continue;const [key,pending]=pair;
            if(pending?.identity?.ownerId!==owner||pending.identity.planId!==plan||typeof pending.identity.operationId!=='string'||!pending.identity.operationId||!Number.isFinite(pending.identity.createdAt)||pending.identity.createdAt<=0||pending.command?.type!=='create_task'||typeof pending.command.task?.title!=='string'||typeof pending.command.task?.id!=='string'||typeof pending.command.target?.boardId!=='string'||typeof pending.command.target?.sectionId!=='string'||pending.expected?.boardId!==pending.command.target.boardId||pending.expected?.sectionId!==pending.command.target.sectionId||key!==sectionKey(pending.command.target))continue;
            entries.set(key,{draft:pending.command.task.title,pending,busy:false,message:copy('uncertain')});
        }
        input.value='';surface.hidden=true;overview.hidden=false;return true;
    }
    function entryFor(target){const key=sectionKey(target);if(!entries.has(key))entries.set(key,{draft:'',pending:null,busy:false,message:''});return entries.get(key)}
    function preference(target){const key=sectionKey(target),saved=preferences[key];if(!saved||typeof saved!=='object'||Array.isArray(saved)||typeof saved.collapsed!=='boolean'||typeof saved.showCompleted!=='boolean')preferences[key]={collapsed:false,showCompleted:true};return preferences[key]}
    function locate(target){
        const matches=(getState().boards||[]).flatMap(board=>(board.sections||[]).filter(section=>board.id===target.boardId&&section.id===target.sectionId).map(section=>({board,section})));
        if(matches.length!==1)return {message:copy('unavailable')};
        if(matches[0].board.archived||matches[0].section.archived)return {...matches[0],message:copy('archived')};return matches[0];
    }
    function render(){
        if(disposed)return;sync();if(!current)return;
        surface.hidden=false;overview.hidden=true;
        const found=locate(current),entry=entryFor(current),pref=preference(current),tasks=found.message?[]:(found.section.tasks||[]).filter(task=>!task.archived);
        find('[data-section-heading]').textContent=found.section?.title||copy('section');find('[data-section-breadcrumb]').textContent=found.board?.title||'';
        find('[data-section-count]').textContent=tasks.filter(task=>task.completed).length+' / '+tasks.length+' '+copy('completed');
        find('[data-show-completed]').setAttribute('aria-pressed',String(pref.showCompleted));
        find('[data-section-state]').textContent=found.message||(tasks.length?(tasks.every(task=>task.completed)&&!pref.showCompleted?copy('hidden_completed'):''):copy('empty'));
        const rows=new Map([...list.children].map(row=>[row.dataset.detailRow,row])),active=document.activeElement,selection=active===input?null:[active?.selectionStart,active?.selectionEnd];
        for(const [index,task] of tasks.entries()){
            let row=rows.get(task.id);rows.delete(task.id);
            if(!row){const template=document.createElement('template');template.innerHTML=renderTaskListRow(task,current.sectionId,copy);row=template.content.firstElementChild;list.appendChild(row)}
            if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
            // Keep row controls alive, especially title typing/caret and completion focus.
            row.classList.toggle('completed',task.completed===true);row.classList.toggle('is-selected',selected.get(sectionKey(current))===task.id);row.hidden=!pref.showCompleted&&task.completed===true;
            const title=row.querySelector('.task-text'),date=row.querySelector('.task-date-input'),check=row.querySelector('[type="checkbox"]');
            if(document.activeElement!==title)title.value=task.title;title.style.textDecoration=task.completed?'line-through':'none';
            if(document.activeElement!==date)date.value=task.date||'';check.checked=task.completed===true;check.setAttribute('aria-label',copy('complete')+' '+task.title);
            const time=row.querySelector('.task-scheduled-time');time.hidden=!task.startTime;time.textContent=(task.startTime||'')+(task.endTime?' – '+task.endTime:'');
            const progress=Array.isArray(task.checklist)?task.checklist:[],count=row.querySelector('.task-checklist-count');count.hidden=!progress.length;count.textContent=(task.recurrence?.enabled?0:progress.filter(item=>item.completed).length)+'/'+progress.length;
        }
        for(const row of rows.values())row.remove();
        if(active&&list.contains(active)&&document.activeElement!==active){active.focus?.({preventScroll:true});if(selection?.every(Number.isInteger))active.setSelectionRange?.(...selection)}
        if(input.value!==entry.draft)input.value=entry.draft;
        input.disabled=!!found.message||entry.busy||!!entry.pending;find('[data-quick-save]').disabled=(!!found.message&&!entry.pending)||entry.busy;
        find('[data-quick-save]').textContent=copy(entry.busy?'saving':entry.pending?'retry':'add');find('[data-quick-status]').textContent=entry.message;
        find('[data-quick-discard]').hidden=!entry.pending;find('[data-quick-discard]').disabled=entry.busy;
    }
    function decorateOverview(){
        sync();for(const block of overview.querySelectorAll('.board-section-block')){
            const target={boardId:block.dataset.boardId,sectionId:block.dataset.sectionId},pref=preference(target),header=block.querySelector('.section-title-row');
            if(!header.querySelector('[data-open-section]')){
                for(const [attribute,label] of [['data-section-collapse','collapse'],['data-open-section','open']]){const button=document.createElement('button');button.type='button';button.setAttribute(attribute,'');button.className='task-section-control';button.textContent=copy(label);header.appendChild(button)}
            }
            const collapse=header.querySelector('[data-section-collapse]');collapse.setAttribute('aria-expanded',String(!pref.collapsed));collapse.textContent=copy(pref.collapsed?'expand':'collapse');
            for(const el of block.querySelectorAll('.task-list,.add-task-btn'))el.hidden=pref.collapsed;
        }
    }
    async function openSection(target,source=null){
        sync();if(!getOwnerId())return false;const ticket=++navigation,actor=owner;
        if(!await requestCloseDetails()||ticket!==navigation||actor!==getOwnerId())return false;
        if(!await ensurePlan()||ticket!==navigation||actor!==getOwnerId())return false;
        sync();if(!current){scrollBack=scrollElement.scrollTop;opener=source;returnTarget={...target,add:source?.matches('.add-task-btn')===true}}
        current={...target};render();scrollElement.scrollTop=0;find('[data-section-heading]').focus?.({preventScroll:true});return true;
    }
    async function back(){
        sync();const ticket=++navigation;if(!await requestCloseDetails()||ticket!==navigation)return false;
        current=null;surface.hidden=true;overview.hidden=false;renderOverview();decorateOverview();scrollElement.scrollTop=scrollBack;
        const block=[...overview.querySelectorAll('.board-section-block')].find(el=>el.dataset.boardId===returnTarget?.boardId&&el.dataset.sectionId===returnTarget?.sectionId),returnControl=block?.querySelector(returnTarget?.add?'.add-task-btn':'[data-open-section]');
        if(opener?.isConnected)opener.focus?.({preventScroll:true});else (returnControl&&!returnControl.hidden?returnControl:block?.querySelector('[data-open-section]')||overview.querySelector('[data-open-section]'))?.focus?.({preventScroll:true});return true;
    }
    async function discard(){
        sync();if(!current)return false;const target={...current},entry=entryFor(target),ticket=generation,pending=entry.pending;
        if(!pending||entry.busy||!await confirmDiscard(copy('discard_warning'))||ticket!==generation||owner!==getOwnerId()||plan!==getPlanId()||entry.pending!==pending)return false;
        entry.pending=null;entry.draft='';entry.message=copy('discarded');remember();render();if(current&&sectionKey(current)===sectionKey(target))input.focus?.();return true;
    }
    async function submit(){
        sync();if(!current||!owner||!plan)return false;const target={...current},entry=entryFor(target);if(entry.busy)return false;
        if(!entry.pending){
            const title=entry.draft.trim();if(!title)return false;
            const uuid=()=>window.crypto?.randomUUID?.()||globalThis.crypto.randomUUID();
            const command={type:'create_task',target,task:{id:'task-'+uuid(),title}},expected={...target};
            try{applyTaskListCommand(getState(),command,expected)}catch(error){entry.message=error.message;render();return false}
            entry.pending={command,expected,identity:{ownerId:owner,planId:plan,operationId:'task-list-'+uuid(),createdAt:Date.now()}};remember();
        }
        const pending=entry.pending,ticket=generation;entry.busy=true;entry.message=copy('saving');render();
        try{
            await commit(pending.command,pending.expected,pending.identity);
            if(disposed||ticket!==generation||getOwnerId()!==pending.identity.ownerId||getPlanId()!==pending.identity.planId)return false;
            entry.draft='';entry.pending=null;entry.message=copy('saved');remember();return true;
        }catch(error){
            if(!disposed&&ticket===generation&&getOwnerId()===pending.identity.ownerId&&getPlanId()===pending.identity.planId){entry.message=copy('uncertain')+' '+error.message;remember()}
            return false;
        }finally{
            entry.busy=false;if(!disposed&&ticket===generation){render();if(current&&sectionKey(current)===sectionKey(target)&&!entry.pending&&root.classList.contains('active'))input.focus?.()}
        }
    }
    const onInput=event=>{if(event.target===input&&current&&!input.disabled)entryFor(current).draft=input.value};
    const onSubmit=event=>{event.preventDefault();void submit()};
    const onKey=event=>{
        if(event.target!==input)return;
        if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void submit()}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();const entry=entryFor(current);if(!entry.pending&&!entry.busy){entry.draft='';input.value='';entry.message='';render()}}
    };
    const onClick=event=>{
        const button=event.target.closest('button'),block=event.target.closest('.board-section-block');
        if(button?.matches('[data-quick-discard]')){void discard();return}
        if(button?.matches('[data-section-back]')){void back();return}
        if(button?.matches('[data-show-completed]')&&current){preference(current).showCompleted=!preference(current).showCompleted;rememberView();render();return}
        if(block&&button?.matches('[data-section-collapse]')){const target={boardId:block.dataset.boardId,sectionId:block.dataset.sectionId};preference(target).collapsed=!preference(target).collapsed;rememberView();decorateOverview();return}
        if(button?.matches('[data-open-section],.add-task-btn')&&block){void openSection({boardId:block.dataset.boardId,sectionId:block.dataset.sectionId},button).then(opened=>{if(opened&&button.matches('.add-task-btn'))input.focus?.()});return}
        const row=event.target.closest('[data-detail-row]');if(current&&row&&surface.contains(row)){selected.set(sectionKey(current),row.dataset.detailRow);for(const item of list.children)item.classList.toggle('is-selected',item===row)}
    };
    root.addEventListener('click',onClick);root.addEventListener('keydown',onKey);root.addEventListener('input',onInput);form.addEventListener('submit',onSubmit);sync();
    return {openSection,back,submit,discard,render,sync,decorateOverview,rowHTML:(task,sectionId)=>renderTaskListRow(task,sectionId,copy),isFocused:()=>!!current,dispose(){disposed=true;generation++;navigation++;root.removeEventListener('click',onClick);root.removeEventListener('keydown',onKey);root.removeEventListener('input',onInput);form.removeEventListener('submit',onSubmit);surface.remove();overview.hidden=false}};
}
