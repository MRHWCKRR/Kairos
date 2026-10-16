import {ensureUiStyles} from './ui-styles.js?v=1';

// Owns the inspector's draft and in-flight operation, not planner data.
export function createScheduleInspectorSession({inspector,getIdentity,getSelection,render,document=inspector.ownerDocument}){
 let editor=null,busy=false,choosing=false,finishChoice=null;
 const identity=()=>JSON.stringify(getIdentity());
 const selectionKey=value=>JSON.stringify([value?.type,value?.occurrenceId||value?.id]);
 const values=form=>JSON.stringify({fields:[...form.querySelectorAll('input,select,textarea')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]),color:form.dataset.colorCustom});
 const current=()=>!!editor&&editor.identity===identity()&&editor.form.isConnected;
 const dirty=()=>current()&&values(editor.form)!==editor.baseline;
 function reset(){finishChoice?.('stay');editor=null;}
 function track(form,save){
  if(editor?.form===form)return;
  reset();editor={form,save,key:selectionKey(getSelection()),identity:identity(),baseline:values(form)};
 }
 function preserve(selection){
  if(editor&&editor.identity!==identity()){reset();return false}
  return current()&&editor.key===selectionKey(selection)&&(busy||choosing||dirty()||editor.form.matches('[data-ks-occurrence-edit]'));
 }
 function choose(){
  return new Promise(resolve=>{
   ensureUiStyles(document);
   const source=document.activeElement,dialog=document.createElement('dialog');dialog.className='kairos-dialog';dialog.dataset.scheduleDraftDialog='';dialog.setAttribute('aria-labelledby','schedule-draft-title');
   dialog.innerHTML='<h2 id="schedule-draft-title">Unsaved changes</h2><p>Save your changes before leaving this task?</p><div class="kairos-dialog-actions"><button type="button" data-schedule-draft-choice="save" class="kairos-primary">Save</button><button type="button" data-schedule-draft-choice="discard">Discard</button><button type="button" data-schedule-draft-choice="stay">Stay</button></div>';
   const finish=value=>{finishChoice=null;dialog.close?.();dialog.remove();if(source?.isConnected)source.focus?.({preventScroll:true});resolve(value)};finishChoice=finish;
   dialog.addEventListener('click',event=>{const choice=event.target.closest('[data-schedule-draft-choice]')?.dataset.scheduleDraftChoice;if(choice)finish(choice)});
   dialog.addEventListener('cancel',event=>{event.preventDefault();finish('stay')});
   dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish('stay')}else if(event.key==='Tab'){const controls=[...dialog.querySelectorAll('button')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus?.()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus?.()}}});
   document.body.appendChild(dialog);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('[data-schedule-draft-choice="stay"]').focus?.();
  });
 }
 async function requestLeave(){
  if(editor&&editor.identity!==identity()){reset();return true}
  if(busy||choosing)return false;
  if(!dirty()){reset();return true}
  const saved=editor;choosing=true;
  try{
   const answer=await choose();if(editor!==saved||!current())return false;
   if(answer==='stay')return false;
   if(answer==='save'&&!await saved.save())return false;
   if(saved.identity!==identity())return false;
   reset();return true;
  }finally{choosing=false}
 }
 async function run(action,{save=false}={}){
  if(busy||!current())return false;
  const saved=editor,scope=saved.identity,disabled=new Map([...inspector.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]));
  const valid=()=>scope===identity()&&editor===saved&&saved.form.isConnected;
  busy=true;inspector.setAttribute('aria-busy','true');for(const el of disabled.keys())el.disabled=true;
  inspector.querySelector('[data-inspector-save-status]')?.remove();
  const status=document.createElement('p');status.dataset.inspectorSaveStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='Saving changes…';inspector.appendChild(status);
  let success=false;
  try{success=await action(valid)===true;if(success&&save&&valid())saved.baseline=values(saved.form);return success&&scope===identity()}
  catch(error){status.textContent=error.message||'Could not save changes.';return false}
  finally{
   busy=false;inspector.removeAttribute('aria-busy');if(success||scope!==identity())status.remove();else if(status.textContent==='Saving changes…')status.textContent='Changes were not saved. Your edits are still here.';for(const [el,value] of disabled)el.disabled=value;
   if(scope!==identity()){if(editor===saved)reset()}
   else if(success&&!dirty()){editor=null;render()}
  }
 }
 return {track,preserve,requestLeave,run,isBusy:()=>busy,hasDraft:dirty,reset};
}
