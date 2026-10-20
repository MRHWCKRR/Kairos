import {normalizeGettingStarted} from './getting-started-model.js?v=1';
import {describeShortcut} from './shortcut-model.js?v=1';

const STEPS=[
 {title:'Create a board and task',text:'Open Routines & Tasks. Choose Add board, add a section, then add a task you actually want to do. Give it a short, clear title.',page:'tasks-page',action:'Open Routines & Tasks',focus:'#add-board-btn'},
 {title:'Schedule your task',text:'Open Schedule, find your task in the backlog, and drag it onto a time. Select it to adjust its date, start time, or duration, then save your changes.',page:'schedule-page',action:'Open Schedule',focus:'#schedule-toolbar button'},
 {title:'Try AI Helper',text:'Ask for help with your plan, or try the example below. Review and edit it before pressing Send. Nothing is sent by this guide.',page:'ai-page',action:'Open AI Helper',focus:'#ai-chat-input',prompt:'Create a task called Science revision for tomorrow at 4 pm for 30 minutes.'},
 {title:'Set up reminders',text:'In Settings → Appearance, enable notifications and choose browser notifications if you want desktop alerts, then Save changes. Set a reminder on your scheduled task. Kairos must remain open for reminder delivery.',page:'settings-page',action:'Open notification settings',focus:'#settings-notif-enabled'},
 {title:'Commands and keyboard shortcuts',page:'settings-page',settingsTab:'accessibility',action:'Open shortcut settings',focus:'#shortcut-settings-editor'}
];

// Normal navigation never submits drafts or changes permissions. Account
// changes invalidate every asynchronous handoff.
export async function openGettingStartedDestination({request,owner,getOwner,navigate,document=globalThis.document}){
 if(getOwner()!==owner)return false;
 await navigate(request.page);
 if(getOwner()!==owner)return false;
 const page=document.getElementById(request.page);
 if(!page?.classList.contains('active')||page.inert||page.querySelector('.page-load-status'))return false;
 if(request.page==='settings-page')document.querySelector('[data-settings-tab="'+(request.settingsTab||'appearance')+'"]')?.click();
 const target=document.querySelector(request.focus);
 if(request.prompt){
  if(!target||target.disabled)return 'AI Helper is not ready yet. Try opening it again.';
  if(target.closest('[hidden],[inert]')||target.readOnly)return 'Open a chat or choose New chat in AI Helper, then use the example again.';
  if(target.value.trim())return 'Your existing AI draft is still there. Send or clear it before using the example.';
  target.value=request.prompt;target.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
 }
 target?.focus();target?.scrollIntoView?.({block:'nearest'});return true;
}

