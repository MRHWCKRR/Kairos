import {stableStringify} from './plan-merge.js';
import {taskDetailValues,TASK_DETAIL_FIELDS,applyTaskListCommand} from './task-list-model.js';
import {recurrenceFieldsMarkup,bindRecurrenceFields,readRecurrenceFields} from './schedule-recurrence-ui.js';
import {t} from './i18n.js';

const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
export function mountTaskDetailPane({root,resolveTarget,commit,getOwnerId,getPlanId=()=>null,onClose=()=>{},openSchedule,document=globalThis.document,window=globalThis.window}){
    let panel=null,form=null,target=null,baseline=null,displayBaseline=null,location=null,owner=null,planId=null,opener=null,pending=null,busy=false,dialog=null,choiceDialog=null,choiceFinish=null,revision=0;
    const copy=key=>t('task_detail_'+key,document.documentElement.lang||'en');
    const field=name=>form?.querySelector('[name="'+name+'"]');
    const key=()=> 'kairos-task-detail-pending:'+owner+':'+planId;
    function status(message,error=false){const el=panel?.querySelector('[role="status"]');if(el){el.textContent=message;el.classList.toggle('is-error',error)}}
    function remember(){try{window.sessionStorage?.setItem(key(),JSON.stringify(pending))}catch{}}
    function forget(){try{window.sessionStorage?.removeItem(key())}catch{}}
    function read(){
        const result={...baseline};
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
    function dirty(){try{return !!pending||Object.keys(edits()).length>0}catch{return true}}
    function updateControls(){
        panel?.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=busy||!!pending);
        if(form){const save=form.querySelector('[type="submit"]');save.disabled=busy;save.textContent=copy(pending?'retry':'save')}
    }
    function close(){
        revision++;
        const returnFocus=opener?.isConnected?opener:[...root.querySelectorAll('[data-task-detail]')].find(el=>el.dataset.taskDetail===target?.taskId);
        choiceFinish?.('stay');choiceDialog?.remove();choiceDialog=null;
        dialog?.close?.();dialog?.remove();dialog=null;panel?.remove();panel=null;form=null;target=null;pending=null;busy=false;
        root.classList.remove('has-task-details');returnFocus?.focus?.();onClose();
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
        if(dirty()){const answer=await chooseDraft();if(answer==='stay')return false;if(answer==='save'&&!await save())return false;if(answer==='discard')forget();}
        close();return true;
    }
    function trap(event,surface){
        if(event.key!=='Tab')return;
        const controls=[...surface.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.type!=='hidden'&&!el.closest('[hidden]'));
        if(!controls.length)return;
        if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus?.()}
        else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus?.()}
    }
    function maximise(){
        if(!panel||busy)return;
        if(dialog){dialog.close?.();root.appendChild(panel);dialog.remove();dialog=null;panel.querySelector('[data-maximise]').textContent=copy('expand');return;}
        dialog=document.createElement('dialog');dialog.className='task-detail-expanded';dialog.setAttribute('aria-labelledby','task-detail-heading');document.body.appendChild(dialog);dialog.appendChild(panel);
        panel.querySelector('[data-maximise]').textContent=copy('shrink');
        dialog.addEventListener('cancel',event=>{event.preventDefault();void requestClose()});
        if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');field('title').focus?.();
    }
    function render(found){
        const values=baseline;
        panel=document.createElement('aside');panel.className='task-detail-pane';panel.dataset.taskDetailPane='';panel.setAttribute('aria-labelledby','task-detail-heading');
        const input=(name,label,type='text',attrs='')=>`<label>${esc(label)}<input name="${name}" type="${type}" ${attrs} value="${esc(values[name])}"></label>`;
        const select=(name,label,options)=>`<label>${esc(label)}<select name="${name}">${options.map(([value,text])=>`<option value="${value}" ${String(values[name]??'')===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
        const reminder=values.reminderMinutes;
        panel.innerHTML=`<header class="task-detail-header"><h2 id="task-detail-heading">${esc(copy('heading'))}</h2><div><button type="button" data-maximise>${esc(copy('expand'))}</button><button type="button" data-close aria-label="${esc(copy('close'))}">×</button></div></header>
          <p class="task-detail-location">${esc(found.board.title)} / ${esc(found.section.title)}</p>
          <form class="task-detail-form" novalidate>
          ${input('title',copy('title'),'text','maxlength="180" required')}
          <label>${esc(copy('notes'))}<textarea name="notes" rows="5" maxlength="3000">${esc(values.notes)}</textarea></label>
          <div class="task-detail-grid">${input('date',copy('date'),'date')}${input('startTime',copy('start'),'time','step="60"')}${input('durationMinutes',copy('duration'),'number','min="1" max="1439" step="1" required')}${input('dueDate',copy('deadline'),'date')}</div>
          <div class="task-detail-grid">${select('priority',copy('priority'),[['',copy('none')],['low',copy('low')],['medium',copy('medium')],['high',copy('high')]])}${input('reminderMinutes',copy('reminder'),'number','min="1" max="10080" step="1"')}</div>
          <p class="task-detail-hint">${esc(copy('reminder_hint'))}</p>
          ${values.recurrence?.enabled?'<p class="task-detail-series">'+esc(copy('series'))+'</p>':''}
          ${recurrenceFieldsMarkup(found.task,{fallbackDate:found.task.date||null})}
          <details><summary>${esc(copy('more'))}</summary><div class="task-detail-grid">${select('schedulingPreference',copy('preference'),[['',copy('none')],['morning',copy('morning')],['afternoon',copy('afternoon')],['evening',copy('evening')]])}${input('color',copy('color'),'text','maxlength="7" placeholder="#a855f7"')}</div>
          <label class="task-detail-check"><input name="scheduleLocked" type="checkbox" ${values.scheduleLocked?'checked':''}>${esc(copy('lock'))}</label></details>
          <p role="status" aria-live="polite">${esc(copy('saved'))}</p>
          <div class="task-detail-actions"><button type="submit" class="task-detail-primary">${esc(copy('save'))}</button><button type="button" data-close>${esc(copy('close'))}</button>${openSchedule?'<button type="button" data-schedule>'+esc(copy('schedule'))+'</button>':''}</div>
          </form>`;
        root.appendChild(panel);root.classList.add('has-task-details');form=panel.querySelector('form');
        bindRecurrenceFields(form,{fallbackDate:found.task.date||values.recurrence?.startDate||null});
        displayBaseline=read();
        if(pending){for(const [name,value] of Object.entries(pending.command.changes)){const el=field(name);if(el){if(el.type==='checkbox')el.checked=value===true;else el.value=value??''}}status(copy('uncertain'),true)}
        form.addEventListener('input',()=>{if(!busy&&!pending)status(copy('unsaved'))});form.addEventListener('change',()=>{if(!busy&&!pending)status(copy('unsaved'))});
        form.addEventListener('submit',event=>{event.preventDefault();void save()});
        panel.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>void requestClose()));
        panel.querySelector('[data-maximise]').addEventListener('click',maximise);
        panel.querySelector('[data-schedule]')?.addEventListener('click',async()=>{const selected={...target};if(await requestClose())openSchedule(selected)});
        panel.addEventListener('keydown',event=>{
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void requestClose()}
            else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void save()}
            else if(dialog)trap(event,panel);
        });
        updateControls();field('title').focus?.();
    }
    async function open(selected,source=document.activeElement){
        if(panel&&!await requestClose())return false;
        let found;try{found=resolveTarget(selected)}catch{return false}
        owner=getOwnerId();if(!owner)return false;planId=getPlanId();target={...selected};opener=source;baseline=taskDetailValues(found.task);location={boardId:found.board.id,sectionId:found.section.id};pending=null;
        try{const stored=JSON.parse(window.sessionStorage?.getItem(key())||'null');if(stored?.command?.target?.taskId===target.taskId&&stored.identity?.ownerId===owner&&stored.identity?.planId===planId&&stored.baseline){pending=stored;baseline=stored.baseline;location={boardId:stored.expected.boardId,sectionId:stored.expected.sectionId}}}catch{}
        render(found);if(window.innerWidth<1100)maximise();return true;
    }
    async function save(){
        if(!panel||busy)return false;
        const ticket=revision;
        if(owner!==getOwnerId()||planId!==getPlanId()){forget();close();return false}
        try{
            const found=resolveTarget(target);
            if(!pending){const changes=edits();if(!Object.keys(changes).length){status(copy('saved'));return true}
                const command={type:'edit_task',target:{...target},changes},expected={...location,fields:structuredClone(baseline)};
                applyTaskListCommand({boards:[{...found.board,sections:[{...found.section,tasks:[found.task]}]}]},command,expected);
                pending={command,expected,baseline:structuredClone(baseline),identity:{ownerId:owner,planId,operationId:'task-detail-'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),createdAt:Date.now()}};remember();
            }
            busy=true;updateControls();status(copy('saving'));
            const result=await commit(pending.command,pending.expected,pending.identity);
            if(ticket!==revision)return false;
            if(owner!==getOwnerId()||planId!==getPlanId()){forget();close();return false}
            const fresh=resolveTarget(target),expanded=dialog,focused=document.activeElement?.name;
            baseline=taskDetailValues(fresh.task);forget();pending=null;busy=false;panel.remove();render(fresh);
            if(expanded){expanded.appendChild(panel);panel.querySelector('[data-maximise]').textContent=copy('shrink')}
            if(focused)field(focused)?.focus?.();status(copy('saved'));return !!result;
        }catch(error){if(ticket!==revision)return false;busy=false;updateControls();status(copy('failed')+' '+error.message,true);return false}
    }
    function sync(){if(panel&&(owner!==getOwnerId()||planId!==getPlanId())){forget();close()}}
    return {open,save,requestClose,maximise,sync,dispose:close};
}
