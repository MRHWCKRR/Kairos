import {ensureUiStyles} from './ui-styles.js?v=1';
export function createAuthFeedback(document) {
  ensureUiStyles(document);
  const root=document.querySelector('.login-box');if(!root)return ()=>{};
  let notice=root.querySelector('#auth-status');
  if(!notice){notice=document.createElement('p');notice.id='auth-status';notice.className='auth-notice';notice.hidden=true;notice.setAttribute('role','alert');notice.setAttribute('aria-live','polite');const anchor=root.querySelector('.social-buttons');if(anchor)anchor.before(notice);else root.prepend(notice);}
  const fields=root.querySelectorAll('input:not([type="checkbox"])');
  function show(message,{fields:invalidFields=[],type='error'}={}) {
    notice.textContent=message||'';notice.hidden=!message;notice.dataset.type=type;
    for(const field of fields){field.removeAttribute('aria-invalid');const refs=(field.getAttribute('aria-describedby')||'').split(' ').filter(ref=>ref&&ref!=='auth-status');if(invalidFields.includes(field.id)){field.setAttribute('aria-invalid','true');refs.push('auth-status');}if(refs.length)field.setAttribute('aria-describedby',refs.join(' '));else field.removeAttribute('aria-describedby');}
  }
  root.addEventListener('input',()=>{if(!notice.hidden)show('');});
  return show;
}
