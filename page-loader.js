// Keep each workspace alive once loaded: navigating never cancels AI requests,
// recreates Firebase listeners, or resets an in-progress schedule edit.
const scheduleStyles=['schedule-workspace.css','schedule-interactions.css','schedule-inspector.css','schedule-ai.css','schedule-day-change.css'];
const scheduleModules=['schedule-interactions.js','schedule-inspector.js','schedule-responsive.js','schedule-task-create.js','schedule-ai.js'];

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

export function createPageLoader({importModule=url=>import(url),loadStyle=loadPageStyle,scheduleEnabled=false,taskDetailsEnabled=false,setupTaskDetails=()=>{},warn=console.warn,waitForChat=()=>globalThis.window?.__kairosAiWorkspaceReady}={}) {
  const loaded=new Map();
  function prepare(page) {
    if(loaded.has(page))return loaded.get(page);
    const task=(async()=>{
      if(page==='tasks-page'&&taskDetailsEnabled){
        await Promise.all([loadStyle('task-list.css?v=2'),loadStyle('schedule-inspector.css?v=10')]);
        await setupTaskDetails(await importModule('./task-detail-pane.js?v=2'));
      }
      if(page==='ai-page') {
        await loadStyle('ai-workspace.css?v=2');
        // Markdown enhances already-escaped text; a CDN outage must not prevent
        // authentication or plain-text chat. Sanitisation stays in ai-markdown.
        void importModule('./ai-markdown.js?v=1').catch(error=>warn('[Kairos] Markdown unavailable; using plain text.',error));
        await importModule('./ai-workspace.js?v=28');
        await waitForChat();
      }
      if(page==='statistics-page') {
        await loadStyle('statistics-ai.css?v=2');
        await importModule('./statistics-ai.js?v=1');
      }
      if(page==='schedule-page'&&scheduleEnabled) {
        await Promise.all(scheduleStyles.map(name=>loadStyle(name+(name==='schedule-day-change.css'?'?v=1':name==='schedule-interactions.css'?'?v=11':'?v=10'))));
        await importModule('./schedule-workspace.js?v=11');
        // These modules inspect the workspace during boot. Preserve that order
        // even when network responses arrive out of order.
        for(const name of scheduleModules)await importModule('./'+name+(name==='schedule-interactions.js'?'?v=12':name==='schedule-responsive.js'||name==='schedule-ai.js'||name==='schedule-inspector.js'?'?v=11':'?v=10'));
      }
    })();
    loaded.set(page,task);
    return task;
  }
  return {prepare};
}
