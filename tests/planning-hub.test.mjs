import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {planningUndoPreview,applyPlanningUndo} from '../planning-undo.js';
import {applyTaskListCommand} from '../task-list-model.js';
const now=Date.parse('2026-10-17T06:00:00Z'),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({store=new Map(),fail=false,gate=null,title='Essay',weeklyAvailability=null,planningPreferences={dailyLimitMinutes:0,gapMinutes:0}}={}){
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div></section></body></html>');
 let data={boards:[{id:'b',title:'Study',sections:[{id:'s',title:'Assignments',tasks:[{id:'a',title,dueDate:'2026-10-19',notes:'Keep',date:null},{id:'old',title:'Slipped',date:'2026-10-13',startTime:'08:00',endTime:'08:30'}]}]}],scheduleEvents:[]},owner='one',plan='plan',offline=fail;const calls=[],opened=[];
 const bridge={getPlanningPreferences:()=>planningPreferences,getWeeklyAvailability:()=>weeklyAvailability,getOwnerId:()=>owner,getPlanId:()=>plan,getBoards:()=>data.boards,getScheduleEvents:()=>data.scheduleEvents,getTimezone:()=> 'UTC',openTaskEditor:target=>opened.push(target),commitTaskCommand:async(command,expected,identity)=>{calls.push({command,expected,identity});if(gate)await gate;if(offline)throw Error('Offline');const result=applyTaskListCommand(data,command,expected,{now});data=result.next;return result.result}};
 let module={};try{module=await import('../planning-hub.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}assert.equal(typeof module.mountPlanningHub,'function');
 const hub=module.mountPlanningHub({document,window,getBridge:()=>bridge,now:()=>now,storage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}});
 const click=action=>document.querySelector('[data-planning-action="'+action+'"]').click(),tab=name=>document.querySelector('[data-planning-tab="'+name+'"]').click();
 return {document,window,hub,bridge,store,calls,opened,data:()=>data,click,tab,text:()=>document.body.textContent,setOffline:value=>offline=value,setOwner:value=>{owner=value;window.dispatchEvent(new window.Event('kairos-data-changed'))},setPlan:value=>{plan=value;window.dispatchEvent(new window.Event('kairos-data-changed'))},field:(name,value)=>{const el=document.querySelector('[name="'+name+'"]');if(el.tagName==='SELECT'){el.querySelectorAll('option').forEach(option=>option.selected=false);const option=[...el.querySelectorAll('option')].find(option=>option.value===value);if(option)option.selected=true;}else el.value=value},dispose:()=>hub.dispose()};
}

test('Planning exposes six real views and opens existing task editing without writing',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();assert.equal(f.document.querySelectorAll('[data-planning-tab]').length,6);assert.match(f.text(),/Due 2026-10-19/);f.document.querySelector('[data-planning-task="a"]').click();assert.equal(f.opened[0].taskId,'a');assert.equal(f.calls.length,0);
});

