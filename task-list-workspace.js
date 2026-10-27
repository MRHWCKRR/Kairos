import {applyTaskListCommand} from './task-list-model.js?v=24';
import {t} from './i18n.js';
import {assignmentProgressIndex,assignmentProgressMarkup} from './assignment-progress.js?v=6';
import {planningClock} from './planning-model.js?v=1';
import {confirmDialog} from './ui-dialogs.js?v=1';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sectionKey=target=>JSON.stringify([target.boardId,target.sectionId]);
const orderIcon=action=>'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="'+({drag:'M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1',up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',move:'M4 12h16m-5-5 5 5-5 5'}[action])+'"/></svg>';
// Reconcile the overview within one account/planner. Retain DOM identity so a
// confirmed save does not restart every board animation or replace live inputs.
function reconcileOverview(parent,next,active){
    const owned=node=>node.nodeType===1&&node.matches('[data-open-section],[data-section-collapse],.task-quick-add');
    const key=node=>node.nodeType===1?(node.dataset.detailRow?'task:'+node.dataset.detailRow:node.classList.contains('board-section-block')?'section:'+node.dataset.sectionId:node.classList.contains('board-card')?'board:'+node.dataset.boardId:null):null;
    const old=[...parent.childNodes].filter(node=>!owned(node)),keyed=new Map(old.map(node=>[key(node),node]).filter(([id])=>id)),used=new Set();
    let cursor=parent.firstChild;
    for(const [index,incoming] of [...next.childNodes].entries()){
        const id=key(incoming),candidate=id?keyed.get(id):old[index];
        let node=candidate&&!used.has(candidate)&&key(candidate)===id&&candidate.nodeType===incoming.nodeType&&candidate.nodeName===incoming.nodeName?candidate:null;
        if(!node)node=incoming.cloneNode(true);
        else if(node.nodeType===1){
            const menuOpen=node.matches('.dots-menu-wrapper.active'),editing=node===active&&node.matches('.task-text,.task-date-input,[contenteditable="true"]');
            for(const attribute of [...node.attributes])if(!incoming.hasAttribute(attribute.name)&&!(editing&&['value','contenteditable'].includes(attribute.name)))node.removeAttribute(attribute.name);
            for(const attribute of [...incoming.attributes])if(!(editing&&attribute.name==='value')&&node.getAttribute(attribute.name)!==attribute.value)node.setAttribute(attribute.name,attribute.value);
            if(menuOpen)node.classList.add('active');
            if(node.matches('input')){
                if(!editing&&node.value!==incoming.value)node.value=incoming.value;
                if(node.type==='checkbox')node.checked=incoming.hasAttribute('checked');
            }else if(!editing)reconcileOverview(node,incoming,active);
        }else if(node.nodeValue!==incoming.nodeValue)node.nodeValue=incoming.nodeValue;
        while(cursor&&owned(cursor))cursor=cursor.nextSibling;
        used.add(node);if(cursor!==node)parent.insertBefore(node,cursor||null);cursor=node.nextSibling;
    }
    for(const node of old)if(!used.has(node))node.remove();
}
export function replaceTaskOverview(overview,html,{document=overview.ownerDocument,scrollElement=overview.closest('.main-content')||overview,preserveActive=true}={}){
    const active=document.activeElement,editable=preserveActive&&overview.contains(active)&&active.matches?.('.task-text,.task-date-input'),snapshot=editable?{id:active.dataset.task,title:active.matches('.task-text'),value:active.value,start:active.selectionStart,end:active.selectionEnd}:null,scroll=scrollElement.scrollTop;
    if(!preserveActive)overview.innerHTML=html;
    else{const template=document.createElement('template');template.innerHTML=html;reconcileOverview(overview,template.content,active)}
    if(snapshot){const field=[...overview.querySelectorAll(snapshot.title?'.task-text':'.task-date-input')].find(el=>el.dataset.task===snapshot.id);
        if(field){field.value=snapshot.value;field.focus?.({preventScroll:true});if(Number.isInteger(snapshot.start)&&Number.isInteger(snapshot.end))field.setSelectionRange?.(snapshot.start,snapshot.end)}
    }
    scrollElement.scrollTop=scroll;
}
export function renderTaskListRow(task,sectionId,copy=key=>t('task_list_'+key),assignment=null){
    const id=esc(task.id),section=esc(sectionId),progress=Array.isArray(task.checklist)?task.checklist:[];
    return `<li class="task-item ${task.completed?'completed':''}" tabindex="0" data-detail-row="${id}">
      <span class="task-order-controls"><button type="button" data-task-action="drag" aria-label="${esc(t('task_order_drag')+' '+task.title)}" title="${esc(t('task_order_drag'))}">${orderIcon('drag')}</button></span>
      <label class="custom-checkbox"><input type="checkbox" data-task-list-complete data-section="${section}" data-task="${id}" aria-label="${esc(copy('complete')+' '+task.title)}" ${task.completed?'checked':''} ${task.recurrence?.enabled?'disabled':''}><span class="checkmark"></span></label>
      <input type="text" class="task-text" data-section="${section}" data-task="${id}" value="${esc(task.title)}" aria-label="${esc(copy('title'))}" maxlength="180" style="text-decoration:${task.completed?'line-through':'none'}">
      <span class="task-scheduled-time" ${task.startTime?'':'hidden'}>${esc(task.startTime)}${task.endTime?' – '+esc(task.endTime):''}</span>
      <span class="task-checklist-count" ${progress.length?'':'hidden'}>${task.recurrence?.enabled?0:progress.filter(item=>item.completed).length}/${progress.length}</span>
      <input type="date" class="task-date-input" data-section="${section}" data-task="${id}" value="${esc(task.date)}" aria-label="${esc(copy('date'))}">

      <button type="button" class="task-menu-button" data-task-menu="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc((t('task_menu_heading')==='task_menu_heading'?'Task actions':t('task_menu_heading'))+': '+task.title)}" title="${esc(t('task_menu_heading')==='task_menu_heading'?'Task actions':t('task_menu_heading'))}"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>${assignmentProgressMarkup(assignment)}</li>`;
}

export function mountTaskListWorkspace({root,overview,scrollElement=root.closest('.main-content')||root,getState,getOwnerId,getPlanId,commit,isMutationBlocked=()=>false,ensurePlan=async()=>true,requestCloseDetails=async()=>true,confirmDiscard=warning=>confirmDialog(warning),renderOverview=()=>{},onRender=()=>{},document=root.ownerDocument,window=document.defaultView,storage,getToday=()=>planningClock(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone).date}={}){
    const copy=key=>t('task_list_'+key,document.documentElement.lang||'en');
    try{storage??=window.sessionStorage}catch{}
    const surface=document.createElement('section');surface.dataset.focusedSection='';surface.className='task-section-focus';surface.hidden=true;overview.before(surface);
    surface.innerHTML=`<header class="task-section-heading"><button type="button" data-section-back>${esc(copy('back'))}</button><p data-section-breadcrumb></p><h2 data-section-heading tabindex="-1"></h2><div><span data-section-count></span><button type="button" data-show-completed aria-pressed="true">${esc(copy('show_completed'))}</button></div></header><p data-section-state role="status"></p><ul class="task-list" data-section-tasks></ul><form class="task-quick-add"><label>${esc(copy('quick_add'))}<input type="text" data-quick-title maxlength="180" autocomplete="off" placeholder="${esc(copy('quick_hint'))}"></label><button type="submit" data-quick-save>${esc(copy('add'))}</button><button type="button" data-quick-discard hidden>${esc(copy('discard'))}</button><button type="button" data-quick-cancel>${esc(copy('cancel'))}</button><p class="task-quick-hint">${esc(copy('capture_hint'))}</p><p data-quick-status role="status" aria-live="polite"></p></form>`;
    const find=selector=>surface.querySelector(selector),input=find('[data-quick-title]'),list=find('[data-section-tasks]'),form=find('form');
    const quick=selector=>form.querySelector(selector);
    let inline=false,relocatedInline=false;
    let owner,plan,current=null,entries=new Map(),preferences={},scrollBack=0,opener=null,returnTarget=null,generation=0,navigation=0,disposed=false,overviewOwner=null,overviewPlan=null;
    const pendingKey=()=> 'kairos-task-quick-pending:'+owner+':'+plan;
    const preferenceKey=()=> 'kairos-task-list-view:'+owner+':'+plan;
    const readStorage=key=>{try{return JSON.parse(storage?.getItem(key)||'null')}catch{return null}};
    function remember(){try{storage?.setItem(pendingKey(),JSON.stringify([...entries].filter(([,entry])=>entry.pending).map(([key,entry])=>[key,entry.pending])))}catch{}}
    function rememberView(){try{storage?.setItem(preferenceKey(),JSON.stringify(preferences))}catch{}}
    function replaceOverview(html){
        sync();const sameScope=overviewOwner===owner&&(overviewPlan===plan||(overviewPlan===null&&plan==='plan-'+owner));
        replaceTaskOverview(overview,html,{document,scrollElement,preserveActive:sameScope});overviewOwner=owner;overviewPlan=plan;
    }
    function sync(){
        if(owner===getOwnerId()&&plan===getPlanId())return false;
        if(inline){surface.appendChild(form);inline=false;form.classList.remove('task-quick-inline')}
        generation++;navigation++;owner=getOwnerId();plan=getPlanId();current=null;entries=new Map();const savedView=readStorage(preferenceKey());preferences=savedView&&typeof savedView==='object'&&!Array.isArray(savedView)?savedView:{};
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
        if(inline){
            if(mountInline()){renderComposer();onRender();return}
            relocatedInline=true;inline=false;form.classList.remove('task-quick-inline');surface.appendChild(form);
        }
        surface.hidden=false;overview.hidden=true;
        surface.dataset.boardId=current.boardId;surface.dataset.sectionId=current.sectionId;
        const found=locate(current),entry=entryFor(current),pref=preference(current),tasks=found.message?[]:(found.section.tasks||[]).filter(task=>!task.archived);
        find('[data-section-heading]').textContent=found.section?.title||copy('section');find('[data-section-breadcrumb]').textContent=found.board?.title||'';
        find('[data-section-count]').textContent=tasks.filter(task=>task.completed).length+' / '+tasks.length+' '+copy('completed');
        find('[data-show-completed]').setAttribute('aria-pressed',String(pref.showCompleted));
        find('[data-show-completed]').textContent=copy(pref.showCompleted?'hide_completed':'show_completed');
        find('[data-section-state]').textContent=found.message||(tasks.length?(tasks.every(task=>task.completed)&&!pref.showCompleted?copy('hidden_completed'):''):copy('empty'));
        const rows=new Map([...list.children].map(row=>[row.dataset.detailRow,row])),active=document.activeElement,selection=active===input?null:[active?.selectionStart,active?.selectionEnd];
        const assignments=assignmentProgressIndex(getState(),getToday());
        for(const [index,task] of tasks.entries()){
            let row=rows.get(task.id);rows.delete(task.id);
            if(!row){const template=document.createElement('template');template.innerHTML=renderTaskListRow(task,current.sectionId,copy,assignments.get(task.id));row=template.content.firstElementChild;list.appendChild(row)}
            if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
            // Keep row controls alive, especially title typing/caret and completion focus.
            row.classList.toggle('completed',task.completed===true);row.hidden=!pref.showCompleted&&task.completed===true;
            const title=row.querySelector('.task-text'),date=row.querySelector('.task-date-input'),check=row.querySelector('[type="checkbox"]');
            if(active!==title)title.value=task.title;title.style.textDecoration=task.completed?'line-through':'none';
            if(active!==date)date.value=task.date||'';check.checked=task.completed===true;check.setAttribute('aria-label',copy('complete')+' '+task.title);
            const assignmentHTML=assignmentProgressMarkup(assignments.get(task.id)),oldAssignment=row.querySelector('[data-assignment-progress]');
            if(oldAssignment?.__assignmentHTML!==assignmentHTML){const activeLink=oldAssignment?.contains(document.activeElement)?document.activeElement?.dataset.assignmentOpen:null;oldAssignment?.remove();if(assignmentHTML){row.insertAdjacentHTML('beforeend',assignmentHTML);row.querySelector('[data-assignment-progress]').__assignmentHTML=assignmentHTML;if(activeLink)[...row.querySelectorAll('[data-assignment-open]')].find(button=>button.dataset.assignmentOpen===activeLink)?.focus?.({preventScroll:true})}}
            const time=row.querySelector('.task-scheduled-time');time.hidden=!task.startTime;time.textContent=(task.startTime||'')+(task.endTime?' – '+task.endTime:'');
            const progress=Array.isArray(task.checklist)?task.checklist:[],count=row.querySelector('.task-checklist-count');count.hidden=!progress.length;count.textContent=(task.recurrence?.enabled?0:progress.filter(item=>item.completed).length)+'/'+progress.length;
        }
        for(const row of rows.values())row.remove();
        if(active&&list.contains(active)&&document.activeElement!==active){active.focus?.({preventScroll:true});if(selection?.every(Number.isInteger))active.setSelectionRange?.(...selection)}
        renderComposer(found,entry);
        onRender();
    }
    function renderComposer(found=locate(current),entry=entryFor(current)){
        if(input.value!==entry.draft)input.value=entry.draft;
        input.disabled=!!found.message||entry.busy||!!entry.pending;quick('[data-quick-save]').disabled=(!!found.message&&!entry.pending)||entry.busy||(!entry.pending&&isMutationBlocked());
        quick('[data-quick-save]').textContent=copy(entry.busy?'saving':entry.pending?'retry':'add');quick('[data-quick-status]').textContent=entry.message;
        quick('[data-quick-discard]').hidden=!entry.pending;quick('[data-quick-discard]').disabled=entry.busy;
        quick('[data-quick-cancel]').disabled=entry.busy||!!entry.pending;quick('[data-quick-cancel]').hidden=!!entry.pending;
        form.setAttribute('aria-busy',String(entry.busy));
    }
    function inlineBlock(){return [...overview.querySelectorAll('.board-section-block')].find(block=>block.dataset.boardId===current?.boardId&&block.dataset.sectionId===current?.sectionId)}
    function mountInline(){
        const block=inlineBlock();if(!block)return false;
        const add=block.querySelector('.add-task-btn');if(form.parentElement!==block)block.insertBefore(form,add||null);
        form.classList.add('task-quick-inline');if(add)add.hidden=true;return true;
    }
    function closeCapture(){
        if(!current)return;const entry=entryFor(current);if(entry.busy||entry.pending)return;
        entry.draft='';entry.message='';input.value='';
        if(!inline){render();return}
        const add=inlineBlock()?.querySelector('.add-task-btn');surface.appendChild(form);form.classList.remove('task-quick-inline');inline=false;current=null;decorateOverview();add?.focus?.({preventScroll:true});
    }
    function decorateOverview(){
        sync();for(const block of overview.querySelectorAll('.board-section-block')){
            const target={boardId:block.dataset.boardId,sectionId:block.dataset.sectionId},pref=preference(target),header=block.querySelector('.section-title-row');
            if(!header.querySelector('[data-open-section]')){
                for(const [attribute,label] of [['data-section-collapse','collapse'],['data-open-section','open']]){const button=document.createElement('button');button.type='button';button.setAttribute(attribute,'');button.className='task-section-control';button.textContent=copy(label);header.appendChild(button)}
            }
            const collapse=header.querySelector('[data-section-collapse]'),label=copy(pref.collapsed?'expand':'collapse');collapse.setAttribute('aria-expanded',String(!pref.collapsed));collapse.setAttribute('aria-label',label);collapse.title=label;if(!collapse.querySelector('svg'))collapse.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 7 7-7 7"/></svg>';if(header.firstElementChild!==collapse)header.prepend(collapse);
            const open=header.querySelector('[data-open-section]');if(!open.querySelector('svg'))open.innerHTML=esc(copy('open'))+'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
            for(const el of block.querySelectorAll('.task-list,.add-task-btn'))el.hidden=pref.collapsed;
        }
        if(inline&&current){if(!mountInline()){render();return}renderComposer()}
        onRender();
    }
    async function openSection(target,source=null,capture=false,isCurrent=()=>true){
        sync();if(!getOwnerId())return false;const ticket=++navigation,actor=owner,actorPlan=plan;
        if(!await requestCloseDetails()||ticket!==navigation||actor!==getOwnerId()||actorPlan!==getPlanId()||!isCurrent())return false;
        if(!await ensurePlan()||ticket!==navigation||actor!==getOwnerId()||(actorPlan!==null&&actorPlan!==getPlanId())||!isCurrent())return false;
        sync();if(!current||inline){scrollBack=scrollElement.scrollTop;opener=source;returnTarget={...target,add:source?.matches('.add-task-btn')===true}}
        if(inline&&!capture){surface.appendChild(form);form.classList.remove('task-quick-inline')}
        current={...target};inline=capture;relocatedInline=false;
        if(capture){preference(target).collapsed=false;rememberView();surface.hidden=true;overview.hidden=false;decorateOverview();render();input.focus?.({preventScroll:true});
            const box=form.getBoundingClientRect?.()||input.getBoundingClientRect?.(),bounds=scrollElement.getBoundingClientRect?.(),top=Math.max(0,bounds?.top||0),bottom=Math.min(window.innerHeight??Infinity,bounds?.bottom??Infinity);
            if(box&&(box.top<top||box.bottom>bottom))(form.scrollIntoView?form:input).scrollIntoView?.({block:'nearest',behavior:'instant'});
            return true}
        render();scrollElement.scrollTop=0;find('[data-section-heading]').focus?.({preventScroll:true});return true;
    }
    async function back(){
        sync();const ticket=++navigation,actor=owner,actorPlan=plan;if(!await requestCloseDetails()||ticket!==navigation||actor!==getOwnerId()||actorPlan!==getPlanId())return false;
        if(inline){surface.appendChild(form);form.classList.remove('task-quick-inline');inline=false}
        current=null;surface.hidden=true;overview.hidden=false;renderOverview();decorateOverview();scrollElement.scrollTop=scrollBack;
        const block=[...overview.querySelectorAll('.board-section-block')].find(el=>el.dataset.boardId===returnTarget?.boardId&&el.dataset.sectionId===returnTarget?.sectionId),returnControl=block?.querySelector(returnTarget?.add?'.add-task-btn':'[data-open-section]');
        if(opener?.isConnected)opener.focus?.({preventScroll:true});else (returnControl&&!returnControl.hidden?returnControl:block?.querySelector('[data-open-section]')||overview.querySelector('[data-open-section]'))?.focus?.({preventScroll:true});return true;
    }
    async function discard(){
        sync();if(!current)return false;const target={...current},entry=entryFor(target),ticket=generation,pending=entry.pending;
        if(!pending||entry.busy||!await confirmDiscard(copy('discard_warning'))||ticket!==generation||owner!==getOwnerId()||plan!==getPlanId()||entry.pending!==pending)return false;
        commit.discard?.(pending.identity);entry.pending=null;entry.draft='';entry.message=copy('discarded');remember();render();if(current&&sectionKey(current)===sectionKey(target))input.focus?.();return true;
    }
    async function submit(){
        sync();if(!current||!owner||!plan)return false;const target={...current},entry=entryFor(target);if(entry.busy)return false;
        if(!entry.pending){
            if(isMutationBlocked()){entry.message='Wait for the current save or resolve Retry/Discard.';render();return false}
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
            entry.busy=false;if(!disposed&&ticket===generation){render();if(current&&sectionKey(current)===sectionKey(target)&&!entry.pending&&root.classList.contains('active')&&(!document.activeElement||document.activeElement===document.body||document.activeElement===input||form.contains(document.activeElement)))input.focus?.({preventScroll:true})}
        }
    }
    const onInput=event=>{if(event.target===input&&current&&!input.disabled)entryFor(current).draft=input.value};
    const onSubmit=event=>{event.preventDefault();void submit()};
    const onKey=event=>{
        if(event.target!==input||event.isComposing||event.keyCode===229)return;
        if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void submit()}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeCapture()}
    };
    const onClick=event=>{
        const button=event.target.closest('button'),block=event.target.closest('.board-section-block');
        if(button?.matches('[data-quick-cancel]')){closeCapture();return}
        if(button?.matches('[data-quick-discard]')){void discard();return}
        if(button?.matches('[data-section-back]')){void back();return}
        if(button?.matches('[data-show-completed]')&&current){preference(current).showCompleted=!preference(current).showCompleted;rememberView();render();return}
        if(block&&button?.matches('[data-section-collapse]')){if(inline&&current&&block.dataset.boardId===current.boardId&&block.dataset.sectionId===current.sectionId){surface.appendChild(form);form.classList.remove('task-quick-inline');inline=false;current=null}const target={boardId:block.dataset.boardId,sectionId:block.dataset.sectionId};preference(target).collapsed=!preference(target).collapsed;rememberView();decorateOverview();return}
        if(button?.matches('[data-open-section],.add-task-btn')&&block){void openSection({boardId:block.dataset.boardId,sectionId:block.dataset.sectionId},button,button.matches('.add-task-btn'));return}
    };
    root.addEventListener('click',onClick);root.addEventListener('keydown',onKey);root.addEventListener('input',onInput);form.addEventListener('submit',onSubmit);sync();
    function sectionMoved(command){
        sync();const value=command.type==='undo_task_list'?command.inverse?.command:command;if(value?.type!=='move_section')return;
        const from=value.target,to={boardId:value.destination.boardId,sectionId:from.sectionId},oldKey=sectionKey(from),newKey=sectionKey(to);
        if(preferences[oldKey]){preferences[newKey]=preferences[oldKey];delete preferences[oldKey];rememberView()}
        if(entries.has(oldKey)){entries.set(newKey,entries.get(oldKey));entries.delete(oldKey)}
        if(current&&sectionKey(current)===oldKey){current={...to};if(relocatedInline){inline=true;relocatedInline=false;surface.hidden=true;overview.hidden=false}}
        if(returnTarget&&sectionKey(returnTarget)===oldKey)returnTarget={...returnTarget,...to};
        render();
    }
    function resolveRecovery(identity,status){
        if(status!=='discarded'||disposed||identity.ownerId!==getOwnerId()||identity.planId!==getPlanId())return;
        for(const entry of entries.values())if(!entry.busy&&entry.pending?.identity.operationId===identity.operationId&&entry.pending.identity.createdAt===identity.createdAt){entry.pending=null;entry.message='Recovery cleared. Your draft is still here.';remember();render();}
    }
    return {resolveRecovery,getCurrentSection(){sync();return current?{...current}:null},cancelCapture(){sync();if(!current)return false;const entry=entryFor(current);if(entry.busy||entry.pending)return false;closeCapture();return true},sectionMoved,hasPendingCapture:()=>[...entries.values()].some(entry=>entry.busy||entry.pending),openSection,back,submit,discard,render,sync,decorateOverview,replaceOverview,async addTask(target,source,{isCurrent=()=>true}={}){return openSection(target,source,true,isCurrent)},async collapseSection(target){if(locate(target).message)return false;if(current&&sectionKey(current)===sectionKey(target)&&!await back())return false;preference(target).collapsed=true;rememberView();decorateOverview();return true},rowHTML:(task,sectionId,assignment)=>renderTaskListRow(task,sectionId,copy,assignment),isFocused:()=>!!current&&!inline,getViewKey:()=>current&&!inline?sectionKey(current):'overview',dispose(){disposed=true;generation++;navigation++;root.removeEventListener('click',onClick);root.removeEventListener('keydown',onKey);root.removeEventListener('input',onInput);form.removeEventListener('submit',onSubmit);form.remove();surface.remove();overview.hidden=false}};
}
