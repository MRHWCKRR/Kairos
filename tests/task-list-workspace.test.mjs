import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {applyTaskListCommand} from '../task-list-model.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('shared Tasks row keeps direct completion and editing with only grip and menu secondary controls',async()=>{
 const {renderTaskListRow}=await import('../task-list-workspace.js');const {document}=parseHTML('<html><body><ul>'+renderTaskListRow({id:'a',title:'<img src=x>'},'s')+'</ul></body></html>');
 assert.ok(document.querySelector('[data-task-action="drag"]'));assert.ok(document.querySelector('[data-task-list-complete]'));assert.ok(document.querySelector('.task-text'));assert.ok(document.querySelector('.task-date-input'));const button=document.querySelector('[data-task-menu="a"]');assert.ok(button);assert.match(button.getAttribute('aria-label'),/<img src=x>/);assert.equal(button.getAttribute('aria-haspopup'),'menu');assert.equal(document.querySelector('img'),null);assert.equal(document.querySelectorAll('[data-task-action]').length,1);assert.equal(document.querySelector('[data-task-detail],[data-task-list-archive]'),null);
});
async function fixture({persist,storage=new Map(),rebuildOverview=false}={}){
  const module=await import('../task-list-workspace.js').catch(()=>({}));assert.equal(typeof module.mountTaskListWorkspace,'function','focused workspace must be implemented');
  const {document,window}=parseHTML('<html><body><main class="main-content"><section id="tasks-page" class="active"><div id="overview"><div class="board-section-block" data-board-id="b" data-section-id="s"><div class="section-title-row"></div><ul class="task-list"></ul><button class="add-task-btn" data-board-id="b" data-section-id="s">Add</button></div></div></section><input id="chat"></main></body></html>');
  let data={userID:'one',boards:[{id:'b',title:'<img src=x>',sections:[{id:'s',title:'" Work <script>x</script>',tasks:[{id:'t',title:'<img src=x onerror=x>',completed:false},{id:'done',title:'Done',completed:true}]},{id:'s2',title:'Other',tasks:[]}]}]},owner='one',plan='plan',wait=null,allow=true,calls=[],discard=true,confirmations=[],focused=null;
  const root=document.getElementById('tasks-page'),overview=document.getElementById('overview'),scroll=document.querySelector('main');
  const store={getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val),removeItem:key=>storage.delete(key)};
  window.HTMLElement.prototype.focus=function(){focused=this};
  const overviewHTML=overview.innerHTML+overview.innerHTML.replaceAll('data-section-id="s"','data-section-id="s2"');if(rebuildOverview)overview.innerHTML=overviewHTML;
  const workspace=module.mountTaskListWorkspace({root,overview,scrollElement:scroll,document,window,storage:store,getState:()=>data,getOwnerId:()=>owner,getPlanId:()=>plan,ensurePlan:async()=>true,requestCloseDetails:async()=>allow,confirmDiscard:async warning=>{confirmations.push(warning);return discard},renderOverview:()=>{if(rebuildOverview)overview.innerHTML=overviewHTML},commit:async(command,expected,identity)=>{
    calls.push(structuredClone({command,expected,identity}));if(wait)await wait;
    if(persist){await persist(command,expected,identity);data=persist.data()}
    else data=applyTaskListCommand(data,command,expected).next;
    workspace.render();
  }});
  const type=value=>{const el=root.querySelector('[data-quick-title]');el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));return el};
  return {workspace,document,window,root,overview,scroll,type,calls,confirmations,focused:()=>focused,data:()=>data,setOwner:value=>owner=value,setPlan:value=>plan=value,block:p=>wait=p,allowClose:value=>allow=value,setDiscard:value=>discard=value};
}
test('focused navigation restores board scroll and local collapse without owning selection',async()=>{
  const f=await fixture();f.workspace.decorateOverview();f.overview.querySelector('[data-section-collapse]').click();assert.equal(f.overview.querySelector('ul').hidden,true);
  const collapse=f.overview.querySelector('[data-section-collapse]');assert.equal(collapse.textContent,'');assert.ok(collapse.getAttribute('aria-label'));assert.equal(collapse.getAttribute('aria-expanded'),'false');assert.ok(collapse.querySelector('svg[aria-hidden="true"]'));assert.ok(f.overview.querySelector('[data-open-section] svg'));
  f.scroll.scrollTop=240;const source=f.overview.querySelector('[data-open-section]');await f.workspace.openSection({boardId:'b',sectionId:'s'},source);
  assert.equal(f.scroll.scrollTop,0);
  assert.equal(f.overview.hidden,true);assert.match(f.root.querySelector('[data-section-heading]').textContent,/Work/);
  const row=f.root.querySelector('[data-detail-row="t"]');row.dispatchEvent(new f.window.Event('click',{bubbles:true}));
  f.scroll.scrollTop=80;await f.workspace.back();assert.equal(f.overview.hidden,false);assert.equal(f.scroll.scrollTop,240);assert.equal(f.overview.querySelector('ul').hidden,true);
  await f.workspace.openSection({boardId:'b',sectionId:'s'},source);assert.ok(!f.root.querySelector('[data-detail-row="t"]').classList.contains('is-selected'));
});
test('quick Enter creates once, keeps the input node and blanks/Escape do not create',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});
  const input=f.type('Science');let release;f.block(new Promise(resolve=>release=resolve));
  const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Enter';input.dispatchEvent(event);input.dispatchEvent(event);await tick();assert.equal(f.calls.length,1);
  release();await tick();assert.equal(f.root.querySelector('[data-quick-title]'),input);assert.equal(input.value,'');assert.equal(input.disabled,false);
  f.type(' ');assert.equal(await f.workspace.submit(),false);f.type('Draft');const escape=new f.window.Event('keydown',{bubbles:true});escape.key='Escape';input.dispatchEvent(escape);assert.equal(input.value,'');assert.equal(f.calls.length,1);
});
test('a late save targets its original section and preserves the newly selected draft',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});f.type('Original');let release;f.block(new Promise(resolve=>release=resolve));const saving=f.workspace.submit();await tick();
  await f.workspace.openSection({boardId:'b',sectionId:'s2'});const input=f.type('Next draft');release();await saving;
  assert.equal(f.data().boards[0].sections[0].tasks.at(-1).title,'Original');assert.equal(f.data().boards[0].sections[1].tasks.length,0);assert.equal(input.value,'Next draft');assert.equal(f.root.querySelector('[data-quick-title]'),input);
});
test('uncertain creation survives remount and reconciles the exact operation once',async()=>{
  const base={userID:'one',boards:[{id:'b',title:'Study',sections:[{id:'s',title:'Work',tasks:[]}]}]};
  const store=await plannerFixture(base,{failAfterCommit:true});store.context.applyTaskListCommand=applyTaskListCommand;
  const persist=async(c,e,id)=>store.context.persistTaskListCommand('plan','one',c,e,id.operationId,id.createdAt);persist.data=store.data;const storage=new Map();
  const first=await fixture({persist,storage});await first.workspace.openSection({boardId:'b',sectionId:'s'});first.type('Read');assert.equal(await first.workspace.submit(),false);const identity=first.calls[0].identity;first.workspace.dispose();
  const second=await fixture({persist,storage});await second.workspace.openSection({boardId:'b',sectionId:'s'});assert.equal(second.root.querySelector('[data-quick-title]').value,'Read');assert.equal(await second.workspace.submit(),true);
  assert.deepEqual(second.calls[0].identity,identity);assert.equal(store.writes.length,1);assert.equal(store.data().boards[0].sections[0].tasks.length,1);
});
test('completed visibility and unrelated refresh preserve drafts and title caret',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});const quick=f.type('Draft'),title=f.root.querySelector('.task-text');title.value='Typing';f.data().boards[0].sections[0].tasks[0].title='Remote';
  const toggle=f.root.querySelector('[data-show-completed]');assert.equal(toggle.textContent,'Hide completed');assert.equal(toggle.getAttribute('aria-pressed'),'true');
  // linkedom has no native focus; emulate the browser active element here.
  Object.defineProperty(f.document,'activeElement',{configurable:true,value:title});title.selectionStart=2;f.workspace.render();assert.equal(f.root.querySelector('.task-text'),title);assert.equal(title.value,'Typing');assert.equal(title.selectionStart,2);assert.equal(quick.value,'Draft');
  f.root.querySelector('[data-show-completed]').click();assert.equal(f.root.querySelector('[data-detail-row="done"]').hidden,true);assert.match(f.root.querySelector('[data-section-count]').textContent,/1.*2/);
  assert.equal(toggle.textContent,'Show completed');assert.equal(toggle.getAttribute('aria-pressed'),'false');toggle.click();assert.equal(toggle.textContent,'Hide completed');assert.equal(f.root.querySelector('[data-detail-row="done"]').hidden,false);
});
test('empty, archived and deleted sections have explicit states; labels and rows escape user content',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});assert.equal(f.root.querySelector('img,script'),null);assert.equal(f.root.querySelector('.task-text').value,'<img src=x onerror=x>');
  f.data().boards[0].sections[0].archived=true;f.workspace.render();assert.match(f.root.querySelector('[data-section-state]').textContent,/archived/i);assert.equal(f.root.querySelector('[data-quick-title]').disabled,true);
  f.data().boards[0].sections.splice(0,1);f.workspace.render();assert.match(f.root.querySelector('[data-section-state]').textContent,/available/i);
  await f.workspace.openSection({boardId:'b',sectionId:'s2'});assert.match(f.root.querySelector('[data-section-state]').textContent,/tasks/i);
});
test('account/planner changes clear drafts and late completions cannot publish old success',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});f.type('Private');let release;f.block(new Promise(resolve=>release=resolve));const saving=f.workspace.submit();await tick();f.setOwner('two');f.workspace.sync();release();assert.equal(await saving,false);
  assert.equal(f.root.querySelector('[data-focused-section]').hidden,true);await f.workspace.openSection({boardId:'b',sectionId:'s'});assert.equal(f.root.querySelector('[data-quick-title]').value,'');f.type('Other');f.setPlan('other');f.workspace.sync();assert.equal(f.root.querySelector('[data-focused-section]').hidden,true);
});
test('section navigation respects detail drafts and shortcuts do not intercept chat typing',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});f.allowClose(false);assert.equal(await f.workspace.back(),false);assert.equal(f.overview.hidden,true);
  const chat=f.document.getElementById('chat'),event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Enter';chat.dispatchEvent(event);await tick();assert.equal(f.calls.length,0);assert.equal(event.defaultPrevented,false);
});
test('an uncertain create can still reconcile after its section is archived',async()=>{
  const f=await fixture({persist:Object.assign(async()=>{throw new Error('Response lost')},{data:()=>null})});
  await f.workspace.openSection({boardId:'b',sectionId:'s'});f.type('Read');assert.equal(await f.workspace.submit(),false);
  f.data().boards[0].sections[0].archived=true;f.workspace.render();assert.equal(f.root.querySelector('[data-quick-save]').disabled,false);assert.equal(f.root.querySelector('[data-quick-title]').disabled,true);
});
test('expired receipt recovery requires acknowledgment and unlocks new entry without reissuing the old task',async()=>{
  const base={userID:'one',aiActionReceiptFloor:200,boards:[{id:'b',sections:[{id:'s',tasks:[]}]}]},store=await plannerFixture(base);store.context.applyTaskListCommand=applyTaskListCommand;
  const pending={command:{type:'create_task',target:{boardId:'b',sectionId:'s'},task:{id:'old',title:'Read'}},expected:{boardId:'b',sectionId:'s'},identity:{ownerId:'one',planId:'plan',operationId:'old',createdAt:100}};
  const storage=new Map([['kairos-task-quick-pending:one:plan',JSON.stringify([[JSON.stringify(['b','s']),pending]])]]);
  const persist=async(c,e,id)=>store.context.persistTaskListCommand('plan','one',c,e,id.operationId,id.createdAt);persist.data=store.data;
  const f=await fixture({persist,storage});await f.workspace.openSection({boardId:'b',sectionId:'s'});assert.equal(await f.workspace.submit(),false);assert.equal(store.writes.length,0);
  assert.equal(typeof f.workspace.discard,'function');f.setDiscard(false);assert.equal(await f.workspace.discard(),false);assert.equal(f.root.querySelector('[data-quick-title]').disabled,true);
  f.setDiscard(true);assert.equal(await f.workspace.discard(),true);assert.match(f.confirmations[0],/may.*saved/i);assert.equal(f.root.querySelector('[data-quick-title]').disabled,false);assert.equal(f.root.querySelector('[data-quick-title]').value,'');assert.equal(store.writes.length,0);
  f.type('Different');assert.equal(await f.workspace.submit(),true);assert.notEqual(f.calls.at(-1).identity.operationId,'old');assert.equal(store.data().boards[0].sections[0].tasks[0].title,'Different');
});
test('malformed pending and preference storage cannot prevent Tasks mounting',async()=>{
  for(const pending of [{},[[],['bad',{command:{type:'create_task',task:{title:'Bad'}},identity:{ownerId:'one',planId:'plan'}}]]]){
    const storage=new Map([['kairos-task-quick-pending:one:plan',JSON.stringify(pending)],['kairos-task-list-view:one:plan','42']]);
    const f=await fixture({storage});f.workspace.decorateOverview();await f.workspace.openSection({boardId:'b',sectionId:'s'});assert.equal(f.root.querySelector('[data-quick-title]').disabled,false);f.workspace.dispose();
  }
  const f=await fixture({storage:new Map([['kairos-task-list-view:one:plan',JSON.stringify({[JSON.stringify(['b','s'])]:3})]])});await f.workspace.openSection({boardId:'b',sectionId:'s'});f.root.querySelector('[data-show-completed]').click();assert.equal(f.root.querySelector('[data-detail-row="done"]').hidden,true);
});
test('remote task order and insertion update DOM order while retaining input nodes',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});const title=f.root.querySelector('.task-text'),tasks=f.data().boards[0].sections[0].tasks;
  tasks.reverse();tasks.splice(1,0,{id:'inserted',title:'New'});f.workspace.render();assert.deepEqual([...f.root.querySelector('[data-section-tasks]').children].map(row=>row.dataset.detailRow),['done','inserted','t']);assert.equal(f.root.querySelector('[data-detail-row="t"] .task-text'),title);
});
test('Back resolves the originating section after the real overview rebuild',async()=>{
  const f=await fixture({rebuildOverview:true});f.workspace.decorateOverview();const source=f.overview.querySelector('[data-section-id="s2"] [data-open-section]');await f.workspace.openSection({boardId:'b',sectionId:'s2'},source);await f.workspace.back();
  assert.equal(source.isConnected,false);assert.equal(f.focused().closest('.board-section-block').dataset.sectionId,'s2');
});
test('moving an active row during refresh preserves its draft when DOM movement temporarily loses focus',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});const title=f.root.querySelector('[data-detail-row="done"] .task-text'),list=f.root.querySelector('[data-section-tasks]');let active=title;
  Object.defineProperty(f.document,'activeElement',{configurable:true,get:()=>active});title.focus=()=>active=title;title.value='Typing';title.selectionStart=2;title.selectionEnd=4;title.setSelectionRange=(a,b)=>{title.selectionStart=a;title.selectionEnd=b};
  const insert=list.insertBefore.bind(list);list.insertBefore=(row,before)=>{const movingActive=row.contains(active),out=insert(row,before);if(movingActive)active=f.document.body;return out};
  f.data().boards[0].sections[0].tasks.reverse();f.data().boards[0].sections[0].tasks[0].title='Remote';f.workspace.render();assert.equal(title.value,'Typing');assert.ok(active===title);assert.equal(title.selectionStart,2);assert.equal(title.selectionEnd,4);
});

