import {SHORTCUT_ACTIONS,DEFAULT_SHORTCUTS,normaliseShortcuts,validateShortcut,parseShortcut} from './shortcut-model.js?v=1';

export function mountShortcutSettings({root,getValue=()=>DEFAULT_SHORTCUTS,onChange=()=>{},document=root.ownerDocument,copy=(_key,fallback)=>fallback}={}){
 let recording=null;const rows=new Map();root.dataset.shortcutEditor='';
 const intro=document.createElement('p');intro.className='shortcut-settings-intro';intro.textContent=copy('intro','Choose Change, then press a new key combination. Mod means Ctrl on Windows/Linux or Command on Mac. Shortcuts pause while you type, except modified search and save commands.');root.appendChild(intro);
 const list=document.createElement('div');list.className='shortcut-settings-list';root.appendChild(list);
 const status=document.createElement('p');status.className='shortcut-settings-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.appendChild(status);
 function stop(){if(recording){rows.get(recording).input.classList.remove('is-recording');recording=null;}}
 function refresh(){stop();const bindings=normaliseShortcuts(getValue());for(const {id} of SHORTCUT_ACTIONS){const row=rows.get(id);row.input.value=bindings[id];row.reset.disabled=bindings[id]===DEFAULT_SHORTCUTS[id];}status.textContent='';}
 function change(id,value){const bindings=normaliseShortcuts(getValue()),result=validateShortcut(id,value,bindings);if(!result.valid){status.textContent=result.error;return false;}onChange({...bindings,[id]:result.value});refresh();status.textContent=copy('updated','Shortcut updated. Save settings to apply your changes.');return true;}
 for(const action of SHORTCUT_ACTIONS){
  const row=document.createElement('div');row.className='shortcut-settings-row';
  const label=document.createElement('label');label.htmlFor='shortcut-'+action.id;label.textContent=copy(action.id,action.label);
  const input=document.createElement('input');input.id='shortcut-'+action.id;input.readOnly=true;input.className='shortcut-settings-value';input.setAttribute('aria-label',label.textContent);input.setAttribute('aria-describedby','shortcut-settings-help');
  const edit=document.createElement('button');edit.type='button';edit.textContent=copy('change','Change');edit.setAttribute('aria-label',copy('change','Change')+' '+label.textContent);
  const reset=document.createElement('button');reset.type='button';reset.textContent=copy('reset','Reset');reset.setAttribute('aria-label',copy('reset','Reset')+' '+label.textContent);
  edit.addEventListener('click',()=>{stop();recording=action.id;input.classList.add('is-recording');status.textContent=copy('recording','Press a key combination. Escape cancels; Tab moves on.');input.focus();});
  reset.addEventListener('click',()=>change(action.id,DEFAULT_SHORTCUTS[action.id]));
  input.addEventListener('blur',()=>{if(recording===action.id)stop();});
  input.addEventListener('keydown',event=>{
   if(recording!==action.id)return;if(event.key==='Tab'){stop();return;}
   event.preventDefault();event.stopPropagation();if(event.key==='Escape'){stop();status.textContent=copy('cancelled','Shortcut change cancelled.');return;}
   if(event.isComposing||event.keyCode===229||event.repeat||event.getModifierState?.('AltGraph')||['Control','Meta','Alt','Shift'].includes(event.key))return;
   const mods=[];if(event.ctrlKey||event.metaKey)mods.push('Mod');if(event.altKey)mods.push('Alt');if(event.shiftKey&&event.key!=='?')mods.push('Shift');
   const parsed=parseShortcut([...mods,event.key===' '?'Space':event.key].join('+'));
   if(!parsed){status.textContent=copy('unsupported','Choose a letter, number or supported key combination.');return;}
   if(change(action.id,parsed.value))edit.focus();
  });
  row.append(label,input,edit,reset);list.appendChild(row);rows.set(action.id,{input,edit,reset});
 }
 const help=document.createElement('p');help.id='shortcut-settings-help';help.className='shortcut-settings-help';help.textContent=copy('fixed','Fixed editing controls: Escape closes or cancels; Enter saves quick entry; arrow keys navigate menus; Alt + Up/Down reorders from grips and checklist editors. Browser shortcuts cannot be assigned.');root.appendChild(help);
 const resetAll=document.createElement('button');resetAll.type='button';resetAll.className='shortcut-settings-reset';resetAll.textContent=copy('reset_all','Reset all shortcuts');resetAll.addEventListener('click',()=>{onChange({...DEFAULT_SHORTCUTS});refresh();status.textContent=copy('updated','Shortcut updated. Save settings to apply your changes.');});root.appendChild(resetAll);
 refresh();return {refresh,dispose(){stop();root.replaceChildren();delete root.dataset.shortcutEditor;}};
}
