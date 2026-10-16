import {applyTaskListCommand,buildTaskBatch,buildTaskTool,taskDetailValues,taskListLocation,taskListSection} from './task-list-model.js';
import {mountSectionOrganisation} from './task-section-organisation.js';
import {openTaskFieldDialog} from './task-tools-dialog.js';
import {t} from './i18n.js';
import {confirmDialog} from './ui-dialogs.js?v=1';

const ids=section=>(section.tasks||[]).map(task=>task.id);
const location=found=>({boardId:found.board.id,sectionId:found.section.id});
const key=target=>JSON.stringify([target.boardId,target.sectionId]);
const actionTypes=['move_section','reorder_sections','reorder_tasks','move_task','complete_task','archive_task','task_batch','task_tool','undo_task_list'];
const closesDetails=command=>{const value=command.type==='undo_task_list'?command.inverse?.command:command;return ['task_tool','restore_task_fields','archive_task','move_task','move_section','reorder_sections'].includes(value?.type)||(['task_batch','restore_task_batch'].includes(value?.type)&&['archive','archived','move'].includes(value.action))};
const sectionMutation=command=>['move_section','reorder_sections'].includes((command.type==='undo_task_list'?command.inverse?.command:command)?.type);
const previews=command=>['complete_task','reorder_tasks'].includes(command.type)||(command.type==='task_batch'&&['complete','incomplete','move'].includes(command.action));

