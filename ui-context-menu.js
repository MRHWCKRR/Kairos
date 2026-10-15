import {positionTaskMenu} from './task-action-menu.js';

// One document-level fallback. Task/section handlers get the event first.
export function mountSiteContextMenu({document=globalThis.document,window=document.defaultView,clipboard=window.navigator?.clipboard}={}) {
  let popup=null,context=null,busy=false,revision=0,disposed=false;
  const mac=/Mac|iPhone|iPad/.test(window.navigator?.platform||''),mod=mac?'Cmd':'Ctrl';
  const safeUrl=value=>{try {const url=new URL(value,window.location.href);return ['http:','https:','mailto:','tel:'].includes(url.protocol)?url.href:null} catch {return null}};
  const editorFor=target=>{const editor=target.closest?.('[contenteditable]');return editor&&['','true','plaintext-only'].includes(editor.getAttribute('contenteditable'))?editor:null};
  function close({restoreFocus=false}={}) {
    const source=context?.target;revision++;popup?.remove();popup=null;context=null;busy=false;
    if(restoreFocus&&source?.isConnected)source.focus?.({preventScroll:true});
  }
  function capture(target) {
    const field=target.closest?.('textarea,input'),rich=editorFor(target);
    const password=field?.type==='password',supported=field&&(field.localName==='textarea'||['text','search','url','tel','email','password'].includes(field.type||'text'));
    // Controls without a text selection API keep their native context menu.
    if(field&&(!supported||!password&&typeof field.selectionStart!=='number'))return null;
    const selection=window.getSelection?.(),selectedRange=rich&&selection?.rangeCount?selection.getRangeAt(0):null;
    const range=selectedRange&&rich.contains(selectedRange.startContainer)&&rich.contains(selectedRange.endContainer)?selectedRange.cloneRange():null;
    const value=field?.value,selected=field?password?'':value.slice(field.selectionStart,field.selectionEnd):String(selection||'');
    return {target,field,rich,range,password,value,selected,start:field?.selectionStart,end:field?.selectionEnd,richValue:rich?.textContent,
      writable:!!(field&&!field.disabled&&!field.readOnly||rich&&range),href:window.location.href,
      link:safeUrl(target.closest?.('a[href]')?.getAttribute('href')||'')&&target.closest?.('a[href]')?safeUrl(target.closest('a').getAttribute('href')):null,
      image:target.closest?.('img[src]')?safeUrl(target.closest('img').getAttribute('src')):null,
      page:target.closest?.('.page-view')};
  }
  function valid(c) {
    return c.target.isConnected&&window.location.href===c.href&&!c.target.closest('[hidden],[inert]')&&(!c.page||c.page.classList.contains('active'))&&
      (!c.field||!c.field.disabled&&!c.field.readOnly&&c.field.value===c.value)&&(!c.rich||c.rich.isConnected&&editorFor(c.target)===c.rich&&c.rich.textContent===c.richValue);
  }
  function inputEvent(c,value,type) {
    const target=c.field||c.rich;
    const make=name=>window.InputEvent?new window.InputEvent(name,{bubbles:true,cancelable:name==='beforeinput',inputType:type,data:value}):new window.Event(name,{bubbles:true,cancelable:name==='beforeinput'});
    if(!target.dispatchEvent(make('beforeinput')))return false;
    target.focus?.({preventScroll:true});
    if(c.field){
      c.field.setSelectionRange(c.start,c.end);
      const max=c.field.maxLength;
      if(max>=0&&c.field.value.length-(c.end-c.start)+value.length>max)throw Error('This text is too long for the field.');
    } else {const selection=window.getSelection();selection.removeAllRanges();selection.addRange(c.range)}
    // Browser editing retains its normal undo history where supported.
    if(document.execCommand?.('insertText',false,value))return true;
    if(c.field)c.field.setRangeText(value,c.start,c.end,'end');
    else {c.range.deleteContents();const text=document.createTextNode(value);c.range.insertNode(text);c.range.setStartAfter(text);c.range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(c.range)}
    target.dispatchEvent(make('input'));return true;
  }
  function definitions(c) {
    const items=[];
    if(c.link)items.push({id:'open-link',label:'Open link in new tab',group:'link'},{id:'copy-link',label:'Copy link address',group:'link',disabled:!clipboard?.writeText});
    if(c.image)items.push({id:'open-image',label:'Open image in new tab',group:'image'},{id:'copy-image',label:'Copy image address',group:'image',disabled:!clipboard?.writeText});
    if(c.field||c.rich)items.push({id:'cut',label:'Cut',hint:mod+'+X',group:'edit',disabled:!c.writable||c.password||!c.selected||!clipboard?.writeText});
    items.push({id:'copy',label:'Copy',hint:mod+'+C',group:'edit',disabled:c.password||!c.selected||!clipboard?.writeText},
      {id:'paste',label:'Paste',hint:mod+'+V',group:'edit',disabled:!c.writable||!clipboard?.readText},
      {id:'select-all',label:'Select all',hint:mod+'+A',group:'edit'},
      {id:'back',label:'Back',hint:'Alt+←',group:'page'},{id:'forward',label:'Forward',hint:'Alt+→',group:'page'},
      {id:'reload',label:'Reload',hint:mod+'+R',group:'page'},{id:'copy-page',label:'Copy page link',group:'page',disabled:!clipboard?.writeText},
      {id:'print',label:'Print…',hint:mod+'+P',group:'page'},
      {id:'inspect',label:'Inspect (browser tools)…',group:'browser'},{id:'browser-menu',label:'Browser menu…',hint:'Shift+right-click',group:'browser'});
    return items;
  }
  function status(text) {if(popup)popup.querySelector('[role="status"]').textContent=text}
  async function activate(id) {
    if(!context||busy)return;const c=context,item=definitions(c).find(item=>item.id===id);if(!item||item.disabled)return;
    if(id==='inspect'){status(`Use ${mac?'Cmd+Option+C':'Ctrl+Shift+C'} to inspect, or Shift+right-click and choose Inspect in the browser menu.`);return}
    if(id==='browser-menu'){status('Hold Shift and right-click to open the original browser menu.');return}
    const ticket=revision;busy=true;popup.setAttribute('aria-busy','true');
    try {
      if(['copy','copy-link','copy-image','copy-page','cut'].includes(id)) {
        await clipboard.writeText(id==='copy-link'?c.link:id==='copy-image'?c.image:id==='copy-page'?c.href:c.selected);
        if(ticket!==revision)return;
        if(id==='cut'){if(!valid(c))throw Error('This field changed. Open the menu again.');inputEvent(c,'','deleteByCut')}
      } else if(id==='paste') {
        const value=await clipboard.readText();if(ticket!==revision)return;
        if(!valid(c))throw Error('This field changed. Open the menu again.');if(value)inputEvent(c,value,'insertFromPaste');
      } else if(id==='select-all') {
        if(c.field){c.field.focus?.();c.field.setSelectionRange(0,c.field.value.length)}
        else {const range=document.createRange();range.selectNodeContents(c.rich||document.body);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)}
      } else if(id==='open-link'||id==='open-image')window.open(id==='open-link'?c.link:c.image,'_blank','noopener,noreferrer');
      else if(id==='back')window.history.back();else if(id==='forward')window.history.forward();else if(id==='reload')window.location.reload();else if(id==='print'){close({restoreFocus:true});window.print();return}
      if(ticket===revision)close({restoreFocus:true});
    } catch(error) {
      if(ticket===revision)status(error.message.includes('changed')||error.message.includes('too long')?error.message:`The browser blocked this action. Use ${mod}+${id==='paste'?'V':id==='cut'?'X':'C'} or Shift+right-click for the browser menu.`);
    } finally {if(ticket===revision){busy=false;popup?.removeAttribute('aria-busy')}}
  }
  function place(point) {
    const viewport=window.visualViewport,rect=popup.getBoundingClientRect();
    const bounds={width:viewport?.width||window.innerWidth||800,height:viewport?.height||window.innerHeight||600,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0};
    const p=positionTaskMenu({point,menuSize:{width:rect.width||272,height:rect.height||popup.scrollHeight||440},viewport:bounds});
    Object.assign(popup.style,{left:p.left+'px',top:p.top+'px',maxHeight:p.maxHeight+'px',maxWidth:Math.max(0,bounds.width-16)+'px'});
  }
  function open(target,point) {
    if(disposed||!target?.closest)return false;const captured=capture(target);close();if(!captured)return false;
    document.dispatchEvent(new window.CustomEvent('kairos-context-menu-open',{detail:{owner:'site'}}));context=captured;
    popup=document.createElement('div');popup.dataset.siteContextMenu='';popup.className='kairos-context-menu';popup.setAttribute('role','menu');popup.setAttribute('aria-label','Page actions');
    let group;
    for(const item of definitions(context)) {
      if(group&&group!==item.group){const separator=document.createElement('div');separator.setAttribute('role','separator');popup.appendChild(separator)}group=item.group;
      const button=document.createElement('button');button.type='button';button.dataset.contextAction=item.id;button.setAttribute('role','menuitem');button.tabIndex=-1;button.setAttribute('aria-disabled',String(!!item.disabled));
      const label=document.createElement('span');label.textContent=item.label;button.appendChild(label);
      if(item.hint){const hint=document.createElement('span');hint.className='context-shortcut';hint.textContent=item.hint;button.appendChild(hint)}
      popup.appendChild(button);
    }
    const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');popup.appendChild(message);
    (target.closest('dialog[open]')||document.body).appendChild(popup);place(point);
    popup.addEventListener('pointerdown',event=>{if(event.target.closest('[data-context-action]'))event.preventDefault()});
    popup.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const button=event.target.closest('[data-context-action]');if(button)void activate(button.dataset.contextAction)});
    popup.querySelector('[role="menuitem"]')?.focus?.({preventScroll:true});return true;
  }
  function onContext(event) {
    if(event.shiftKey){close();return}if(event.defaultPrevented)return;
    if(popup?.contains(event.target)){event.preventDefault();return}
    if(open(event.target,{x:event.clientX,y:event.clientY}))event.preventDefault();
  }
  function onKey(event) {
    if(popup&&popup.contains(event.target)) {
      const items=[...popup.querySelectorAll('[role="menuitem"]')],index=items.indexOf(document.activeElement);let next;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close({restoreFocus:true});return}
      if(event.key==='Tab'){close({restoreFocus:true});return}
      if(event.key==='ArrowDown')next=(index+1)%items.length;else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;
      else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();if(items[index])void activate(items[index].dataset.contextAction);return}
      if(next!==undefined){event.preventDefault();event.stopPropagation();items[next].focus?.({preventScroll:true});items[next].scrollIntoView?.({block:'nearest'})}
      return;
    }
    if(!event.defaultPrevented&&(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)) {
      const rect=event.target.getBoundingClientRect?.();if(open(event.target,{x:rect?.left||8,y:rect?.bottom||8})){event.preventDefault();event.stopPropagation()}
    }
  }
  const outside=event=>{if(popup&&!popup.contains(event.target))close()},scroll=event=>{if(popup&&!popup.contains(event.target))close()},dismiss=()=>close();
  const other=event=>{if(event.detail?.owner!=='site')close()};
  document.addEventListener('contextmenu',onContext);document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',scroll,true);document.addEventListener('kairos-context-menu-open',other);
  window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);window.addEventListener('popstate',dismiss);window.visualViewport?.addEventListener('resize',dismiss);
  return {close,dispose(){disposed=true;close();document.removeEventListener('contextmenu',onContext);document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',scroll,true);document.removeEventListener('kairos-context-menu-open',other);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);window.removeEventListener('popstate',dismiss);window.visualViewport?.removeEventListener('resize',dismiss)}};
}
