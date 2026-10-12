// Coalesce hidden-page work until the browser is idle. Returning to a clean
// page keeps its DOM, scroll position, and bound controls intact.
export function createPageRenderCache({isActive,scheduleIdle}) {
  const pending=new Map();let scheduled=false,rendering=null;
  function flush(page) {
    const render=pending.get(page);if(!render)return;
    pending.delete(page);rendering=page;
    try {render();}finally {rendering=null;}
  }
  function queue() {
    if(scheduled)return;scheduled=true;
    scheduleIdle(()=>{
      scheduled=false;
      const page=pending.keys().next().value;
      if(page)flush(page);
      if(pending.size)queue();
    });
  }
  function defer(page,render) {
    if(rendering===page||isActive(page)){pending.delete(page);return false;}
    // A page can have more than one renderer (e.g. badges and goal selects).
    const previous=pending.get(page);
    if(previous) {
      const renderers=previous.renderers||new Set([previous]);renderers.add(render);
      const combined=()=>{for(const renderer of renderers)renderer();};combined.renderers=renderers;pending.set(page,combined);
    } else pending.set(page,render);
    queue();return true;
  }
  return {defer,activate:flush};
}
