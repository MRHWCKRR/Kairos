export function openTaskFieldDialog({field,label,count,initialValue,onSubmit,onClose=()=>{},translate,document=globalThis.document}){
 const text=(key,fallback)=>{const name='task_tool_'+key,value=translate?.(name);return value&&value!==name?value:fallback};
 const dialog=document.createElement('dialog');dialog.className='task-move-dialog task-field-dialog';dialog.dataset.taskFieldDialog='';dialog.setAttribute('aria-label',label);
 const heading=document.createElement('h3');heading.textContent=label+' · '+count;const form=document.createElement('form'),caption=document.createElement('label');caption.textContent=label;let input;
 if(['priority','scheduleLocked'].includes(field)){
  input=document.createElement('select');for(const [value,label] of (field==='priority'?[['','None'],['low','Low'],['medium','Medium'],['high','High']]:[['','Choose'],['true','Locked'],['false','Unlocked']])){const option=document.createElement('option');option.value=value;option.textContent=text(value||'none',label);input.appendChild(option)}
 }else{input=document.createElement('input');input.type=['date','dueDate'].includes(field)?'date':'number';if(input.type==='number'){input.min='1';input.max=field==='durationMinutes'?'1439':'10080';input.step='1'}}
 input.name=field;const initial=initialValue===undefined||initialValue===null?'':String(initialValue);if(input.matches('select')){const option=[...input.querySelectorAll('option')].find(option=>option.value===initial);if(option)option.selected=true}else input.value=initial;caption.appendChild(input);const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 if(initialValue===undefined)status.textContent=text('mixed','Mixed values. Applying replaces this field for every selected task.');
 const save=document.createElement('button');save.type='submit';save.textContent=text('apply','Apply');const cancel=document.createElement('button');cancel.type='button';cancel.textContent=text('cancel','Cancel');form.append(caption,status,save,cancel);dialog.append(heading,form);document.body.appendChild(dialog);let disposed=false,busy=false;
 function dispose(){if(disposed)return;disposed=true;dialog.close?.();dialog.remove();onClose()}
 cancel.addEventListener('click',dispose);dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)dispose()});
 form.addEventListener('submit',async event=>{event.preventDefault();if(disposed||busy)return;busy=true;save.disabled=true;cancel.disabled=true;
  try{let value=input.value;if(field==='scheduleLocked'){if(!['true','false'].includes(value))throw Error('Choose Locked or Unlocked.');value=value==='true'}else if(['durationMinutes','reminderMinutes'].includes(field))value=value===''?null:Number(value);else value=value||null;
   if(await onSubmit(value)!==false)dispose();
  }catch(error){status.textContent=error.message}finally{busy=false;save.disabled=false;cancel.disabled=false}
 });
 if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');input.focus?.();return {element:dialog,dispose};
}
