import {aiEventPreviewMarkup} from './ai-event-actions.js?v=1';
import {mountDialogWindow} from './dialog-window.js?v=2';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountAiUndo({root,document=globalThis.document,window=globalThis.window,getIdentity,loadPreview,session}={}){
 if(!root)return {sync(){},dispose(){}};
 let actor=JSON.stringify(getIdentity()),generation=0,review=null,busy=false,opener=null,disposed=false;
 root.innerHTML='<button type="button" class="settings-cancel-btn" data-ai-undo-open>Undo AI change…</button><span data-ai-undo-status role="status" aria-live="polite"></span>';
 const dialog=document.createElement('dialog');dialog.className='task-capture-dialog ai-undo-dialog';dialog.setAttribute('aria-labelledby','ai-undo-title');
 dialog.innerHTML='<header><h2 id="ai-undo-title">Review AI Undo</h2><button type="button" data-ai-undo-close aria-label="Close AI Undo">Close</button></header><p>Only the changes below will be reversed. If an affected field has changed, Undo will stop so you can review it.</p><div class="ai-undo-review" tabindex="0"></div><footer><button type="button" class="action-btn" data-ai-undo-apply>Undo reviewed changes</button></footer>';
 document.body.appendChild(dialog);const dialogWindow=mountDialogWindow({dialog,window});
 const message=text=>{root.querySelector('[data-ai-undo-status]').textContent=text;};
 function close(){dialogWindow.stop();if(dialog.close)dialog.close();else dialog.removeAttribute('open');review=null;opener?.focus?.();}
 function sync(){
  const next=JSON.stringify(getIdentity());if(next!==actor){actor=next;generation++;busy=false;close();message('');}
  const ready=getIdentity()?.ownerId&&getIdentity()?.planId,state=session.state();
  dialog.setAttribute('aria-busy',String(busy||state.busy));dialog.querySelector('[data-ai-undo-close]').disabled=busy||state.busy;
  root.querySelector('[data-ai-undo-open]').disabled=!ready||busy||state.busy||state.pending;
  dialog.querySelector('[data-ai-undo-apply]').disabled=!review||busy||state.busy||state.pending;
 }
 async function open(){
  sync();if(root.querySelector('[data-ai-undo-open]').disabled||[...document.querySelectorAll('dialog[open]')].some(d=>d!==dialog))return;
  const id={...getIdentity()},ticket=generation;opener=document.activeElement;busy=true;message('Loading the last supported AI change…');sync();
  try{
   const next=await loadPreview(id.planId,id.ownerId);
   if(disposed||ticket!==generation||JSON.stringify(getIdentity())!==actor)return;
   review=next;
   dialog.querySelector('.ai-undo-review').innerHTML=next.eventSummary?aiEventPreviewMarkup(next.eventSummary):'<table><caption>Changes to reverse</caption><thead><tr><th>Item</th><th>Field</th><th>Current</th><th>Restored</th></tr></thead><tbody>'+next.rows.map(row=>'<tr><th scope="row">'+esc(row.title)+'</th><td>'+esc(row.field)+'</td><td>'+esc(row.before)+'</td><td>'+esc(row.after)+'</td></tr>').join('')+'</tbody></table>';
   if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialogWindow.reset();dialog.querySelector('[data-ai-undo-apply]').focus?.();message('');
  }catch(error){if(ticket===generation&&JSON.stringify(getIdentity())===actor)message(error.message);}
  finally{if(ticket===generation){busy=false;sync();}}
 }
 async function apply(){
  sync();if(!review||busy||session.state().busy||session.state().pending||!dialog.hasAttribute('open'))return;
  const ticket=generation,proposal=review;busy=true;sync();
  const result=await session.run(proposal.command,proposal.expected);
  if(!disposed&&ticket===generation){busy=false;if(result){close();message('AI change undone.');}else message(session.state().message);sync();}
 }
 const cancel=event=>{event.preventDefault();if(!busy)close();};
 root.querySelector('[data-ai-undo-open]').addEventListener('click',()=>void open());dialog.querySelector('[data-ai-undo-close]').addEventListener('click',()=>{if(!busy)close();});dialog.querySelector('[data-ai-undo-apply]').addEventListener('click',()=>void apply());dialog.addEventListener('cancel',cancel);
 const unsubscribe=session.subscribe(sync);sync();
 return {sync,dispose(){disposed=true;generation++;unsubscribe();dialogWindow.dispose();dialog.remove();root.replaceChildren();}};
}

