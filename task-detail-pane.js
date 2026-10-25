import {bindTaskFocus} from './task-focus.js?v=3';
import {bindDeadlineImpact} from './deadline-impact.js?v=3';
import {stableStringify} from './plan-merge.js';
import {taskDetailValues,TASK_DETAIL_FIELDS,applyTaskListCommand} from './task-list-model.js?v=18';
import {recurrenceFieldsMarkup,bindRecurrenceFields,readRecurrenceFields} from './schedule-recurrence-ui.js?v=12';
import {t} from './i18n.js';
import {assignmentProgressIndex,assignmentProgressMarkup,refreshAssignmentProgress} from './assignment-progress.js?v=4';
import {planningClock} from './planning-model.js?v=1';
import {mountTaskChecklistEditor} from './task-checklist-editor.js?v=7';
import {matchesShortcut} from './shortcut-model.js?v=1';

const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
export function mountTaskDetailPane({root,resolveTarget,commit,getAllowCompletedReschedule=()=>false,getShortcuts=()=>undefined,getOwnerId,getPlanId=()=>null,getState=()=>({boards:[]}),getToday=()=>planningClock(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone).date,onClose=()=>{},openSchedule,onStartFocus,document=globalThis.document,window=globalThis.window}){
    let panel=null,form=null,target=null,baseline=null,displayBaseline=null,location=null,owner=null,planId=null,opener=null,pending=null,busy=false,dialog=null,choiceDialog=null,choiceFinish=null,revision=0,checklistEditor=null;
    let pendingFocus=null,pointerFocus=null,deadlineImpactView=null,taskFocusView=null,statusError=false;
    const copy=key=>t('task_detail_'+key,document.documentElement.lang||'en');
    const field=name=>form?.querySelector('[name="'+name+'"]');
    const key=()=> 'kairos-task-detail-pending:'+owner+':'+planId;
    function refreshSaveControls(){
        if(!panel||!form)return;
        const changed=dirty();
        if(changed)window.addEventListener('beforeunload',beforeUnload);else window.removeEventListener('beforeunload',beforeUnload);
        panel.dataset.saveState=busy?'saving':pending?'retry':statusError?'error':changed?'unsaved':'saved';
        panel.setAttribute('aria-busy',String(busy));
        const save=form.querySelector('[type="submit"]');
        save.disabled=busy||(!pending&&!changed);save.textContent=copy(busy?'saving':pending?'retry':'save');
    }
    function status(message,error=false){
        statusError=error;
        if(!error&&!busy&&message.startsWith(copy('unsaved'))&&!dirty())message=copy('saved');
        const el=panel?.querySelector('.task-detail-footer [role="status"]');if(el){el.textContent=message;el.classList.toggle('is-error',error)}
        refreshSaveControls();
    }
    function remember(){try{window.sessionStorage?.setItem(key(),JSON.stringify(pending))}catch{}}
    function forget(){try{window.sessionStorage?.removeItem(key())}catch{}}
    function read(){
        const result={...baseline,checklist:checklistEditor?.read()||[]};
        if(target?.occurrenceDate)return result;
        for(const name of ['title','notes'])result[name]=field(name).value;
        for(const name of ['date','startTime','dueDate','priority','schedulingPreference','color'])result[name]=field(name).value||null;
        for(const name of ['durationMinutes','reminderMinutes'])result[name]=field(name).value===''?null:Number(field(name).value);
        result.scheduleLocked=field('scheduleLocked').checked===true;
        // The shared recurrence controls consume the same form contract as Schedule.
        const recurrenceForm={querySelector:selector=>form.querySelector(selector),querySelectorAll:selector=>form.querySelectorAll(selector),elements:{date:field('date')}};
        result.recurrence=readRecurrenceFields(recurrenceForm,baseline.recurrence?.startDate||result.date);
        if(result.recurrence&&baseline.recurrence)result.recurrence.startDate=baseline.recurrence.startDate;
        return result;
    }
    function edits(){const values=read();return Object.fromEntries(TASK_DETAIL_FIELDS.filter(name=>stableStringify(values[name])!==stableStringify(displayBaseline[name])).map(name=>[name,values[name]]))}
    function dirty(){try{return !!pending||checklistEditor?.hasPendingEntry()||Object.keys(edits()).length>0}catch{return true}}
    const activePage=()=>!root.classList.contains('page-view')||root.classList.contains('active');
    function captureUi(){
        const active=document.activeElement;
        return {group:active?.localName==='summary'?active.closest('[data-detail-group]')?.dataset.detailGroup:null,checklist:checklistEditor?.captureFocus(),checklistView:checklistEditor?.captureView(),groups:[...form.querySelectorAll('[data-detail-group]')].filter(el=>el.open).map(el=>el.dataset.detailGroup),name:panel?.contains(active)?active.name:null,control:active?.matches?.('[type="submit"]')?'save':active?.matches?.('[data-maximise]')?'maximise':null,start:active?.selectionStart,end:active?.selectionEnd,scroll:panel?.scrollTop||0,dialogScroll:dialog?.scrollTop||0};
    }
    function restoreUi(view,focus=true){
        if(!view)return;
        checklistEditor?.restoreView(view.checklistView);
        if(Array.isArray(view.groups))for(const group of form.querySelectorAll('[data-detail-group]'))group.open=view.groups.includes(group.dataset.detailGroup);
        if(focus&&activePage()){
            if(view.checklist)checklistEditor?.restoreFocus(view.checklist);
            else {let el=view.group?[...form.querySelectorAll('[data-detail-group]')].find(el=>el.dataset.detailGroup===view.group)?.querySelector('summary'):view.name?field(view.name):view.control==='save'?form?.querySelector('[type="submit"]'):view.control==='maximise'?panel?.querySelector('[data-maximise]'):null;if(el?.disabled)el=form?.querySelector('.task-detail-footer [data-close]');el?.focus?.({preventScroll:true});if(typeof view.start==='number')try{el?.setSelectionRange?.(view.start,view.end)}catch{}}
        }
        if(panel)panel.scrollTop=view.scroll;if(dialog)dialog.scrollTop=view.dialogScroll;
    }
    function updateControls(){
        deadlineImpactView?.refresh();taskFocusView?.refresh();
        panel?.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=busy||!!pending);
        let scheduleLocked=false;try{scheduleLocked=resolveTarget(target).task.completed&&!getAllowCompletedReschedule()}catch{}
        if(scheduleLocked)for(const name of ['date','startTime','durationMinutes']){const input=field(name);if(input)input.disabled=true;}
        checklistEditor?.setDisabled(busy||!!pending);
        panel?.querySelectorAll('[data-series-scope],[data-open-occurrence]').forEach(el=>el.disabled=busy||!!pending);
        refreshSaveControls();
    }
    function updatePropertySummaries(){
        const set=(name,value)=>{const el=form.querySelector('[data-detail-summary="'+name+'"]');if(el)el.textContent=value};
        set('reminder',field('reminderMinutes').value?field('reminderMinutes').value+' '+copy('minutes_before'):copy('none'));
        set('repeat',form.querySelector('[data-recurrence-summary]')?.textContent||copy('none'));
        const preference=field('schedulingPreference').value,color=field('color').value;
        set('planning',[preference?copy(preference):null,field('scheduleLocked').checked?copy('lock'):null,color?copy('color')+' '+color:null].filter(Boolean).join(' · ')||copy('none'));
    }
    function close(){
        window.removeEventListener('beforeunload',beforeUnload);
        revision++;taskFocusView?.dispose();taskFocusView=null;deadlineImpactView?.dispose();deadlineImpactView=null;checklistEditor?.dispose();checklistEditor=null;pendingFocus=null;pointerFocus=null;
        const returnFocus=opener?.isConnected?opener:[...root.querySelectorAll('[data-task-detail]')].find(el=>el.dataset.taskDetail===target?.taskId);
        choiceFinish?.('stay');choiceDialog?.remove();choiceDialog=null;
        dialog?.close?.();dialog?.remove();dialog=null;panel?.remove();panel=null;form=null;target=null;pending=null;busy=false;statusError=false;
        root.classList.remove('has-task-details');returnFocus?.focus?.();onClose();
    }
    function beforeUnload(event){
        if(!panel||owner!==getOwnerId()||planId!==getPlanId()||!dirty())return;
        event.preventDefault();event.returnValue='';
    }
    function chooseDraft(){
        if(choiceDialog)return Promise.resolve('stay');
        return new Promise(resolve=>{
            const modal=document.createElement('dialog');choiceDialog=modal;modal.className='task-detail-choice';modal.setAttribute('aria-labelledby','task-detail-unsaved-title');
            const title=document.createElement('h2');title.id='task-detail-unsaved-title';title.textContent=copy(pending?'uncertain':'unsaved');modal.appendChild(title);
            const actions=document.createElement('div');actions.className='task-detail-actions';
            for(const value of ['save','discard','stay']){const button=document.createElement('button');button.type='button';button.dataset.draftChoice=value;button.textContent=copy(pending&&value==='save'?'retry':value);actions.appendChild(button)}
            modal.appendChild(actions);document.body.appendChild(modal);
            const finish=value=>{choiceFinish=null;choiceDialog=null;modal.close?.();modal.remove();resolve(value)};choiceFinish=finish;
            modal.addEventListener('click',event=>{const value=event.target.closest?.('[data-draft-choice]')?.dataset.draftChoice;if(value)finish(value)});
            modal.addEventListener('cancel',event=>{event.preventDefault();finish('stay')});
            modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish('stay')}else trap(event,modal)});
            if(modal.showModal)modal.showModal();else modal.setAttribute('open','');modal.querySelector('[data-draft-choice="stay"]').focus?.();
        });
    }
    async function requestClose(){
        if(!panel)return true;if(busy)return false;
        if(owner!==getOwnerId()){forget();close();return true}
        if(dirty()){const answer=await chooseDraft();if(answer==='stay')return false;if(answer==='save'&&!await save())return false;if(answer==='discard'){commit.discard?.(pending?.identity);forget();}}
        close();return true;
    }
    function trap(event,surface){
        if(event.key!=='Tab')return;
        const controls=[...surface.querySelectorAll('button,input,select,textarea,summary')].filter(el=>{
            if(el.disabled||el.type==='hidden'||el.closest('[hidden],[inert],fieldset[disabled]')||(el.hasAttribute('tabindex')&&Number(el.getAttribute('tabindex'))<0))return false;
            for(let details=el.closest('details');details;details=details.parentElement?.closest('details'))if(!details.open&&![...details.children].find(child=>child.tagName==='SUMMARY')?.contains(el))return false;
            return true;
        });
        if(!controls.length)return;
        if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus?.()}
        else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus?.()}
    }
    function maximise(){
        if(!panel||busy)return;
        const view=document.activeElement?.matches?.('[data-maximise]')&&pointerFocus?pointerFocus:captureUi();pointerFocus=null;
        if(dialog){dialog.close?.();root.appendChild(panel);dialog.remove();dialog=null;panel.querySelector('[data-maximise]').textContent=copy('expand');restoreUi(view);return;}
        dialog=document.createElement('dialog');dialog.className='task-detail-expanded';dialog.setAttribute('aria-labelledby','task-detail-heading');document.body.appendChild(dialog);dialog.appendChild(panel);
        panel.querySelector('[data-maximise]').textContent=copy('shrink');
        dialog.addEventListener('cancel',event=>{event.preventDefault();void requestClose()});
        if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');restoreUi(view);
    }
    function render(found,{focus=true}={}){
        const values=baseline;
        const recurrenceTask=pending&&Object.hasOwn(pending.command.changes,'recurrence')?{...found.task,recurrence:pending.command.changes.recurrence}:found.task;
        panel=document.createElement('aside');panel.className='task-detail-pane';panel.dataset.taskDetailPane='';panel.setAttribute('aria-labelledby','task-detail-heading');
        const input=(name,label,type='text',attrs='')=>`<label>${esc(label)}<input name="${name}" type="${type}" ${attrs} value="${esc(values[name])}"></label>`;
        const select=(name,label,options)=>`<label>${esc(label)}<select name="${name}">${options.map(([value,text])=>`<option value="${value}" ${String(values[name]??'')===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
        panel.innerHTML=`<header class="task-detail-header"><h2 id="task-detail-heading">${esc(copy('heading'))}</h2><div><button type="button" data-maximise>${esc(copy('expand'))}</button><button type="button" data-close aria-label="${esc(copy('close'))}">×</button></div></header>
          <div data-assignment-detail>${assignmentProgressMarkup(assignmentProgressIndex(getState(),getToday()).get(target.taskId),{details:true})}</div><div data-task-focus></div><form class="task-detail-form" novalidate>
          <fieldset class="task-detail-title task-detail-metadata" ${target.occurrenceDate?'disabled':''}>
          ${input('title',copy('title'),'text','maxlength="180" required')}
          </fieldset>
          <div class="task-detail-context"><p class="task-detail-location">${esc(found.board.title)} / ${esc(found.section.title)}</p>
          ${values.recurrence?.enabled?`<div class="task-checklist-scope"><p>${esc(target.occurrenceDate?copy('occurrence')+' '+target.occurrenceDate:copy('template'))}</p><button type="button" data-series-scope>${esc(copy('template'))}</button><label>${esc(copy('occurrence_date'))}<input type="date" data-checklist-occurrence value="${esc(target.occurrenceDate||values.recurrence.startDate||values.date)}"></label><button type="button" data-open-occurrence>${esc(copy('open_occurrence'))}</button></div>`:''}</div>
          <div class="task-detail-layout"><div class="task-detail-work">
          <fieldset class="task-detail-notes task-detail-metadata" ${target.occurrenceDate?'disabled':''}>
          <label>${esc(copy('notes'))}<textarea name="notes" rows="5" maxlength="3000">${esc(values.notes)}</textarea></label>
          </fieldset>
          <section class="task-checklist" aria-label="${esc(copy('checklist'))}"></section>
          </div><fieldset class="task-detail-properties task-detail-metadata" ${target.occurrenceDate?'disabled':''}>
          <legend>${esc(copy('properties'))}</legend>
          <div class="task-detail-grid">${input('date',copy('date'),'date')}${input('startTime',copy('start'),'time','step="60"')}${input('durationMinutes',copy('duration'),'number','min="1" max="1439" step="1" required')}${input('dueDate',copy('deadline'),'date')}</div><div data-deadline-impact></div>
          ${select('priority',copy('priority'),[['',copy('none')],['low',copy('low')],['medium',copy('medium')],['high',copy('high')]])}
          <details data-detail-group="reminder"><summary>${esc(copy('reminders'))}<span data-detail-summary="reminder"></span></summary>
          ${input('reminderMinutes',copy('reminder'),'number','min="1" max="10080" step="1"')}<p class="task-detail-hint">${esc(copy('reminder_hint'))}</p></details>
          <details data-detail-group="repeat"><summary>${esc(copy('repeat_settings'))}<span data-detail-summary="repeat"></span></summary>
          ${values.recurrence?.enabled?'<p class="task-detail-series">'+esc(copy('series'))+'</p>':''}
          ${recurrenceFieldsMarkup(recurrenceTask,{fallbackDate:found.task.date||null})}</details>
          <details data-detail-group="planning"><summary>${esc(copy('planning_settings'))}<span data-detail-summary="planning"></span></summary><div class="task-detail-grid">${select('schedulingPreference',copy('preference'),[['',copy('none')],['morning',copy('morning')],['afternoon',copy('afternoon')],['evening',copy('evening')]])}${input('color',copy('color'),'text','maxlength="7" placeholder="#a855f7"')}</div>
          <label class="task-detail-check"><input name="scheduleLocked" type="checkbox" ${values.scheduleLocked?'checked':''}>${esc(copy('lock'))}</label></details></fieldset></div>
          <footer class="task-detail-footer"><p role="status" aria-live="polite">${esc(copy('saved'))}</p>
          <div class="task-detail-actions"><button type="submit" class="task-detail-primary">${esc(copy('save'))}</button><button type="button" data-close>${esc(copy('close'))}</button>${openSchedule?'<button type="button" data-schedule>'+esc(copy('schedule'))+'</button>':''}</div>
          </footer></form>`;
        root.appendChild(panel);root.classList.add('has-task-details');form=panel.querySelector('form');refreshAssignmentProgress(panel.querySelector('[data-assignment-detail]'),assignmentProgressIndex(getState(),getToday()).get(target.taskId),{details:true});
        bindRecurrenceFields(form,{fallbackDate:found.task.date||values.recurrence?.startDate||null});
        checklistEditor=mountTaskChecklistEditor({root:panel.querySelector('.task-checklist'),isActive:()=>activePage()&&owner===getOwnerId()&&planId===getPlanId(),items:pending?.command?.changes?.checklist||values.checklist||[],canToggle:!!target.occurrenceDate||!values.recurrence?.enabled,hint:copy(values.recurrence?.enabled&&!target.occurrenceDate?'template_hint':target.occurrenceDate?'occurrence_hint':'checklist_hint'),copy,onStatus:status,onChange:()=>status(copy('unsaved')),document,window});
        deadlineImpactView?.dispose();deadlineImpactView=bindDeadlineImpact({root:panel,taskId:target.taskId,getState,isBlocked:()=>busy||!!pending,onReview:async id=>{if(!openSchedule)return;const actor=owner,actorPlan=planId;if(await requestClose()&&getOwnerId()===actor&&getPlanId()===actorPlan)await openSchedule({taskId:id,reviewDeadline:true})}});
        taskFocusView?.dispose();taskFocusView=bindTaskFocus({root:panel,taskId:target.taskId,occurrenceDate:target.occurrenceDate,getState,isBlocked:()=>busy||!!pending,onStart:(id,date)=>onStartFocus?.(id,date)});
        displayBaseline=read();
        if(pending){for(const [name,value] of Object.entries(pending.command.changes)){const el=field(name);if(el){if(el.type==='checkbox')el.checked=value===true;else el.value=value??''}}status(copy('uncertain'),true)}
        updatePropertySummaries();
        const formChanged=event=>{if(event.target.closest('.task-checklist-scope'))return;updatePropertySummaries();if(!busy&&!pending)status(copy('unsaved'))};
        form.addEventListener('input',formChanged);form.addEventListener('change',formChanged);
        panel.addEventListener('click',event=>{const linked=event.target.closest('[data-assignment-open]');if(linked){event.preventDefault();event.stopPropagation();void open({taskId:linked.dataset.assignmentOpen},linked)}});
        panel.querySelector('[data-series-scope]')?.addEventListener('click',()=>void open({taskId:target.taskId},opener));
        panel.querySelector('[data-open-occurrence]')?.addEventListener('click',()=>{const date=panel.querySelector('[data-checklist-occurrence]').value;if(date)void open({taskId:target.taskId,occurrenceDate:date},opener)});
        form.addEventListener('submit',event=>{event.preventDefault();void save()});
        panel.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>void requestClose()));
        panel.querySelector('[data-maximise]').addEventListener('click',maximise);
        panel.addEventListener('pointerdown',event=>{pointerFocus=event.target.closest?.('[data-maximise],[type="submit"]')?captureUi():null});
        panel.addEventListener('pointercancel',()=>pointerFocus=null);
        panel.querySelector('[data-schedule]')?.addEventListener('click',async()=>{const selected={...target};if(await requestClose())openSchedule(selected)});
        panel.addEventListener('keydown',event=>{
            pointerFocus=null;if(event.isComposing||event.keyCode===229)return;
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void requestClose()}
            else if(matchesShortcut(event,'saveTaskDetails',getShortcuts(),{allowInEditor:true,activeElement:document.activeElement})){event.preventDefault();event.stopPropagation();void save()}
            else if(dialog)trap(event,panel);
        });
        updateControls();if(focus){if(target.occurrenceDate)checklistEditor.restoreFocus({stepId:checklistEditor.read()[0]?.id,control:'title'});else field('title').focus?.();}
    }
    async function open(selected,source=document.activeElement){
        const actor=getOwnerId(),actorPlan=getPlanId();if(!actor)return false;
        try{resolveTarget(selected)}catch(error){status(error.message,true);return false}
        if(panel&&!await requestClose())return false;
        if(getOwnerId()!==actor||getPlanId()!==actorPlan)return false;
        let found;try{found=resolveTarget(selected)}catch{return false}
        owner=getOwnerId();if(!owner)return false;planId=getPlanId();target={...selected};opener=source;baseline=taskDetailValues(found.task,target);location={boardId:found.board.id,sectionId:found.section.id};pending=null;
        try{const stored=JSON.parse(window.sessionStorage?.getItem(key())||'null');if(stored?.command?.target?.taskId===target.taskId&&(stored.command.target.occurrenceDate||null)===(target.occurrenceDate||null)&&stored.identity?.ownerId===owner&&stored.identity?.planId===planId&&stored.baseline){pending=stored;baseline=stored.baseline;location={boardId:stored.expected.boardId,sectionId:stored.expected.sectionId}}}catch{}
        pendingFocus=null;pointerFocus=null;render(found);
        const entering=panel;entering.classList.add('task-detail-entering');entering.addEventListener('animationend',()=>entering.classList.remove('task-detail-entering'),{once:true});
        if(window.innerWidth<1100)maximise();return true;
    }
    async function save(){
        if(!panel||busy)return false;
        const ticket=revision;
        if(owner!==getOwnerId()||planId!==getPlanId()){forget();close();return false}
        try{
            const found=resolveTarget(target);
            const view=document.activeElement?.matches?.('[type="submit"]')&&pointerFocus?pointerFocus:captureUi();pointerFocus=null;
            if(!pending){if(!checklistEditor?.flushEntry())return false;const changes=edits();if(!Object.keys(changes).length){status(copy('saved'));return true}
                const command={type:'edit_task',target:{...target},changes},expected={...location,fields:structuredClone(baseline)};
                applyTaskListCommand({boards:[{...found.board,sections:[{...found.section,tasks:[found.seriesTask||found.task]}]}]},command,expected,{allowCompleted:getAllowCompletedReschedule()});
                pendingFocus=view;pending={command,expected,baseline:structuredClone(baseline),identity:{ownerId:owner,planId,operationId:'task-detail-'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),createdAt:Date.now()}};remember();
            }
            busy=true;updateControls();status(copy('saving'));
            const result=await commit(pending.command,pending.expected,pending.identity);
            if(ticket!==revision)return false;
            if(owner!==getOwnerId()||planId!==getPlanId()){forget();close();return false}
            const currentView=captureUi(),fresh=resolveTarget(target),expanded=dialog,restore={...(currentView.group?currentView:view.group?view:pendingFocus||view),groups:currentView.groups,checklistView:currentView.checklistView,scroll:currentView.scroll,dialogScroll:currentView.dialogScroll},canFocus=activePage()&&(document.activeElement===document.body||panel.contains(document.activeElement));
            baseline=taskDetailValues(fresh.task,target);forget();pending=null;pendingFocus=null;busy=false;checklistEditor?.dispose();panel.remove();render(fresh,{focus:false});
            if(expanded){expanded.appendChild(panel);panel.querySelector('[data-maximise]').textContent=copy('shrink')}
            restoreUi(restore,canFocus);status(copy('saved'));return !!result;
        }catch(error){if(ticket!==revision)return false;busy=false;updateControls();status(copy('failed')+' '+error.message,true);return false}
    }
    function sync(){if(panel)updateControls();deadlineImpactView?.refresh();taskFocusView?.refresh();if(panel&&owner===getOwnerId()&&planId===getPlanId()){refreshAssignmentProgress(panel.querySelector('[data-assignment-detail]'),assignmentProgressIndex(getState(),getToday()).get(target.taskId),{details:true})}if(!activePage())checklistEditor?.cancelReorder();if(panel&&(owner!==getOwnerId()||planId!==getPlanId())){forget();close()}}
    function resolveRecovery(identity,status){
        if(status!=='discarded'||busy||!panel||identity.ownerId!==getOwnerId()||identity.planId!==getPlanId()||pending?.identity.operationId!==identity.operationId||pending?.identity.createdAt!==identity.createdAt)return;
        forget();pending=null;updateControls();statusError=false;
        const el=panel.querySelector('.task-detail-footer [role="status"]');if(el)el.textContent='Recovery cleared. Your draft is still here. Review it before saving.';
    }
    return {open,save,requestClose,maximise,sync,resolveRecovery,dispose:close};
}