test('Add task opens capture inside the board without leaving the overview',async()=>{
  const f=await fixture({rebuildOverview:true});f.workspace.decorateOverview();f.scroll.scrollTop=180;
  const button=f.overview.querySelector('.add-task-btn');button.click();await tick();
  assert.equal(f.overview.hidden,false);assert.equal(f.workspace.isFocused(),false);assert.equal(f.workspace.getViewKey(),'overview');
  const input=f.root.querySelector('[data-quick-title]');assert.equal(input.closest('.board-section-block').dataset.sectionId,'s');assert.equal(f.focused(),input);assert.equal(f.scroll.scrollTop,180);
  f.type('First');assert.equal(await f.workspace.submit(),true);f.type('Second');assert.equal(await f.workspace.submit(),true);
  assert.deepEqual(f.data().boards[0].sections[0].tasks.slice(-2).map(task=>task.title),['First','Second']);assert.equal(input.value,'');
  f.type('Cancel this');const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';input.dispatchEvent(escape);
  assert.equal(f.overview.querySelector('.task-quick-add'),null);assert.equal(f.focused(),button);assert.equal(f.calls.length,2);
});

test('inline capture survives an overview refresh and keeps its draft and caret',async()=>{
  const f=await fixture({rebuildOverview:true});const html=f.overview.innerHTML;f.workspace.replaceOverview(html);f.workspace.decorateOverview();
  f.overview.querySelector('.add-task-btn').click();await tick();const input=f.type('Keep typing');input.selectionStart=3;input.selectionEnd=6;
  Object.defineProperty(f.document,'activeElement',{configurable:true,value:input});
  f.workspace.replaceOverview(html);f.workspace.decorateOverview();
  assert.ok(f.overview.querySelector('[data-quick-title]')===input,'input remains inside the board');assert.equal(input.value,'Keep typing');assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,6);
});

