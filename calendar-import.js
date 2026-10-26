const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const shiftDate=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const scope=id=>id?.ownerId?JSON.stringify([id.ownerId,id.planId||null]):null;
const safeMessage=(error,fallback)=>String(error?.message||fallback).replace(/(?:https?|webcal):\/\/\S+/gi,'[calendar link]');

export function mountCalendarImport({document=globalThis.document,window=globalThis.window,getIdentity,getState,getTimezone,getToday,ensurePlan,commit,session,fetchFeed,confirmRemove=async()=>false,uuid=()=>globalThis.crypto.randomUUID(),now=Date.now,
 parse=async(...args)=>(await import('./calendar-parser.js?v=1')).parseCalendar(...args),
 buildSync=async(...args)=>(await import('./calendar-commands.js?v=1')).buildCalendarSync(...args),
 buildRemove=async(...args)=>(await import('./calendar-commands.js?v=1')).buildCalendarRemove(...args)}={}){
 const dialog=document.createElement('dialog');dialog.className='calendar-import-dialog';dialog.setAttribute('aria-labelledby','calendar-import-title');
 dialog.innerHTML=`<header class="calendar-import-head"><div><h2 id="calendar-import-title">Calendars</h2><p>Read-only commitments for your schedule.</p></div><button type="button" data-calendar-close aria-label="Close calendars">×</button></header>
 <section class="calendar-import-sources"><h3>Your calendars</h3><div data-calendar-sources></div></section>
 <form data-calendar-form><h3 data-calendar-form-title>Add a calendar</h3><p class="calendar-import-help">Upload an .ics file or use a published Google, Outlook or iCloud calendar link. Other calendars can be exported as .ics files.</p>
 <div class="calendar-import-inputs"><label>Calendar file<input name="file" type="file" accept=".ics,text/calendar"></label><span class="calendar-import-or">or</span><label>Published calendar link<input name="url" type="url" maxlength="2048" placeholder="https://…" autocomplete="off" spellcheck="false"></label></div>
 <label>Calendar name<input name="name" maxlength="120" placeholder="Use calendar name" autocomplete="off"></label>
 <div class="calendar-import-range"><label>Import from<input name="from" type="date" required></label><label>Through<input name="to" type="date" required></label></div>
 <p class="calendar-import-help" data-calendar-range>Dates use your profile timezone. Import up to 366 days at a time.</p>
 <div class="calendar-import-actions"><button type="submit" data-calendar-preview>Preview import</button><button type="button" data-calendar-new hidden>Add another calendar</button></div></form>
 <section class="calendar-import-preview" data-calendar-preview-section hidden><h3>Review changes</h3><p data-calendar-summary></p><p class="calendar-import-help" data-calendar-warning></p><ol data-calendar-preview-list></ol><p class="calendar-import-help">Busy events block planning time. Free events remain visible. Changes in the original calendar appear after you refresh and import again.</p><button type="button" data-calendar-apply class="calendar-import-primary">Import calendar</button></section>
 <footer><p data-calendar-status role="status" aria-live="polite"></p><div class="calendar-import-actions" data-calendar-recovery hidden><button type="button" data-calendar-retry>Retry save</button><button type="button" data-calendar-clear>Clear recovery</button></div></footer>`;
 document.body.appendChild(dialog);
 const find=s=>dialog.querySelector(s),field=name=>find('[name="'+name+'"]');
 let actor=scope(getIdentity()),generation=0,busy=false,disposed=false,preview=null,retained=null,sourceId=null,sourceKind=null,message='',opener=null,draftTimezone=getTimezone(),observedPending=null;
 const state=()=>session?.state?.()||{busy:false,pending:false};
 const current=(ticket,id)=>!disposed&&generation===ticket&&scope(getIdentity())===id;
 const sameOperation=(a,b)=>a&&b&&scope(a)===scope(b)&&a.operationId===b.operationId&&a.createdAt===b.createdAt;
 const blocked=()=>busy||state().busy||state().pending;
 function defaults(){const today=getToday();field('from').value=shiftDate(today,-7);field('to').value=shiftDate(today,90);field('name').value='';field('url').value='';field('file').value='';sourceId=null;sourceKind=null;}
 function close(){if(dialog.close)dialog.close();else dialog.removeAttribute('open');opener?.focus?.();}
 function render(){
  if(disposed)return;
  const pending=state(),disabled=busy||pending.busy||pending.pending||!getIdentity()?.planId;
  dialog.setAttribute('aria-busy',String(busy||pending.busy));
  for(const input of dialog.querySelectorAll('input'))input.disabled=disabled;
  find('[data-calendar-preview]').disabled=disabled;find('[data-calendar-new]').disabled=disabled;
  find('[data-calendar-close]').disabled=false;
  find('[data-calendar-form-title]').textContent=sourceId?'Refresh calendar':'Add a calendar';
  find('[data-calendar-new]').hidden=!sourceId;
  find('[data-calendar-range]').textContent='Dates use '+getTimezone()+'. Import up to 366 days at a time.';
  const sources=getState()?.calendarSources||[];
  find('[data-calendar-sources]').innerHTML=sources.length?sources.map(source=>`<div class="calendar-import-source"><div><strong>${escapeText(source.name)}</strong><small>${source.kind==='feed'?'Published feed':'Calendar file'} · ${escapeText(source.from)} – ${escapeText(source.to)} · ${escapeText(source.timezone)}</small>${source.timezone!==getTimezone()?'<small class="calendar-import-stale">Timezone changed—refresh or replace this calendar before planning.</small>':''}</div><div class="calendar-import-actions"><button type="button" data-calendar-refresh="${escapeText(source.id)}" ${disabled?'disabled':''}>${source.kind==='feed'?'Refresh':'Replace file'}</button><button type="button" data-calendar-remove="${escapeText(source.id)}" ${disabled?'disabled':''}>Remove</button></div></div>`).join(''):'<p class="calendar-import-help">No imported calendars yet.</p>';
  find('[data-calendar-preview-section]').hidden=!preview;
  find('[data-calendar-preview-list]').innerHTML=preview?preview.events.slice(0,50).map(event=>`<li><time>${escapeText(event.date)} · ${event.allDay?'All day':escapeText(event.start)+'–'+escapeText(event.end)}</time><span>${escapeText(event.title)}</span>${event.transparent?'<small>Free</small>':''}</li>`).join(''):'';
  if(preview){const summary=preview.built.summary||{};find('[data-calendar-summary]').textContent=`${preview.source.name}: ${summary.added||0} added, ${summary.updated||0} updated, ${summary.removed||0} removed. ${preview.events.length} events from ${preview.source.from} through ${preview.source.to} in ${preview.source.timezone}.`;find('[data-calendar-warning]').textContent=[...(preview.warnings||[]),...(preview.events.length>50?['Showing the first 50 events. All '+preview.events.length+' events will be imported.']:[])].join(' ');}
  else{find('[data-calendar-summary]').textContent='';find('[data-calendar-warning]').textContent='';}
  find('[data-calendar-apply]').disabled=!preview||disabled;
  find('[data-calendar-recovery]').hidden=!pending.pending;
  find('[data-calendar-retry]').disabled=busy||pending.busy;
  find('[data-calendar-clear]').disabled=busy||pending.busy;
  find('[data-calendar-status]').textContent=pending.pending?(pending.message||'A save is unconfirmed. Retry checks the original operation.'):message;
 }
 function sync(){
  if(disposed)return;
  const next=scope(getIdentity());
  if(next!==actor){actor=next;generation++;busy=false;preview=null;retained=null;observedPending=null;message='';draftTimezone=getTimezone();defaults();close();}
  if(draftTimezone!==getTimezone()){draftTimezone=getTimezone();if(!retained){generation++;busy=false;preview=null;message='Your timezone changed. Preview the calendar again before importing.';}}
  render();
 }
 async function open(){
  if(disposed||[...document.querySelectorAll('dialog[open]')].some(item=>item!==dialog))return false;
  sync();const id=getIdentity();if(!id?.ownerId)return false;
  const owner=id.ownerId,ticket=generation;let initializedPlan=null;
  try{if(!id.planId)initializedPlan=await ensurePlan?.();}catch(error){message=safeMessage(error,'Could not open your planner.');render();return false;}
  const initialized=!id.planId&&typeof initializedPlan==='string'&&getIdentity()?.planId===initializedPlan&&generation===ticket+1;
  if(disposed||generation!==ticket&&!initialized||getIdentity()?.ownerId!==owner)return false;
  actor=scope(getIdentity());if(!getIdentity()?.planId)return false;
  opener=document.activeElement;render();if(!dialog.hasAttribute('open')){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}field('url').focus?.();return true;
 }
 function range(){const from=field('from').value,to=field('to').value;const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;if(!valid(from)||!valid(to)||to<from||(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000>=366)throw Error('Choose a date range of up to 366 days.');return {from,to};}
 async function prepare({source=null,fetchExisting=false}={}){
  sync();if(disposed||blocked())return false;
  const id=actor,ticket=++generation;busy=true;preview=null;message=fetchExisting?'Refreshing calendar.':'Reading calendar.';
  try{
   const dates=range(),file=field('file').files?.[0],url=source?.kind==='feed'?source.url:field('url').value.trim(),name=field('name').value.trim();
   if(source){sourceId=source.id;sourceKind=source.kind;}
   const target=sourceId||'calendar-'+uuid(),kind=sourceKind||((file&&!url)?'file':'feed');
   let text,normalisedUrl;
   render();
   if(kind==='file'){
    if(!file)throw Error('Choose an .ics file to preview.');if(file.size>1024*1024)throw Error('Calendar files must be no larger than 1 MiB.');text=await file.text();
   }else{
    if(!url)throw Error('Choose an .ics file or enter a published calendar link.');
    const result=await fetchFeed(url);if(!current(ticket,id))return false;text=result.calendar;normalisedUrl=result.url;
   }
   if(!current(ticket,id))return false;
   const timezone=getTimezone(),parsed=await parse(text,{sourceId:target,timezone,...dates});if(!current(ticket,id))return false;
   const next={id:target,name:name||parsed.name||source?.name||file?.name?.replace(/\.ics$/i,'')||'Imported calendar',kind,timezone,...dates,updatedAt:now(),...(kind==='feed'?{url:normalisedUrl}:{})};
   const built=await buildSync(getState(),next,parsed.events);if(!current(ticket,id))return false;
   preview={source:next,events:parsed.events,warnings:parsed.warnings||[],built};sourceId=target;sourceKind=kind;message='Review the changes, then import to save them.';return true;
  }catch(error){if(current(ticket,id))message=safeMessage(error,'Could not read this calendar. Nothing was imported.');return false;}
  finally{if(current(ticket,id)){busy=false;render();}}
 }
 async function save(built){
  sync();if(!built||disposed||blocked())return false;
  if(built.command.type==='calendar_sync'&&built.command.source.timezone!==getTimezone()){preview=null;message='Your timezone changed. Preview the calendar again before importing.';render();return false;}
  const id=actor,ticket=++generation,identity={...getIdentity(),operationId:'calendar-'+uuid(),createdAt:now()};retained={identity,built};busy=true;message='Saving calendar.';render();
  try{await commit(built.command,built.expected,identity);if(!current(ticket,id))return false;retained=null;preview=null;defaults();message='Calendar saved.';return true;}
  catch(error){if(current(ticket,id)){if(!sameOperation(identity,state().pendingIdentity))retained=null;message=(retained?'Could not confirm this save. Retry uses the same operation. ':'Could not save this calendar. Your preview is retained. ')+safeMessage(error,'');}return false;}
  finally{if(current(ticket,id)){busy=false;render();}}
 }
 async function remove(sourceId){
  sync();if(disposed||blocked())return;
  const id=actor,ticket=generation,source=(getState().calendarSources||[]).find(item=>item.id===sourceId);if(!source)return;
  try{const built=await buildRemove(getState(),sourceId);if(!current(ticket,id))return;if(!await confirmRemove('Remove '+source.name+' and its imported events? Tasks and other calendars will stay unchanged.'))return;if(!current(ticket,id)||blocked())return;await save(built);}catch(error){if(current(ticket,id)){message=safeMessage(error,'Could not remove this calendar.');render();}}
 }
 async function refresh(id){
  sync();if(blocked())return;
  const source=(getState().calendarSources||[]).find(item=>item.id===id);if(!source)return;
  preview=null;sourceId=source.id;sourceKind=source.kind;field('name').value=source.name;field('url').value='';field('file').value='';
  if(source.kind==='feed'){field('url').value=source.url;await prepare({source,fetchExisting:true});}
  else{message='Choose the updated .ics file, then preview its replacement.';render();field('file').focus?.();}
 }
 async function retry(){if(disposed||busy||state().busy)return;const id=actor,ticket=generation,owned=sameOperation(retained?.identity,state().pendingIdentity);busy=true;render();try{const result=await session.retry();if(current(ticket,id)&&result&&owned){retained=null;preview=null;defaults();message='Calendar saved.';}}catch(error){if(current(ticket,id))message=safeMessage(error,'Could not confirm this save. Your recovery is retained.');}finally{if(current(ticket,id)){busy=false;render();}}}
 function clear(){if(disposed||busy||state().busy)return;const expected=state().pendingIdentity;if(!expected)return;if(session.discard(expected)){retained=null;message='Recovery cleared. Your preview and inputs are still available.';}render();}
 const onInput=event=>{if(!busy&&!state().pending&&event.target.matches('input')){preview=null;render();}};
 const onSubmit=event=>{event.preventDefault();void prepare();};
 const onClick=event=>{const target=event.target.closest('button');if(!target)return;if(target.matches('[data-calendar-close]'))close();else if(target.matches('[data-calendar-apply]'))void save(preview?.built);else if(target.matches('[data-calendar-retry]'))void retry();else if(target.matches('[data-calendar-clear]'))clear();else if(target.matches('[data-calendar-refresh]'))void refresh(target.dataset.calendarRefresh);else if(target.matches('[data-calendar-remove]'))void remove(target.dataset.calendarRemove);else if(target.matches('[data-calendar-new]')){defaults();preview=null;message='';render();}};
 const onCancel=event=>{event.preventDefault();close();};
 const unsubscribe=session?.subscribe?.(()=>{if(disposed)return;if(scope(getIdentity())!==actor){sync();return;}const next=state();if(retained&&!next.pending&&sameOperation(observedPending,retained.identity)){if(next.status==='saved'){retained=null;preview=null;defaults();message='Calendar saved.';}else if(next.status==='idle'){retained=null;message='Recovery cleared. Your preview and inputs are still available.';}}observedPending=next.pendingIdentity;render();});
 const onPagehide=event=>{if(!event.persisted)dispose();};
 function dispose(){if(disposed)return;disposed=true;generation++;unsubscribe?.();dialog.removeEventListener('input',onInput);dialog.removeEventListener('change',onInput);dialog.removeEventListener('click',onClick);dialog.removeEventListener('cancel',onCancel);find('form').removeEventListener('submit',onSubmit);window?.removeEventListener('pagehide',onPagehide);dialog.remove();}
 dialog.addEventListener('input',onInput);dialog.addEventListener('change',onInput);dialog.addEventListener('click',onClick);dialog.addEventListener('cancel',onCancel);find('form').addEventListener('submit',onSubmit);window?.addEventListener('pagehide',onPagehide);defaults();render();
 return {open,sync,dispose};
}
