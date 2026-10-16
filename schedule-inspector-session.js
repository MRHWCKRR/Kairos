import {ensureUiStyles} from './ui-styles.js?v=1';

// Owns the inspector's draft and in-flight operation, not planner data.
export function createScheduleInspectorSession({inspector,getIdentity,getSelection,render,document=inspector.ownerDocument,storage}){
 let editor=null,busy=false,choosing=false,finishChoice=null,recoveryAttempted=null,restoring=false;
 if(!storage)try{storage=document.defaultView?.sessionStorage}catch{}
 const identity=()=>JSON.stringify(getIdentity());
 const selectionKey=value=>JSON.stringify([value?.type,value?.occurrenceId||value?.id]);
 const values=form=>JSON.stringify({fields:[...form.querySelectorAll('input,select,textarea')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]),color:form.dataset.colorCustom});
 const current=()=>!!editor&&editor.identity===identity()&&editor.form.isConnected;
 const dirty=()=>current()&&values(editor.form)!==editor.baseline;
 const storageKey=scope=>'kairos-schedule-draft:'+scope;
 const recoverable=()=>{const scope=getIdentity();return Array.isArray(scope)&&!!scope[0]&&!!scope[1]};
 const controls=form=>[...form.querySelectorAll('input,select,textarea')].filter(el=>el.type!=='hidden');
 const fieldKey=el=>el.name?'name:'+el.name:[...el.attributes].find(attr=>attr.name.startsWith('data-recurrence-'))?.name+(el.type==='checkbox'?':'+el.value:'');
 const snapshot=form=>({fields:Object.fromEntries(controls(form).map(el=>[fieldKey(el),el.type==='checkbox'?el.checked===true:el.value])),color:form.dataset.colorCustom});
 function readSaved(){
  if(!recoverable())return null;
  try{const record=JSON.parse(storage?.getItem(storageKey(identity()))||'null');return record?.version===1&&record.identity===identity()&&['task','occurrence-edit'].includes(record.kind)&&record.selection&&record.changes&&typeof record.changes==='object'?record:null}catch{return null}
 }
 function clearSaved(saved=editor){
  if(!saved)return;
  try{const key=storageKey(saved.identity),record=JSON.parse(storage?.getItem(key)||'null');if(record?.id===saved.storageId)storage?.removeItem(key)}catch{}
 }
 function recoveryStatus(message){
  let status=inspector.querySelector('[data-schedule-recovery-status]');if(!status){status=document.createElement('p');status.dataset.scheduleRecoveryStatus='';status.setAttribute('role','status');inspector.appendChild(status)}
  if(status.textContent!==message)status.textContent=message;
 }
 function persist(){
  if(!current()||!recoverable()||editor.form.localName!=='form')return;
  const view=snapshot(editor.form),changes=Object.fromEntries(Object.entries(view.fields).filter(([key,value])=>value!==editor.original.fields[key]));
  if(!Object.keys(changes).length&&view.color===editor.original.color){clearSaved();return}
  const record={version:1,id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),identity:editor.identity,selection:editor.selection,kind:editor.form.matches('[data-ks-occurrence-edit]')?'occurrence-edit':'task',changes,...(view.color!==editor.original.color?{color:view.color}:{})};
  try{if(!storage)throw Error('Storage unavailable');storage.setItem(storageKey(editor.identity),JSON.stringify(record));editor.storageId=record.id}
  catch{recoveryStatus('Draft recovery is unavailable. Keep this tab open until your changes are saved.')}
 }
 function reset(){finishChoice?.('stay');editor=null;}
 function track(form,save,{onRestore}={}){
  if(editor?.form===form)return;
  reset();editor={form,save,key:selectionKey(getSelection()),selection:structuredClone(getSelection()),identity:identity(),baseline:values(form),original:snapshot(form)};
  const stored=readSaved();
  if(form.localName==='form'&&stored&&selectionKey(stored.selection)===editor.key&&stored.kind===(form.matches('[data-ks-occurrence-edit]')?'occurrence-edit':'task')){
   editor.storageId=stored.id;
   restoring=true;
   const board=form.querySelector('[name="board"]');if(board&&typeof stored.changes['name:board']==='string'){board.value=stored.changes['name:board'];board.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));}
   for(const el of controls(form)){const key=fieldKey(el);if(Object.hasOwn(stored.changes,key)){const value=stored.changes[key];if(el.type==='checkbox'&&typeof value==='boolean')el.checked=value;else if(typeof value==='string')el.value=value}}
   if(stored.color==='0'||stored.color==='1')form.dataset.colorCustom=stored.color;
   onRestore?.();restoring=false;recoveryStatus('Recovered unsaved changes. Review and save when ready.');persist();
  }
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
   clearSaved(saved);reset();return true;
  }finally{choosing=false}
 }
 async function run(action,{save=false}={}){
  if(busy||!current())return false;
  persist();
  const saved=editor,scope=saved.identity,disabled=new Map([...inspector.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]));
  const valid=()=>scope===identity()&&editor===saved&&saved.form.isConnected;
  busy=true;inspector.setAttribute('aria-busy','true');for(const el of disabled.keys())el.disabled=true;
  inspector.querySelector('[data-inspector-save-status]')?.remove();
  const status=document.createElement('p');status.dataset.inspectorSaveStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='Saving changes…';inspector.appendChild(status);
  let success=false;
  try{success=await action(valid)===true;if(success&&save&&valid()){clearSaved(saved);saved.baseline=values(saved.form);saved.original=snapshot(saved.form)}return success&&scope===identity()}
  catch(error){status.textContent=error.message||'Could not save changes.';return false}
  finally{
   busy=false;inspector.removeAttribute('aria-busy');if(success||scope!==identity())status.remove();else if(status.textContent==='Saving changes…')status.textContent='Changes were not saved. Your edits are still here.';for(const [el,value] of disabled)el.disabled=value;
   if(scope!==identity()){if(editor===saved)reset()}
   else if(success&&!dirty()){editor=null;render()}
  }
 }
 const capture=()=>{if(!busy&&!restoring)persist()};for(const type of ['input','change','click'])inspector.addEventListener(type,capture);
 document.defaultView?.addEventListener('beforeunload',event=>{if(current()&&(dirty()||busy)){persist();event.preventDefault();event.returnValue=''}});
 document.defaultView?.addEventListener('pagehide',persist);
 function takeRecoverySelection(){const record=readSaved();if(!record||recoveryAttempted===identity())return null;recoveryAttempted=identity();return structuredClone(record.selection)}
 const hasRecovery=kind=>{const record=readSaved();return record?.kind===kind&&selectionKey(record.selection)===selectionKey(getSelection())};
 return {track,preserve,requestLeave,run,isBusy:()=>busy,hasDraft:dirty,reset,takeRecoverySelection,hasRecovery};
}
