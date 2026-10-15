export function styleValidation({document}) {
  let sequence=0;
  function clear(field) {
    const id=field.dataset.kairosError;if(!id)return;
    document.getElementById(id)?.remove();
    const refs=(field.getAttribute('aria-describedby')||'').split(' ').filter(ref=>ref&&ref!==id);
    if(refs.length)field.setAttribute('aria-describedby',refs.join(' '));else field.removeAttribute('aria-describedby');
    field.removeAttribute('aria-invalid');delete field.dataset.kairosError;
  }
  function invalid(event) {
    const field=event.target;if(!field.matches('input:not([type="hidden"]),textarea'))return;
    event.preventDefault();clear(field);
    const error=document.createElement('span');error.id='kairos-field-error-'+(++sequence);error.className='kairos-field-error';error.setAttribute('role','alert');error.textContent=field.validationMessage||'Check this field.';
    field.after(error);field.dataset.kairosError=error.id;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',((field.getAttribute('aria-describedby')||'')+' '+error.id).trim());
    // The first invalid field receives focus, without later invalid events stealing it.
    if(!field.form||field===Array.from(field.form.elements).find(item=>item.willValidate&&!item.validity.valid))field.focus();
  }
  const edited=event=>clear(event.target);
  document.addEventListener('invalid',invalid,true);document.addEventListener('input',edited);
  return ()=>{document.removeEventListener('invalid',invalid,true);document.removeEventListener('input',edited);};
}