export function mountTaskListInteractions({root,getState,getOwnerId,getPlanId,commit,refresh=()=>{},ensurePlan=async()=>true,requestCloseDetails=async()=>true,onConfirmed=()=>{},getViewKey=()=>'',getSelectedTaskIds=()=>[],isSorted=()=>false,scrollElement=root.closest('.main-content')||root,document=root.ownerDocument,window=document.defaultView,clock=()=>Date.now(),storage,sectionBlocked=()=>false,setTimer=(fn,ms)=>window.setTimeout(fn,ms),clearTimer=id=>window.clearTimeout(id),requestFrame=fn=>window.requestAnimationFrame(fn),cancelFrame=id=>window.cancelAnimationFrame(id),confirmArchive=message=>confirmDialog(message),confirmDiscard=message=>confirmDialog(message)}={}){
    const copy=name=>t('task_order_'+name,document.documentElement.lang||'en');
    const sameBatchView=(command,view)=>!(['task_batch','task_tool','move_section','reorder_sections'].includes(command.type)||['restore_task_batch','restore_task_fields','move_section','reorder_sections'].includes(command.inverse?.command?.type))||(root.classList.contains('active')&&getViewKey()===view);
    try{storage??=window.sessionStorage}catch{}
    const bar=document.createElement('div');bar.className='task-order-status';bar.dataset.taskOrderStatus='';bar.setAttribute('aria-live','polite');
    const message=document.createElement('span');message.setAttribute('role','status');bar.appendChild(message);
    const button=(attribute,label)=>{const el=document.createElement('button');el.type='button';el.setAttribute(attribute,'');el.textContent=copy(label);el.hidden=true;bar.appendChild(el);return el};
    const undoButton=button('data-task-undo','undo'),retryButton=button('data-task-retry','retry'),discardButton=button('data-task-discard','discard');root.appendChild(bar);
    let owner,plan,generation=0,busy=false,pending=null,preview=null,undoState=null,timer=null,drag=null,frame=null,moveDialog=null,moveDialogView=null,fieldDialog=null,fieldDialogView=null,disposed=false,suppressPointer=null;
    const sections=mountSectionOrganisation({root,getState,getIdentity:()=>({ownerId:getOwnerId(),planId:getPlanId()}),getViewKey,blocked:()=>busy||!!pending||sectionBlocked(),execute,reportError:text=>{message.textContent=text;decorate()},scrollElement,document,window,requestFrame,cancelFrame});
    const storageKey=()=> 'kairos-task-order-pending:'+owner+':'+plan;
    function remember(){try{if(pending)storage?.setItem(storageKey(),JSON.stringify(pending));else storage?.removeItem(storageKey())}catch{}}
    function clearUndo(){if(timer!==null)clearTimer(timer);timer=null;undoState=null;undoButton.hidden=true;if(message.textContent===copy('saved_undo'))message.textContent=copy('saved')}
    function cancelDrag(){
        const saved=drag;drag=null;if(saved?.active)suppressPointer=saved.pointerId;
        if(frame!==null)cancelFrame(frame);frame=null;
        if(saved){try{root.releasePointerCapture?.(saved.pointerId)}catch{}saved.row?.classList.remove('task-dragging');saved.badge?.remove()}
        for(const row of root.querySelectorAll('.task-group-dragging'))row.classList.remove('task-group-dragging');
        for(const el of root.querySelectorAll('.task-drop-before,.task-drop-after,.task-drop-empty'))el.classList.remove('task-drop-before','task-drop-after','task-drop-empty');drag=null;
    }
    function sync(){
        if(!root.classList.contains('active')){cancelDrag();sections.cancel()}
        if(moveDialog&&(!root.classList.contains('active')||moveDialogView!==getViewKey())){moveDialog.remove();moveDialog=null}
        if(fieldDialog&&(!root.classList.contains('active')||fieldDialogView!==getViewKey()))fieldDialog.dispose();
        if(owner===getOwnerId()&&plan===getPlanId())return false;
        generation++;owner=getOwnerId();plan=getPlanId();cancelDrag();moveDialog?.remove();moveDialog=null;fieldDialog?.dispose();fieldDialog=null;clearUndo();pending=null;preview=null;busy=false;message.textContent='';
        try{const saved=JSON.parse(storage?.getItem(storageKey())||'null');if(owner&&plan&&saved?.identity?.ownerId===owner&&saved.identity.planId===plan&&typeof saved.identity.operationId==='string'&&saved.identity.operationId&&Number.isFinite(saved.identity.createdAt)&&saved.identity.createdAt>0&&actionTypes.includes(saved.command?.type)&&saved.expected&&typeof saved.expected==='object')pending=saved}catch{}
        if(pending)message.textContent=copy('uncertain');return true;
    }
    // The optimistic state is display-only. Canonical planner data and durable
    // receipts remain untouched until the host confirms and reloads the save.
    function getDisplayState(){
        const state=getState(),operation=preview;
        if(!operation||operation.identity.ownerId!==getOwnerId()||operation.identity.planId!==getPlanId())return state;
        try{return applyTaskListCommand(state,operation.command,operation.expected,{now:clock()}).next}
        catch{return state} // The saved result or a conflicting update is already visible.
    }
    function decorate(){
        if(disposed)return;sync();sections.decorate();
        if(drag&&(!drag.row.isConnected||drag.view!==getViewKey()||isSorted()))cancelDrag();
        const operation=pending?.command?.type==='undo_task_list'?pending.command.inverse?.command:pending?.command;
        // Inline saves still address canonical sections; a location preview must
        // not accept edits against its unconfirmed destination (or uncertain Undo).
        const moving=new Set(['task_batch','restore_task_batch'].includes(operation?.type)&&operation.action==='move'?operation.taskIds:[]);
        const entries=new Map(),groups=new Map();for(const board of getState().boards||[])for(const section of board.sections||[])for(const task of section.tasks||[]){const unavailable=board.archived||section.archived||task.archived;entries.set(task.id,entries.has(task.id)||unavailable?null:{board,section,task})}
        for(const row of root.querySelectorAll('[data-detail-row]')){
            const found=entries.get(row.dataset.detailRow);if(!groups.has(row.parentElement))groups.set(row.parentElement,new Map([...row.parentElement.children].filter(el=>el.matches('[data-detail-row]')&&!el.hidden).map((el,index)=>[el,index])));const positions=groups.get(row.parentElement),index=positions.get(row);
            for(const control of row.querySelectorAll('[data-task-action]'))control.disabled=busy||!!pending||!found||isSorted()||(control.dataset.taskAction==='up'&&index<=0)||(control.dataset.taskAction==='down'&&index===positions.size-1);
            const check=row.querySelector('[data-task-list-complete]');if(check)check.disabled=busy||!!pending||!found||found.task.recurrence?.enabled===true;
            const locked=moving.has(row.dataset.detailRow),title=row.querySelector('.task-text'),date=row.querySelector('.task-date-input');
            if(title)title.disabled=!found||locked;
            if(date)date.disabled=!found||found.task.recurrence?.enabled===true||locked;
            for(const field of [title,date].filter(Boolean)){if(locked){field.title=copy('batch_move_wait');field.dataset.taskMovePending=''}else if(field.hasAttribute('data-task-move-pending')){field.removeAttribute('title');delete field.dataset.taskMovePending}}
            const archive=row.querySelector('[data-task-list-archive]');if(archive)archive.disabled=busy||!!pending||!found;
        }
        retryButton.hidden=!pending;retryButton.disabled=busy||!!(pending&&sectionMutation(pending.command)&&sectionBlocked());discardButton.hidden=!pending;discardButton.disabled=busy;undoButton.disabled=busy||!!pending||!!(undoState&&sectionMutation(undoState.inverse.command)&&sectionBlocked());
        if(undoState&&clock()>=undoState.expiresAt)clearUndo();bar.hidden=!message.textContent&&!pending&&!undoState;
    }
    function focusSnapshot(command){
        const active=document.activeElement,row=active?.closest?.('[data-detail-row]'),source=[...root.querySelectorAll('[data-detail-row]')].find(el=>el.dataset.detailRow===(command.target?.taskId||command.taskIds?.[0])&&!el.closest('[hidden]')),chosen=row||source;
        const section=active?.closest?.('.board-section-block,[data-focused-section]'),sectionControl=active?.closest?.('[data-section-drag],[data-section-menu]');
        return {section:sectionControl&&section?{boardId:section.dataset.boardId,sectionId:section.dataset.sectionId,menu:sectionControl.hasAttribute('data-section-menu')}:null,element:active,view:getViewKey(),scroll:scrollElement.scrollTop,id:chosen?.dataset.detailRow,action:active?.dataset?.taskAction,index:chosen?[...chosen.parentElement.children].filter(el=>el.matches('[data-detail-row]')&&!el.hidden).indexOf(chosen):-1};
    }
    function restoreFocus(snapshot){
        if(!root.classList.contains('active')||getViewKey()!==snapshot.view)return;
        const active=document.activeElement,meaningful=active&&active.isConnected&&active!==document.body&&active!==document.documentElement;
        // A user may continue typing, focusing another control or scrolling while
        // a save is in flight. Preserve that newer activity instead of restoring it.
        if(scrollElement.scrollTop!==snapshot.scroll||(meaningful&&active!==snapshot.element))return;
        if(snapshot.section){const block=[...root.querySelectorAll('.board-section-block,[data-focused-section]')].find(el=>el.dataset.sectionId===snapshot.section.sectionId&&!el.closest('[hidden]'));block?.querySelector(snapshot.section.menu?'[data-section-menu]':'[data-section-drag]')?.focus?.({preventScroll:true});return}
        const rows=[...root.querySelectorAll('[data-detail-row]')].filter(row=>!row.closest('[hidden]')),row=rows.find(row=>row.dataset.detailRow===snapshot.id)||rows[Math.max(0,Math.min(snapshot.index,rows.length-1))];
        const control=row?.querySelector(snapshot.action?'[data-task-action="'+snapshot.action+'"]':'[data-task-action="drag"]');
        (control&&!control.disabled?control:row||root.querySelector('[data-quick-title],[data-open-section]'))?.focus?.({preventScroll:true});
    }
    async function reconcile(){
        sync();if(!pending||busy||(sectionMutation(pending.command)&&sectionBlocked()))return false;const original=pending,ticket=generation,snapshot=focusSnapshot(original.command);busy=true;message.textContent=copy('saving');clearUndo();decorate();
        try{
            if(closesDetails(original.command)&&!await requestCloseDetails()){message.textContent=copy('uncertain');return false}
            if(disposed||ticket!==generation||pending!==original||getOwnerId()!==original.identity.ownerId||getPlanId()!==original.identity.planId||(!sameBatchView(original.command,snapshot.view)||(sectionMutation(original.command)&&sectionBlocked())))return false;
            if(previews(original.command)){
                preview=original;refresh();decorate();
            }
            const result=await commit(original.command,original.expected,original.identity);
            if(disposed||ticket!==generation||getOwnerId()!==original.identity.ownerId||getPlanId()!==original.identity.planId)return false;
            preview=null;pending=null;remember();message.textContent=copy('saved');
            if(original.command.type!=='undo_task_list'&&original.inverse){undoState={inverse:original.inverse,expiresAt:clock()+10000};message.textContent=copy('saved_undo');undoButton.hidden=false;timer=setTimer(()=>{clearUndo();decorate()},10000);timer?.unref?.()}
            try{await onConfirmed(original.command,result)}catch(error){console.warn('[Kairos] Post-save task update failed.',error)}
            return true;
        }catch(error){if(!disposed&&ticket===generation&&getOwnerId()===original.identity.ownerId&&getPlanId()===original.identity.planId){message.textContent=copy('uncertain')+' '+error.message;remember()}return false}
        finally{if(preview===original)preview=null;if(!disposed&&ticket===generation&&getOwnerId()===original.identity.ownerId&&getPlanId()===original.identity.planId){busy=false;refresh();decorate();restoreFocus(snapshot)}else if(!disposed){sync();decorate()}}
    }
    async function execute(command,expected){
        sync();if(busy||pending||!owner||(sectionMutation(command)&&sectionBlocked()))return false;busy=true;const actor=owner,originalPlan=plan,originalGeneration=generation,originalView=getViewKey();let operationGeneration=generation;
        try{
            if(closesDetails(command)&&!await requestCloseDetails())return false;
            if(disposed||getOwnerId()!==actor||getPlanId()!==originalPlan||generation!==originalGeneration||(!sameBatchView(command,originalView)||(sectionMutation(command)&&sectionBlocked())))return false;
            const ready=await ensurePlan();
            if(!ready||disposed||getOwnerId()!==actor||(originalPlan!==null&&(getPlanId()!==originalPlan||generation!==originalGeneration))||(originalPlan===null&&ready!==getPlanId())||!sameBatchView(command,originalView))return false;
            sync();operationGeneration=generation;busy=true;if(!plan)return false;
            const applied=applyTaskListCommand(getState(),command,expected,{now:clock()}),uuid=()=>window.crypto?.randomUUID?.()||globalThis.crypto.randomUUID();
            pending={command:structuredClone(command),expected:structuredClone(expected),inverse:applied.result.inverse?structuredClone(applied.result.inverse):null,identity:{ownerId:owner,planId:plan,operationId:'task-list-'+uuid(),createdAt:clock()}};remember();
        }catch(error){if(operationGeneration===generation){message.textContent=error.message;refresh()}return false}
        finally{if(operationGeneration===generation)busy=false;else sync();decorate()}
        return reconcile();
    }
    async function undo(){
        sync();if(!undoState||clock()>=undoState.expiresAt||busy||pending){if(undoState&&clock()>=undoState.expiresAt)clearUndo();return false}
        const command={type:'undo_task_list',inverse:structuredClone(undoState.inverse),expiresAt:undoState.expiresAt};return execute(command,{});
    }
    async function discard(){
        sync();if(!pending||busy)return false;const original=pending,ticket=generation;
        if(!await confirmDiscard(copy('discard_warning'))||ticket!==generation||getOwnerId()!==owner||getPlanId()!==plan||pending!==original||disposed)return false;
        pending=null;remember();message.textContent=copy('discarded');refresh();decorate();return true;
    }
    function sourceFor(row){return taskListLocation(getState(),row.dataset.detailRow)}
    function destinationFor(element){
        const block=element?.closest?.('.board-section-block,[data-focused-section]');if(!block||!root.contains(block)||block.hidden)return null;
        const target={boardId:block.dataset.boardId,sectionId:block.dataset.sectionId};try{taskListSection(getState(),target);return {target,block}}catch{return null}
    }
    function orderedAction(source,destination,anchorId=null,after=false,orders=null){
        const sourceTarget=location(source),destinationSection=taskListSection(getState(),destination.target).section,sourceOrder=orders?.get(key(sourceTarget))||ids(source.section),destinationOrder=orders?.get(key(destination.target))||ids(destinationSection);
        let index=anchorId?destinationOrder.indexOf(anchorId)+(after?1:0):destinationOrder.length;
        if(anchorId&&destinationOrder.indexOf(anchorId)<0)throw new Error(copy('changed'));
        if(key(sourceTarget)===key(destination.target)){
            const taskIds=sourceOrder.filter(id=>id!==source.task.id),oldIndex=sourceOrder.indexOf(source.task.id);if(oldIndex<index)index--;
            taskIds.splice(index,0,source.task.id);if(JSON.stringify(taskIds)===JSON.stringify(sourceOrder))return null;
            return {command:{type:'reorder_tasks',target:{...sourceTarget,taskId:source.task.id},taskIds},expected:{...sourceTarget,order:sourceOrder}};
        }
        return {command:{type:'move_task',target:{taskId:source.task.id},destination:{...destination.target,index}},expected:{...sourceTarget,sourceOrder,destinationOrder}};
    }
    function moveStep(row,direction){
        if(isSorted())return false;const visible=[...row.parentElement.children].filter(el=>el.matches('[data-detail-row]')&&!el.hidden),index=visible.indexOf(row),anchor=visible[index+direction];if(!anchor)return false;
        const source=sourceFor(row),target=location(source),action=orderedAction(source,{target},anchor.dataset.detailRow,direction>0);return action?execute(action.command,action.expected):false;
    }
    function openMove(row,batchIds=null){
        if(moveDialog||busy||pending||isSorted())return;
        const source=sourceFor(row),choices=(getState().boards||[]).filter(board=>!board.archived).flatMap((board,boardIndex)=>(board.sections||[]).filter(section=>!section.archived).map((section,sectionIndex)=>({boardId:board.id,sectionId:section.id,label:board.title+' / '+section.title,boardPosition:boardIndex+1,sectionPosition:sectionIndex+1}))).filter(choice=>batchIds||!(choice.sectionId===source.section.id&&choice.boardId===source.board.id));
        const ticket=generation,originalOwner=owner,originalPlan=plan,originalView=getViewKey(),sourceTarget=location(source),sourceOrder=ids(source.section),batchState=batchIds?structuredClone(getState()):null;
        const labelCounts=new Map();for(const choice of choices)labelCounts.set(choice.label,(labelCounts.get(choice.label)||0)+1);
        const dialog=document.createElement('dialog');dialog.dataset.taskMoveDialog='';dialog.className='task-move-dialog';dialog.setAttribute('aria-label',copy('move'));const label=document.createElement('label');label.textContent=copy('destination');const select=document.createElement('select');label.appendChild(select);dialog.appendChild(label);
        for(const [index,choice] of choices.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=choice.label+(labelCounts.get(choice.label)>1?' ('+copy('board')+' '+choice.boardPosition+', '+copy('section')+' '+choice.sectionPosition+')':'');select.appendChild(option)}
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent=copy('cancel');const save=document.createElement('button');save.type='button';save.dataset.moveConfirm='';save.textContent=copy('move');save.disabled=!choices.length;dialog.append(cancel,save);document.body.appendChild(dialog);moveDialog=dialog;moveDialogView=originalView;
        const close=()=>{dialog.close?.();dialog.remove();moveDialog=null;if(root.classList.contains('active')&&getOwnerId()===originalOwner&&getPlanId()===originalPlan&&getViewKey()===originalView&&!row.closest('[hidden]'))(row.querySelector('[data-task-menu],[data-task-action="move"]')||row)?.focus?.({preventScroll:true})};cancel.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
        save.addEventListener('click',()=>{
            if(ticket!==generation||getOwnerId()!==originalOwner||getPlanId()!==originalPlan||getViewKey()!==originalView||!root.classList.contains('active')){close();return}
            const choice=choices[Number(select.value)];if(!choice)return;
            try{const destination=taskListSection(getState(),choice),operation=batchIds?buildTaskBatch(batchState,'move',batchIds,choice):{command:{type:'move_task',target:{taskId:source.task.id},destination:{boardId:choice.boardId,sectionId:choice.sectionId,index:ids(destination.section).length}},expected:{...sourceTarget,sourceOrder,destinationOrder:ids(destination.section)}};close();void execute(operation.command,operation.expected)}catch(error){message.textContent=error.message;close();decorate()}
        });
        if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');select.focus?.();return true;
    }
    const actionRow=target=>[...root.querySelectorAll('[data-detail-row]')].find(row=>row.dataset.detailRow===target.taskId&&!row.closest('[hidden]'));
    function getActionState(target){
        sync();const row=actionRow(target),visible=row?[...row.parentElement.children].filter(el=>el.matches('[data-detail-row]')&&!el.hidden):[],index=visible.indexOf(row);
        return {busy,pending:!!pending,sorted:isSorted(),canMoveUp:index>0,canMoveDown:index>=0&&index<visible.length-1};
    }
    async function runTaskAction(action,target){
        sync();if(disposed||busy||pending||!owner)return false;const row=actionRow(target);if(!row)return false;
        try{
            const source=sourceFor(row),expected=location(source);
            if(action==='complete')return execute({type:'complete_task',target:{taskId:target.taskId},value:source.task.completed!==true},{...expected,value:source.task.completed===true});
            if(action==='up'||action==='down')return moveStep(row,action==='up'?-1:1);
            if(action==='move')return !!openMove(row);
            if(action==='archive'){
                const actor=owner,capturedPlan=plan,ticket=generation;
                if(!await confirmArchive(copy('archive_warning'))||disposed||ticket!==generation||getOwnerId()!==actor||getPlanId()!==capturedPlan)return false;
                return execute({type:'archive_task',target:{taskId:target.taskId},value:true},{...expected,value:false});
            }
        }catch(error){message.textContent=error.message;decorate()}return false;
    }
    async function runTaskBatch(action,{taskIds}){
        sync();if(disposed||busy||pending||!owner||!root.classList.contains('active'))return false;
        try{
            if(!Array.isArray(taskIds)||!taskIds.length||taskIds.length>50||new Set(taskIds).size!==taskIds.length)throw Error(copy('batch_limit'));
            const rows=[...root.querySelectorAll('[data-detail-row]')].filter(row=>!row.closest('[hidden]')&&taskIds.includes(row.dataset.detailRow)),ordered=[...new Set(rows.map(row=>row.dataset.detailRow))];
            if(ordered.length!==taskIds.length)throw Error('A selected task is no longer visible. Select the tasks again.');
            if(action==='move')return !!openMove(rows[0],ordered);
            const operation=buildTaskBatch(getState(),action,ordered),actor=owner,capturedPlan=plan,ticket=generation,view=getViewKey();
            if(action==='archive'&&!await confirmArchive(copy('batch_archive_warning').replace('{n}',ordered.length)))return false;
            if(disposed||ticket!==generation||getOwnerId()!==actor||getPlanId()!==capturedPlan||getViewKey()!==view||!root.classList.contains('active'))return false;
            return execute(operation.command,operation.expected);
        }catch(error){message.textContent=error.message;decorate()}return false;
    }
    async function runTaskTool(id,{taskIds},sourceElement){
        sync();if(disposed||busy||pending||fieldDialog||!owner||!root.classList.contains('active'))return false;
        try{
            if(!Array.isArray(taskIds)||!taskIds.length||taskIds.length>50||new Set(taskIds).size!==taskIds.length||taskIds.some(id=>!actionRow({taskId:id})))throw Error(copy('batch_limit'));
            if(id==='duplicate'){const operation=buildTaskTool(getState(),'duplicate',taskIds);return execute(operation.command,operation.expected)}
            const field=id.startsWith('set-')?id.slice(4):'',snapshot=structuredClone(getState()),values=taskIds.map(taskId=>taskDetailValues(taskListLocation(snapshot,taskId).task)[field]),initialValue=values.every(value=>JSON.stringify(value)===JSON.stringify(values[0]))?values[0]:undefined;
            const ticket=generation,actor=owner,capturedPlan=plan,view=getViewKey(),label=t('task_tool_'+field,document.documentElement.lang||'en');
            // Validate field/recurrence scope before presenting an editor.
            buildTaskTool(snapshot,'edit',taskIds,{field,value:initialValue});
            fieldDialogView=view;fieldDialog=openTaskFieldDialog({field,label,count:taskIds.length,initialValue,document,translate:key=>t(key,document.documentElement.lang||'en'),onClose:()=>{fieldDialog=null;if(!disposed&&getOwnerId()===actor&&getPlanId()===capturedPlan&&getViewKey()===view&&root.classList.contains('active')&&sourceElement?.isConnected)sourceElement.focus?.({preventScroll:true})},onSubmit:value=>{
                if(disposed||ticket!==generation||getOwnerId()!==actor||getPlanId()!==capturedPlan||getViewKey()!==view||!root.classList.contains('active')){fieldDialog?.dispose();return false}
                if(busy||pending)throw Error(copy('uncertain'));
                const operation=buildTaskTool(snapshot,'edit',taskIds,{field,value});applyTaskListCommand(getState(),operation.command,operation.expected);fieldDialog?.dispose();return execute(operation.command,operation.expected);
            }});return true;
        }catch(error){message.textContent=error.message;decorate()}return false;
    }
    const onClick=event=>{
        const button=event.target.closest?.('button');if(!button)return;
        if(button===undoButton){void undo();return}if(button===retryButton){void reconcile();return}if(button===discardButton){void discard();return}
        const row=button.closest('[data-detail-row]');if(!row)return;
        if(button.matches('[data-task-action],[data-task-list-archive]')){event.preventDefault();event.stopPropagation();if(button.disabled||busy||pending)return;
            void runTaskAction(button.matches('[data-task-list-archive]')?'archive':button.dataset.taskAction,{taskId:row.dataset.detailRow});
        }
    };
    const onChange=event=>{
        if(!event.target.matches('[data-task-list-complete]'))return;event.stopPropagation();const check=event.target,row=check.closest('[data-detail-row]');
        try{const source=sourceFor(row),value=check.checked;check.checked=source.task.completed===true;if(!check.disabled)void execute({type:'complete_task',target:{taskId:source.task.id},value},{...location(source),value:source.task.completed===true})}catch(error){message.textContent=error.message;decorate()}
    };
    const onKey=event=>{
        if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();cancelDrag();return}
        if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||event.target.closest('input,textarea,select')||!event.target.closest('[data-detail-row]')||busy||pending||isSorted())return;
        event.preventDefault();event.stopPropagation();try{moveStep(event.target.closest('[data-detail-row]'),event.key==='ArrowUp'?-1:1)}catch(error){message.textContent=error.message;decorate()}
    };
    const onDown=event=>{
        const grip=event.target.closest?.('[data-task-action="drag"]');if(!grip||grip.disabled||event.button!==0||busy||pending||isSorted())return;
        sync();cancelDrag();suppressPointer=null;grip.focus?.({preventScroll:true});const row=grip.closest('[data-detail-row]');try{const source=sourceFor(row),orders=new Map((getState().boards||[]).flatMap(board=>(board.sections||[]).map(section=>[key({boardId:board.id,sectionId:section.id}),ids(section)])));
            const selected=getSelectedTaskIds(),group=selected.includes(source.task.id)&&selected.length>1;
            if(group&&(selected.length>50||new Set(selected).size!==selected.length))throw Error(copy('batch_limit'));
            const groupIds=group?[...root.querySelectorAll('[data-detail-row]')].filter(row=>!row.closest('[hidden]')&&selected.includes(row.dataset.detailRow)).map(row=>row.dataset.detailRow):null;
            if(group&&groupIds.length!==selected.length)throw Error('A selected task is no longer visible.');
            drag={row,source,orders,groupIds,state:group?structuredClone(getState()):null,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false,drop:null,view:getViewKey(),owner,plan};event.preventDefault();try{root.setPointerCapture?.(event.pointerId)}catch{}
        }catch(error){message.textContent=error.message;decorate()}
    };
    function autoScroll(){
        frame=null;if(!drag?.active)return;
        if(!drag.row.isConnected||owner!==getOwnerId()||plan!==getPlanId()||drag.view!==getViewKey()||!root.classList.contains('active')||isSorted()){cancelDrag();return}
        const rect=scrollElement.getBoundingClientRect(),distance=drag.y<rect.top+40?-12:drag.y>rect.bottom-40?12:0;if(distance){scrollElement.scrollTop+=distance;updateDrop(drag.x,drag.y)}frame=requestFrame(autoScroll);
    }
    function updateDrop(x,y){
        if(!drag)return;
        for(const el of root.querySelectorAll('.task-drop-before,.task-drop-after,.task-drop-empty'))el.classList.remove('task-drop-before','task-drop-after','task-drop-empty');
        const element=document.elementFromPoint?.(x,y),destination=destinationFor(element);drag.drop=null;
        if(destination){const row=element.closest('[data-detail-row]');if(row&&!row.closest('[hidden]')&&root.contains(row)){if(drag.groupIds?.includes(row.dataset.detailRow))return;const rect=row.getBoundingClientRect(),after=y>rect.top+rect.height/2;row.classList.add(after?'task-drop-after':'task-drop-before');drag.drop={destination,anchorId:row.dataset.detailRow,after}}else{destination.block.classList.add('task-drop-empty');drag.drop={destination,anchorId:null,after:false}}}
    }
    const onMove=event=>{
        if(!drag||event.pointerId!==drag.pointerId)return;
        if(owner!==getOwnerId()||plan!==getPlanId()||drag.view!==getViewKey()||!root.classList.contains('active')||isSorted()){cancelDrag();return}
        if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<4)return;
        drag.active=true;drag.x=event.clientX;drag.y=event.clientY;drag.row.classList.add('task-dragging');updateDrop(event.clientX,event.clientY);
        if(drag.groupIds){if(!drag.badge){drag.badge=document.createElement('span');drag.badge.dataset.taskDragCount='';drag.badge.className='task-group-drag-count';drag.badge.setAttribute('role','status');drag.badge.textContent=copy('drag')+' · '+drag.groupIds.length;document.body.appendChild(drag.badge);for(const row of root.querySelectorAll('[data-detail-row]'))if(drag.groupIds.includes(row.dataset.detailRow)&&!row.closest('[hidden]'))row.classList.add('task-group-dragging')}drag.badge.style.left=Math.max(8,Math.min(event.clientX+16,(window.innerWidth||800)-180))+'px';drag.badge.style.top=Math.max(8,Math.min(event.clientY+16,(window.innerHeight||600)-48))+'px'}
        if(frame===null)frame=requestFrame(autoScroll);event.preventDefault();
    };
    const onUp=event=>{
        if(!drag||event.pointerId!==drag.pointerId)return;if(drag.active)updateDrop(event.clientX,event.clientY);const saved=drag;cancelDrag();
        if(!saved.active||!saved.drop||saved.owner!==getOwnerId()||saved.plan!==getPlanId()||saved.view!==getViewKey()||!root.classList.contains('active')||isSorted())return;
        try{const action=saved.groupIds?buildTaskBatch(saved.state,'move',saved.groupIds,{...saved.drop.destination.target,...(saved.drop.anchorId?{anchorTaskId:saved.drop.anchorId,after:saved.drop.after}:{})}):orderedAction(saved.source,saved.drop.destination,saved.drop.anchorId,saved.drop.after,saved.orders);if(action)void execute(action.command,action.expected)}catch(error){message.textContent=error.message;decorate()}
    };
    const onCancel=event=>{if(event?.pointerId===undefined||event.pointerId===drag?.pointerId)cancelDrag()};
    const onVisibility=()=>{if(document.visibilityState==='hidden')cancelDrag()};
    window.addEventListener('blur',onCancel);document.addEventListener('visibilitychange',onVisibility);root.addEventListener('lostpointercapture',onCancel);
    // A pointer-captured drag can emit a click on the workspace on release.
    // Consume only that gesture's click; a new press always restores normal clicks.
    const nextPress=()=>{suppressPointer=null};
    const dragClick=event=>{if(suppressPointer!==null&&event.pointerId===suppressPointer&&event.detail>0){suppressPointer=null;event.preventDefault();event.stopImmediatePropagation()}};
    document.addEventListener('pointerdown',nextPress,true);document.addEventListener('click',dragClick,true);
    root.addEventListener('click',onClick);root.addEventListener('change',onChange);root.addEventListener('keydown',onKey);root.addEventListener('pointerdown',onDown);root.addEventListener('pointermove',onMove);root.addEventListener('pointerup',onUp);root.addEventListener('pointercancel',onCancel);sync();decorate();
    return {runSectionAction:sections.run,getSectionState:sections.state,getDisplayState,getActionState,runTaskAction,runTaskBatch,runTaskTool,execute,retry:reconcile,undo,discard,sync,decorate,cancelDrag,isDragging:()=>!!drag||sections.isDragging(),reportError(text){message.textContent=text;decorate()},dispose(){document.removeEventListener('pointerdown',nextPress,true);document.removeEventListener('click',dragClick,true);window.removeEventListener('blur',onCancel);document.removeEventListener('visibilitychange',onVisibility);root.removeEventListener('lostpointercapture',onCancel);sections.dispose();disposed=true;preview=null;generation++;cancelDrag();clearUndo();moveDialog?.remove();fieldDialog?.dispose();bar.remove();for(const [type,handler] of [['click',onClick],['change',onChange],['keydown',onKey],['pointerdown',onDown],['pointermove',onMove],['pointerup',onUp],['pointercancel',onCancel]])root.removeEventListener(type,handler)}};
}
