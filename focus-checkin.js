const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The timer is already paused. Save the chosen outcome with the log in one
// transaction, so a failed check-in cannot leave half of the change applied.
export function promptFocusCheckin(work,{document=globalThis.document,window=globalThis.window,signal}={}){
 if(signal?.aborted)return Promise.resolve(null);
 return new Promise(resolve=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');let settled=false;
  dialog.className='focus-checkin-dialog';dialog.setAttribute('aria-label','Focus check-in');
  dialog.innerHTML='<h2>How much work is left?</h2><p><strong>'+esc(work.title)+'</strong></p><p>Your timer is paused. Save this focus session and choose what comes next.</p><p>Current remaining estimate: '+work.remainingMinutes+' minutes.</p><div class="focus-checkin-actions"><button type="button" data-checkin="keep">Keep the estimate and log time</button><label>Remaining work (minutes)<input name="remainingMinutes" type="number" min="1" max="1440" step="1" value="'+work.remainingMinutes+'"></label><button type="button" data-checkin="remaining">Set remaining work and log time</button><button type="button" data-checkin="complete">Log and mark complete</button></div><p class="text-muted">Changing the estimate leaves completion and calendar blocks unchanged. Review a rescheduling preview to move or resize future work.</p><p role="status" aria-live="polite"></p><button type="button" data-checkin="cancel">Back to paused timer</button>';
  function finish(value){if(settled)return;settled=true;signal?.removeEventListener('abort',abort);dialog.removeEventListener('click',click);dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',cancel);dialog.close?.();dialog.remove();previous?.isConnected&&previous.focus?.();resolve(value)}
  function abort(){finish(null)}
  function cancel(event){event?.preventDefault();finish(null)}
  function click(event){const choice=event.target.closest('[data-checkin]')?.dataset.checkin;if(choice==='cancel')finish(null);if(choice==='keep')finish({mode:'log'});if(choice==='complete')finish({mode:'complete'});if(choice==='remaining'){const raw=dialog.querySelector('input').value,value=Number(raw);if(!raw.trim()||!Number.isInteger(value)||value<1||value>1440){dialog.querySelector('[role="status"]').textContent='Enter a whole number from 1 to 1440 minutes, or explicitly mark the task complete.';dialog.querySelector('input').focus();return}finish({mode:'log',remainingMinutes:value,workExpected:work.workExpected})}}
  dialog.addEventListener('click',click);dialog.addEventListener('cancel',cancel);dialog.addEventListener('close',cancel);signal?.addEventListener('abort',abort,{once:true});document.body.append(dialog);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('[data-checkin="keep"]').focus();
 });
}
