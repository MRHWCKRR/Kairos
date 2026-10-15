import test from 'node:test';
import assert from 'node:assert/strict';
const load=async()=>{const m=await import('../task-actions.js').catch(()=>({}));assert.equal(typeof m.createTaskActions,'function');return m.createTaskActions};
async function fixture(){
 const create=await load();let identity={ownerId:'u',planId:'p'},state={busy:false,pending:false,sorted:false,canMoveUp:true,canMoveDown:false},task={id:'a',title:'<Science>',completed:false},missing=false;
 const calls=[],errors=[];let clipboard=async text=>calls.push(['copy',text]);
 const actions=create({resolveTarget:({taskId})=>{if(missing||taskId!==task.id)throw Error('Task unavailable');return {task,board:{},section:{}}},getIdentity:()=>identity,getInteractionState:()=>state,runTaskAction:async(...args)=>{calls.push(args);return true},openDetails:async(...args)=>{calls.push(['details',...args]);return true},openSchedule:async(...args)=>{calls.push(['schedule',...args]);return true},copyText:text=>clipboard(text),reportError:e=>errors.push(e)});
 return {actions,calls,errors,context:{taskIds:['a'],ownerId:'u',planId:'p'},task,state,setIdentity:v=>identity=v,setMissing:()=>missing=true,setClipboard:v=>clipboard=v};
}
test('shared registry offers the real actions and reflects canonical completion and order',async()=>{
 const f=await fixture();assert.deepEqual(f.actions.items(f.context).map(x=>x.id),['details','rename','schedule','complete','up','down','move','copy-title','archive']);
 assert.equal(f.actions.items(f.context).find(x=>x.id==='complete').label,'Complete');f.task.completed=true;assert.equal(f.actions.items(f.context).find(x=>x.id==='complete').label,'Mark incomplete');assert.equal(f.actions.items(f.context).find(x=>x.id==='down').enabled,false);
});
test('details, rename, schedule and copy use the exact live task and explicit callbacks',async()=>{
 const f=await fixture();const source={};await f.actions.invoke('rename',f.context,source);assert.deepEqual(f.calls[0],['details',{taskId:'a'},source,{focusField:'title'}]);
 await f.actions.invoke('details',f.context,source);assert.equal(f.calls[1][3].focusField,null);await f.actions.invoke('schedule',f.context,source);assert.deepEqual(f.calls[2],['schedule',{taskId:'a'},source]);f.task.title='New live title';await f.actions.invoke('copy-title',f.context,source);assert.deepEqual(f.calls[3],['copy','New live title']);
});
test('mutations use the existing adapter and recheck busy state at invocation',async()=>{
 const f=await fixture();await f.actions.invoke('up',f.context,{});assert.equal(f.calls[0][0],'up');f.state.pending=true;assert.equal(await f.actions.invoke('archive',f.context),false);assert.equal(f.calls.length,1);assert.equal(f.actions.items(f.context).find(x=>x.id==='copy-title').enabled,true);
});
test('stale, missing, unknown and multi-target actions never dispatch',async()=>{
 const f=await fixture();for(const [id,context] of [['bogus',f.context],['complete',{...f.context,taskIds:['a','b']}],['archive',{...f.context,ownerId:'other'}],['details',{...f.context,planId:'other'}]])assert.equal(await f.actions.invoke(id,context),false);
 f.setMissing();assert.equal(await f.actions.invoke('complete',f.context),false);assert.equal(f.calls.length,0);
});
test('recurring completion and sorted movement remain unavailable with an explanation',async()=>{
 const f=await fixture();f.task.recurrence={enabled:true};let item=f.actions.items(f.context).find(x=>x.id==='complete');assert.equal(item.enabled,false);assert.match(item.disabledReason,/Schedule/);f.state.sorted=true;item=f.actions.items(f.context).find(x=>x.id==='move');assert.equal(item.enabled,false);assert.ok(item.disabledReason);assert.equal(await f.actions.invoke('complete',f.context),false);assert.equal(f.calls.length,0);
});
test('clipboard rejection reports a usable error only to the original session',async()=>{
 const f=await fixture();f.setClipboard(async()=>{throw Error('denied')});assert.equal(await f.actions.invoke('copy-title',f.context),false);assert.match(f.errors[0],/copy|clipboard/i);f.errors.length=0;
 f.setClipboard(async()=>{f.setIdentity({ownerId:'other',planId:'p'});throw Error('denied')});assert.equal(await f.actions.invoke('copy-title',f.context),false);assert.equal(f.errors.length,0);
});
test('selected batch actions are explicit, bounded, recurring-aware and blocked by pending recovery',async()=>{
 const {createTaskActions}=await import('../task-actions.js');let state={canMoveUp:true},recurring=false,size=2;const calls=[];
 const selection={has:()=>true,ids:()=>Array.from({length:size},(_,i)=>'t'+i)},actions=createTaskActions({selection,getIdentity:()=>({ownerId:'u',planId:'p'}),resolveTarget:({taskId})=>({task:{id:taskId,completed:taskId==='t1',recurrence:recurring&&taskId==='t1'?{enabled:true}:null},board:{id:'b'},section:{id:'s'}}),getInteractionState:()=>state,runTaskBatch:async(...args)=>{calls.push(args);return true}}),context=()=>({ownerId:'u',planId:'p',taskIds:selection.ids()});
 assert.ok(actions.items(context()).some(item=>item.id==='bulk-incomplete'));assert.ok(actions.items(context()).some(item=>item.id==='bulk-complete'));assert.equal(await actions.invoke('bulk-incomplete',context()),true);assert.deepEqual(calls[0],['incomplete',{taskIds:['t0','t1']},undefined]);
 recurring=true;for(const id of ['bulk-complete','bulk-incomplete']){const item=actions.items(context()).find(item=>item.id===id);assert.equal(item.enabled,false);assert.match(item.disabledReason,/Schedule/)}recurring=false;
 state={pending:true};assert.equal(await actions.invoke('bulk-archive',context()),false);assert.equal(actions.items(context()).find(item=>item.id==='copy-titles').enabled,true);state={sorted:true};assert.equal(actions.items(context()).find(item=>item.id==='bulk-move').enabled,false);state={};size=51;assert.match(actions.items(context()).find(item=>item.id==='bulk-complete').disabledReason,/50/);assert.equal(calls.length,1);
});
test('Duplicate and six field tools share exact single/multiple targets and reject pending or recurring sets',async()=>{
 const {createTaskActions}=await import('../task-actions.js');let pending=false,recurring=false;const calls=[],context={ownerId:'u',planId:'p',taskIds:['a','c']};const actions=createTaskActions({selection:{has:()=>true,ids:()=>['a','c']},getIdentity:()=>({ownerId:'u',planId:'p'}),resolveTarget:({taskId})=>({task:{id:taskId,recurrence:recurring?{enabled:true}:null},board:{},section:{}}),getInteractionState:()=>({pending}),runTaskTool:async(...args)=>{calls.push(args);return true}});
 for(const id of ['duplicate','set-date','set-dueDate','set-priority','set-durationMinutes','set-reminderMinutes','set-scheduleLocked'])assert.ok(actions.items(context).some(item=>item.id===id));assert.equal(await actions.invoke('duplicate',context),true);assert.deepEqual(calls[0],['duplicate',{taskIds:['a','c']},undefined]);pending=true;assert.equal(await actions.invoke('set-priority',context),false);pending=false;recurring=true;assert.match(actions.items(context).find(item=>item.id==='duplicate').disabledReason,/recurr|Schedule/i);assert.equal(calls.length,1);
});
test('section registry validates exact identity, blocks Add during recovery and dispatches local actions',async()=>{
 const module=await import('../task-section-actions.js').catch(()=>({}));assert.equal(typeof module.createTaskSectionActions,'function');let owner='u',pending=false;const calls=[],context={scope:'section',ownerId:'u',planId:'p',section:{boardId:'b',sectionId:'s'},taskIds:[]};const actions=module.createTaskSectionActions({getIdentity:()=>({ownerId:owner,planId:'p'}),resolveSection:target=>{assert.deepEqual(target,{boardId:'b',sectionId:'s'});return {}},getInteractionState:()=>({pending}),addTask:async target=>calls.push(['add',target]),selectSection:target=>calls.push(['select',target]),collapseSection:async target=>calls.push(['collapse',target])});
 assert.deepEqual(actions.items(context).map(item=>item.id),['add','select-section','collapse-section']);await actions.invoke('select-section',context);assert.deepEqual(calls[0],['select',{boardId:'b',sectionId:'s'}]);pending=true;assert.equal(await actions.invoke('add',context),false);assert.equal(actions.items(context)[1].enabled,true);owner='other';assert.equal(await actions.invoke('collapse-section',context),false);assert.equal(calls.length,1);
});