test('IME Enter never submits a quick capture task',async()=>{
  const f=await fixture();await f.workspace.openSection({boardId:'b',sectionId:'s'});const input=f.type('Composing');
  const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Enter';event.isComposing=true;input.dispatchEvent(event);await tick();
  assert.equal(f.calls.length,0);assert.equal(event.defaultPrevented,false);
});

test('a slow inline save never steals focus from another control',async()=>{
  const f=await fixture();await f.workspace.addTask({boardId:'b',sectionId:'s'},f.overview.querySelector('.add-task-btn'));const input=f.type('Read');
  let active=input,focusCount=0,release;Object.defineProperty(f.document,'activeElement',{configurable:true,get:()=>active});input.focus=()=>{active=input;focusCount++};
  f.block(new Promise(resolve=>release=resolve));const saving=f.workspace.submit();await tick();active=f.document.getElementById('chat');release();await saving;
  assert.ok(active===f.document.getElementById('chat'),'newer focus remains on chat');assert.equal(focusCount,0);
});

test('inline capture retains separate drafts when switching sections and closing a section',async()=>{
  const f=await fixture({rebuildOverview:true});await f.workspace.addTask({boardId:'b',sectionId:'s'});f.type('First draft');
  await f.workspace.addTask({boardId:'b',sectionId:'s2'});f.type('Second draft');await f.workspace.addTask({boardId:'b',sectionId:'s'});
  assert.equal(f.root.querySelector('[data-quick-title]').value,'First draft');
  await f.workspace.collapseSection({boardId:'b',sectionId:'s'});assert.equal(f.overview.querySelector('.task-quick-add'),null);
  await f.workspace.addTask({boardId:'b',sectionId:'s'});assert.equal(f.root.querySelector('[data-quick-title]').value,'First draft');
});

