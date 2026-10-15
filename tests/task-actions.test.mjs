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
