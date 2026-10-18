import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {applyTaskListCommand} from '../task-list-model.js';
const now=Date.parse('2026-10-17T06:00:00Z'),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({store=new Map(),fail=false,gate=null,title='Essay'}={}){
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div></section></body></html>');
 let data={boards:[{id:'b',title:'Study',sections:[{id:'s',title:'Assignments',tasks:[{id:'a',title,dueDate:'2026-10-19',notes:'Keep',date:null},{id:'old',title:'Slipped',date:'2026-10-13',startTime:'08:00',endTime:'08:30'}]}]}],scheduleEvents:[]},owner='one',plan='plan',offline=fail;const calls=[],opened=[];
 const bridge={getOwnerId:()=>owner,getPlanId:()=>plan,getBoards:()=>data.boards,getScheduleEvents:()=>data.scheduleEvents,getTimezone:()=> 'UTC',openTaskEditor:target=>opened.push(target),commitTaskCommand:async(command,expected,identity)=>{calls.push({command,expected,identity});if(gate)await gate;if(offline)throw Error('Offline');const result=applyTaskListCommand(data,command,expected,{now});data=result.next;return result.result}};
 let module={};try{module=await import('../planning-hub.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}assert.equal(typeof module.mountPlanningHub,'function');
 const hub=module.mountPlanningHub({document,window,getBridge:()=>bridge,now:()=>now,storage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}});
 const click=action=>document.querySelector('[data-planning-action="'+action+'"]').click(),tab=name=>document.querySelector('[data-planning-tab="'+name+'"]').click();
 return {document,window,hub,bridge,store,calls,opened,data:()=>data,click,tab,text:()=>document.body.textContent,setOffline:value=>offline=value,setOwner:value=>{owner=value;window.dispatchEvent(new window.Event('kairos-data-changed'))},setPlan:value=>{plan=value;window.dispatchEvent(new window.Event('kairos-data-changed'))},field:(name,value)=>{document.querySelector('[name="'+name+'"]').value=value},dispose:()=>hub.dispose()};
}

test('Planning exposes five real views and opens existing task editing without writing',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();assert.equal(f.document.querySelectorAll('[data-planning-tab]').length,5);assert.match(f.text(),/Due 2026-10-19/);f.document.querySelector('[data-planning-task="a"]').click();assert.equal(f.opened[0].taskId,'a');assert.equal(f.calls.length,0);
});
test('existing session effort is reviewed and surplus archives are explicit before Apply',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','60');f.click('preview-sessions');f.click('apply');await tick();
 f.tab('plans');assert.equal(f.document.querySelector('[name="remainingMinutes"]').value,'60');f.field('remainingMinutes','15');f.click('preview-session-revision');assert.match(f.text(),/Sessions to archive \(1\)/);assert.equal(f.calls.length,1);f.click('apply');await tick();assert.equal(f.calls.length,2);assert.equal(f.data().boards[0].sections[0].tasks.filter(task=>task.assignmentId==='a'&&task.archived).length,1);
});

test('assignment sessions are previewed before Apply and preserve original parent data',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','60');f.click('preview-sessions');assert.equal(f.calls.length,0);assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,2);f.click('apply');await tick();assert.equal(f.data().boards[0].sections[0].tasks.length,4);assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'Keep');assert.match(f.text(),/Saved/);
});
test('session ordering is opt-in and only persists after its reviewed preview is applied',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('sessions');assert.equal(!!f.document.querySelector('[name="ordered"]').checked,false);f.document.querySelector('[name="ordered"]').checked=true;f.field('totalMinutes','60');f.click('preview-sessions');assert.match(f.text(),/numbered sequence/);assert.equal(f.calls.length,0);f.click('apply');await tick();assert.equal(f.data().boards[0].sections[0].tasks[0].sessionOrder,'sequential');
 f.tab('plans');assert.equal(f.document.querySelector('[name="revisionOrdered"]').hasAttribute('checked'),true);
});

test('failed Apply retains exact operation/session IDs for Retry, including reopen after reload',async t=>{
 const f=await fixture({fail:true});t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','60');f.click('preview-sessions');f.click('apply');await tick();assert.match(f.text(),/Retry/);const first=f.calls[0];f.hub.dispose();
 const next=await fixture({store:f.store});t.after(next.dispose);next.hub.open();assert.equal(next.document.querySelectorAll('[data-planning-preview-row]').length,2);next.click('apply');await tick();assert.equal(next.calls[0].identity.operationId,first.identity.operationId);assert.deepEqual(next.calls[0].command.rows.map(row=>row.taskId),first.command.rows.map(row=>row.taskId));
});

test('account/planner switches close pending UI and late callbacks cannot restore old content',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=await fixture({gate});t.after(f.dispose);f.hub.open();f.tab('sessions');f.click('preview-sessions');f.click('apply');assert.equal(f.document.querySelector('[data-planning-action="apply"]').disabled,true);f.setOwner('two');assert.equal(f.document.querySelector('dialog'),null);release();await tick();assert.equal(f.document.querySelector('dialog'),null);
});

test('weekly review labels dated-work status and offers explicit selected carry-over',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('review');assert.match(f.text(),/scheduled|dated/i);assert.match(f.text(),/Slipped/);assert.equal(f.calls.length,0);const box=f.document.querySelector('[name="carryover"]');box.checked=true;f.click('preview-carryover');assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,1);assert.equal(f.calls.length,0);
});

test('no-capacity errors and untrusted titles remain text without writes',async t=>{
 const f=await fixture({title:'<img src=x onerror=alert(1)>'});t.after(f.dispose);f.hub.open();assert.equal(f.document.querySelector('dialog img'),null);f.tab('sessions');f.field('to','2026-10-17');f.field('dayStart','07:00');f.field('dayEnd','08:00');f.field('totalMinutes','120');f.click('preview-sessions');assert.match(f.text(),/room|fit/i);assert.equal(f.calls.length,0);
});

test('Escape/Close never save; storage denial retains a usable preview and clear keep-tab-open warning',async t=>{
 const f=await fixture({store:{get(){throw Error('blocked')},set(){throw Error('blocked')},delete(){}}});t.after(f.dispose);f.hub.open();f.tab('sessions');f.click('preview-sessions');assert.match(f.text(),/Keep this tab open/i);f.click('close');assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.calls.length,0);f.hub.open();const event=new f.window.Event('cancel',{cancelable:true});f.document.querySelector('dialog').dispatchEvent(event);assert.equal(f.document.querySelector('dialog'),null);
});

test('an uncertain save remains retryable after closing and reopening when recovery storage is blocked',async t=>{
 const f=await fixture({fail:true,store:{get(){throw Error('blocked')},set(){throw Error('blocked')},delete(){}}});t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','60');f.click('preview-sessions');f.click('apply');await tick();const first=f.calls[0];f.click('close');f.hub.open();assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,2);assert.match(f.text(),/Retry/);f.setOffline(false);f.click('apply');await tick();assert.equal(f.calls[1].identity.operationId,first.identity.operationId);
});

test('invalid range input stays recoverable when switching Planning views',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('from','');f.click('preview-sessions');assert.match(f.text(),/valid date range/i);assert.doesNotThrow(()=>f.tab('conflicts'));assert.ok(f.document.querySelector('[name="from"]'));assert.equal(f.document.querySelector('[name="from"]').value,'2026-10-17');
});
