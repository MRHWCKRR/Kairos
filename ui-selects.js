import {ensureUiStyles} from './ui-styles.js?v=1';

export function enhanceSelects({document,window}) {
  ensureUiStyles(document);
  const controls=new Map(),labels=new WeakMap();let sequence=0,opened=null;
  const disabled=option=>option.disabled||option.hasAttribute('disabled')||option.closest('optgroup')?.hasAttribute('disabled');
  function labelFor(select) {
    const explicit=select.getAttribute('aria-label');if(explicit)return explicit;
    let label=labels.get(select);
    if(!label?.isConnected){label=select.labels?.[0]||[...document.querySelectorAll('label')].find(label=>(label.htmlFor||label.getAttribute('for'))===select.id&&select.id)||select.closest('label');if(label)labels.set(select,label);}
    function copy(node){if(node.nodeType===3)return node.textContent;if(node.matches?.('select,input,textarea,button,.kairos-select'))return '';return [...node.childNodes].map(copy).join('');}
    if(label)return copy(label).trim();
    return select.getAttribute('title')||select.name||'Choose an option';
  }
  function enhance(select) {
    if(controls.has(select)||select.multiple||select.hasAttribute('multiple')||Number(select.size)>1||select.hasAttribute('data-native-select'))return;
    // Forms can be cloned by existing editors. Rebuild a cloned enhancement,
    // whose buttons do not carry the original event listeners.
    const stale=select.parentElement;
    if(stale?.classList.contains('kairos-select')){stale.before(select);stale.remove();select.classList.remove('kairos-native-select');}
    let original;try {original=JSON.parse(select.dataset.kairosSelectOriginal||'null');}catch{}
    original ||= {tabindex:select.getAttribute('tabindex'),ariaHidden:select.getAttribute('aria-hidden')};
    select.dataset.kairosSelectOriginal=JSON.stringify(original);
    const wrap=document.createElement('span');wrap.className='kairos-select';select.before(wrap);wrap.appendChild(select);
    select.classList.add('kairos-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const trigger=document.createElement('button'),text=document.createElement('span'),popup=document.createElement('div'),error=document.createElement('span');
    trigger.type='button';if(original.tabindex!==null)trigger.setAttribute('tabindex',original.tabindex);trigger.className='kairos-select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.appendChild(text);
    popup.id='kairos-options-'+(++sequence);popup.className='kairos-select-popup';popup.setAttribute('role','listbox');popup.setAttribute('popover','manual');popup.hidden=true;trigger.setAttribute('aria-controls',popup.id);
    error.id=popup.id+'-error';error.className='kairos-field-error';error.hidden=true;error.setAttribute('role','alert');wrap.append(trigger,popup,error);
    let active=-1,optionNodes=[],options=[],buffer='',lastTyped=0,isOpen=false,signature='';
    function sync(){
      options=[...select.querySelectorAll('option')];
      const nextSignature=options.map(option=>[option.value,option.label||option.textContent,!!disabled(option)].join('\u0000')).join('\u0001');
      if(isOpen&&signature!==nextSignature){close(false);open();return;}
      const selected=options.find(option=>option.selected)||options.find(option=>option.value===select.value)||(select.selectedIndex===-1?null:options[0]);
      const label=selected?.label||selected?.textContent||'Choose…';if(text.textContent!==label)text.textContent=label;
      const unavailable=select.disabled||select.hasAttribute('disabled');if(trigger.disabled!==!!unavailable)trigger.disabled=!!unavailable;
      trigger.setAttribute('aria-label',labelFor(select));trigger.setAttribute('aria-valuetext',label);popup.setAttribute('aria-label',labelFor(select));
      if(select.required||select.hasAttribute('required'))trigger.setAttribute('aria-required','true');else trigger.removeAttribute('aria-required');
      const described=[select.getAttribute('aria-describedby'),!error.hidden?error.id:null].filter(Boolean).join(' ');if(described)trigger.setAttribute('aria-describedby',described);else trigger.removeAttribute('aria-describedby');
      if(select.getAttribute('aria-invalid')==='true'){if(trigger.getAttribute('aria-invalid')!=='true')trigger.setAttribute('aria-invalid','true');}else trigger.removeAttribute('aria-invalid');
      const hidden=select.hidden||select.classList.contains('hidden')||select.style.display==='none';if(wrap.hidden!==!!hidden)wrap.hidden=!!hidden;
      if(select.style.width&&wrap.style.width!==select.style.width)wrap.style.width=select.style.width;
      if(unavailable||hidden)close(false);
      optionNodes.forEach((node,index)=>{const selected=index===select.selectedIndex;if(node.getAttribute('aria-selected')!==String(selected))node.setAttribute('aria-selected',String(selected));});
    }
    function close(commit=false){
      if(!isOpen)return;
      if(commit&&active>=0&&!disabled(options[active])) {
        const previous=select.value,previousIndex=select.selectedIndex;select.selectedIndex=active;
        if(previous!==select.value||previousIndex!==active){select.dispatchEvent(new window.Event('input',{bubbles:true}));select.dispatchEvent(new window.Event('change',{bubbles:true}));}
        if(select.validity?.valid!==false){error.hidden=true;select.removeAttribute('aria-invalid');}
      }
      isOpen=false;if(opened===control)opened=null;
      if(popup.hidePopover)try {popup.hidePopover();}catch{}
      popup.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');sync();
    }
    function setActive(index){
      if(index<0||!options[index]||disabled(options[index]))return;
      active=index;optionNodes.forEach((node,i)=>node.classList.toggle('is-active',i===active));
      trigger.setAttribute('aria-activedescendant',optionNodes[active].id);optionNodes[active].scrollIntoView?.({block:'nearest'});
    }
    function position(){
      const rect=trigger.getBoundingClientRect(),height=Math.max(160,Math.min(300,(window.innerHeight||800)-24));
      const below=(window.innerHeight||800)-rect.bottom-12,above=rect.top-12,up=below<160&&above>below;
      popup.style.width=Math.min(Math.max(rect.width,180),(window.innerWidth||1024)-24)+'px';
      popup.style.maxHeight=Math.max(80,Math.min(height,up?above:below))+'px';
      popup.style.left=Math.max(12,Math.min(rect.left,(window.innerWidth||1024)-parseFloat(popup.style.width)-12))+'px';
      popup.style.top=(up?Math.max(12,rect.top-popup.getBoundingClientRect().height-6):rect.bottom+6)+'px';
    }
    function open(){
      sync();if(trigger.disabled||wrap.hidden||isOpen)return;
      opened?.close(false);popup.replaceChildren();optionNodes=[];signature=options.map(option=>[option.value,option.label||option.textContent,!!disabled(option)].join('\u0000')).join('\u0001');const groups=new Map();
      for(const [index,option] of options.entries()) {
        const group=option.parentElement?.tagName==='OPTGROUP'?option.parentElement:null;
        if(group&&!groups.has(group)){const container=document.createElement('div');container.setAttribute('role','group');container.setAttribute('aria-label',group.label||group.getAttribute('label')||'');const heading=document.createElement('div');heading.className='kairos-select-group';heading.textContent=group.label||group.getAttribute('label')||'';heading.setAttribute('aria-hidden','true');container.appendChild(heading);popup.appendChild(container);groups.set(group,container);}
        const selectedIndex=Number.isInteger(select.selectedIndex)?select.selectedIndex:options.findIndex(item=>item.selected);
        const node=document.createElement('div');node.className='kairos-select-option';node.id=popup.id+'-'+index;node.setAttribute('role','option');node.setAttribute('aria-selected',String(index===selectedIndex));node.setAttribute('aria-disabled',String(!!disabled(option)));node.textContent=option.label||option.textContent;
        node.addEventListener('pointerdown',event=>event.preventDefault());node.addEventListener('pointerenter',()=>setActive(index));node.addEventListener('click',()=>{if(disabled(option))return;setActive(index);close(true);});
        optionNodes.push(node);(groups.get(group)||popup).appendChild(node);
      }
      if(!options.length){const empty=document.createElement('div');empty.className='kairos-select-option';empty.textContent='No options available';popup.appendChild(empty);}
      isOpen=true;opened=control;popup.hidden=false;trigger.setAttribute('aria-expanded','true');
      if(popup.showPopover){try {popup.showPopover();}catch{popup.removeAttribute('popover');}}else{popup.removeAttribute('popover');(select.closest('dialog')||document.body).appendChild(popup);}
      position();const selected=Number.isInteger(select.selectedIndex)&&options[select.selectedIndex]&&!disabled(options[select.selectedIndex])?select.selectedIndex:options.findIndex(option=>option.selected&&!disabled(option));setActive(selected>=0?selected:options.findIndex(option=>!disabled(option)));
    }
    function move(step){const indices=options.map((option,index)=>disabled(option)?-1:index).filter(index=>index>=0);if(!indices.length)return;const at=indices.indexOf(active);setActive(indices[Math.max(0,Math.min(indices.length-1,at+step))]);}
    function keydown(event){
      if(['Enter',' ','ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Escape'].includes(event.key))event.preventDefault();
      if(event.key==='Escape'){if(isOpen){event.stopPropagation();close(false);}return;}
      if(event.key==='Tab'){close(true);return;}
      if(event.key==='Enter'||event.key===' '){if(isOpen)close(true);else open();return;}
      if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key)){
        const wasOpen=isOpen;open();
        if(event.altKey&&event.key==='ArrowUp'){close(true);return;}
        if(event.key==='Home')setActive(options.findIndex(option=>!disabled(option)));
        else if(event.key==='End')setActive(options.map((option,index)=>disabled(option)?-1:index).filter(index=>index>=0).at(-1)??-1);
        else if(wasOpen)move(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='PageDown'?10:-10);
        return;
      }
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        const time=Date.now();buffer=time-lastTyped<700?buffer+event.key:event.key;lastTyped=time;open();
        const repeated=[...buffer].every(char=>char===buffer[0]),term=(repeated?buffer[0]:buffer).toLocaleLowerCase();
        for(let offset=1;offset<=options.length;offset++){const index=((repeated?active:-1)+offset+options.length)%options.length;if(!disabled(options[index])&&(options[index].label||options[index].textContent||'').trim().toLocaleLowerCase().startsWith(term)){setActive(index);break;}}
      }
    }
    const change=()=>{if(select.validity?.valid!==false){error.hidden=true;select.removeAttribute('aria-invalid');}sync();};
    const invalid=event=>{event.preventDefault();select.setAttribute('aria-invalid','true');error.textContent=select.validationMessage||'Choose an option.';error.hidden=false;sync();trigger.focus?.();open();};
    const focus=()=>trigger.focus?.();
    trigger.addEventListener('click',()=>isOpen?close(false):open());trigger.addEventListener('keydown',keydown);trigger.addEventListener('focus',sync);trigger.addEventListener('focusout',()=>close(true));select.addEventListener('change',change);select.addEventListener('invalid',invalid);select.addEventListener('focus',focus);
    const control={select,trigger,popup,wrap,sync,close,destroy:()=>{close(false);select.removeEventListener('change',change);select.removeEventListener('invalid',invalid);select.removeEventListener('focus',focus);popup.remove();select.classList.remove('kairos-native-select');for(const [name,value] of [['tabindex',original.tabindex],['aria-hidden',original.ariaHidden]]){if(value===null)select.removeAttribute(name);else select.setAttribute(name,value);}delete select.dataset.kairosSelectOriginal;if(wrap.contains(select))wrap.before(select);wrap.remove();}};
    controls.set(select,control);sync();
  }
  function refresh({scan=true}={}){
    for(const [select,control] of controls)if(!select.isConnected||!control.wrap.contains(select)||select.multiple||select.hasAttribute('multiple')||Number(select.size)>1){control.destroy();controls.delete(select);}
    if(scan)document.querySelectorAll('select').forEach(enhance);controls.forEach(control=>control.sync());
  }
  const outside=event=>{if(opened&&!opened.wrap.contains(event.target)&&!opened.popup.contains(event.target))opened.close(false);};
  const scroll=event=>{if(opened&&!opened.popup.contains(event.target)&&event.target!==opened.popup)opened.close(false);};
  const label=event=>{const node=event.target.closest?.('label');if(!node||event.target.closest('.kairos-select'))return;const select=node.htmlFor?document.getElementById(node.htmlFor):node.querySelector('select');const control=controls.get(select);if(control){event.preventDefault();control.trigger.focus?.();}};
  const reset=()=>queueMicrotask(refresh),resize=()=>opened?.close(false);
  document.addEventListener('pointerdown',outside);document.addEventListener('click',label);document.addEventListener('reset',reset);document.addEventListener('kairos-controls-refresh',reset);window.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize);
  const observer=new window.MutationObserver(records=>{
    if(records.every(record=>record.target.closest?.('.kairos-select,.kairos-select-popup')&&!['SELECT','OPTION','OPTGROUP'].includes(record.target.tagName)))return;
    const scan=records.some(record=>record.type==='childList'&&[...record.addedNodes].some(node=>node.tagName==='SELECT'||node.querySelector?.('select')));
    refresh({scan});
  });observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','selected','label','class','style','aria-invalid','multiple','size']});refresh();
  return {refresh,controls,destroy:()=>{observer.disconnect();document.removeEventListener('pointerdown',outside);document.removeEventListener('click',label);document.removeEventListener('reset',reset);document.removeEventListener('kairos-controls-refresh',reset);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resize);controls.forEach(control=>control.destroy());controls.clear();}};
}