function addCombined(f){f.data().boards[0].sections[0].tasks.push({id:'a1',title:'Research',assignmentId:'a',estimatedMinutes:60},{id:'q',title:'<img src=x onerror=alert(1)>',dueDate:'2026-10-19'},{id:'q1',title:'Research',assignmentId:'q',estimatedMinutes:60});f.hub.open();f.tab('combined');for(const box of f.document.querySelectorAll('[name="combinedAssignment"]')){box.checked=true;box.dispatchEvent(new f.window.Event('change',{bubbles:true}))}f.field('to','2026-10-17');f.field('dayStart','07:00');f.field('dayEnd','08:00')}
test('Planning exposes optional gaps and retains the exact spacing during recovered Retry',async t=>{
 const f=await fixture({fail:true});t.after(f.dispose);f.hub.open();f.tab('sessions');assert.equal(f.document.querySelector('[name="gapMinutes"]').value,'0');f.field('gapMinutes','10');f.field('totalMinutes','90');f.click('preview-sessions');assert.match(f.text(),/Spacing: 10 minutes/);assert.match(f.text(),/07:40/);assert.equal(f.calls.length,0);f.click('apply');await tick();const first=f.calls[0];assert.equal(first.command.options.gapMinutes,10);f.click('close');f.hub.open();assert.match(f.text(),/Spacing: 10 minutes/);f.setOffline(false);f.click('apply');await tick();assert.equal(f.calls[1].identity.operationId,first.identity.operationId);assert.equal(f.calls[1].command.options.gapMinutes,10);
});
test('combined capacity accounts for spacing and changing the gap invalidates its diagnostic',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.field('dayEnd','09:00');f.field('gapMinutes','15');f.click('check-combined');assert.match(f.text(),/Not placed/);assert.match(f.text(),/15-minute gaps/);const gap=f.document.querySelector('[name="gapMinutes"]');gap.dispatchEvent(new f.window.Event('change',{bubbles:true}));assert.equal(f.document.querySelector('[data-planning-action="preview-combined"]'),null);assert.equal(f.document.querySelector('[name="gapMinutes"]'),gap);
});
test('combined selection checks shared capacity, previews explicit partial work, and applies only listed rows',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.click('check-combined');assert.match(f.text(),/60 minutes short/);assert.match(f.text(),/Not placed/);assert.equal(f.calls.length,0);assert.equal(f.document.querySelector('dialog img'),null);f.click('preview-combined');assert.match(f.text(),/Partial plan/);assert.match(f.text(),/stays unchanged/);assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,1);f.click('apply');await tick();assert.equal(f.calls.length,1);assert.equal(f.data().boards[0].sections[0].tasks.find(x=>x.id==='q1').date,undefined);
});
test('combined inputs and planner edits invalidate results without replacing focused controls',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.click('check-combined');const input=f.document.querySelector('[name="dayEnd"]');input.value='09:00';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));assert.equal(f.document.querySelector('[name="dayEnd"]'),input);assert.equal(f.document.querySelector('[data-planning-action="preview-combined"]'),null);assert.match(f.text(),/Check shared plan again/);f.click('check-combined');assert.equal([...f.document.querySelectorAll('[name="combinedAssignment"]')].filter(el=>el.checked).length,2);f.window.dispatchEvent(new f.window.Event('kairos-data-changed'));assert.equal(f.document.querySelector('[data-planning-action="preview-combined"]'),null);assert.equal(f.calls.length,0);
});
test('combined preview rechecks live state and exact retries preserve a partial-plan notice',async t=>{
 const f=await fixture({fail:true});t.after(f.dispose);addCombined(f);f.click('check-combined');f.data().boards[0].sections[0].tasks.find(x=>x.id==='q1').estimatedMinutes=90;f.click('preview-combined');assert.match(f.text(),/90 minutes/);f.click('apply');await tick();const first=f.calls[0];f.click('close');f.hub.open();assert.match(f.text(),/Partial plan/);f.setOffline(false);f.click('apply');await tick();assert.equal(f.calls[1].identity.operationId,first.identity.operationId);assert.deepEqual(f.calls[1].command,first.command);
});
test('toolbar reconciliation preserves a checked shared plan until actual planner data changes',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.click('check-combined');f.document.querySelector('#schedule-toolbar').appendChild(f.document.createElement('span'));await tick();assert.ok(f.document.querySelector('[data-planning-action="preview-combined"]'));f.window.dispatchEvent(new f.window.Event('kairos-data-changed'));assert.equal(f.document.querySelector('[data-planning-action="preview-combined"]'),null);
});

test('Planning starts with saved weekly hours, discloses them, and allows an explicit daily override',async t=>{
 const weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]])),f=await fixture({weeklyAvailability});t.after(f.dispose);f.hub.open();assert.match(f.text(),/Monday|Mon/);assert.match(f.text(),/18:00/);f.tab('sessions');assert.equal(f.document.querySelector('[name="availabilityMode"]').value,'saved');f.field('totalMinutes','60');f.click('preview-sessions');assert.match(f.text(),/Saved weekly/);assert.match(f.text(),/18:00/);f.click('discard');f.field('availabilityMode','daily');f.field('dayStart','07:00');f.field('dayEnd','08:00');f.click('preview-sessions');assert.match(f.text(),/07:00/);assert.equal(f.calls.length,0);
});

test('deadline capacity explains effort and previews all unfinished sessions before any save',async t=>{
 const f=await fixture({title:'<img src=x onerror=alert(1)>'});t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','120');f.click('preview-sessions');f.click('apply');await tick();
 f.tab('deadlines');assert.match(f.text(),/120 minutes remaining/);assert.match(f.text(),/Fits/);assert.match(f.text(),/separately|individually/);assert.equal(f.document.querySelector('dialog img'),null);assert.equal(f.calls.length,1);
 f.field('dayStart','07:00');f.field('dayEnd','07:15');f.click('check-capacity');assert.match(f.text(),/75 minutes short/);assert.equal(f.document.querySelector('[data-planning-capacity="a"]'),null);
 f.field('dayEnd','09:00');f.click('check-capacity');f.document.querySelector('[data-planning-capacity="a"]').click();assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,4);assert.equal(f.calls.length,1);f.click('apply');await tick();assert.equal(f.calls.length,2);
});

test('invalid capacity availability leaves the deadline view editable without mutation',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.field('dayStart','');f.click('check-capacity');assert.match(f.text(),/availability/i);assert.equal(f.calls.length,0);assert.equal(f.document.querySelector('[name="dayStart"]').value,'');
});

