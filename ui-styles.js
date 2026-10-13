export function ensureUiStyles(document=globalThis.document) {
  if(!document || document.querySelector('link[data-kairos-ui]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='ui-controls.css?v=1';link.dataset.kairosUi='';document.head.appendChild(link);
}
