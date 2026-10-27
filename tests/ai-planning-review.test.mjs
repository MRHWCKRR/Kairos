import {isAiEventAction} from '../ai-event-actions.js';
import {weeklyAvailabilityText} from '../weekly-availability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

const source=(await readFile(new URL('../ai-workspace.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
async function fixture(){
 const {document,window}=parseHTML('<html><body></body></html>');
 const entry={action:{type:'plan_sessions',args:{taskId:'a'}},operationId:'op'},calls=[];
 const preview={action:entry.action,approval:{command:{rows:[{taskId:'stable-id'}]},expected:{signature:'before'}},summary:{kind:'planning',title:'New sessions',timezone:'Australia/Brisbane',options:{dayStart:'07:00',dayEnd:'22:00'},rows:[{title:'<img src=x> Essay',date:'2026-10-19',startTime:'09:00',endTime:'09:30',minutes:30}]}};
 document.addEventListener=()=>{};
 const c=vm.createContext({isAiEventAction,weeklyAvailabilityText,document,window,console,auth:{currentUser:{uid:'one'}},confirmedKairosAction:async()=>null,previewKairosAction:async()=>{calls.push('preview');return preview},executeKairosAction:async(a,o)=>{calls.push(o);return {type:'planning_batch',action:'sessions',affectedCount:1}},entry,calls});
 vm.runInContext(source,c);vm.runInContext("chats=[{id:'chat'}];user={uid:'one'};save=async()=>{calls.push('save')}",c);
 return {c,document,entry,calls,review:()=>c.requestActionConfirmation('chat',entry.action,{ownerId:'one',planId:'plan',operationId:'op'},entry)};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('chat review shows exact escaped placements, stores them before Apply and does not write on Cancel',async()=>{
 const f=await fixture(),p=f.review();await tick();
 assert.ok(f.entry.preview,'review command must survive reload');assert.equal(f.calls[1],'save');
 assert.match(f.document.body.textContent,/09:00.*09:30/);assert.match(f.document.body.textContent,/Australia\/Brisbane/);assert.equal(f.document.querySelector('img'),null);
 assert.equal(f.calls.filter(x=>typeof x==='object').length,0);f.document.querySelector('[data-cancel]').click();assert.equal(await p,false);
});
test('a reloaded review reuses its exact command and only Apply executes it',async()=>{
 const f=await fixture(),p=f.review();await tick();f.document.querySelector('[data-ok]').click();await p;
 const first=f.calls.find(x=>typeof x==='object');assert.deepEqual(first.confirmation,f.entry.preview.approval);
 const next=f.review();await tick();assert.equal(f.calls.filter(x=>x==='preview').length,1);f.document.querySelector('[data-ok]').click();await next;
 assert.equal(f.calls.filter(x=>typeof x==='object').length,2);
});
test('planning success reports the saved session count without completing the parent',async()=>{
 const f=await fixture();assert.match(f.c.singleActionResultReply([{type:'planning_batch',action:'sessions',affectedCount:4}]),/4.*session/i);
});

test('chat review discloses the saved weekly windows instead of undefined daily hours',async()=>{const f=await fixture();vm.runInContext("globalThis.markup=actionPreviewMarkup({kind:'planning',title:'New sessions',timezone:'UTC',options:{weeklyAvailability:Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]]))},rows:[]})",f.c);assert.match(f.c.markup,/Saved weekly hours/);assert.match(f.c.markup,/Monday: 18:00/);assert.doesNotMatch(f.c.markup,/undefined/)});