test('capacity preview rechecks changed data and Apply rejects a later stale plan',async t=>{
 const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','60');f.click('preview-sessions');f.click('apply');await tick();f.tab('deadlines');
 f.data().boards[0].sections[0].tasks[0].dueDate='2026-10-16';f.document.querySelector('[data-planning-capacity="a"]').click();assert.match(f.text(),/deadline has passed/);assert.equal(f.calls.length,1);assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,0);
 f.data().boards[0].sections[0].tasks[0].dueDate='2026-10-19';f.click('check-capacity');f.document.querySelector('[data-planning-capacity="a"]').click();f.data().boards[0].sections[0].tasks[0].dueDate='2026-10-18';f.click('apply');await tick();assert.match(f.text(),/changed/i);assert.equal(f.calls.length,2);assert.equal(f.data().boards[0].sections[0].tasks[0].dueDate,'2026-10-18');
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

test('daily limit is optional, spreads work, and survives recovered exact Retry',async t=>{
 const f=await fixture({fail:true});t.after(f.dispose);f.hub.open();f.tab('sessions');assert.equal(f.document.querySelector('[name="dailyLimitMinutes"]').value,'0');f.field('dailyLimitMinutes','60');f.field('totalMinutes','120');f.click('preview-sessions');assert.match(f.text(),/Daily assignment-work limit: 60 minutes/);assert.match(f.text(),/2026-10-18/);f.click('apply');await tick();const first=f.calls[0];assert.equal(first.command.options.dailyLimitMinutes,60);f.click('close');f.hub.open();f.setOffline(false);f.click('apply');await tick();assert.equal(f.calls[1].identity.operationId,first.identity.operationId);assert.deepEqual(f.calls[1].command,first.command);
});
test('daily limit changes invalidate shared results and invalid limits preserve editable drafts',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.field('dayEnd','12:00');f.field('dailyLimitMinutes','60');f.click('check-combined');assert.match(f.text(),/60 minutes short/);const field=f.document.querySelector('[name="dailyLimitMinutes"]');field.value='30';field.dispatchEvent(new f.window.Event('input',{bubbles:true}));assert.equal(f.document.querySelector('[data-planning-action="preview-combined"]'),null);assert.equal(f.document.querySelector('[name="dailyLimitMinutes"]'),field);field.value='14';f.click('check-combined');assert.match(f.text(),/15-1440/);assert.equal(field.value,'14');assert.equal(f.calls.length,0);
});


test('Planning inherits saved defaults and clearly reviews independent zero overrides',async t=>{
 const prefs={dailyLimitMinutes:60,gapMinutes:10},f=await fixture({planningPreferences:prefs});t.after(f.dispose);f.hub.open();f.tab('sessions');assert.equal(f.document.querySelector('[name="dailyLimitMinutes"]').value,'60');assert.equal(f.document.querySelector('[name="gapMinutes"]').value,'10');f.field('dailyLimitMinutes','0');f.field('totalMinutes','90');f.click('preview-sessions');assert.match(f.text(),/Overrides for this plan: no daily limit/);assert.match(f.text(),/Spacing: 10 minutes/);f.click('apply');await tick();assert.equal(f.calls[0].command.options.dailyLimitMinutes,0);assert.equal(f.calls[0].command.options.gapMinutes,10);assert.deepEqual(prefs,{dailyLimitMinutes:60,gapMinutes:10});f.click('close');f.hub.open();f.tab('plans');assert.equal(f.document.querySelector('[name="dailyLimitMinutes"]').value,'60');
});
test('changed saved defaults do not replace recovered reviewed values or retry identity',async t=>{
 const prefs={dailyLimitMinutes:60,gapMinutes:10},f=await fixture({fail:true,planningPreferences:prefs});t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','90');f.click('preview-sessions');f.click('apply');await tick();const first=f.calls[0];f.dispose();const reloaded=await fixture({store:f.store,planningPreferences:{dailyLimitMinutes:120,gapMinutes:15}});t.after(reloaded.dispose);reloaded.hub.open();assert.match(reloaded.text(),/Daily assignment-work limit: 60 minutes/);assert.match(reloaded.text(),/Spacing: 10 minutes/);reloaded.click('apply');await tick();assert.deepEqual(reloaded.calls[0].command,first.command);assert.equal(reloaded.calls[0].identity.operationId,first.identity.operationId);
});