export function mountGettingStarted({document=globalThis.document,window=globalThis.window,getOwner,navigate,save=async()=>{throw Error('Guide storage unavailable')},onComplete=()=>{},getShortcuts=()=>undefined,storage}={}){
 if(!storage)try{storage=window.localStorage}catch{}
 const opener=document.getElementById('getting-started-open');
 let owner=null,state=null,root=null,revision=0,busy=false,message='',highlight=null,target=null,progressQueue=Promise.resolve();
 const terminal=new Set(),cache=new Map();
 const key=id=>'kairos-getting-started:'+id;
 function persist(){cache.set(owner,state);try{storage?.setItem(key(owner),JSON.stringify(state))}catch{}}
 function clearHighlight(){highlight?.remove();highlight=null;target=null}
 function positionHighlight(){
  if(!target||!highlight)return;
  const page=target.closest('.page-view');
  if(!target.isConnected||target.closest('[hidden],[inert]')||page&&!page.classList.contains('active')){clearHighlight();return}
  const rect=target.getBoundingClientRect?.();if(!rect)return;
  if(!rect.width||!rect.height){clearHighlight();return}
  Object.assign(highlight.style,{left:rect.left-5+'px',top:rect.top-5+'px',width:rect.width+10+'px',height:rect.height+10+'px'});
  const guideRect=root?.getBoundingClientRect?.();
  if(guideRect&&rect.left<guideRect.right&&rect.right>guideRect.left&&rect.top<guideRect.bottom&&rect.bottom>guideRect.top){root.style.right='auto';root.style.left='24px'}
 }
 function spotlight(selector){clearHighlight();target=document.querySelector(selector);if(!target)return;highlight=document.createElement('div');highlight.className='gs-spotlight';highlight.setAttribute('aria-hidden','true');document.body.appendChild(highlight);positionHighlight()}
 function render(){
  root?.remove();root=null;if(opener)opener.hidden=!owner||state?.status!=='active';
  if(!owner||state?.status!=='active'){clearHighlight();return}
  root=document.createElement('aside');root.className='getting-started';root.dataset.gettingStarted='';root.setAttribute('aria-label','Getting started');
  const step=STEPS[state.step],last=state.step===STEPS.length-1;
  if(!state.expanded)root.innerHTML='<button type="button" class="gs-launcher" data-guide="expand">Getting started · '+(state.step+1)+'/'+STEPS.length+'</button>';
  else root.innerHTML=`<section data-guide-panel aria-busy="${busy}"><header><span>Getting started · ${state.step+1}/${STEPS.length}</span><button type="button" data-guide="collapse" aria-label="Minimise guide">−</button></header><h2 tabindex="-1"></h2><p class="gs-copy"></p>${step.prompt?'<blockquote>'+step.prompt+'</blockquote>':''}<p class="gs-status" role="status" aria-live="polite"></p><div class="gs-actions"><button type="button" data-guide="action" ${busy?'disabled':''}>${step.action}</button>${step.prompt?'<button type="button" data-guide="example" '+(busy?'disabled':'')+'>Use example</button>':''}</div><footer><button type="button" data-guide="skip" ${busy?'disabled':''}>Skip guide</button><div>${state.step?'<button type="button" data-guide="back" '+(busy?'disabled':'')+'>Back</button>':''}<button type="button" data-guide="next" ${busy?'disabled':''}>${last?'Finish guide':'Next'}</button></div></footer></section>`;
  const heading=root.querySelector('h2');if(heading)heading.textContent=step.title;
  const copy=root.querySelector('.gs-copy');if(copy)copy.textContent=last?`Mod means Ctrl on Windows/Linux or Command on Mac. Use ${describeShortcut('search',getShortcuts())} to search your planner, ${describeShortcut('addTask',getShortcuts())} to add a task in Routines & Tasks, and ${describeShortcut('showTaskShortcuts',getShortcuts())} for its shortcut guide. Save task details with ${describeShortcut('saveTaskDetails',getShortcuts())}. AI Helper also accepts commands such as “Create a task for tomorrow”; review changes before applying them. Change your keybinds in Settings → Accessibility.`:step.text;
  const status=root.querySelector('.gs-status');if(status)status.textContent=message;
  root.addEventListener('click',click);document.body.appendChild(root);
 }
 function sync(){const next=getOwner();if(next===owner)return;clearHighlight();owner=next;revision++;busy=false;message='';progressQueue=Promise.resolve();state=owner?(cache.get(owner)||null):null;render()}
 function hydrate(data){
  sync();if(!owner)return;
  const saved=normalizeGettingStarted(data?.gettingStarted);
  if(saved&&saved.status!=='active')terminal.add(owner);
  if(terminal.has(owner)){state=saved&&saved.status!=='active'?saved:{version:2,status:'completed',step:0};persist();render();return}
  if(data?.onboardingCompleted!==true||!saved){state=null;render();return}
  // Keep this tab's current step while it is in use. A delayed progress
  // snapshot must not undo Back; terminal states above still sync immediately.
  if(state?.status==='active'&&saved.status==='active')return;
  state={...saved,expanded:true};persist();render();
 }
 function open(){sync();if(!owner||state?.status!=='active')return;revision++;busy=false;message='';state.expanded=true;persist();render();root?.querySelector('h2')?.focus()}
 function collapse(){if(!state||busy)return;state.expanded=false;persist();render();root?.querySelector('button')?.focus()}
 async function click(event){
  const action=event.target.closest('[data-guide]')?.dataset.guide;if(!action)return;
  if(getOwner()!==owner){sync();return}if(busy)return;
  if(action==='expand'){open();return}if(action==='collapse'){collapse();return}
  if(action==='skip'||(action==='next'&&state.step===STEPS.length-1)){
   const actor=owner,ticket=++revision;busy=true;message='Saving…';render();clearHighlight();
   try{await progressQueue;if(getOwner()!==actor||revision!==ticket)return;const result=await save(actor,{type:action==='skip'?'skipped':'completed'});if(getOwner()!==actor||revision!==ticket)return;
    if(!result?.state||result.state.status==='active')throw Error('Guide completion was not saved');
    terminal.add(actor);state=result.state;persist();busy=false;render();onComplete(result,actor);
   }catch{if(getOwner()!==actor||revision!==ticket)return;busy=false;message='Could not save your guide. Please try again.';render()}
   return;
  }
  if(action==='next'||action==='back'){
   clearHighlight();state.step+=action==='next'?1:-1;message='';persist();render();root.querySelector('h2')?.focus();
   const actor=owner,step=state.step;progressQueue=progressQueue.catch(()=>{}).then(()=>getOwner()===actor?save(actor,{type:'progress',step}):null).catch(()=>{});return;
  }
  if(action!=='action'&&action!=='example')return;
  const actor=owner,ticket=++revision,step=STEPS[state.step];busy=true;message='';render();
  let result=false;try{result=await navigate({page:step.page,focus:step.focus,settingsTab:step.settingsTab,...(action==='example'?{prompt:step.prompt}:{})},actor)}catch{}
  if(getOwner()!==actor||revision!==ticket)return;
  busy=false;
  if(result===true){message='The highlighted control is ready. Use it, then continue the guide.';render();spotlight(step.focus)}
  else{message=typeof result==='string'?result:'This page could not open. Try again, or use the sidebar.';render();root.querySelector('[data-guide="action"]')?.focus()}
 }
 function complete(event){if(event.detail?.ownerId!==getOwner())return;sync();if(event.detail.guide&&!terminal.has(owner)){hydrate({onboardingCompleted:true,gettingStarted:{version:2,status:'active',step:0}});open()}}
 function keydown(event){if(event.key==='Escape'&&state?.expanded&&event.target?.nodeType===1&&root?.contains(event.target)){event.preventDefault();collapse()}}
 opener?.addEventListener('click',open);window.addEventListener('kairos:onboarding-complete',complete);document.addEventListener('keydown',keydown);
 window.addEventListener('resize',positionHighlight);document.addEventListener('scroll',positionHighlight,true);
 const observer=window.MutationObserver?new window.MutationObserver(positionHighlight):null;observer?.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','hidden','inert']});
 sync();if(window.__kairosGettingStartedOwner===getOwner()&&getOwner()){window.__kairosGettingStartedOwner=null;complete({detail:{ownerId:getOwner(),guide:true}})}
 return {open,sync,hydrate,dispose(){revision++;clearHighlight();root?.remove();observer?.disconnect();opener?.removeEventListener('click',open);window.removeEventListener('kairos:onboarding-complete',complete);document.removeEventListener('keydown',keydown);window.removeEventListener('resize',positionHighlight);document.removeEventListener('scroll',positionHighlight,true)}};
}