test('inline uncertain save retries the original creation once',async()=>{
  const base={userID:'one',boards:[{id:'b',title:'Study',sections:[{id:'s',title:'Work',tasks:[]}]}]};
  const store=await plannerFixture(base,{failAfterCommit:true});store.context.applyTaskListCommand=applyTaskListCommand;
  const persist=async(c,e,id)=>store.context.persistTaskListCommand('plan','one',c,e,id.operationId,id.createdAt);persist.data=store.data;
  const f=await fixture({persist});await f.workspace.addTask({boardId:'b',sectionId:'s'});const input=f.type('Read');
  assert.equal(await f.workspace.submit(),false);assert.equal(input.disabled,true);assert.equal(f.root.querySelector('[data-quick-cancel]').hidden,true);
  assert.equal(f.root.querySelector('[data-quick-discard]').hidden,false);assert.equal(f.root.querySelector('form').getAttribute('aria-busy'),'false');
  assert.equal(await f.workspace.submit(),true);assert.deepEqual(f.calls[0].identity,f.calls[1].identity);assert.equal(store.writes.length,1);assert.equal(store.data().boards[0].sections[0].tasks.length,1);assert.equal(input.disabled,false);
});

test('a deleted inline section falls back to an explicit recovery view',async()=>{
  const f=await fixture();await f.workspace.addTask({boardId:'b',sectionId:'s'});f.type('Draft');f.data().boards[0].sections.splice(0,1);
  f.workspace.replaceOverview('');f.workspace.decorateOverview();
  assert.equal(f.workspace.isFocused(),true);assert.match(f.root.querySelector('[data-section-state]').textContent,/available/i);assert.equal(f.root.querySelector('[data-quick-title]').disabled,true);
});

test('opening capture reveals an offscreen input without scrolling a visible one',async()=>{
  const f=await fixture(),input=f.root.querySelector('[data-quick-title]');let top=900,calls=0;
  f.window.innerHeight=768;f.scroll.getBoundingClientRect=()=>({top:0,bottom:768});input.getBoundingClientRect=()=>({top,bottom:top+44});f.root.querySelector('form').getBoundingClientRect=()=>({top,bottom:top+160});input.scrollIntoView=options=>{assert.equal(options.block,'nearest');calls++};
  await f.workspace.addTask({boardId:'b',sectionId:'s'});assert.equal(calls,1);top=200;
  await f.workspace.addTask({boardId:'b',sectionId:'s'});assert.equal(calls,1);
});
