// Keep each workspace alive once loaded: navigating never cancels AI requests,
// recreates Firebase listeners, or resets an in-progress schedule edit.
const scheduleStyles=['schedule-find-time.css','schedule-workspace.css','schedule-calendar.css','schedule-interactions.css','schedule-inspector.css','schedule-ai.css','schedule-day-change.css','planning-hub.css','assignment-progress.css','schedule-keyboard.css'];
const scheduleModules=['schedule-interactions.js?v=26','schedule-inspector.js?v=29','schedule-responsive.js','schedule-task-create.js?v=22','schedule-ai.js?v=22','planning-hub.js?v=22','schedule-find-time.js?v=8','schedule-keyboard.js?v=8'];

export function loadPageStyle(href, document=globalThis.document) {
  const existing=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.getAttribute('href')===href);
  if(existing?.sheet)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const link=existing||document.createElement('link');
    link.rel='stylesheet';link.href=href;
    link.addEventListener('load',()=>resolve(),{once:true});
    link.addEventListener('error',()=>reject(Error('Could not load '+href)),{once:true});
    if(!existing)document.head.appendChild(link);
  });
}

export function createPageLoader({importModule=url=>import(url),loadStyle=loadPageStyle,scheduleEnabled=false,taskDetailsEnabled=false,setupTaskDetails=()=>{},setupTaskWorkspace=null,setupTaskInteractions=null,setupTaskSelection=null,setupTaskMenus=null,setupTaskShortcuts=null,warn=console.warn,waitForChat=()=>globalThis.window?.__kairosAiWorkspaceReady}={}) {
  const loaded=new Map();
  function prepare(page) {
    if(loaded.has(page))return loaded.get(page);
    const task=(async()=>{
      if(page==='tasks-page'&&taskDetailsEnabled){
        await Promise.all([loadStyle('task-list.css?v=19'),loadStyle('assignment-progress.css?v=2'),loadStyle('schedule-inspector.css?v=11')]);
        await setupTaskDetails(await importModule('./task-detail-pane.js?v=26'));
        if(setupTaskWorkspace)await setupTaskWorkspace(await importModule('./task-list-workspace.js?v=23'));
        if(setupTaskInteractions)await setupTaskInteractions(await importModule('./task-list-interactions.js?v=21'));
        if(setupTaskSelection)await setupTaskSelection(await importModule('./task-selection.js?v=4'));
        if(setupTaskMenus){const [actions,menu]=await Promise.all([importModule('./task-actions.js?v=5'),importModule('./task-action-menu.js?v=6')]);await setupTaskMenus({actions,menu})}
        if(setupTaskShortcuts)await setupTaskShortcuts(await importModule('./task-keyboard-shortcuts.js?v=2'));
      }
      if(page==='ai-page') {
        await loadStyle('ai-workspace.css?v=3');
        // Markdown enhances already-escaped text; a CDN outage must not prevent
        // authentication or plain-text chat. Sanitisation stays in ai-markdown.
        void importModule('./ai-markdown.js?v=1').catch(error=>warn('[Kairos] Markdown unavailable; using plain text.',error));
        await importModule('./ai-workspace.js?v=60');
        await waitForChat();
      }
      if(page==='statistics-page') {
        await loadStyle('statistics-ai.css?v=2');
        await importModule('./statistics-ai.js?v=1');
      }
      if(page==='schedule-page'&&scheduleEnabled) {
        await Promise.all(scheduleStyles.map(name=>loadStyle(name+(name==='schedule-keyboard.css'?'?v=1':name==='schedule-find-time.css'?'?v=2':name==='schedule-workspace.css'?'?v=11':name==='schedule-inspector.css'?'?v=11':name==='schedule-calendar.css'?'?v=11':name==='schedule-ai.css'?'?v=11':name==='planning-hub.css'?'?v=3':name==='assignment-progress.css'?'?v=2':name==='schedule-day-change.css'?'?v=1':name==='schedule-interactions.css'?'?v=12':'?v=10'))));
        await importModule('./schedule-workspace.js?v=21');
        // These modules inspect the workspace during boot. Preserve that order
        // even when network responses arrive out of order.
        for(const name of scheduleModules)await importModule('./'+name+(name==='schedule-keyboard.js?v=8'?'?v=2':name==='schedule-find-time.js?v=8'?'?v=2':name==='planning-hub.js?v=22'?'?v=16':name==='schedule-interactions.js?v=26'?'?v=20':name==='schedule-inspector.js?v=29'?'?v=22':name==='schedule-ai.js?v=22'?'?v=15':name==='schedule-task-create.js?v=22'?'?v=14':'?v=11'));
      }
    })();
    loaded.set(page,task);
    return task;
  }
  return {prepare};
}
