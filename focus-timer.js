import {focusElapsedMs,recoverFocus,validFocusSession,MAX_FOCUS_MS} from './focus-model.js?v=7';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=ms=>{const s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':')};
export function mountFocusTimer({document=globalThis.document,window=globalThis.window,getIdentity,persist,chooseOutcome=null,getLongestSeconds=()=>0,confirmDiscard=async()=>false,storage,locks=window.navigator?.locks,now=()=>Date.now(),setInterval=window.setInterval.bind(window),clearInterval=window.clearInterval.bind(window)}={}){
 if(!storage)try{storage=window.localStorage}catch{}if(!storage)storage={getItem(){throw Error('Recovery storage is unavailable.')},setItem(){throw Error('Recovery storage is unavailable.')},removeItem(){throw Error('Recovery storage is unavailable.')}};
 let owner=null,state=null,control=false,claim=null,release=null,busy=false,message='',disposed=false,generation=0,checkinAbort=null;
 const bar=document.createElement('aside');bar.className='task-focus-bar';bar.setAttribute('aria-label','Active focus timer');document.body.appendChild(bar);
 const key=uid=>'kairos-focus:'+uid;
 const current=()=>getIdentity()?.ownerId===owner;
 const samePlan=()=>!state?.planId||state.planId===getIdentity()?.planId;
 function write(value){storage.setItem(key(owner),JSON.stringify(value));state=value}
 function read(){try{const value=JSON.parse(storage.getItem(key(owner))||'null');if(value&&(!validFocusSession(value)||value.ownerId!==owner))throw Error('The saved timer needs review.');state=value;return true}catch(error){message='Focus recovery is unavailable. '+error.message;state=null;return false}}
 function checkpoint(){if(control&&state?.startedAt!=null&&!state.pending){try{write({...state,lastSeenAt:now()})}catch{state=recoverFocus(state,now());message='Recovery storage is unavailable. Timer paused; keep this tab open.'}}}
 function releaseControl(){release?.();release=null;control=false;claim=null}
 async function takeControl(){
  if(control)return true;if(claim)return claim;if(!owner)return false;
  if(!locks?.request){message='This browser cannot safely share a timer between tabs. Focus controls are unavailable.';render();return false}
  const actor=owner,ticket=generation;
  claim=new Promise(resolve=>{locks.request('kairos-focus:'+actor,{ifAvailable:true},async lock=>{
   if(!lock||ticket!==generation||disposed){resolve(false);return}
   control=true;if(!read()){control=false;resolve(false);return}
   if(state?.startedAt!=null){state=recoverFocus(state,now());try{write(state);message='Recovered your timer paused. Resume when ready.'}catch{control=false;resolve(false);return}}
   const held=new Promise(done=>release=done);resolve(true);render();await held;
  }).catch(error=>{message=String(error.message||'Could not access the focus timer.');resolve(false)})});
  const result=await claim;if(!result){claim=null;message=message||'The timer is controlled in another tab. Close it there, then try again.';render()}return result;
 }
 function controls(){const unavailable=busy||!control||!samePlan(),button=(action,label,disabled=false)=>'<button type="button" data-focus-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
  if(!state)return button('start','Start focus',busy||!owner);
  if(state.pending)return button('retry',busy?'Saving…':'Retry same log',busy||!samePlan())+(!control?button('take','Use timer in this tab',busy):'');
  return (state.startedAt!=null?button('pause','Pause',unavailable):button('resume','Resume',busy||!samePlan()))+button('log','Log time',busy||!samePlan())+(state.target?button('complete','Log and complete',busy||!samePlan()):'')+button('discard','Discard',busy||!control)+(!control?button('take','Use timer in this tab',busy):'');
 }
 function render(){if(disposed)return;const home=document.getElementById('focus-timer-container'),active=document.activeElement,action=active?.dataset?.focusAction,inBar=bar.contains(active),name=state?.target?.title||'General focus';
  const running=!!state&&state.startedAt!=null&&!state.pending;
  home?.classList.toggle('focus-timer-running',running);bar.classList.toggle('focus-timer-running',running);
  const html='<div class="task-focus-heading"><strong>'+esc(name)+'</strong><span class="focus-timer-display" data-focus-elapsed>'+format(focusElapsedMs(state,now()))+'</span></div><div class="focus-timer-controls">'+controls()+'</div><p data-focus-status role="status" aria-live="polite">'+esc(!samePlan()?'Switch back to this timer’s planner before logging.':message)+'</p>';
  if(home)home.innerHTML='<h3>Focus timer</h3>'+html+'<p class="text-muted focus-timer-longest-row">Longest session '+format((getLongestSeconds()||0)*1000)+'</p><button type="button" class="focus-timer-secondary" data-focus-history-open>Focus history</button> <button type="button" class="focus-timer-secondary" data-focus-manual-open>Add focus time</button>';
  bar.hidden=!owner||!state;bar.innerHTML=html;
  if(action)(inBar?bar:home)?.querySelector('[data-focus-action="'+action+'"]')?.focus?.({preventScroll:true});
 }
 async function start(target=null){sync();const actor=owner,plan=getIdentity()?.planId;if(busy||!await takeControl()||owner!==actor||getIdentity()?.planId!==plan||!current())return false;if(state){message='Finish or discard your current focus session before starting another.';render();return false}const time=now(),candidate={version:1,id:'focus-'+globalThis.crypto.randomUUID(),ownerId:owner,planId:getIdentity()?.planId||null,target:target?structuredClone(target):null,createdAt:time,accumulatedMs:0,startedAt:time,lastSeenAt:time};try{if(!validFocusSession(candidate))throw Error('Invalid focus target.');write(candidate);message='Timer started.';render();return true}catch(error){releaseControl();message='Timer not started: recovery storage is unavailable. '+error.message;render();return false}}
 async function pause(){const actor=owner;if(busy||!await takeControl()||owner!==actor||!state||state.pending||!current())return false;try{write({...state,accumulatedMs:Math.floor(focusElapsedMs(state,now())),startedAt:null,lastSeenAt:now()});message='Paused.';render();return true}catch(error){message=error.message;render();return false}}
 async function resume(){sync();const actor=owner;if(busy||!await takeControl()||owner!==actor||!state||state.pending||!samePlan())return false;try{write({...state,startedAt:state.startedAt??now(),lastSeenAt:now()});message='Timer running.';render();return true}catch(error){message=error.message;render();return false}}
 async function finish(mode='log'){
  sync();const actor=owner,ticket=generation;if(busy||!await takeControl()||busy||owner!==actor||ticket!==generation||!state||!samePlan()||!current())return false;
  if(!state.pending){
   const time=now(),seconds=Math.floor(focusElapsedMs(state,time)/1000);if(!seconds){message='Record at least one second before logging.';render();return false}
   let outcome={mode};
   try{
    write({...state,accumulatedMs:seconds*1000,startedAt:null,lastSeenAt:time});
    if(mode==='log'&&state.target&&chooseOutcome){
     busy=true;message='Timer paused. Choose a remaining-work check-in.';render();checkinAbort=new AbortController();
     try{outcome=await chooseOutcome({target:structuredClone(state.target),signal:checkinAbort.signal})}finally{if(ticket===generation&&owner===actor){busy=false;checkinAbort=null}}
     if(ticket!==generation||owner!==actor||!current()||!samePlan())return false;
     if(!outcome){message='Timer paused. Nothing saved yet.';render();return false}
    }
    const pending={id:state.id,ownerId:owner,planId:state.planId,createdAt:state.createdAt,endedAt:time,seconds,target:state.target,mode:outcome.mode,...(outcome.remainingMinutes!==undefined?{remainingMinutes:outcome.remainingMinutes,workExpected:outcome.workExpected}:{})};
    write({...state,pending});
   }catch(error){if(ticket===generation&&owner===actor){message='Could not retain this log. '+error.message;render()}return false}
  }
  const attempt=structuredClone(state.pending);busy=true;message='Saving focus time.';render();
  try{const result=await persist(attempt);if(ticket!==generation||owner!==actor||!current())return false;storage.removeItem(key(actor));state=null;releaseControl();message=result.attributed?'Focus time saved'+(result.completedTaskIds?.length?' and task completed.':'.'):'Focus time saved to your overall total.';return true}
  catch(error){if(ticket!==generation||owner!==actor)return false;if(['focus-target-unavailable','focus-log-expired'].includes(error.code)){const next={...state};delete next.pending;try{write(next)}catch{}}message=String(error.message||'Could not confirm this log.')+(state?.pending?' Retry uses the same log.':'');return false}
  finally{if(ticket===generation&&owner===actor){busy=false;render()}}
 }
 async function discard(){const initiator=owner,ticket=generation;if(busy||!await takeControl()||owner!==initiator||ticket!==generation||!state)return false;if(state.pending){message='Retry this log first so a cloud save cannot be counted twice.';render();return false}const id=state.id,actor=owner;if(!await confirmDiscard()||owner!==actor||state?.id!==id)return false;try{storage.removeItem(key(owner));state=null;releaseControl();message='Focus session discarded.';render();return true}catch(error){message=error.message;render();return false}}
 function sync(){if(state&&!samePlan())checkinAbort?.abort();const next=getIdentity()?.ownerId||null;if(next!==owner){checkinAbort?.abort();checkinAbort=null;checkpoint();generation++;releaseControl();owner=next;state=null;busy=false;message='';if(owner){read();if(state)void takeControl()}}render()}
 function click(event){const action=event.target.closest('[data-focus-action]')?.dataset.focusAction;if(!action)return;event.preventDefault();if(action==='start')void start();else if(action==='pause')void pause();else if(action==='resume')void resume();else if(action==='discard')void discard();else if(action==='take')void takeControl();else void finish(action==='complete'?'complete':'log')}
 function storageChanged(event){if(event.key===key(owner)&&!control){read();render()}}
 function pagehide(){checkinAbort?.abort();if(control&&state?.startedAt!=null&&!state.pending){try{write({...state,accumulatedMs:Math.floor(focusElapsedMs(state,now())),startedAt:null,lastSeenAt:now()})}catch{checkpoint()}}releaseControl()}
 function tick(){if(!current()){sync();return}if(control)checkpoint();if(control&&state?.startedAt!=null&&focusElapsedMs(state,now())>=MAX_FOCUS_MS)void pause();document.querySelectorAll('[data-focus-elapsed]').forEach(el=>el.textContent=format(focusElapsedMs(state,now())))}
 document.addEventListener('click',click);window.addEventListener('storage',storageChanged);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',sync);window.addEventListener('kairos-data-changed',sync);const interval=setInterval(tick,1000);sync();
 return {start,pause,resume,finish,discard,sync,render,getState:()=>state?structuredClone(state):null,getMessage:()=>message,dispose(){checkinAbort?.abort();checkpoint();generation++;releaseControl();disposed=true;clearInterval(interval);document.removeEventListener('click',click);window.removeEventListener('storage',storageChanged);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',sync);window.removeEventListener('kairos-data-changed',sync);bar.remove()}};
}
