import {dayChangeCandidates,prepareDayChange} from './schedule-day-change.js?v=5';
import {toDateKey,formatTime,parseTime} from './schedule-utils.js?v=5';

export function mountDayChange({document,window,getBoards,onSubmit,isBusy=()=>false,getTimeFormat=()=> '24',now=()=>new Date(),getPlanningContext,onPreviewReady=()=>{}}) {
  const toolbar=document.getElementById('schedule-toolbar');let dialog=null,pending=false,openedContext=null;
  const planningContext=()=>{const current=now();return getPlanningContext?.()||{date:toDateKey(current),time:formatTime(current.getHours()*60+current.getMinutes(),false)}};
  const sameContext=(a,b)=>JSON.stringify(a?.scope??null)===JSON.stringify(b?.scope??null)&&JSON.stringify(a?.availability??null)===JSON.stringify(b?.availability??null);
  function clock(time){const minutes=parseTime(time);return minutes===null?'':formatTime(minutes,getTimeFormat()!=='24');}
  function ensureButton(){
    const plan=toolbar?.querySelector('[data-plan]');if(!plan||toolbar.querySelector('[data-day-change]'))return;
    const button=document.createElement('button');button.type='button';button.dataset.dayChange='';button.className='ks-day-change-button';button.textContent='My day changed';button.disabled=isBusy();plan.insertAdjacentElement('afterend',button);
  }
  function close(force=false){if(pending&&force!==true)return;dialog?.close?.();dialog?.remove();dialog=null;toolbar?.querySelector('[data-day-change]')?.focus?.();}
  function open(){
    if(dialog||isBusy())return;
    let initialError='';try{openedContext=planningContext()}catch(error){initialError=error.message;const current=now();openedContext={date:toDateKey(current),time:formatTime(current.getHours()*60+current.getMinutes(),false)}}const date=openedContext.date,time=openedContext.time,candidates=initialError?[]:dayChangeCandidates(getBoards(),date,time);
    dialog=document.createElement('dialog');dialog.className='ks-day-change';dialog.setAttribute('aria-labelledby','ks-day-change-title');
    dialog.innerHTML=`<form><header><h2 id="ks-day-change-title">My day changed</h2><button type="button" data-close aria-label="Close">×</button></header><p class="ks-day-change-intro">Rework today. Fixed commitments and work underway stay put.</p><p class="ks-day-change-intro" data-work-hours></p><label for="ks-day-change-description">What changed?</label><textarea id="ks-day-change-description" name="description" rows="3" maxlength="1200" required placeholder="My appointment moved to this afternoon. Keep science revision first."></textarea><details><summary>Avoid a time window</summary><p>These changes will avoid this time. Existing events are unchanged.</p><div class="ks-day-change-times"><label>From<input type="time" name="blockedFrom"></label><label>Until<input type="time" name="blockedUntil"></label></div></details><details class="ks-day-change-tasks"><summary>Tasks Kairos may move</summary><div data-task-list></div></details><p data-status role="status" aria-live="polite"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit" class="ks-primary">Preview changes</button></footer></form>`;
    const form=dialog.querySelector('form'),status=dialog.querySelector('[data-status]'),list=dialog.querySelector('[data-task-list]');
    dialog.querySelector('[data-work-hours]').textContent=openedContext.description||'';
    dialog.querySelector('.ks-day-change-tasks summary').textContent='Tasks Kairos may move · '+candidates.length;
    for(const task of candidates){
      const label=document.createElement('label');label.className='ks-day-change-task';const input=document.createElement('input');input.type='checkbox';input.name='taskId';input.value=task.id;input.checked=true;
      const copy=document.createElement('span'),title=document.createElement('strong'),time=document.createElement('small');title.textContent=task.title||'Untitled task';time.textContent=clock(task.startTime)+(task.endTime?'–'+clock(task.endTime):'')+(task.boardTitle?' · '+task.boardTitle:'');copy.append(title,time);label.append(input,copy);list.appendChild(label);
    }
    if(!candidates.length){status.textContent=initialError||'No unfinished flexible tasks are scheduled for today. Use Plan to place unscheduled tasks.';form.querySelector('[type="submit"]').disabled=true;}
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(pending||isBusy())return;
      try {
        const current=planningContext();if(!sameContext(openedContext,current)||current.date!==openedContext.date)throw Error('Your day, workspace or saved work hours changed. Reopen My day changed.');const day=current.date,minute=current.time;
        const request=prepareDayChange({description:form.querySelector('[name="description"]').value,taskIds:[...form.querySelectorAll('[name="taskId"]')].filter(input=>input.checked).map(input=>input.value),blockedFrom:form.querySelector('[name="blockedFrom"]').value,blockedUntil:form.querySelector('[name="blockedUntil"]').value},dayChangeCandidates(getBoards(),day,minute),day);
        pending=true;form.querySelectorAll('button,input,textarea').forEach(button=>button.disabled=true);status.textContent='Finding adjustments… Nothing changes until you apply.';
        const result=await onSubmit(request);pending=false;if(!sameContext(openedContext,planningContext())){close(true);return;}
        if(result?.ok){close();onPreviewReady();return;}
        status.textContent=result?.message||'No safe changes were found. Try a different time window or task selection.';
      } catch(error){pending=false;status.textContent=error.message||'Could not preview changes. Try again.';}
      form.querySelectorAll('button,input,textarea').forEach(button=>button.disabled=false);
    });
    dialog.querySelector('[data-close]').onclick=close;dialog.querySelector('[data-cancel]').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.appendChild(dialog);
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('textarea').focus?.();
  }
  const syncScope=()=>{if(dialog){try{if(JSON.stringify(openedContext?.scope??null)!==JSON.stringify(planningContext()?.scope??null))close(true)}catch{}}};window.addEventListener('kairos-data-changed',syncScope);
  const click=event=>{if(event.target.closest?.('#schedule-toolbar [data-day-change]'))open();};document.addEventListener('click',click);
  const observer=new window.MutationObserver(ensureButton);if(toolbar)observer.observe(toolbar,{childList:true,subtree:true});ensureButton();
  return {open,setBusy:()=>{const button=toolbar?.querySelector('[data-day-change]');if(button){button.disabled=isBusy();if(button.textContent!=='My day changed')button.textContent='My day changed';}},destroy:()=>{window.removeEventListener('kairos-data-changed',syncScope);observer.disconnect();document.removeEventListener('click',click);dialog?.remove();}};
}
