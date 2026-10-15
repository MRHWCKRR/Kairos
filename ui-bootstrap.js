import {styleValidation} from './ui-validation.js?v=1';
import {enhanceSelects} from './ui-selects.js?v=1';
import {ensureUiStyles} from './ui-styles.js?v=2';
import {mountSiteContextMenu} from './ui-context-menu.js?v=1';
if(!window.__kairosMobileDevice) {
  ensureUiStyles(document);
  styleValidation({document});
  const controls=enhanceSelects({document,window});
  const contextMenu=mountSiteContextMenu({document,window});
  window.addEventListener('pagehide',event=>{contextMenu.close();if(!event.persisted){controls.destroy();contextMenu.dispose();}});
  window.addEventListener('pageshow',event=>{if(event.persisted)controls.refresh();});
}
