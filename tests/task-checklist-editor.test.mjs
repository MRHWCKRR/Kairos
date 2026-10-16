import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

const initial=()=>[{id:'a',title:'Read',completed:false},{id:'b',title:'Write notes',completed:false}];
async function fixture(options={}){
 const module=await import('../task-checklist-editor.js').catch(()=>({}));assert.equal(typeof module.mountTaskChecklistEditor,'function');
 const {document,window}=parseHTML('<html><body><form><section class="task-checklist"></section></form></body></html>');let active=document.body,uuidCalls=0;const changes=[],statuses=[];
 Object.defineProperty(document,'activeElement',{get:()=>active?.isConnected?active:document.body});window.HTMLElement.prototype.focus=function(){active=this};window.HTMLInputElement.prototype.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end};
 const root=document.querySelector('section'),items=options.items||initial();
 const editor=module.mountTaskChecklistEditor({root,items,document,window,uuid:()=>String(++uuidCalls),onChange:items=>changes.push(items),onStatus:(...args)=>statuses.push(args),...options});
 const event=(target,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);target.dispatchEvent(e);return e};
 const row=id=>[...root.querySelectorAll('[data-step-row]')].find(row=>row.dataset.stepRow===id),title=id=>row(id)?.querySelector('[data-step-title]'),composer=root.querySelector('[data-checklist-new]');
 const input=(id,value)=>{title(id).value=value;event(title(id),'input')},add=value=>{composer.value=value;root.querySelector('[data-checklist-add]').click()};
 return {root,document,window,editor,items,changes,statuses,event,row,title,composer,input,add,uuidCalls:()=>uuidCalls};
}
test('checklist draft is isolated, safely rendered and uses stable IDs',async()=>{
 const items=[{id:'a',title:'<img src=x onerror=alert(1)>',completed:false}],f=await fixture({items});assert.equal(f.root.querySelector('img'),null);assert.equal(f.title('a').value,items[0].title);const clone=f.editor.read();clone[0].title='Changed';assert.equal(f.editor.read()[0].title,items[0].title);f.input('a','Renamed');assert.equal(items[0].title,'<img src=x onerror=alert(1)>');assert.equal(f.editor.read()[0].id,'a');f.editor.dispose();
});
test('preserves an unaffected checklist row and caret while a sibling changes',async()=>{
 const f=await fixture(),before=f.row('b'),title=f.title('b');title.focus();title.setSelectionRange(2,4);f.input('a','Read again');assert.equal(f.row('b'),before);assert.equal(f.document.activeElement,title);assert.equal(title.selectionStart,2);assert.equal(title.selectionEnd,4);assert.equal(f.editor.read()[0].title,'Read again');f.editor.dispose();
});
test('completion updates progress without replacing neighboring inputs or mutating source items',async()=>{
 const f=await fixture(),title=f.title('b'),check=f.row('a').querySelector('[data-step-check]');check.checked=true;f.event(check,'change');assert.match(f.root.querySelector('[data-checklist-progress]').textContent,/1\s*\/\s*2/);assert.equal(f.title('b'),title);assert.equal(f.editor.read()[0].completed,true);assert.equal(f.items[0].completed,false);assert.equal(f.changes.length,1);f.editor.dispose();
});
test('add, move and remove keep logical focus and exact surviving row identities',async()=>{
 const f=await fixture(),a=f.row('a');f.add('Third');assert.deepEqual(f.editor.read().map(item=>item.id),['a','b','step-1']);assert.equal(f.document.activeElement,f.composer);assert.equal(f.row('a'),a);
 const up=f.row('b').querySelector('[data-step-action="up"]');up.focus();up.click();assert.deepEqual(f.editor.read().map(item=>item.id),['b','a','step-1']);assert.equal(f.document.activeElement,f.title('b'));assert.equal(f.row('a'),a);
 const remove=f.row('b').querySelector('[data-step-action="remove"]');remove.focus();remove.click();assert.equal(f.document.activeElement,f.title('a'));f.row('a').querySelector('[data-step-action="remove"]').focus();f.row('a').querySelector('[data-step-action="remove"]').click();f.row('step-1').querySelector('[data-step-action="remove"]').focus();f.row('step-1').querySelector('[data-step-action="remove"]').click();assert.deepEqual(f.editor.read(),[]);assert.equal(f.document.activeElement,f.composer);f.editor.dispose();
});
test('series completion and busy-state restrictions cannot be bypassed with DOM events',async()=>{
 const f=await fixture({canToggle:false}),check=f.row('a').querySelector('[data-step-check]');assert.equal(check.disabled,true);check.checked=true;f.event(check,'change');assert.equal(f.editor.read()[0].completed,false);assert.equal(f.title('a').disabled,false);f.input('a','Template title');assert.equal(f.editor.read()[0].title,'Template title');f.editor.setDisabled(true);f.add('Blocked');f.input('a','Blocked');assert.equal(f.editor.read().length,2);assert.equal(f.editor.read()[0].title,'Template title');assert.equal(f.composer.disabled,true);f.editor.setDisabled(false);assert.equal(check.disabled,true);f.editor.dispose();
});
test('focus snapshots restore a surviving control and dispose removes event handlers',async()=>{
 const f=await fixture();f.title('a').focus();f.title('a').setSelectionRange(1,3);const snapshot=f.editor.captureFocus();assert.deepEqual(snapshot,{stepId:'a',control:'title',start:1,end:3});f.composer.focus();f.editor.restoreFocus(snapshot);assert.equal(f.document.activeElement,f.title('a'));assert.equal(f.title('a').selectionEnd,3);const before=f.editor.read();f.editor.dispose();f.input('a','After disposal');assert.deepEqual(f.editor.read(),before);
});
test('checklist labels, editors and context gestures retain parent task selection',async()=>{
 const f=await fixture(),{mountTaskSelection}=await import('../task-selection.js');f.root.closest('form').className='task-detail-pane';const task=f.document.createElement('div');task.dataset.detailRow='t';f.document.body.appendChild(task);f.document.body.classList.add('active');const selection=mountTaskSelection({root:f.document.body,getIdentity:()=>({ownerId:'u',planId:'p'}),getViewKey:()=>'',resolveTarget:()=>({task:{id:'t'},board:{id:'b'},section:{id:'s'}})});selection.toggle('t');
 for(const target of [f.row('a').querySelector('label'),f.row('a').querySelector('[data-step-check]'),f.title('a'),f.composer]){f.event(target,'click',{button:0});f.event(target,'contextmenu');assert.deepEqual(selection.ids(),['t']);}selection.dispose();f.editor.dispose();
});
test('repeat entry adds five steps while empty and composing Enter never add or submit',async()=>{
 const f=await fixture({items:[]});let submissions=0;f.root.closest('form').addEventListener('submit',()=>submissions++);
 for(let i=0;i<5;i++){f.composer.value='Step '+i;const e=f.event(f.composer,'keydown',{key:'Enter'});assert.equal(e.defaultPrevented,true);assert.equal(f.document.activeElement,f.composer);assert.equal(f.composer.value,'');}
 assert.equal(f.editor.read().length,5);const statusCount=f.statuses.length;f.event(f.composer,'keydown',{key:'Enter'});assert.equal(f.statuses.length,statusCount);f.composer.value='正在输入';const composing=f.event(f.composer,'keydown',{key:'Enter',isComposing:true});assert.equal(composing.defaultPrevented,false);assert.equal(f.editor.read().length,5);assert.equal(submissions,0);f.editor.dispose();
});
test('keyboard title navigation preserves native shortcuts and delegates Ctrl/Cmd Enter to pane Save',async()=>{
 const f=await fixture();let saveEvents=0;f.root.closest('form').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))saveEvents++});
 f.title('a').focus();assert.equal(f.event(f.title('a'),'keydown',{key:'Enter'}).defaultPrevented,true);assert.equal(f.document.activeElement,f.title('b'));f.event(f.title('b'),'keydown',{key:'Enter',shiftKey:true});assert.equal(f.document.activeElement,f.title('a'));f.event(f.title('a'),'keydown',{key:'Enter',shiftKey:true});assert.equal(f.document.activeElement,f.title('a'));f.event(f.title('b'),'keydown',{key:'Enter'});assert.equal(f.document.activeElement,f.composer);
 for(const props of [{key:'Tab'},{key:'Backspace'},{key:'Delete'},{key:'a',ctrlKey:true}])assert.equal(f.event(f.title('a'),'keydown',props).defaultPrevented,false);
 f.composer.value='Pending';for(const modifier of ['ctrlKey','metaKey'])assert.equal(f.event(f.composer,'keydown',{key:'Enter',[modifier]:true}).defaultPrevented,false);assert.equal(saveEvents,2);assert.equal(f.editor.read().length,2);f.editor.dispose();
});
function paste(f,value){return f.event(f.composer,'paste',{clipboardData:{getData:type=>type==='text/plain'?value:''}})}
test('completed visibility is presentation only and retains total progress and draft IDs',async()=>{
 const f=await fixture({items:[{id:'a',title:'Done',completed:true},{id:'b',title:'Next',completed:false}]});const toggle=f.root.querySelector('[data-checklist-completed-toggle]');assert.ok(toggle);assert.match(toggle.textContent,/Hide completed/);assert.equal(f.row('a').hidden,false);const before=f.editor.read(),row=f.row('a');toggle.click();assert.equal(f.row('a').hidden,true);assert.ok(f.row('a')===row);assert.match(toggle.textContent,/Show completed/);assert.match(f.root.querySelector('[data-checklist-progress]').textContent,/1.*2/);assert.deepEqual(f.editor.read(),before);assert.equal(f.changes.length,0);assert.equal(f.statuses.length,0);assert.deepEqual(f.editor.captureView(),{showCompleted:false});f.editor.restoreView({showCompleted:true});assert.equal(f.row('a').hidden,false);assert.equal(f.changes.length,0);f.editor.dispose();
});
test('filtered keyboard navigation and arrow movement skip hidden steps without losing them',async()=>{
 const f=await fixture({items:[{id:'a',title:'First',completed:false},{id:'hidden',title:'Done',completed:true},{id:'b',title:'Last',completed:false}]});const toggle=f.root.querySelector('[data-checklist-completed-toggle]');assert.ok(toggle);toggle.click();f.title('a').focus();f.title('a').setSelectionRange(1,3);f.event(f.title('a'),'keydown',{key:'Enter'});assert.ok(f.document.activeElement===f.title('b'));f.event(f.title('b'),'keydown',{key:'Enter',shiftKey:true});assert.ok(f.document.activeElement===f.title('a'));f.event(f.title('a'),'keydown',{key:'ArrowDown',altKey:true});assert.deepEqual(f.editor.read().map(x=>x.id),['hidden','b','a']);assert.ok(f.document.activeElement===f.title('a'));f.row('a').querySelector('[data-step-action="up"]').click();assert.deepEqual(f.editor.read().map(x=>x.id),['hidden','a','b']);assert.equal(f.row('hidden').hidden,true);assert.equal(f.editor.read().length,3);f.editor.dispose();
});
test('hiding a focused completed row moves to a visible neighbour or composer',async()=>{
 const f=await fixture();const toggle=f.root.querySelector('[data-checklist-completed-toggle]');assert.ok(toggle);toggle.click();const check=f.row('a').querySelector('[data-step-check]');check.focus();check.checked=true;f.event(check,'change');assert.equal(f.row('a').hidden,true);assert.ok(f.document.activeElement===f.title('b'));const last=f.row('b').querySelector('[data-step-check]');last.focus();last.checked=true;f.event(last,'change');assert.ok(f.document.activeElement===f.composer);assert.equal(f.editor.read().length,2);f.editor.setDisabled(true);const view=f.editor.captureView();toggle.click();assert.deepEqual(f.editor.captureView(),view);f.editor.dispose();toggle.click();assert.deepEqual(f.editor.captureView(),view);
});
test('Alt arrows reorder only checklist titles and grips with stable caret and no parent shortcut',async()=>{
 const f=await fixture();let parentKeys=0;f.root.closest('form').addEventListener('keydown',()=>parentKeys++);const before=f.row('a'),title=f.title('a');title.focus();title.setSelectionRange(2,4);const down=f.event(title,'keydown',{key:'ArrowDown',altKey:true});assert.equal(down.defaultPrevented,true);assert.deepEqual(f.editor.read().map(item=>item.id),['b','a']);assert.ok(f.row('a')===before);assert.ok(f.document.activeElement===title);assert.equal(title.selectionStart,2);assert.equal(title.selectionEnd,4);assert.equal(f.changes.length,1);assert.match(f.statuses.at(-1)[0],/2.*2/);const grip=f.row('a').querySelector('[data-step-grip]');assert.ok(grip);grip.focus();f.event(grip,'keydown',{key:'ArrowUp',altKey:true});assert.deepEqual(f.editor.read().map(item=>item.id),['a','b']);assert.ok(f.document.activeElement===grip);assert.equal(parentKeys,0);assert.equal(f.changes.length,2);f.editor.dispose();
});
test('keyboard reorder boundaries composition and disabled state do not mutate',async()=>{
 for(const count of [0,1,100]){const f=await fixture({items:Array.from({length:count},(_,i)=>({id:'s'+i,title:'Step '+i,completed:false}))});if(count){const first=f.title('s0');first.focus();assert.equal(f.event(first,'keydown',{key:'ArrowUp',altKey:true}).defaultPrevented,true);const last=f.title('s'+(count-1));assert.equal(f.event(last,'keydown',{key:'ArrowDown',altKey:true}).defaultPrevented,true);for(const options of [{isComposing:true},{ctrlKey:true},{metaKey:true},{shiftKey:true}])assert.equal(f.event(first,'keydown',{key:'ArrowDown',altKey:true,...options}).defaultPrevented,false);assert.equal(f.changes.length,0);f.editor.setDisabled(true);assert.equal(f.row('s0').querySelector('[data-step-grip]')?.disabled,true);f.event(first,'keydown',{key:'ArrowDown',altKey:true});assert.equal(f.changes.length,0);}assert.equal(f.editor.read().length,count);f.editor.dispose();}
});
test('custom menu multiline paste uses the same atomic composer path',async()=>{
 const f=await fixture({items:[]});f.composer.value='Review';f.composer.setSelectionRange(0,6);const e=f.event(f.composer,'beforeinput',{inputType:'insertFromPaste',data:'Read\nWrite'});assert.equal(e.defaultPrevented,true);assert.deepEqual(f.editor.read().map(item=>item.title),['Read','Write']);f.composer.value='Keep';f.composer.setSelectionRange(0,4);f.event(f.composer,'beforeinput',{inputType:'insertFromPaste',data:'Valid\n'+'x'.repeat(181)});assert.equal(f.editor.read().length,2);assert.equal(f.composer.value,'Keep');f.editor.dispose();
});
test('multiline paste replaces selected composer text and appends trimmed nonempty lines in order',async()=>{
 const f=await fixture({items:[]});f.composer.focus();f.composer.value='Prefix ';f.composer.setSelectionRange(7,7);assert.equal(paste(f,'Read\r\n\nWrite').defaultPrevented,true);assert.deepEqual(f.editor.read().map(item=>item.title),['Prefix Read','Write']);assert.equal(f.composer.value,'');assert.equal(f.document.activeElement,f.composer);
 f.composer.value='Review';f.composer.setSelectionRange(0,6);paste(f,'Read\nWrite');assert.deepEqual(f.editor.read().slice(2).map(item=>item.title),['Read','Write']);f.composer.value='Start end';f.composer.setSelectionRange(5,5);paste(f,'\rMiddle\r');assert.deepEqual(f.editor.read().slice(4).map(item=>item.title),['Start','Middle','end']);assert.equal(paste(f,'single line').defaultPrevented,false);f.editor.dispose();
});
test('rejects an entire multiline addition beyond checklist limits without consuming IDs',async()=>{
 for(const scenario of ['count','title']){
  const items=scenario==='count'?Array.from({length:99},(_,i)=>({id:'old-'+i,title:'Existing',completed:false})):initial(),f=await fixture({items}),before=f.editor.read();f.composer.value='Keep me';f.composer.setSelectionRange(0,7);const content=scenario==='count'?'One\nTwo':'Valid\n'+'x'.repeat(181);assert.equal(paste(f,content).defaultPrevented,true);assert.deepEqual(f.editor.read(),before);assert.equal(f.composer.value,'Keep me');assert.equal(f.uuidCalls(),0);assert.equal(f.statuses.at(-1)[1],true);f.editor.dispose();
 }
 const f=await fixture({items:Array.from({length:99},(_,i)=>({id:'old-'+i,title:'Existing',completed:false}))});f.composer.value='x'.repeat(180);assert.equal(f.editor.flushEntry(),true);assert.equal(f.editor.read().length,100);assert.equal(f.editor.read().at(-1).title.length,180);f.editor.dispose();
});
test('pending composer flushes once, preserves invalid entry and honors disabled state',async()=>{
 const f=await fixture();f.composer.value='Review';assert.equal(f.editor.hasPendingEntry(),true);assert.equal(f.editor.flushEntry(),true);assert.equal(f.editor.hasPendingEntry(),false);assert.equal(f.editor.flushEntry(),true);assert.equal(f.editor.read().filter(item=>item.title==='Review').length,1);f.composer.value='x'.repeat(181);assert.equal(f.editor.flushEntry(),false);assert.equal(f.composer.value.length,181);f.editor.setDisabled(true);const before=f.editor.read();paste(f,'Blocked\nPaste');assert.deepEqual(f.editor.read(),before);f.editor.dispose();
});
