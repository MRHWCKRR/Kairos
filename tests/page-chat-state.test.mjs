import {isAiEventAction,aiEventPreviewMarkup} from '../ai-event-actions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mountPageRouter} from '../page-router.js';
import {aiConversationMessages,aiErrorMessage} from '../ai-request.js';
import {appendPlanLimitActions} from '../plan-usage.js';
import {ACTION_TYPES,ACTION_INSTRUCTIONS,validateActionShape,explicitDurationIntent} from '../ai-action-schema.js';

const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
const source=(await readFile(new URL('../ai-workspace.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
const workspace={activeChatId:'first',projects:[],chats:['first','second'].map(id=>({id,autoMemoryEnabled:false,messages:[]}))};
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

function setup(data=workspace,{getDoc,aiFetch}={}) {
  const {document,window}=parseHTML(html);
  document.addEventListener('DOMContentLoaded',()=>{});
  Object.defineProperty(document,'readyState',{value:'loading'});
  window.location={href:'https://kairos.invalid/app.html?page=ai'};
  window.history={state:null,pushState(_,__,url){window.location.href=url;},replaceState(_,__,url){window.location.href=url;}};
  const auth={currentUser:{uid:'fixture',emailVerified:true}};
  let saved=data;const activityEvents=[];
  const context=vm.createContext({isAiEventAction,aiEventPreviewMarkup,ACTION_TYPES,ACTION_INSTRUCTIONS,validateActionShape,explicitDurationIntent,document,window,auth,db:{},console,
    localStorage:{getItem:()=>null,setItem(){}},
    requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,
    onAuthStateChanged:(_,callback)=>void callback(auth.currentUser),
    doc:()=>({}),getDoc:getDoc||(async()=>({exists:()=>true,data:()=>({aiWorkspace:saved})})),
    setDoc:async(_,value)=>{saved=JSON.parse(JSON.stringify(value.aiWorkspace));},
    aiFetch,getKairosContext:async()=>'',aiConversationMessages,aiErrorMessage,appendPlanLimitActions,
    initializeMessageUsage:async()=>{},recordSentMessage:async(uid,baseline)=>activityEvents.push({uid,baseline}),savedMessageCount:()=>0,actionNeedsConfirmation:()=>false});
  vm.runInContext(source,context);
  context.boot();
  return {document,window,context,saved:()=>saved,activityEvents};
}

test('combined check-only and no-fit reports finish in chat without offering Apply or writing a plan',async()=>{
 const action={type:'plan_assignments',args:{assignmentIds:['a','q'],from:'2099-01-01',to:'2099-01-01',checkOnly:true}},f=setup(workspace,{aiFetch:async()=>Response.json({choices:[{message:{content:JSON.stringify({reply:'Checking shared capacity.',actions:[action]})}}]})});await f.window.__kairosAiWorkspaceReady;let executions=0;f.context.actionNeedsConfirmation=()=>true;f.context.getAiPlanId=async()=> 'plan';f.context.confirmedKairosAction=async()=>null;f.context.previewKairosAction=async action=>({action,approval:null,summary:{kind:'planning',rows:[],notice:'Shared capacity: 60 minutes short. Nothing changed.'}});f.context.executeKairosAction=async()=>{executions++;throw Error('Must not execute')};
 f.document.getElementById('ai-chat-input').value='Will both assignments fit?';await f.context.send();const chat=f.saved().chats.find(c=>c.id==='first');assert.match(chat.messages.at(-1).content,/60 minutes short/);assert.equal(chat.pendingActionBatch,null);assert.doesNotMatch(chat.messages.at(-1).content,/retry|could not confirm/i);assert.equal(f.document.querySelector('[data-ok]'),null);assert.equal(executions,0);
});
test('combined planning review escapes assignment data and retains excluded-work disclosure',async()=>{
 const f=setup();await f.window.__kairosAiWorkspaceReady;const html=f.context.actionPreviewMarkup({kind:'planning',title:'Combined assignment plan',notice:'Partial plan. Science stays unchanged.',timezone:'UTC',options:{dayStart:'07:00',dayEnd:'08:00'},capacity:{assignments:[{title:'<img src=x>',status:'not-placed',remainingMinutes:60,reason:'Needs <review>'}]},rows:[{title:'Essay / Research',date:'2099-01-01',startTime:'07:00',endTime:'08:00',minutes:60}]});const area=f.document.createElement('div');area.innerHTML=html;assert.equal(area.querySelector('img'),null);assert.match(area.textContent,/Science stays unchanged/);assert.match(area.textContent,/Not placed/);assert.match(area.textContent,/Needs <review>/);
 assert.match(f.context.actionResultReply([{type:'planning_batch',action:'move',affectedCount:1,combinedPlan:true}]),/outside the preview stayed unchanged/);
});

test('deferred chat readiness waits for persisted conversations',async()=>{
  let release;
  const snapshot=new Promise(resolve=>release=resolve);
  const f=setup(workspace,{getDoc:()=>snapshot});
  let ready=false;f.window.__kairosAiWorkspaceReady.then(()=>ready=true);
  await settle();assert.equal(ready,false);
  release({exists:()=>true,data:()=>({aiWorkspace:workspace})});
  await f.window.__kairosAiWorkspaceReady;
  assert.equal(f.document.querySelectorAll('[data-id]').length,2);
});

test('concurrent responses survive page switches and restore after reload',async()=>{
  const responses=[];
  const f=setup(workspace,{aiFetch:()=>new Promise(resolve=>responses.push(resolve))});
  await f.window.__kairosAiWorkspaceReady;
  const router=mountPageRouter({document:f.document,window:f.window});await router.start();
  f.document.getElementById('ai-chat-input').value='Hello';const first=f.context.send();await settle();
  f.document.querySelector('[data-id="second"]').click();
  f.document.getElementById('ai-chat-input').value='Hi';const second=f.context.send();await settle();
  assert.equal(responses.length,2);
  assert.equal(f.activityEvents.length,2);
  await router.navigate('tasks-page');await router.navigate('settings-page');
  responses[1](Response.json({choices:[{message:{content:JSON.stringify({reply:'Second response',actions:[]})}}]}));
  await second;
  responses[0](Response.json({choices:[{message:{content:JSON.stringify({reply:'First response',actions:[]})}}]}));
  await first;await router.navigate('ai-page');
  assert.match(f.document.getElementById('ai-chat-messages').textContent,/Second response/);
  const restored=setup(f.saved());await restored.window.__kairosAiWorkspaceReady;
  restored.document.querySelector('[data-id="first"]').click();
  assert.match(restored.document.getElementById('ai-chat-messages').textContent,/First response/);
  assert.equal(restored.document.querySelectorAll('[data-id]').length,2);
});

test('daily limit action survives chat persistence while ordinary rate notices save cleanly',async()=>{
  for(const reason of ['daily-account','rate']){
    const resetsAt=new Date(Date.now()+86400000).toISOString();
    const f=setup(workspace,{aiFetch:async()=>{throw Object.assign(Error('Allowance reached'),{code:'ai-protection',reason,...(reason==='daily-account'?{resetsAt}:{})});}});
    await f.window.__kairosAiWorkspaceReady;
    f.document.getElementById('ai-chat-input').value='Hello';await f.context.send();
    const messages=f.saved().chats.find(c=>c.id==='first').messages,notice=messages.find(m=>m.notice);
    assert.ok(notice);
    if(reason==='daily-account'){
      assert.deepEqual(notice.limit,{reason,resetsAt});
      const restored=setup(f.saved());await restored.window.__kairosAiWorkspaceReady;
      assert.ok(restored.document.querySelector('[data-plan-limit-action]'));
    }else assert.equal(Object.hasOwn(notice,'limit'),false);
    assert.equal(aiConversationMessages(messages).some(m=>m.notice),false);
  }
});
