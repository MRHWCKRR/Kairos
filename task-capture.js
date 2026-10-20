import {mountDialogWindow} from './dialog-window.js?v=1';
import {applyTaskListCommand} from './task-list-model.js?v=12';

export function mountTaskCapture({document=globalThis.document,window=globalThis.window,getIdentity,getState,commit,confirmClear=async()=>false,storage,uuid=()=>window.crypto.randomUUID(),now=Date.now}={}) {
    if(!storage)try{storage=window.localStorage}catch{}
    const dialog=document.createElement('dialog');
    dialog.className='task-capture-dialog';dialog.setAttribute('aria-labelledby','task-capture-title');
    dialog.innerHTML=`<form novalidate><header><h2 id="task-capture-title">New task</h2><button type="button" data-capture-close aria-label="Close new task">Close</button></header>
        <label>Task title<input name="title" maxlength="180" autocomplete="off" required placeholder="What needs doing?"></label>
        <div class="task-capture-location"><label>Board<select name="boardId" required></select></label><label>Section<select name="sectionId" required></select></label></div>
        <details><summary>Date, deadline &amp; estimate</summary><div class="task-capture-options"><label>Date<input name="date" type="date"></label><label>Deadline<input name="dueDate" type="date"></label><label>Estimate (minutes)<input name="estimatedMinutes" type="number" min="1" max="1440" step="1" placeholder="Optional"></label></div><p class="task-capture-hint">A date adds the task to that day without setting a start time.</p></details>
        <div class="task-capture-feedback"><p data-capture-status role="status" aria-live="polite"></p><button type="button" data-capture-undo hidden>Undo</button></div><footer><button type="button" data-capture-clear hidden>Clear recovery</button><button type="submit" data-capture-save>Create task</button></footer></form>`;
    document.body.appendChild(dialog);
    const dialogWindow=mountDialogWindow({dialog,window});
    const find=selector=>dialog.querySelector(selector),field=name=>find('[name="'+name+'"]');
    let identity=null,generation=0,busy=false,pending=null,undoSource=null,opener=null,disposed=false,message='',draft={};
    const scope=()=>{const id=getIdentity();return id?.ownerId&&id.planId?JSON.stringify([id.ownerId,id.planId]):null};
    const key=()=>identity?'kairos-global-capture:'+identity:null;
    const visible=()=>dialog.hasAttribute('open');
    const empty=()=>({title:'',boardId:'',sectionId:'',date:'',dueDate:'',estimatedMinutes:''});
    function read(){try{return JSON.parse(storage?.getItem(key())||'null')}catch{return null}}
    function valid(record){
        const id=getIdentity();
        if(!record||record.identity?.ownerId!==id?.ownerId||record.identity?.planId!==id?.planId||typeof record.identity.operationId!=='string'||!record.identity.operationId.startsWith('capture-')||!Number.isFinite(record.identity.createdAt)||record.identity.createdAt<=0)return false;
        if(record.command?.type==='undo_create_task'){
            const expected=record.expected;
            if(typeof expected?.boardId!=='string'||typeof expected?.sectionId!=='string'||!expected.task||expected.task.id!==record.command.target?.taskId)return false;
            try{applyTaskListCommand({boards:[{id:expected.boardId,sections:[{id:expected.sectionId,tasks:[expected.task]}]}]},record.command,expected);return true}catch{return false}
        }
        if(record.command?.type!=='create_task')return false;
        const target=record.command.target;
        if(typeof target?.boardId!=='string'||typeof target?.sectionId!=='string')return false;
        try{applyTaskListCommand({boards:[{id:target.boardId,sections:[{id:target.sectionId,tasks:[]}]}]},record.command,record.expected);return true}catch{return false}
    }
    function restore(record){
        pending=record;undoSource=null;
        if(record.command.type==='undo_create_task'){
            draft=Object.fromEntries(Object.entries(empty()).map(([key,value])=>[key,typeof record.draft?.[key]==='string'?record.draft[key]:value]));
            message='A previous Undo is unconfirmed. Retry uses the same operation.';
        }else{draft={...empty(),...record.command.target,...record.command.task,estimatedMinutes:record.command.task.estimatedMinutes??''};message='A previous save is unconfirmed. Retry uses the same task.'}
    }
    function close(restoreFocus=true){
        if(busy)return false;
        dialogWindow.stop();if(dialog.close)dialog.close();else dialog.removeAttribute('open');
        if(restoreFocus&&opener?.isConnected)opener.focus?.();return true;
    }
    function sync(){
        if(disposed)return;
        const next=scope();
        if(next!==identity){generation++;busy=false;close(false);identity=next;pending=null;undoSource=null;draft=empty();message='';const saved=identity?read():null;if(valid(saved))restore(saved);}
        for(const button of document.querySelectorAll('[data-task-capture-open]'))button.disabled=!getIdentity()?.ownerId;
        if(visible())render();
    }
    const activeBoards=()=>identity?(getState().boards||[]).filter(board=>!board.archived):[];
    function options(select,items,wanted,missing){
        select.replaceChildren();
        for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.title||'Untitled';select.appendChild(option)}
        if(wanted&&!items.some(item=>item.id===wanted)){const option=document.createElement('option');option.value=wanted;option.textContent=missing;select.appendChild(option)}
        if(!select.children.length){const option=document.createElement('option');option.value='';option.textContent=missing;select.appendChild(option)}
        const chosen=wanted||items[0]?.id||'';
        for(const option of select.querySelectorAll('option'))option.selected=option.value===chosen;
        return chosen;
    }
    function render(){
        const boards=activeBoards();
        draft.boardId=options(field('boardId'),boards,draft.boardId,'No board available');
        const board=boards.find(item=>item.id===draft.boardId),sections=(board?.sections||[]).filter(section=>!section.archived);
        draft.sectionId=options(field('sectionId'),sections,draft.sectionId,'No section available');
        for(const name of ['title','date','dueDate','estimatedMinutes'])field(name).value=String(draft[name]??'');
        for(const input of dialog.querySelectorAll('input,select'))input.disabled=busy||!!pending||!identity;
        find('[data-capture-save]').disabled=busy||!identity||(!pending&&(!board||!sections.some(section=>section.id===draft.sectionId)));
        find('[data-capture-save]').textContent=busy?'Saving…':pending?.command.type==='undo_create_task'?'Retry Undo':pending?'Retry save':'Create task';
        find('[data-capture-undo]').hidden=!undoSource||!!pending;find('[data-capture-undo]').disabled=busy;
        find('[data-capture-close]').disabled=busy;
        find('[data-capture-clear]').hidden=!pending;find('[data-capture-clear]').disabled=busy;
        find('[data-capture-status]').textContent=message||(!identity?'Your planner is loading. Close and try again once it is ready.':!boards.length?'Create a board and section in Routines & Tasks first.':!sections.length?'Add a section to this board in Routines & Tasks first.':'');
        dialog.setAttribute('aria-busy',String(busy));
    }
    function open(){
        if(disposed||[...document.querySelectorAll('dialog[open]')].some(item=>item!==dialog))return false;
        sync();if(!getIdentity()?.ownerId)return false;
        const saved=identity?read():null;if(valid(saved)&&saved.identity.operationId!==pending?.identity.operationId)restore(saved);
        opener=document.activeElement;render();if(!visible()){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialogWindow.reset()}
        (pending?find('[data-capture-save]'):field('title')).focus?.();return true;
    }
    async function submit(){
        sync();if(disposed||busy||!identity||!visible())return false;
        const storageKey=key();
        try{
            const existing=read();
            if(valid(existing)&&existing.identity.operationId!==pending?.identity.operationId){restore(existing);render();return false}
            if(!pending){
                const target={boardId:draft.boardId,sectionId:draft.sectionId},task={id:'task-'+uuid(),title:draft.title.trim()};
                for(const name of ['date','dueDate'])if(draft[name])task[name]=draft[name];
                if(draft.estimatedMinutes!=='')task.estimatedMinutes=Number(draft.estimatedMinutes);
                const command={type:'create_task',target,task},expected={...target},id=getIdentity();
                applyTaskListCommand(getState(),command,expected);
                const record={command,expected,identity:{ownerId:id.ownerId,planId:id.planId,operationId:'capture-'+uuid(),createdAt:now()}};
                if(!storage)throw Error('Recovery storage is unavailable. Nothing was submitted.');
                try{storage.setItem(storageKey,JSON.stringify(record))}catch{throw Error('Could not retain recovery data. Nothing was submitted.')}
                pending=record;
            }
        }catch(error){message=error.message;render();return false}
        return savePending();
    }
    async function savePending(){
        const actor=identity,ticket=generation,storageKey=key(),attempt=structuredClone(pending),undoing=attempt.command.type==='undo_create_task';
        busy=true;message=undoing?'Undoing task creation…':'Saving task…';render();
        try{
            const result=await commit(attempt.command,attempt.expected,attempt.identity);
            if(disposed||generation!==ticket||scope()!==actor)return false;
            // A stale tab must not clear a newer capture's recovery request.
            if(read()?.identity?.operationId===attempt.identity.operationId)storage.removeItem(storageKey);
            pending=null;
            undoSource=!undoing&&result?.createdTask?{operationId:attempt.identity.operationId,target:attempt.command.target,task:structuredClone(result.createdTask)}:null;
            if(!undoing)draft={...empty(),boardId:draft.boardId,sectionId:draft.sectionId};
            message=undoing?'Task creation undone. The task is in Archive.':'Task created.';return true;
        }catch(error){if(!disposed&&generation===ticket&&scope()===actor)message=(undoing?'Could not confirm Undo. Retry uses the same operation. ':'Could not confirm this save. Retry uses the same task. ')+error.message;return false}
        finally{if(!disposed&&generation===ticket&&scope()===actor){busy=false;render();if(!pending)field('title').focus?.()}}
    }
    async function undo(){
        sync();if(disposed||busy||pending||!undoSource||!identity||!visible())return false;
        try{
            const existing=read();if(valid(existing)){restore(existing);render();return false}
            const command={type:'undo_create_task',target:{taskId:undoSource.task.id},sourceOperationId:undoSource.operationId},expected={...undoSource.target,task:structuredClone(undoSource.task)},id=getIdentity();
            applyTaskListCommand(getState(),command,expected);
            const record={command,expected,draft:{...draft},identity:{ownerId:id.ownerId,planId:id.planId,operationId:'capture-undo-'+uuid(),createdAt:now()}};
            if(!storage)throw Error('Recovery storage is unavailable. Nothing was submitted.');
            try{storage.setItem(key(),JSON.stringify(record))}catch{throw Error('Could not retain recovery data. Nothing was submitted.')}
            pending=record;
        }catch(error){message=error.message;render();return false}
        return savePending();
    }
    async function clearRecovery(){
        if(!pending||busy)return;
        const ticket=generation,id=pending.identity.operationId,retainedDraft=pending.command.type==='undo_create_task'?{...draft}:empty();
        const confirmation=pending.command.type==='undo_create_task'?'This Undo may already have archived the task. Check Archive and Routines & Tasks before clearing recovery. Clearing does not change saved tasks. Continue?':'This task may already have saved. Check Routines & Tasks before clearing recovery. Clearing does not delete a saved task. Continue?';
        if(!await confirmClear(confirmation))return;
        if(disposed||ticket!==generation||scope()!==identity||pending?.identity.operationId!==id)return;
        try{if(read()?.identity?.operationId===id)storage.removeItem(key());pending=null;undoSource=null;draft=retainedDraft;message='Recovery cleared. Existing tasks were not changed.'}catch{message='Recovery could not be cleared. Try again.'}render();
    }
    const onInput=event=>{const name=event.target.name;if(!busy&&!pending&&Object.hasOwn(draft,name))draft[name]=event.target.value};
    const onChange=event=>{onInput(event);if(event.target===field('boardId')&&!pending){draft.sectionId='';render()}};
    const onSubmit=event=>{event.preventDefault();void submit()};
    const onCancel=event=>{event.preventDefault();close()};
    const onClick=event=>{if(event.target.closest('[data-task-capture-open]'))open()};
    find('form').addEventListener('submit',onSubmit);dialog.addEventListener('input',onInput);dialog.addEventListener('change',onChange);dialog.addEventListener('cancel',onCancel);
    find('[data-capture-close]').addEventListener('click',()=>close());find('[data-capture-clear]').addEventListener('click',()=>void clearRecovery());find('[data-capture-undo]').addEventListener('click',()=>void undo());document.addEventListener('click',onClick);
    sync();
    return {open,close,sync,submit,undo,dispose(){disposed=true;generation++;busy=false;dialogWindow.dispose();dialog.remove();document.removeEventListener('click',onClick)}};
}
