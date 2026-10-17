const STEPS=[
 {title:'Create a board and task',text:'Open Routines & Tasks. Choose Add board, add a section, then add a task you actually want to do. Give it a short, clear title.',page:'tasks-page',action:'Open Routines & Tasks',focus:'#add-board-btn'},
 {title:'Schedule your task',text:'Open Schedule, find your task in the backlog, and drag it onto a time. Select it to adjust its date, start time, or duration, then save your changes.',page:'schedule-page',action:'Open Schedule',focus:'#schedule-toolbar button'},
 {title:'Try AI Helper',text:'Ask for help with your plan, or try the example below. Review and edit it before pressing Send. Nothing is sent by this guide.',page:'ai-page',action:'Open AI Helper',focus:'#ai-chat-input',prompt:'Create a task called Science revision for tomorrow at 4 pm for 30 minutes.'},
 {title:'Set up reminders',text:'In Settings → Appearance, enable notifications and choose browser notifications if you want desktop alerts, then Save changes. Set a reminder on your scheduled task. Kairos must remain open for reminder delivery.',page:'settings-page',action:'Open notification settings',focus:'#settings-notif-enabled'}
];

// Uses the same router and controls as normal navigation. It never sends AI
// messages, creates planner data, or requests browser notification permission.
export async function openGettingStartedDestination({request,owner,getOwner,navigate,document=globalThis.document}){
 if(getOwner()!==owner)return false;
 await navigate(request.page);
 if(getOwner()!==owner)return false;
 const page=document.getElementById(request.page);
 if(!page?.classList.contains('active')||page.inert||page.querySelector('.page-load-status'))return false;
 if(request.page==='settings-page')document.querySelector('[data-settings-tab="appearance"]')?.click();
 const target=document.querySelector(request.focus);
 if(request.prompt){
  if(!target||target.disabled)return 'AI Helper is not ready yet. Try opening it again.';
  if(target.closest('[hidden],[inert]')||target.readOnly)return 'Open a chat or choose New chat in AI Helper, then use the example again.';
  if(target.value.trim())return 'Your existing AI draft is still there. Send or clear it before using the example.';
  target.value=request.prompt;target.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
 }
 target?.focus();target?.scrollIntoView?.({block:'nearest'});return true;
}

export function mountGettingStarted({document=globalThis.document,window=globalThis.window,getOwner,navigate,storage}={}){
 if(!storage)try{storage=window.localStorage}catch{}
 const opener=document.getElementById('getting-started-open');
 let owner=null,state=null,root=null,revision=0,busy=false,message='';
 const key=id=>'kairos-getting-started:'+id;
 function read(){try{const saved=JSON.parse(storage?.getItem(key(owner))||'null');if(saved?.version===1&&Number.isInteger(saved.step)&&saved.step>=0&&saved.step<STEPS.length)return saved}catch{}return null}
 function persist(){try{storage?.setItem(key(owner),JSON.stringify(state))}catch{}}
 function render(){
  root?.remove();root=null;if(!owner||!state?.active)return;
  root=document.createElement('aside');root.className='getting-started';root.dataset.gettingStarted='';root.setAttribute('aria-label','Getting started');
  const step=STEPS[state.step];
  if(!state.expanded)root.innerHTML='<button type="button" class="gs-launcher" data-guide="expand">Getting started · '+(state.step+1)+'/4</button>';
  else root.innerHTML=`<section data-guide-panel><header><span>Getting started · ${state.step+1}/4</span><button type="button" data-guide="collapse" aria-label="Minimise guide">−</button></header><h2 tabindex="-1">${step.title}</h2><p>${step.text}</p>${step.prompt?'<blockquote>'+step.prompt+'</blockquote>':''}<p class="gs-status" role="status" aria-live="polite"></p><div class="gs-actions"><button type="button" data-guide="action" ${busy?'disabled':''}>${busy?'Opening…':step.action}</button>${step.prompt?'<button type="button" data-guide="example" '+(busy?'disabled':'')+'>Use example</button>':''}</div><footer><button type="button" data-guide="skip">Skip guide</button><div>${state.step?'<button type="button" data-guide="back" '+(busy?'disabled':'')+'>Back</button>':''}<button type="button" data-guide="next" ${busy?'disabled':''}>${state.step===3?'Finish guide':'Next'}</button></div></footer></section>`;
  const status=root.querySelector('.gs-status');if(status)status.textContent=message;
  root.addEventListener('click',click);document.body.appendChild(root);
 }
 function sync(){const next=getOwner();if(next===owner)return;owner=next;revision++;busy=false;message='';state=owner?read():null;if(opener)opener.hidden=!owner;render()}
 function open(){sync();if(!owner)return;revision++;busy=false;message='';state={version:1,active:true,expanded:true,step:state?.active?state.step:0};persist();render();root?.querySelector('h2')?.focus()}
 function collapse(){if(!state?.active)return;revision++;busy=false;state.expanded=false;persist();render();root?.querySelector('button')?.focus()}
 async function click(event){
  const action=event.target.closest('[data-guide]')?.dataset.guide;if(!action)return;
  if(getOwner()!==owner){sync();return}
  if(action==='expand'){state.expanded=true;render();persist();root.querySelector('h2')?.focus();return}
  if(action==='collapse'){collapse();return}
  if(action==='skip'||(action==='next'&&state.step===3)){revision++;state.active=false;persist();render();opener?.focus();return}
  if(busy)return;
  if(action==='next'||action==='back'){state.step+=action==='next'?1:-1;message='';persist();render();root.querySelector('h2')?.focus();return}
  if(action!=='action'&&action!=='example')return;
  const actor=owner,ticket=++revision,step=STEPS[state.step];busy=true;message='';render();
  let result=false;try{result=await navigate({page:step.page,focus:step.focus,...(action==='example'?{prompt:step.prompt}:{})},actor)}catch{}
  if(getOwner()!==actor||revision!==ticket)return;
  busy=false;
  if(result===true){state.expanded=false;persist();render()}
  else{message=typeof result==='string'?result:'This page could not open. Try again, or use the sidebar.';render();root.querySelector('[data-guide="action"]')?.focus()}
 }
 function complete(event){if(event.detail?.guide&&event.detail.ownerId===getOwner())open()}
 function keydown(event){if(event.key==='Escape'&&state?.expanded&&event.target?.nodeType===1&&root?.contains(event.target)){event.preventDefault();collapse()}}
 opener?.addEventListener('click',open);window.addEventListener('kairos:onboarding-complete',complete);document.addEventListener('keydown',keydown);
 sync();if(window.__kairosGettingStartedOwner===getOwner()&&getOwner()){window.__kairosGettingStartedOwner=null;open()}
 return {open,sync,dispose(){revision++;root?.remove();opener?.removeEventListener('click',open);window.removeEventListener('kairos:onboarding-complete',complete);document.removeEventListener('keydown',keydown)}};
}
