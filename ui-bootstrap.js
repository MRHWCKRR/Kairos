import {styleValidation} from './ui-validation.js?v=1';
import {enhanceSelects} from './ui-selects.js?v=1';
import {ensureUiStyles} from './ui-styles.js?v=1';
if(!window.__kairosMobileDevice) {
  ensureUiStyles(document);
  styleValidation({document});
  const controls=enhanceSelects({document,window});
  window.addEventListener('pagehide',event=>{if(!event.persisted)controls.destroy();});
  window.addEventListener('pageshow',event=>{if(event.persisted)controls.refresh();});
}