test('comparison is read-only until a chosen alternative is reviewed and explicitly applied',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.click('check-combined');f.click('compare-alternatives');assert.equal(f.calls.length,0);assert.match(f.text(),/Assumes you are available/);assert.equal(f.document.querySelector('dialog img'),null);f.document.querySelector('[data-planning-alternative="hours"]').click();assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,2);assert.match(f.text(),/extra work hours/);assert.match(f.text(),/07:00-09:00/);assert.equal(f.calls.length,0);f.click('apply');await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].command.options.dayEnd,'09:00');
});
test('explicit priority review leaves other selected assignments unchanged and survives exact retry',async t=>{
 const f=await fixture({fail:true});t.after(f.dispose);addCombined(f);f.field('focusAssignmentId','q');f.click('check-combined');f.click('compare-alternatives');f.document.querySelector('[data-planning-alternative="focus"]').click();assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,1);assert.match(f.text(),/Essay.*unchanged/);f.click('apply');await tick();const first=f.calls[0];f.dispose();const reload=await fixture({store:f.store});t.after(reload.dispose);reload.data().boards=structuredClone(f.data().boards);reload.hub.open();assert.match(reload.text(),/Prioritise chosen assignments/);reload.click('apply');await tick();assert.deepEqual(reload.calls[0].command,first.command);assert.equal(reload.calls[0].identity.operationId,first.identity.operationId);assert.equal(reload.data().boards[0].sections[0].tasks.find(t=>t.id==='a1').date,undefined);assert.equal(reload.data().boards[0].sections[0].tasks.find(t=>t.id==='q1').date,'2026-10-17');
});
test('comparison controls invalidate on inputs or planner edits and recheck before review',async t=>{
 const f=await fixture();t.after(f.dispose);addCombined(f);f.click('check-combined');f.click('compare-alternatives');const field=f.document.querySelector('[name="focusAssignmentId"]');field.dispatchEvent(new f.window.Event('change',{bubbles:true}));assert.equal(f.document.querySelector('[data-planning-alternative]'),null);assert.equal(f.document.querySelector('[name="focusAssignmentId"]'),field);f.click('check-combined');f.click('compare-alternatives');f.data().boards[0].sections[0].tasks.find(t=>t.id==='q1').estimatedMinutes=180;f.document.querySelector('[data-planning-alternative="hours"]').click();assert.match(f.text(),/no improved validated candidate/);assert.equal(f.calls.length,0);f.window.dispatchEvent(new f.window.Event('kairos-data-changed'));assert.equal(f.document.querySelector('[data-planning-alternative]'),null);
});

test('Planning Undo reviews saved rows, escapes titles and recovers an uncertain attempt with the same identity',async t=>{const f=await fixture();t.after(f.dispose);f.hub.open();f.tab('sessions');f.field('totalMinutes','60');f.click('preview-sessions');f.click('apply');await tick();const source=f.calls[0],data=f.data(),saved=applyTaskListCommand({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'Essay',dueDate:'2026-10-19',notes:'Keep',date:null},{id:'old',date:'2026-10-13',startTime:'08:00',endTime:'08:30'}]}]}],scheduleEvents:[]},source.command,source.expected,{now});data.aiActionReceipts=[{id:'source',result:saved.result}];data.boards[0].sections[0].tasks[1].title='<img src=x>';f.bridge.previewPlanningUndo=async()=>planningUndoPreview(data,null,'UTC');f.tab('deadlines');f.click('preview-undo');await tick();assert.match(f.text(),/Review Undo/);assert.equal(f.document.querySelectorAll('[data-planning-preview-row]').length,2);assert.match(f.text(),/Archive created session/);assert.equal(f.calls.length,1);let fail=true,attempts=[];f.bridge.commitTaskCommand=async(command,expected,identity)=>{attempts.push({command,identity});if(fail)throw Error('Lost response');return applyPlanningUndo(data,saved.result.planningUndo).result};f.click('apply');await tick();assert.match(f.text(),/Retry/);f.click('close');f.hub.open();assert.match(f.text(),/Review Undo/);fail=false;f.click('apply');await tick();assert.equal(attempts[0].identity.operationId,attempts[1].identity.operationId);assert.deepEqual(attempts[0].command,attempts[1].command);assert.match(f.text(),/Undid/)});
test('Undo loading is disabled, errors are visible, and an account switch discards late previews',async t=>{const f=await fixture();t.after(f.dispose);let release;f.bridge.previewPlanningUndo=()=>new Promise(resolve=>release=resolve);f.hub.open();f.click('preview-undo');assert.equal(f.document.querySelector('[data-planning-action="preview-undo"]').disabled,true);f.setOwner('two');release({});await tick();assert.equal(f.document.querySelector('dialog'),null);f.bridge.previewPlanningUndo=async()=>{throw Error('No retained history')};f.hub.open();f.click('preview-undo');await tick();assert.match(f.text(),/No retained history/);assert.equal(f.document.querySelector('[data-planning-action="preview-undo"]').disabled,false);assert.equal(f.calls.length,0)});
