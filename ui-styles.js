export function ensureUiStyles(document=globalThis.document) {
  if(!document)return;
  const existing=document.querySelector('link[data-kairos-ui]');
  if(existing){if(existing.getAttribute('href')!=='ui-controls.css?v=2')existing.href='ui-controls.css?v=2';return;}
  const link=document.createElement('link');link.rel='stylesheet';link.href='ui-controls.css?v=2';link.dataset.kairosUi='';document.head.appendChild(link);
}
