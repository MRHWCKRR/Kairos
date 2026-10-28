import {eventOccurrence} from './event-occurrences.js?v=3';
import {
  getVisibleDates, shiftAnchor, toDateKey, parseTime, formatTime, addDays,
  taskDurationMinutes, layoutOverlaps, findConflicts, splitOvernightInterval, blockGeometry, eventSegmentsForDate
} from './schedule-utils.js?v=6';
import { projectStoredOccurrence, generateTaskOccurrences, generateTaskOccurrencesThrough } from './recurrence-utils.js?v=14';
import {planningClock} from './planning-model.js?v=1';
import {scheduleBacklogItems} from './schedule-overdue.js?v=5';

const HOUR_HEIGHT = 56;
const DAY_MINUTES = 1440;
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const validTaskColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null;

export function initScheduleWorkspace(options){
  const root=document.getElementById('schedule-page');
  if(!root) return null;
  const shell=root.querySelector('.schedule-workspace-shell');
  const toolbar=document.getElementById('schedule-toolbar');
  const backlog=document.getElementById('schedule-backlog');
  const calendar=document.getElementById('schedule-calendar');
  const inspector=document.getElementById('schedule-inspector');
  const review=document.getElementById('schedule-ai-review');
  const monthCalendar=document.getElementById('calendar-page');
  if(monthCalendar){monthCalendar.classList.remove('page-view','active');monthCalendar.classList.add('schedule-month-view');monthCalendar.hidden=true;root.appendChild(monthCalendar);}
  const initialView=options.getScheduleView?.();
  const state={monthView:initialView==='month',view:['day','week','three-day'].includes(initialView)?initialView:'three-day',anchor:new Date(),selected:{type:null,id:null},backlogCollapsed:false,inspectorOpen:false,proposals:[],interaction:null,scrollTop:null,filterOpen:false,filters:{tasks:true,events:true,completed:true}};
  state.focusDate=options.getScheduleDate?.()||toDateKey(state.anchor);
  let clockTimer=null;
  let dirty=true;
  let renderedDate=null,occurrenceCache=null,backlogKey=null;
  let inspectorSession=null,selectionRevision=0;

  const locale=()=>options.getLocale?.()||document.documentElement.lang||'en';
  const hour12=()=>options.getTimeFormat?.()!=='24';
  const visibleDates=()=>getVisibleDates(state.anchor,state.view);
  const boards=()=>Array.isArray(options.getBoards?.())?options.getBoards():[];
  const events=()=>Array.isArray(options.getScheduleEvents?.())?options.getScheduleEvents():[];
  const categories=()=>options.getScheduleCategories?.()||{};
  const currentClock=()=>planningClock(new Date().getTime(),options.getTimezone?.()||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');

  function allTasks(){
    const out=[];
    for(const board of boards()){
      if(board?.archived) continue;
      for(const section of Array.isArray(board?.sections)?board.sections:[]){
        if(section?.archived) continue;
        for(const task of Array.isArray(section?.tasks)?section.tasks:[]){
          if(task?.archived) continue;
          out.push({task,board,section});
        }
      }
    }
    return out;
  }

  function findTask(id){ return allTasks().find(x=>String(x.task.id)===String(id))||null; }
  function findEvent(id){ return events().find(x=>String(x.id)===String(id))||null; }
  function rangeLabel(){
    const dates=visibleDates(),first=dates[0],last=dates.at(-1);
    if(dates.length===1) return first.toLocaleDateString(locale(),{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    if(first.getFullYear()===last.getFullYear()&&first.getMonth()===last.getMonth()) return `${first.toLocaleDateString(locale(),{month:'short',day:'numeric'})}–${last.getDate()}, ${last.getFullYear()}`;
    return `${first.toLocaleDateString(locale(),{month:'short',day:'numeric'})} – ${last.toLocaleDateString(locale(),{month:'short',day:'numeric',year:'numeric'})}`;
  }

  function formatClock(minutes){ return formatTime(minutes,hour12()); }
  function displayClock(minutes){return formatClock(minutes>=DAY_MINUTES?0:minutes)}
  function taskMeta(entry){
    const bits=[entry.board?.title,entry.section?.title].filter(Boolean);
    if(entry.task.dueDate) bits.push(`Due ${new Date(entry.task.dueDate+'T12:00:00').toLocaleDateString(locale(),{month:'short',day:'numeric'})}`);
    if(entry.task.estimatedMinutes) bits.push(`${entry.task.estimatedMinutes} min`);
    return bits.join(' · ');
  }
  function recurringOccurrences(){
    if(occurrenceCache)return occurrenceCache;
    const dates=visibleDates(),today=currentClock().date,end=[toDateKey(dates.at(-1)),today].sort().at(-1),out=[];
    for(const {task,board,section} of allTasks()){
      if(!task.recurrence?.enabled)continue;
      for(const occurrence of generateTaskOccurrencesThrough(task,end,{today,includeCompleted:true})) out.push({...occurrence,board,section});
    }
    return occurrenceCache=out;
  }

  function renderToolbar(){
    const changedFilters=Number(!state.filters.tasks)+Number(!state.filters.events)+Number(!state.filters.completed);
    const filterMenu=state.filterOpen?`<div class="ks-filter-menu" role="group" aria-label="Schedule filters"><label><input type="checkbox" data-filter-key="tasks" ${state.filters.tasks?'checked':''}> Flexible tasks</label><label><input type="checkbox" data-filter-key="events" ${state.filters.events?'checked':''}> Fixed events</label><label><input type="checkbox" data-filter-key="completed" ${state.filters.completed?'checked':''}> Completed tasks</label></div>`:'';
    toolbar.innerHTML=`<div class="ks-toolbar-nav"><button type="button" data-nav="prev" aria-label="Previous period">‹</button><button type="button" data-nav="today">Today</button><button type="button" data-nav="next" aria-label="Next period">›</button><strong>${esc(rangeLabel())}</strong></div><div class="ks-toolbar-actions"><div class="ks-view-switch" role="group" aria-label="Schedule view"><button data-view="day" aria-pressed="${!state.monthView&&state.view==='day'}">Day</button><button data-view="three-day" aria-pressed="${!state.monthView&&state.view==='three-day'}">3 Day</button><button data-view="week" aria-pressed="${!state.monthView&&state.view==='week'}">Week</button><button type="button" data-view="month" aria-pressed="${state.monthView}">Month</button></div><div class="ks-filter-wrap"><button type="button" data-filter aria-expanded="${state.filterOpen}">Filter${changedFilters?` · ${changedFilters}`:''}</button>${filterMenu}</div><button type="button" data-plan class="ks-plan-btn">Plan</button><button type="button" data-event>+ Event</button><button type="button" data-calendars>Calendars</button><button type="button" data-schedule-settings>Settings</button></div>`;
    toolbar.querySelector('[data-nav="prev"]').onclick=()=>void setDate(toDateKey(shiftAnchor(new Date(state.focusDate+'T12:00:00'),state.view,-1)));
    toolbar.querySelector('[data-nav="today"]').onclick=()=>void goToday();
    toolbar.querySelector('[data-nav="next"]').onclick=()=>void setDate(toDateKey(shiftAnchor(new Date(state.focusDate+'T12:00:00'),state.view,1)));
    toolbar.querySelectorAll('[data-view]').forEach(btn=>btn.onclick=()=>void setView(btn.dataset.view));
    toolbar.querySelector('[data-schedule-settings]')?.addEventListener('click',()=>void options.openScheduleSettings?.());
    toolbar.querySelector('[data-filter]')?.addEventListener('click',event=>{event.stopPropagation();state.filterOpen=!state.filterOpen;renderToolbar()});
    toolbar.querySelectorAll('[data-filter-key]').forEach(input=>input.addEventListener('change',()=>{state.filters[input.dataset.filterKey]=input.checked;renderToolbar();renderCalendar()}));
    toolbar.querySelector('.ks-filter-menu')?.addEventListener('click',event=>event.stopPropagation());
    toolbar.querySelector('[data-event]').onclick=()=>options.openRecurringEventEditor?.();
    toolbar.querySelector('[data-calendars]')?.addEventListener('click',()=>void options.openCalendars?.());
  }

  function backlogItems(){return scheduleBacklogItems(allTasks(),recurringOccurrences(),currentClock())}
  function backlogSignature(items){return JSON.stringify(items.map(item=>[item.kind,item.occurrence?.occurrenceId||item.task.id,item.overdueReason]))}
  function renderBacklog(){
    const focused=backlog.contains(document.activeElement)?document.activeElement:null;
    const focusKeys=['taskId','occurrenceId','recoverTask','recoverOccurrence','backlogToggle'];
    const focusData=focused?focusKeys.filter(key=>key in focused.dataset).map(key=>[key,focused.dataset[key]]):[];
    const items=backlogItems();backlogKey=backlogSignature(items);
    const row=item=>{
      const {task,board,section,occurrence:o,overdueReason}=item,color=validTaskColor(task.color);
      const selected=o?state.selected.type==='occurrence'&&state.selected.occurrenceId===o.occurrenceId:state.selected.type==='task'&&String(state.selected.id)===String(task.id);
      const identity=o?`data-occurrence-id="${esc(o.occurrenceId)}" data-series-id="${esc(o.seriesId)}" data-occurrence-date="${esc(o.occurrenceDate)}"`:`data-task-id="${esc(task.id)}"`;
      const detail=[o?.displayDate||task.date,overdueReason==='deadline'?'Deadline passed':overdueReason==='schedule'?'Planned time passed':overdueReason?'Overdue':null,taskMeta({task,board,section})].filter(Boolean).join(' · ');
      return `<div class="ks-backlog-entry"><button type="button" class="ks-backlog-row ${o?'ks-recurring':''} ${selected?'is-selected':''} ${overdueReason?'is-overdue':''}" ${identity} ${color?`style="--ks-task-color:${color}"`:''}><span class="ks-grab" aria-hidden="true">⋮⋮</span><span class="ks-task-color-dot" aria-hidden="true"></span><span class="ks-backlog-copy"><strong>${o?'<span class="ks-recurring-mark" aria-hidden="true">↻</span> ':''}${esc(task.title)}</strong><small>${esc(detail)}</small></span></button>${overdueReason?`<button type="button" class="ks-recover-task" data-recover-task="${esc(o?.seriesId||task.id)}" ${o?`data-recover-occurrence="${esc(o.occurrenceDate)}" data-recover-id="${esc(o.occurrenceId)}"`:''} ${task.scheduleLocked?'disabled title="Unlock this task to find a new time"':''} aria-label="Find a new time for ${esc(task.title)}${o?', this occurrence':''}">Find a new time</button>`:''}</div>`;
    };
    const groups=[['Overdue',items.filter(item=>item.overdueReason)],['Unscheduled',items.filter(item=>!item.overdueReason)]];
    backlog.setAttribute('aria-label','Tasks to plan');backlog.classList.toggle('is-collapsed',state.backlogCollapsed);
    backlog.innerHTML=`<div class="ks-panel-title"><strong>${state.backlogCollapsed?'P':'To plan'}</strong><span>${items.length}</span><button type="button" data-backlog-toggle aria-label="${state.backlogCollapsed?'Expand':'Collapse'} tasks to plan">${state.backlogCollapsed?'>':'<'}</button></div>${state.backlogCollapsed?'':items.length?`<div class="ks-backlog-list">${groups.filter(([,entries])=>entries.length).map(([title,entries])=>`<section class="ks-backlog-group" aria-label="${title}"><h3>${title} <span>${entries.length}</span></h3>${entries.map(row).join('')}</section>`).join('')}</div>`:'<p class="ks-panel-empty">No tasks to plan.</p>'}`;
    backlog.querySelector('[data-backlog-toggle]')?.addEventListener('click',()=>{state.backlogCollapsed=!state.backlogCollapsed;render()});
    backlog.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('click',()=>selectItem('task',el.dataset.taskId)));
    backlog.querySelectorAll('[data-occurrence-id]').forEach(el=>el.addEventListener('click',()=>selectOccurrence(el.dataset)));
    if(focusData.length)[...backlog.querySelectorAll('button')].find(button=>focusData.every(([key,value])=>button.dataset[key]===value))?.focus();
  }

  function recurringSegmentsForDate(date){
    return eventSegmentsForDate(events(),toDateKey(date)).map(({event:ev,startMin,endMin,continued})=>({kind:'event',occurrenceDate:ev.occurrenceDate,id:'event-'+ev.id+'-'+(ev.occurrenceDate||'')+'-'+(continued?'end':'start'),sourceId:ev.id,title:ev.title,startMin,endMin,category:ev.category,fixed:true,continued,dated:!!ev.date,allDay:ev.allDay===true,readOnly:ev.readOnly===true||!!ev.calendarSourceId,transparent:ev.transparent===true}));
  }

  function taskSegmentsForDate(date){
    const key=toDateKey(date),fixed=recurringSegmentsForDate(date).filter(item=>!item.transparent);
    const ordinary=allTasks().filter(({task})=>!task.recurrence?.enabled&&task.date===key&&task.startTime&&!task.archived&&(state.filters.completed||!task.completed)).map(({task,board,section})=>{
      const start=parseTime(task.startTime); if(start===null) return null;
      const duration=taskDurationMinutes(task),end=Math.min(DAY_MINUTES,start+duration),conflicts=findConflicts({startMin:start,endMin:end},fixed);
      return {kind:'task',id:`task-${task.id}`,sourceId:task.id,title:task.title,startMin:start,endMin:end,task,board,section,conflicts};
    }).filter(Boolean);
    const recurring=recurringOccurrences().filter(o=>(o.status==='pending'||state.filters.completed&&o.status==='completed')&&o.displayDate===key&&o.startTime).map(o=>{
      const start=parseTime(o.startTime);if(start===null)return null;const end=Math.min(DAY_MINUTES,start+o.durationMinutes),conflicts=findConflicts({startMin:start,endMin:end},fixed);
      return {kind:'occurrence',id:`occurrence-${o.occurrenceId}`,sourceId:o.occurrenceId,title:o.task.title,startMin:start,endMin:end,task:o.task,board:o.board,section:o.section,conflicts,seriesId:o.seriesId,occurrenceId:o.occurrenceId,occurrenceDate:o.occurrenceDate,isOverdue:o.isOverdue,displayDate:o.displayDate};
    }).filter(Boolean);
    return [...ordinary,...recurring];
  }

  function itemMarkup(item,dateKey){
    const geometry=blockGeometry(item.startMin,item.endMin,HOUR_HEIGHT,20),compact=geometry.heightPx<34,width=100/item.columnCount,left=width*item.column;
    if(item.kind==='task'){
      const selected=state.selected.type==='task'&&String(state.selected.id)===String(item.sourceId),color=validTaskColor(item.task.color),label=`${item.title}, ${displayClock(item.startMin)} to ${displayClock(item.endMin)}, flexible task${item.conflicts.length?', conflicts with fixed commitment':''}`;
      return `<button type="button" class="ks-block ks-task-block ${compact?'is-compact':''} ${selected?'is-selected':''} ${item.task.completed?'is-completed':''} ${item.conflicts.length?'is-conflicting':''}" data-task-id="${esc(item.sourceId)}" data-date="${dateKey}" aria-label="${esc(label)}" style="${color?`--ks-task-color:${color};`:''}top:${geometry.topPx}px;height:${geometry.heightPx}px;left:calc(${left}% + 3px);width:calc(${width}% - 6px)"><span class="ks-block-title">${esc(item.title)}</span><span class="ks-block-time">${esc(displayClock(item.startMin))}–${esc(displayClock(item.endMin))}</span>${item.conflicts.length?'<span class="ks-conflict-mark" aria-hidden="true">!</span>':''}</button>`;
    }
    if(item.kind==='occurrence'){
      const selected=state.selected.type==='occurrence'&&state.selected.occurrenceId===item.occurrenceId,color=validTaskColor(item.task.color),label=`${item.title}, ${displayClock(item.startMin)} to ${displayClock(item.endMin)}, recurring task${item.isOverdue?', overdue':''}${item.conflicts.length?', conflicts with fixed commitment':''}`;
      return `<button type="button" class="ks-block ks-task-block ks-recurring ${compact?'is-compact':''} ${selected?'is-selected':''} ${item.isOverdue?'is-overdue':''} ${item.conflicts.length?'is-conflicting':''}" data-occurrence-id="${esc(item.occurrenceId)}" data-series-id="${esc(item.seriesId)}" data-occurrence-date="${esc(item.occurrenceDate)}" data-date="${dateKey}" aria-label="${esc(label)}" style="${color?`--ks-task-color:${color};`:''}top:${geometry.topPx}px;height:${geometry.heightPx}px;left:calc(${left}% + 3px);width:calc(${width}% - 6px)"><span class="ks-block-title"><span class="ks-recurring-mark" aria-hidden="true">↻</span> ${esc(item.title)}</span><span class="ks-block-time">${esc(displayClock(item.startMin))}–${esc(displayClock(item.endMin))}</span>${item.conflicts.length?'<span class="ks-conflict-mark" aria-hidden="true">!</span>':''}</button>`;
    }
    const selected=state.selected.type==='event'&&String(state.selected.id)===String(item.sourceId)&&(!item.occurrenceDate||state.selected.occurrenceDate===item.occurrenceDate),category=categories()[item.category]||{color:'#64748b'};
    return `<button type="button" class="ks-block ks-fixed-block ${compact?'is-compact':''} ${selected?'is-selected':''}" data-event-id="${esc(item.sourceId)}" data-event-occurrence="${esc(item.occurrenceDate||'')}" data-date="${dateKey}" aria-label="${esc(`${item.title}, ${displayClock(item.startMin)} to ${displayClock(item.endMin)}, ${item.dated?'dated event':'fixed recurring event'}${item.transparent?', free time':''}`)}" style="--ks-event:${esc(category.color||'#64748b')};top:${geometry.topPx}px;height:${geometry.heightPx}px;left:calc(${left}% + 3px);width:calc(${width}% - 6px)"><span class="ks-block-title">${esc(item.title)}${item.continued?' · continued':''}</span><span class="ks-block-time">${esc(displayClock(item.startMin))}–${esc(displayClock(item.endMin))}</span></button>`;
  }

  function deadlineMarkup(date){
    const key=toDateKey(date),deadlines=allTasks().filter(({task})=>!task.recurrence?.enabled&&!task.completed&&task.dueDate===key),visible=deadlines.slice(0,2);
    return `${visible.map(({task})=>`<button type="button" class="ks-deadline" data-task-id="${esc(task.id)}" title="${esc(task.title)} due">${esc(task.title)} due</button>`).join('')}${deadlines.length>2?`<span class="ks-deadline-more">+${deadlines.length-2} deadlines</span>`:''}`;
  }

  function renderCalendar(){
    const existingScroller=calendar.querySelector('.ks-timeline-scroll'),previousScroll=existingScroller?.scrollTop;if(Number.isFinite(previousScroll))state.scrollTop=previousScroll;
    const dates=visibleDates(),hours=Array.from({length:24},(_,h)=>`<div class="ks-hour-label ${h===0?'is-midnight':''}" style="top:${h===0?8:h*HOUR_HEIGHT}px">${esc(formatClock(h*60))}</div>`).join('');
    const headers=dates.map(date=>{const key=toDateKey(date),today=key===toDateKey(new Date());return `<div class="ks-day-head ${today?'is-today':''}" data-date="${key}"><span>${esc(date.toLocaleDateString(locale(),{weekday:'short'}))}</span><strong>${date.getDate()}</strong><div class="ks-deadline-lane">${deadlineMarkup(date)}</div></div>`}).join('');
    const cols=dates.map(date=>{const key=toDateKey(date),fixed=recurringSegmentsForDate(date),tasks=state.filters.tasks?taskSegmentsForDate(date):[],items=layoutOverlaps([...(state.filters.events?fixed:[]),...tasks]);return `<div class="ks-day-column" data-date="${key}"><div class="ks-day-grid" style="height:${24*HOUR_HEIGHT}px">${items.map(x=>itemMarkup(x,key)).join('')}<div class="ks-now-line" data-now-date="${key}" hidden><span></span></div></div></div>`}).join('');
    calendar.innerHTML=`<div class="ks-calendar-frame"><div class="ks-timeline-scroll"><div class="ks-calendar-content" style="--ks-days:${dates.length}"><div class="ks-calendar-head"><div class="ks-time-head"></div>${headers}</div><div class="ks-calendar-body"><div class="ks-time-rail" style="height:${24*HOUR_HEIGHT}px">${hours}</div><div class="ks-days">${cols}</div></div></div></div></div>`;
    calendar.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();selectItem('task',el.dataset.taskId)}));
    calendar.querySelectorAll('[data-occurrence-id]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();selectOccurrence(el.dataset)}));
    calendar.querySelectorAll('[data-event-id]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();selectItem('event',el.dataset.eventId,{occurrenceDate:el.dataset.eventOccurrence||null})}));
    calendar.querySelectorAll('.ks-day-grid').forEach(el=>el.addEventListener('click',()=>clearSelection()));updateNowLine();
    const scroller=calendar.querySelector('.ks-timeline-scroll');scroller?.addEventListener('scroll',()=>{state.scrollTop=scroller.scrollTop},{passive:true});requestAnimationFrame(()=>{if(!scroller)return;if(Number.isFinite(state.scrollTop))scroller.scrollTop=state.scrollTop;else{state.scrollTop=7*HOUR_HEIGHT;scroller.scrollTop=state.scrollTop}});
  }

  function updateNowLine(){const now=new Date(),key=toDateKey(now),top=(now.getHours()*60+now.getMinutes())/60*HOUR_HEIGHT;calendar.querySelectorAll('[data-now-date]').forEach(line=>{const active=line.dataset.nowDate===key;line.hidden=!active;if(active){line.style.top=`${top}px`;line.firstElementChild.textContent=formatClock(now.getHours()*60+now.getMinutes())}})}

  function renderInspector(){
    if(inspectorSession?.preserve(state.selected))return;
    const {type,id}=state.selected;shell.classList.toggle('inspector-open',!!type);if(!type){inspector.hidden=true;inspector.innerHTML='';return}inspector.hidden=false;
    if(type==='occurrence'){
      inspector.innerHTML=`<div class="ks-inspector-head"><span>Recurring task</span><button type="button" data-close aria-label="Close inspector">×</button></div><div class="ks-inspector-body"><p>Loading occurrence…</p></div>`;
    }else if(type==='task'){
      const found=findTask(id); if(!found){clearSelection();return}const {task,board,section}=found;
      inspector.innerHTML=`<div class="ks-inspector-head"><span>Task</span><button type="button" data-close aria-label="Close inspector">×</button></div><div class="ks-inspector-body"><h3>${esc(task.title)}</h3><p>${esc([board.title,section.title].filter(Boolean).join(' / '))}</p><dl><div><dt>Scheduled</dt><dd>${task.date?esc(task.date):'Unscheduled'}${task.startTime?` · ${esc(task.startTime)}${task.endTime?`–${esc(task.endTime)}`:''}`:''}</dd></div><div><dt>Duration</dt><dd>${task.startTime?`${taskDurationMinutes(task)} min`:(task.estimatedMinutes?`${task.estimatedMinutes} min`:'Not estimated')}</dd></div><div><dt>Due</dt><dd>${esc(task.dueDate||'No deadline')}</dd></div></dl><div class="ks-inspector-actions"><button type="button" data-complete>${task.completed?'Mark incomplete':'Complete'}</button><button type="button" data-reschedule>Reschedule</button><button type="button" data-ask-ai>Ask AI</button></div></div>`;
    }else{
      const source=findEvent(id),ev=state.selected.occurrenceDate?eventOccurrence(source,state.selected.occurrenceDate):source; if(!ev){clearSelection();return}const calendarSource=options.getCalendarSources?.().find(source=>source.id===ev.calendarSourceId),staleTimezone=calendarSource&&calendarSource.timezone!==options.getTimezone?.();inspector.innerHTML=`<div class="ks-inspector-head"><span>Fixed event</span><button type="button" data-close aria-label="Close inspector">×</button></div><div class="ks-inspector-body"><h3>${esc(ev.title)}</h3><p>${ev.occurrenceDate?'Occurrence '+esc(ev.occurrenceDate)+' · ':''}${ev.date?esc(ev.date):'Repeats weekly'} · ${ev.allDay?'All day':esc(ev.start)+'–'+esc(ev.end)}</p>${ev.readOnly||ev.calendarSourceId?'<p>Imported calendar · Read-only'+(ev.transparent?' · Free time':' · Busy')+'</p>'+(calendarSource?'<p>'+esc(calendarSource.name)+' · Imported in '+esc(calendarSource.timezone)+'.</p>':'')+(staleTimezone?'<p>Your timezone changed. Refresh this calendar in Calendars before planning.</p>':''):'<div class="ks-inspector-actions"><button type="button" data-edit-event>Edit event</button></div>'}</div>`;inspector.querySelector('[data-edit-event]')?.addEventListener('click',()=>options.openRecurringEventEditor?.(ev.id,state.selected.occurrenceDate));
    }
    inspector.querySelector('[data-close]')?.addEventListener('click',clearSelection);
  }

  function changeSelection(next){
    const apply=()=>{occurrenceCache=null;const entry=next.type==='task'?findTask(next.id):next.type==='occurrence'?findTask(next.seriesId):null;const effective=next.type==='occurrence'&&entry?projectStoredOccurrence(entry.task,next.occurrenceDate)?.task:entry?.task;if(!next.keepDate&&parsedDate(effective?.date)){state.focusDate=effective.date;options.setScheduleDate?.(state.focusDate);}state.selected=next;state.inspectorOpen=!!next.type;renderBacklog();renderCalendar();renderInspector();return true};
    const ticket=++selectionRevision,actor=JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()]);
    if(!inspectorSession)return apply();
    if(state.selected.type===next.type&&String(state.selected.id)===String(next.id)&&state.selected.occurrenceDate===next.occurrenceDate)return true;
    return inspectorSession.requestLeave().then(allowed=>allowed&&ticket===selectionRevision&&actor===JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()])?apply():false);
  }
  function selectItem(type,id,{keepDate=false,occurrenceDate=null}={}){return state.monthView?setView('day').then(allowed=>allowed?changeSelection({type,id,keepDate,occurrenceDate}):false):changeSelection({type,id,keepDate,occurrenceDate})}
  function selectOccurrence(data){
    if(state.monthView)return setView('day').then(allowed=>allowed?selectOccurrence(data):false);
    const occurrenceId=data.occurrenceId||data.id,seriesId=data.seriesId,occurrenceDate=data.occurrenceDate;
    const found=recurringOccurrences().find(item=>item.occurrenceId===occurrenceId);
    return changeSelection({type:'occurrence',id:occurrenceId,seriesId,occurrenceId,occurrenceDate,keepDate:!!data.keepDate,isOverdue:!!found?.isOverdue});
  }
  function clearSelection(){return changeSelection({type:null,id:null})}
  function focusDateTime(dateKey,timeValue){
    const parts=String(dateKey||'').split('-').map(Number);if(parts.length!==3||parts.some(x=>!Number.isFinite(x)))return;const target=new Date(parts[0],parts[1]-1,parts[2],12);if(target.getFullYear()!==parts[0]||target.getMonth()!==parts[1]-1||target.getDate()!==parts[2])return;state.focusDate=String(dateKey);options.setScheduleDate?.(state.focusDate);if(state.monthView){state.monthView=false;options.setScheduleView?.(state.view);}state.anchor=state.view==='three-day'?addDays(target,-1):target;const minutes=typeof timeValue==='number'?timeValue:parseTime(timeValue),targetMinutes=minutes===null?8*60:Math.max(0,Math.min(1439,minutes));render();requestAnimationFrame(()=>{const scroller=calendar.querySelector('.ks-timeline-scroll'),column=calendar.querySelector(`.ks-day-column[data-date="${CSS.escape(String(dateKey))}"]`);if(!scroller||!column)return;const top=Math.max(0,targetMinutes/60*HOUR_HEIGHT-scroller.clientHeight*.35),left=Math.max(0,64+column.offsetLeft+column.offsetWidth/2-scroller.clientWidth/2),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;state.scrollTop=top;scroller.scrollTo({top,left,behavior:reduced?'auto':'smooth'})});
  }

  function parsedDate(key){const parts=String(key||'').split('-').map(Number);if(parts.length!==3)return null;const date=new Date(parts[0],parts[1]-1,parts[2],12);return toDateKey(date)===key?date:null}
  async function setDate(key){
    const date=parsedDate(key);if(!date)return false;
    const ticket=++selectionRevision,actor=JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()]);
    if(inspectorSession&&!await inspectorSession.requestLeave())return false;
    if(ticket!==selectionRevision||actor!==JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()]))return false;
    state.focusDate=key;options.setScheduleDate?.(key);state.anchor=state.view==='three-day'?addDays(date,-1):date;state.selected={type:null,id:null};state.inspectorOpen=false;render();revealMonthDate();return true;
  }
  function revealMonthDate(){if(state.monthView)requestAnimationFrame(()=>{if(state.monthView)monthCalendar?.querySelector('.calendar-day[data-date="'+CSS.escape(state.focusDate)+'"]')?.scrollIntoView?.({block:'nearest'})})}
  function goToday(){return setDate(toDateKey(new Date()))}
  async function openTaskAt(target){
    const resolve=()=>{const found=findTask(target.taskId);if(!found)return null;if(target.occurrenceDate){const occurrence=found.task.recurrence?.exceptions?.[target.occurrenceDate]?.status==='completed'?projectStoredOccurrence(found.task,target.occurrenceDate):generateTaskOccurrences(found.task,target.occurrenceDate,target.occurrenceDate)[0];return occurrence?{task:occurrence.task,occurrence}:null}return found.task.recurrence?.enabled?null:found};
    if(!resolve()||!await setView('day'))return false;
    const actor=JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()]),found=resolve();if(!found)return false;
    const opened=target.occurrenceDate?await selectOccurrence({seriesId:target.taskId,occurrenceDate:target.occurrenceDate,occurrenceId:found.occurrence.occurrenceId}):await selectItem('task',target.taskId);
    if(!opened||actor!==JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()]))return false;
    focusDateTime(found.task.date,found.task.startTime);return true;
  }
  async function setView(view){
    if(!['day','three-day','week','month'].includes(view))return false;
    const ticket=++selectionRevision,actor=[options.getOwnerId?.(),options.getPlanId?.()];
    if(inspectorSession&&!await inspectorSession.requestLeave())return false;
    if(ticket!==selectionRevision||JSON.stringify(actor)!==JSON.stringify([options.getOwnerId?.(),options.getPlanId?.()]))return false;
    state.selected={type:null,id:null};state.monthView=view==='month';if(!state.monthView)state.view=view;
    const date=parsedDate(state.focusDate);if(date)state.anchor=state.view==='three-day'?addDays(date,-1):date;options.setScheduleView?.(view);render();revealMonthDate();return true;
  }
  function render(){
    occurrenceCache=null;
    root.classList.toggle('is-month-view',state.monthView);shell.hidden=state.monthView;
    if(monthCalendar)monthCalendar.hidden=!state.monthView;
    if(state.monthView)options.renderMonthCalendar?.(state.focusDate);
    renderToolbar();renderBacklog();if(!state.monthView)renderCalendar();renderInspector();review.hidden=!state.proposals.length;dirty=false;renderedDate=currentClock().date; }
  function activate(){ if(dirty||renderedDate!==currentClock().date)render();else if(backlogSignature(backlogItems())!==backlogKey)renderBacklog();updateNowLine(); }
  function invalidate(){ dirty=true;if(root.classList.contains('active'))render(); }
  function destroy(){ if(clockTimer) clearInterval(clockTimer); }

  document.addEventListener('click',event=>{if(state.filterOpen&&!event.target.closest?.('.ks-filter-wrap')){state.filterOpen=false;renderToolbar()}},true);
  document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||e.key!=='Escape'||!root.classList.contains('active')||document.querySelector('dialog[open]'))return;if(state.filterOpen){state.filterOpen=false;renderToolbar();return}void clearSelection()});
  window.addEventListener('popstate',()=>{if(root.classList.contains('active'))void setView(options.getScheduleView?.()||'three-day')});
  clockTimer=setInterval(()=>{if(root.classList.contains('active'))activate();},60000);render();revealMonthDate();
  return {render,activate,invalidate,destroy,state,setView,setDate,goToday,openTaskAt,selectItem,selectOccurrence,clearSelection,focusDateTime,setInspectorSession(session){inspectorSession=session},get inspectorSession(){return inspectorSession}};
}

function boot(){
  if(window.__kairosMobileDevice||document.documentElement.classList.contains('kairos-mobile-blocked')) return;
  const bridge=window.__kairosScheduleBridge;if(!bridge||window.__kairosScheduleWorkspace) return;window.__kairosScheduleWorkspace=initScheduleWorkspace(bridge);document.querySelector('[data-target="schedule-page"]')?.addEventListener('click',()=>window.__kairosScheduleWorkspace?.activate());
}

window.addEventListener('kairos-schedule-bridge-ready',boot);
window.addEventListener('kairos-data-changed',()=>setTimeout(()=>window.__kairosScheduleWorkspace?.invalidate(),25));
window.addEventListener('kairos-page-ready',event=>{if(event.detail?.page==='schedule-page')window.__kairosScheduleWorkspace?.activate();});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();

