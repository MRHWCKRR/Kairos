import {ensureUiStyles} from './ui-styles.js?v=2';

export function createDialogs({document,window}) {
  let queue=Promise.resolve(),sequence=0;
  function request(kind,message,options={}) {
    const task=queue.then(()=>new Promise(resolve=>{
      ensureUiStyles(document);
      const previous=document.activeElement,dialog=document.createElement('dialog'),form=document.createElement('form');let settled=false;
      dialog.className='kairos-dialog';dialog.setAttribute('aria-labelledby','kairos-dialog-title-'+(++sequence));dialog.setAttribute('aria-describedby','kairos-dialog-copy-'+sequence);
      dialog.setAttribute('role',kind==='notice'?'alertdialog':'dialog');dialog.setAttribute('aria-modal','true');
      const title=document.createElement('h2');title.id='kairos-dialog-title-'+sequence;title.textContent=options.title||(kind==='notice'?'Kairos':kind==='prompt'?'Enter a name':'Confirm action');
      const copy=document.createElement('p');copy.id='kairos-dialog-copy-'+sequence;copy.textContent=String(message);form.append(title,copy);
      let input;
      if(kind==='prompt') {
        const label=document.createElement('label');label.textContent=options.label||'Name';input=document.createElement('input');input.type='text';input.value=String(options.value??'');input.id='kairos-dialog-input-'+sequence;label.htmlFor=input.id;form.append(label,input);
      }
      const status=document.createElement('p');status.className='kairos-dialog-error';status.setAttribute('role','alert');status.hidden=true;form.appendChild(status);
      const actions=document.createElement('div');actions.className='kairos-dialog-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
      const accept=document.createElement('button');accept.type='submit';accept.className=options.destructive?'kairos-danger':'kairos-primary';accept.textContent=options.confirmText||(kind==='notice'?'OK':kind==='prompt'?'Save':'Continue');
      if(kind!=='notice')actions.appendChild(cancel);actions.appendChild(accept);form.appendChild(actions);dialog.appendChild(form);
      const cancelValue=kind==='confirm'?false:kind==='prompt'?null:undefined;
      function finish(value){if(settled)return;settled=true;dialog.close?.();dialog.remove();if(previous?.isConnected)previous.focus?.();resolve(value);}
      cancel.addEventListener('click',()=>finish(cancelValue));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(cancelValue);});dialog.addEventListener('close',()=>finish(cancelValue));
      form.addEventListener('submit',event=>{
        event.preventDefault();
        if(kind==='prompt'&&!input.value.trim()){status.hidden=false;status.textContent='Enter a name, or choose Cancel.';input.focus?.();return;}
        finish(kind==='confirm'?true:kind==='prompt'?input.value:undefined);
      });
      dialog.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(cancelValue);return;}
        if(event.key!=='Tab')return;
        const controls=[input,kind!=='notice'?cancel:null,accept].filter(Boolean),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus?.();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus?.();}
      });
      document.body.appendChild(dialog);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
      const focus=input||(kind==='notice'?accept:cancel);focus.focus?.();input?.select?.();
    }));
    queue=task.catch(()=>{});return task;
  }
  return {notice:(message,options)=>request('notice',message,options),confirm:(message,options)=>request('confirm',message,options),prompt:(message,value='',options={})=>request('prompt',message,{...options,value})};
}
let dialogs;
const current=()=>dialogs ||= createDialogs({document:globalThis.document,window:globalThis.window});
export const showNotice=(message,options)=>current().notice(message,options);
export const confirmDialog=(message,options)=>current().confirm(message,options);
export const promptDialog=(message,value,options)=>current().prompt(message,value,options);
