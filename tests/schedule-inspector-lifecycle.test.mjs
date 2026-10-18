import * as assignment from '../assignment-progress.js';
import {planningClock} from '../planning-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import * as utils from '../schedule-utils.js';
import * as recurrence from '../recurrence-utils.js';
import * as recurrenceUi from '../schedule-recurrence-ui.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('assignment progress refreshes while Schedule preserves a dirty form',async()=>{
 const f=await fixture();f.boards[0].sections[0].tasks.push({id:'linked',title:'Research',assignmentId:'t',sessionIndex:1,estimatedMinutes:30});f.ws.render();await tick();
 f.type('title','Unsaved assignment');const form=f.document.querySelector('[data-ks-rich-inspector]');f.boards[0].sections[0].tasks.find(task=>task.id==='linked').completed=true;f.ws.render();await tick();
 assert.ok(f.document.querySelector('[data-ks-rich-inspector]')===form);assert.equal(f.field('title').value,'Unsaved assignment');assert.match(f.document.querySelector('[data-assignment-detail]').textContent,/1 of 1/);
});
let cleanup=()=>{};
async function fixture({recurring=false,storage=new Map()}={}){
 cleanup();const observers=[];
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><aside id="schedule-backlog"></aside><div id="schedule-calendar"></div><aside id="schedule-inspector" hidden></aside></div><div id="schedule-ai-review"></div></section></body></html>');
 Object.defineProperty(document,'readyState',{value:'loading'});
 const select=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
 if(!select.set)Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:select.get,set(value){for(const option of this.querySelectorAll('option'))option.selected=option.value===String(value)}});
 Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(el=>[el.name,el]))}});
 let active=document.body;Object.defineProperty(document,'activeElement',{get:()=>active?.isConnected?active:document.body});window.HTMLElement.prototype.focus=function(){active=this};
 const date=utils.toDateKey(new Date()),task={id:'t',title:'Revision',date,startTime:'10:00',endTime:'11:00'},other={id:'u',title:'Other',date,startTime:'12:00',endTime:'13:00'},boards=[{id:'b',title:'Study',sections:[{id:'s',title:'Tasks',tasks:[task,other]}]}];
 if(recurring)task.recurrence=recurrence.normalizeRecurrence({enabled:true,frequency:'daily',interval:1,startDate:date,mode:'fixed'});
 boards[0].sections.push({id:'dest',title:'Destination',tasks:[]});
 boards.push({id:'other-board',title:'Other board',sections:[{id:'other-section',title:'Other section',tasks:[]}]});
 let owner='one',plan='plan',saves=[];
 const bridge={getBoards:()=>boards,getOwnerId:()=>owner,getPlanId:()=>plan,getTimeFormat:()=> '24',getScheduleEvents:()=>[],persistPlan:()=>new Promise((resolve,reject)=>saves.push({resolve,reject})),refreshAppViews(){}};
 window.__kairosScheduleBridge=bridge;window.__kairosScheduleInspectorBooted=false;window.__kairosScheduleWorkspace=null;
 window.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 let sessionModule={};try{sessionModule=await import('../schedule-inspector-session.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
 // linkedom reports class mutations despite attributeFilter. Flush enhancement
 // explicitly below; actual MutationObserver timing is covered in Chrome QA.
 class Observer{observe(){}disconnect(){}}
 cleanup=()=>observers.forEach(observer=>observer.disconnect());
 const context=vm.createContext({...assignment,planningClock,document,window,MutationObserver:Observer,...utils,...recurrence,...recurrenceUi,...sessionModule,showRecurrenceScopeDialog:async()=> 'occurrence',CSS:{escape:String},console:{error(){},warn(){}},structuredClone,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},confirmDialog:async()=>true});
 const workspaceSource=(await readFile(new URL('../schedule-workspace.js',import.meta.url),'utf8')).replace(/^import\s[\s\S]*?from ['"][^'"]+['"];\r?\n/gm,'').replace('export function initScheduleWorkspace','function initScheduleWorkspace');
 vm.runInContext(workspaceSource,context);const ws=context.initScheduleWorkspace(bridge);window.__kairosScheduleWorkspace=ws;
 // Each module has its own lexical scope, just as in the browser.
 const inspectorContext=vm.createContext({...context,window,document});
 vm.runInContext((await readFile(new URL('../schedule-inspector.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,''),inspectorContext);inspectorContext.boot();
 for(const method of ['render','selectItem','selectOccurrence','clearSelection']){const original=ws[method];ws[method]=(...args)=>{const result=original(...args);inspectorContext.enhance();if(result?.then)result.then(()=>inspectorContext.enhance());return result}}
 const selectTask=async id=>{const result=ws.selectItem('task',id);await tick();return result};
 if(recurring){await ws.selectOccurrence({seriesId:'t',occurrenceId:'t::'+date,occurrenceDate:date});await tick();document.querySelector('[data-occurrence-edit]').click();await tick()}else await selectTask('t');
 const field=name=>document.querySelector('#schedule-inspector [name="'+name+'"]');
 const type=(name,value)=>{const el=field(name);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}))};
 const submit=()=>document.querySelector('#schedule-inspector form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 return {document,window,ws,task,other,boards,saves,field,type,submit,selectTask,storage,setOwner:v=>owner=v,setPlan:v=>plan=v};
}

test('Schedule permits only one inspector save while persistence is pending',async()=>{
 const f=await fixture();f.type('title','First edit');f.submit();await tick();f.submit();await tick();
 assert.equal(f.saves.length,1);assert.equal(f.document.querySelector('#schedule-inspector [type="submit"]').disabled,true);
 f.saves[0].resolve();await tick();assert.equal(f.task.title,'First edit');
});

test('a failed Schedule save retains the editable draft and a retry saves it',async()=>{
 const f=await fixture();f.type('title','Keep this draft');f.submit();await tick();f.saves[0].reject(Error('Offline'));await tick();
 assert.equal(f.task.title,'Revision');assert.equal(f.field('title').value,'Keep this draft');assert.equal(f.field('title').disabled,false);
 f.submit();await tick();assert.equal(f.saves.length,2);f.saves[1].resolve();await tick();assert.equal(f.task.title,'Keep this draft');
});

test('switching task asks before discarding a Schedule draft and Stay preserves it',async()=>{
 const f=await fixture();f.type('title','Unsaved');const switching=f.ws.selectItem('task','u');await tick();
 const stay=f.document.querySelector('[data-schedule-draft-choice="stay"]');assert.ok(stay,'Save / Discard / Stay is required');
 assert.equal(f.ws.state.selected.id,'t');stay.click();await switching;assert.equal(f.field('title').value,'Unsaved');assert.equal(f.saves.length,0);
});

test('calendar refresh retains the same dirty inspector form',async()=>{
 const f=await fixture();f.type('notes','Draft notes');const input=f.field('notes');f.ws.render();await tick();
 assert.equal(f.field('notes')===input,true,'Refresh must retain the draft input');assert.equal(f.field('notes').value,'Draft notes');
});

test('Discard closes a dirty inspector without writing',async()=>{
 const f=await fixture();f.type('notes','Discard me');const closing=f.ws.clearSelection();await tick();
 f.document.querySelector('[data-schedule-draft-choice="discard"]').click();assert.equal(await closing,true);assert.equal(f.ws.state.selected.type,null);assert.equal(f.saves.length,0);
});

test('Save before switching waits for success and failed saves keep the current task',async()=>{
 const f=await fixture();f.type('title','Save before switching');const switching=f.ws.selectItem('task','u');await tick();
 f.document.querySelector('[data-schedule-draft-choice="save"]').click();await tick();assert.equal(f.saves.length,1);assert.equal(f.ws.state.selected.id,'t');
 f.saves[0].reject(Error('Offline'));assert.equal(await switching,false);assert.equal(f.field('title').value,'Save before switching');
 const retry=f.ws.selectItem('task','u');await tick();f.document.querySelector('[data-schedule-draft-choice="save"]').click();await tick();f.saves[1].resolve();assert.equal(await retry,true);assert.equal(f.ws.state.selected.id,'u');assert.equal(f.task.title,'Save before switching');
});

test('a pending write blocks switching and old-account failures cannot restore old data',async()=>{
 const f=await fixture();f.type('title','Saving');f.submit();await tick();assert.equal(await f.ws.selectItem('task','u'),false);
 f.setOwner('two');f.task.title='New account data';f.saves[0].reject(Error('Late failure'));await tick();assert.equal(f.task.title,'New account data');
});

test('recurring editor survives refresh and asks before switching away',async()=>{
 const f=await fixture({recurring:true});f.type('title','Occurrence draft');const field=f.field('title');f.ws.render();await tick();
 assert.equal(f.field('title')===field,true);const switching=f.ws.selectItem('task','u');await tick();assert.ok(f.document.querySelector('[data-schedule-draft-choice="stay"]'));f.document.querySelector('[data-schedule-draft-choice="stay"]').click();assert.equal(await switching,false);
});

test('recurring save locks scope selection and retains its draft after failure',async()=>{
 const f=await fixture({recurring:true});f.type('title','Occurrence draft');f.submit();f.submit();await tick();
 assert.equal(f.saves.length,1);f.saves[0].reject(Error('Offline'));await tick();assert.equal(f.field('title').value,'Occurrence draft');assert.equal(f.boards[0].sections[0].tasks[0].title,'Revision');
});

test('failed recurring save preserves unrelated task changes made while waiting',async()=>{
 const f=await fixture({recurring:true});f.type('title','Occurrence draft');f.submit();await tick();f.other.title='Updated elsewhere';f.boards[0].sections[0].tasks.push({id:'new',title:'New task'});
 f.saves[0].reject(Error('Offline'));await tick();assert.equal(f.boards[0].sections[0].tasks.find(t=>t.id==='u').title,'Updated elsewhere');assert.ok(f.boards[0].sections[0].tasks.find(t=>t.id==='new'));
});

test('a recurring draft can be retried after a failed save',async()=>{
 const f=await fixture({recurring:true});f.type('title','Retry occurrence');f.submit();await tick();f.saves[0].reject(Error('Offline'));await tick();
 f.submit();await tick();f.saves[1].resolve();await tick();assert.equal(recurrence.generateTaskOccurrences(f.boards[0].sections[0].tasks[0],f.task.date,f.task.date)[0].task.title,'Retry occurrence');
});

test('saving a retained draft targets refreshed data and preserves fields edited elsewhere',async()=>{
 const f=await fixture();f.type('title','My draft');const live={...f.task,title:'Remote title',notes:'Remote notes',startTime:'09:00',endTime:'10:00'};f.boards[0].sections[0].tasks[0]=live;f.ws.render();await tick();
 f.submit();await tick();f.saves[0].resolve();await tick();assert.equal(live.title,'My draft');assert.equal(live.notes,'Remote notes');assert.equal(live.startTime,'09:00');
});

test('moving a dirty task twice cannot remove unrelated tasks or duplicate the moved task',async()=>{
 const f=await fixture();f.type('title','Retain draft');f.field('section').value='dest';f.document.querySelector('[data-move]').click();await tick();f.saves[0].resolve();await tick();
 f.document.querySelector('[data-move]').click();await tick();assert.equal(f.saves.length,1);assert.deepEqual(f.boards[0].sections[0].tasks.map(t=>t.id),['u']);assert.deepEqual(f.boards[0].sections[1].tasks.map(t=>t.id),['t']);assert.equal(f.field('title').value,'Retain draft');
});

test('late old-account completion cannot disconnect a newly opened editor',async()=>{
 const f=await fixture();f.type('title','Old account');f.submit();await tick();f.setOwner('two');f.task.title='Current account';f.ws.render();await tick();f.saves[0].reject(Error('Old failure'));await tick();
 f.type('title','New edit');f.submit();await tick();assert.equal(f.saves.length,2);f.saves[1].resolve();await tick();assert.equal(f.task.title,'New edit');
});

test('failed occurrence save rolls back its fields while preserving newer edits on that series',async()=>{
 const f=await fixture({recurring:true});f.type('title','Failed occurrence title');f.submit();await tick();f.boards[0].sections[0].tasks[0].notes='External notes';f.saves[0].reject(Error('Offline'));await tick();
 const series=f.boards[0].sections[0].tasks[0];assert.equal(series.notes,'External notes');assert.equal(recurrence.generateTaskOccurrences(series,f.task.date,f.task.date)[0].task.title,'Revision');assert.equal(f.field('title').value,'Failed occurrence title');
});

test('ordinary save recovery preserves newer unrelated changes on the same task',async()=>{
 const f=await fixture();f.type('title','Failed title');f.submit();await tick();f.task.notes='External notes';f.saves[0].reject(Error('Offline'));await tick();assert.equal(f.task.title,'Revision');assert.equal(f.task.notes,'External notes');assert.equal(f.field('title').value,'Failed title');
});

test('blank title keeps the task title while other edits save normally',async()=>{
 const f=await fixture();f.type('title','   ');f.type('notes','Keep these notes');f.submit();await tick();assert.equal(f.saves.length,1);f.saves[0].resolve();await tick();assert.equal(f.task.title,'Revision');assert.equal(f.task.notes,'Keep these notes');
});

test('recovered move fields rebuild sections for the restored destination board',async()=>{
 const first=await fixture();first.type('title','Recover draft');first.field('board').value='other-board';first.field('board').dispatchEvent(new first.window.Event('change',{bubbles:true}));first.field('section').value='other-section';first.field('section').dispatchEvent(new first.window.Event('change',{bubbles:true}));
 const next=await fixture({storage:first.storage});assert.equal(next.field('board').value,'other-board');assert.equal(next.field('section').value,'other-section');
});
