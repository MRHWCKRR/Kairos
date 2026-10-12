import {createScenario, validateState, getPlan, recommend, proposeChange, applyProposal, updateTask, addTask, setCompleted, beginSession, pauseSession, formatTime} from './model.js';

const KEY = 'kairos-today-prototype-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  today:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  plan:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lists:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  change:'<path d="M4 9a8 8 0 0 1 14-3l2 3m0-5v5h-5M20 15a8 8 0 0 1-14 3l-2-3m0 5v-5h5"/>',
  play:'<path d="m9 5 10 7-10 7Z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
const clone = value => JSON.parse(JSON.stringify(value));
const elapsed = (state, now) => {
  const task = state.tasks.find(t => t.id === state.session?.taskId);
  const seconds = Math.floor((task?.spentMs || 0) / 1000 + (state.session ? Math.max(0, now - state.session.startedAt) / 1000 : 0));
  return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
};
const deadline = task => task.dueDay === null ? '' : task.dueDay === 0 ? 'Due today' : task.dueDay === 1 ? 'Due tomorrow' : `Due in ${task.dueDay} days`;
const planned = task => task.plannedDay === 0 ? 'Today' : task.plannedDay === 1 ? 'Tomorrow' : 'Unscheduled';

export function mountPrototype({document, storage, now = () => Date.now(), tick = true}) {
  let state = createScenario(), view = 'today', planDay = 0, filter = 'all', search = '', undo = null;
  let editingId = null, pausedId = null, review = null, selectedOption = 0, pendingScenario = null, opener = null;
  let notice = '';
  const completedAt = new Map();
  const $ = selector => document.querySelector(selector);
  const main = $('#main');
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const saved = validateState(JSON.parse(raw));
      if (saved) state = saved;
      else notice = 'The saved sample could not be read. A fresh sample is ready; your real account is unaffected.';
    }
  } catch { notice = 'Browser storage is unavailable. Your changes work in this tab but may not survive a reload.'; }

  function showNotice() {
    $('#storage-notice').textContent = notice;
    $('#storage-notice').hidden = !notice;
  }
  function save() {
    try { storage?.setItem(KEY, JSON.stringify(state)); }
    catch { notice = 'Browser storage is unavailable. Your changes work in this tab but may not survive a reload.'; showNotice(); }
  }
  function feedback(message, reversible = false) {
    $('#feedback-text').textContent = message;
    $('#feedback').hidden = false;
    $('#feedback [data-action="undo"]').hidden = !reversible;
  }
  function commit(next, message, reversible = true) {
    if (next === state) return;
    undo = reversible ? clone(state) : null;
    state = next; save(); render(); feedback(message, reversible);
  }
  function showDialog(id) {
    const dialog = $(`#${id}`);
    opener = document.activeElement;
    if (!dialog.hasAttribute('open')) dialog.showModal();
  }
  function closeDialog(dialog) { dialog.close(); }
  function heading(title, subtitle, change = false) {
    return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${change ? `<button class="secondary-button" data-action="change" ${state.session ? 'disabled title="Pause the current session first"' : ''}>${icon('change')} Day changed?</button>` : ''}<button class="primary-button" data-action="add">${icon('add')} Add task</button></div></div>`;
  }
  function taskRow(task, {context = false, placement = null} = {}) {
    return `<li class="task-row ${task.done ? 'is-done' : ''}" data-task-id="${esc(task.id)}">
      <button class="check-button" data-action="complete" data-id="${esc(task.id)}" aria-label="${task.done ? 'Reopen' : 'Complete'} ${esc(task.title)}" aria-pressed="${task.done}"><span class="check-circle" aria-hidden="true">${task.done ? '✓' : ''}</span></button>
      <div class="task-info"><button class="task-title-button" data-action="edit" data-id="${esc(task.id)}">${esc(task.title)}</button><div class="task-meta">${context ? `<span>${esc(planned(task))}</span>` : `<span>${esc(task.list)}</span>`}${deadline(task) ? `<span class="${task.dueDay === 0 ? 'deadline-today' : ''}">${esc(deadline(task))}</span>` : ''}${task.note ? '<span>↳ Resume note</span>' : ''}${placement ? `<span>${formatTime(placement.start)}–${formatTime(placement.end)}</span>` : ''}</div></div>
      <span class="task-duration">${task.remaining} min</span>${!task.done ? `<button class="row-begin" data-action="begin" data-id="${esc(task.id)}" ${state.session ? 'disabled' : ''}>Begin<span class="sr-only"> ${esc(task.title)}</span></button>` : ''}
    </li>`;
  }
  function capacityRibbon(plan) {
    const length=plan.end-plan.start;
    if(length<=0)return '';
    const parts=[...plan.slots.map(s=>({...s,type:'available'})),...plan.blocks.map(b=>({start:Math.max(b.start,plan.start),end:Math.min(b.end,plan.end),type:b.type}))].sort((a,b)=>a.start-b.start);
    return `<div class="time-ribbon" role="img" aria-label="Available time between protected commitments and breaks">${parts.map(p=>`<span class="ribbon-${p.type}" style="flex:${Math.max(0,p.end-p.start)}" title="${formatTime(p.start)}–${formatTime(p.end)} · ${p.type==='available'?'Available for work':p.type==='fixed'?'Fixed commitment':'Break'}"></span>`).join('')}</div><div class="ribbon-key"><span><i class="key-work"></i>Available</span><span><i class="key-fixed"></i>Fixed</span><span><i class="key-break"></i>Break</span></div>`;
  }
  function timeline(plan) {
    const events = [...plan.placements.map(p=>({id:p.task.id,title:p.task.title,start:p.start,end:p.end,type:'task'})), ...plan.blocks].sort((a,b)=>a.start-b.start);
    return `<ol class="timeline">${events.map(e=>`<li><time>${formatTime(Math.max(e.start, plan.start))}</time><div class="timeline-event is-${e.type}"><div class="timeline-title">${e.type==='fixed'?icon('lock'):''}${esc(e.title)}</div><small>${e.type === 'fixed' ? 'Fixed commitment' : e.type === 'break' ? 'Protected pause' : `${e.end-e.start} min`} · until ${formatTime(e.end)}</small></div></li>`).join('')}</ol>`;
  }
  function fitWarning(plan, targetDay = 0) {
    if (!plan.unplaced.length) return '';
    return `<div class="no-fit"><strong>${plan.unplaced.length} ${plan.unplaced.length === 1 ? 'task needs' : 'tasks need'} a different plan.</strong>${plan.overflow ? `${plan.effort} minutes of work, ${plan.capacity} minutes available. ` : 'The spare time is split into gaps that are too short. '}Unplaced work stays in your list.<br><button class="text-button" data-action="${targetDay===1?'window':'change'}" ${state.session && targetDay===0 ? 'disabled' : ''}>${targetDay===1?'Adjust tomorrow’s window':'Review what can give'}</button></div>`;
  }
  function renderToday() {
    const plan = getPlan(state), pick = recommend(state), active = state.tasks.find(t => t.id === state.session?.taskId);
    const plannedTasks = state.tasks.filter(t => t.plannedDay === 0 && !t.done);
    let focus;
    if (active) {
      focus = `<section class="next-action" aria-label="Current task"><div class="focus-heading"><p class="eyebrow"><span class="working-dot"></span>IN FOCUS</p><span class="focus-fit">Your session</span></div><h2>${esc(active.title)}</h2><div class="task-context"><span>${esc(active.list)}</span><span>·</span><span>${active.remaining} min estimated remaining</span></div>${active.note ? `<p class="resume-note"><strong>Pick up here</strong>${esc(active.note)}</p>` : ''}<div id="elapsed" class="session-time" aria-label="Elapsed time">${elapsed(state, now())}</div><p class="session-caption">Elapsed time · the task stays open until you complete it</p><div class="action-line"><button class="secondary-button" data-action="pause">Pause & leave a note</button><button class="primary-button" data-action="complete" data-id="${esc(active.id)}">Mark complete</button></div></section>`;
    } else if (pick) {
      focus = `<section class="next-action" aria-label="Recommended next task"><div class="focus-heading"><p class="eyebrow"><span class="working-dot"></span>RIGHT NOW</p><span class="focus-fit">Fits your next gap</span></div><h2>${esc(pick.task.title)}</h2><div class="task-context"><span>${pick.task.remaining} min</span><span>·</span><span>${esc(pick.task.list)}</span>${deadline(pick.task) ? `<span>·</span><span>${esc(deadline(pick.task))}</span>` : ''}</div><p class="fit-reason">${esc(pick.reason)}</p>${pick.task.note ? `<p class="resume-note"><strong>Pick up here</strong>${esc(pick.task.note)}</p>` : ''}<div class="action-line"><button class="primary-button" data-action="begin" data-id="${esc(pick.task.id)}">${icon('play')} ${pick.task.spentMs || pick.task.note ? 'Resume' : 'Begin'}</button><button class="text-button" data-action="edit" data-id="${esc(pick.task.id)}">Adjust task</button></div></section>`;
    } else {
      const currentBlock = plan.blocks.find(b => b.start <= state.now && b.end > state.now);
      const title = !plannedTasks.length ? 'Your planned work is done.' : currentBlock ? `${currentBlock.title} has this time.` : 'There’s no whole task that fits right now.';
      focus = `<section class="next-action empty-state"><div class="focus-heading"><p class="eyebrow"><span class="working-dot"></span>RIGHT NOW</p></div><h2>${esc(title)}</h2><p>${!plannedTasks.length ? 'Leave some space in the day, or choose something from your lists.' : currentBlock ? `Your next free time begins at ${formatTime(currentBlock.end)}. Keep this commitment, then pick up what fits.` : 'You can change the window, adjust a task’s remaining estimate, or make room for it.'}</p><button class="primary-button" data-action="${!plannedTasks.length ? 'lists' : 'window'}">${!plannedTasks.length ? 'Open your lists' : 'Adjust available time'}</button></section>`;
    }
    const done = state.tasks.filter(t=>t.plannedDay === 0 && t.done);
    const availableBreak = plan.blocks.filter(b=>b.type==='break').reduce((n,b)=>n+Math.min(b.end,plan.end)-Math.max(b.start,plan.start),0);
    main.innerHTML = heading('Today', 'Monday, 12 October · Your afternoon, with a little room to breathe.', true) + `<div class="today-grid"><div>${focus}${fitWarning(plan)}<section aria-label="Today’s tasks"><div class="section-heading"><h2>On your list today</h2><span>${plannedTasks.length} ${plannedTasks.length===1 ? 'task' : 'tasks'}</span></div><ul class="task-list">${plannedTasks.map(t=>taskRow(t,{placement:plan.placements.find(p=>p.task.id===t.id)})).join('')}</ul><button class="inline-add" data-action="add">${icon('add')} Add something to today</button>${done.length ? `<details class="completed-details"><summary>Completed · ${done.length}</summary><ul class="task-list">${done.map(t=>taskRow(t)).join('')}</ul></details>` : ''}</section></div><aside class="capacity-pane" aria-label="Available time and agenda"><div class="pane-heading"><h3>Your time</h3><button class="text-button" data-action="window">Edit</button></div><p class="capacity-label">${formatTime(state.now)}–${formatTime(state.end)} · sample window</p><div class="capacity-number">${plan.capacity}<span> min available</span></div><p class="capacity-detail">After commitments & ${availableBreak} min of pauses</p>${capacityRibbon(plan)}<div class="capacity-status ${plan.unplaced.length ? 'is-tight' : ''}"><strong>${plan.effort} min of work planned</strong>${plan.unplaced.length ? 'Some work does not fit yet.' : plan.spare ? `${plan.spare} min left open. A little breathing room.` : 'Everything fits. Breaks are protected.'}</div><h3>In time order</h3>${timeline(plan)}<button class="text-button" data-action="plan">Open the full plan →</button></aside></div>`;
  }
  function renderPlan() {
    const plan = getPlan(state,{day:planDay});
    const events = [...plan.placements.map(p=>({start:p.start,end:p.end,type:'task',task:p.task,title:p.task.title})), ...plan.blocks].sort((a,b)=>a.start-b.start);
    main.innerHTML = heading('Your plan', 'Time is finite. Keep the trade-offs visible.', planDay === 0) + `<div class="view-tabs" aria-label="Plan day"><button data-action="plan-day" data-day="0" aria-pressed="${planDay===0}">Today</button><button data-action="plan-day" data-day="1" aria-pressed="${planDay===1}">Tomorrow</button></div><div class="agenda"><div class="window-summary"><span><strong>${formatTime(plan.start)}–${formatTime(plan.end)}</strong> available window</span><span><strong>${plan.capacity} min</strong> for flexible work</span><span><strong>${plan.effort} min</strong> planned</span><button class="text-button" data-action="window">Edit window</button></div>${fitWarning(plan,planDay)}${events.map(e=>`<div class="agenda-row is-${e.type}"><time>${formatTime(Math.max(e.start,plan.start))}–${formatTime(e.end)}</time><div><div class="agenda-title">${esc(e.title)}</div><p>${e.type==='fixed' ? 'Fixed · preserved when you replan' : e.type==='break' ? 'Break · protected time' : `${esc(e.task.list)} · ${e.end-e.start} min · ${esc(deadline(e.task) || 'No deadline')}`}</p></div>${e.type==='task' ? `<button class="text-button" data-action="edit" data-id="${esc(e.task.id)}">Adjust</button>` : ''}</div>`).join('') || '<div class="empty-state"><h2>A clear window.</h2><p>Add work from your lists or leave the time open.</p></div>'}${plan.unplaced.length ? `<section style="margin-top:28px"><div class="section-heading"><h2>Still needs a place</h2></div><ul class="task-list">${plan.unplaced.map(t=>taskRow(t)).join('')}</ul></section>` : ''}<button class="inline-add" data-action="add">${icon('add')} Add work to this day</button></div>`;
  }
  function listBody() {
    const tasks = state.tasks.filter(t => (filter==='all' || filter==='completed' && t.done || filter==='today' && t.plannedDay===0 && !t.done || filter==='tomorrow' && t.plannedDay===1 && !t.done || filter==='unscheduled' && t.plannedDay===null && !t.done) && `${t.title} ${t.list}`.toLowerCase().includes(search.toLowerCase()));
    const lists = [...new Set(tasks.map(t=>t.list))];
    return lists.map(list=>`<section class="list-group"><h2>${esc(list)}<span class="list-count">${tasks.filter(t=>t.list===list).length}</span></h2><ul class="task-list">${tasks.filter(t=>t.list===list).sort((a,b)=>Number(a.done)-Number(b.done)).map(t=>taskRow(t,{context:true})).join('')}</ul></section>`).join('') || '<div class="empty-state"><h2>No tasks here yet.</h2><p>Try another filter, or capture one concrete next step.</p><button class="primary-button" data-action="add">Add a task</button></div>';
  }
  function renderLists() {
    main.innerHTML = heading('Your lists', 'Everything stays findable, even when it is not on today’s plan.') + `<div class="view-tabs" aria-label="Task filter">${[['all','All work'],['today','Today'],['tomorrow','Tomorrow'],['unscheduled','Unscheduled'],['completed','Completed']].map(([key,label])=>`<button data-action="filter" data-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('')}</div><input id="task-search" class="search-field" type="search" placeholder="Find a task or list" aria-label="Find a task or list" value="${esc(search)}"><div id="list-content" class="list-content">${listBody()}</div>`;
  }
  function render() {
    const active = document.activeElement;
    const focusAction = active?.getAttribute?.('data-action'), focusId = active?.getAttribute?.('data-id');
    const focusFilter = active?.getAttribute?.('data-filter'), focusDay = active?.getAttribute?.('data-day');
    $('#navigation').innerHTML = ['today','plan','lists'].map(name=>`<button class="nav-button" data-action="${name}" ${view===name ? 'aria-current="page"' : ''}>${icon(name)} ${name[0].toUpperCase()+name.slice(1)}</button>`).join('');
    $('#sidebar-lists').innerHTML=[...new Set(state.tasks.map(t=>t.list))].map((list,i)=>`<button class="sidebar-list-button" data-action="open-list" data-list="${esc(list)}"><span class="list-colour colour-${i%3}"></span>${esc(list)}<span class="sidebar-count">${state.tasks.filter(t=>t.list===list&&!t.done).length}</span></button>`).join('');
    $('#sample-clock').textContent = `${formatTime(state.now)} · sample time`;
    setSelect($('#scenario'), state.scenario);
    if (view==='today') renderToday(); else if (view==='plan') renderPlan(); else renderLists();
    if (focusAction && !document.querySelector('dialog[open]')) {
      const candidates = [...document.querySelectorAll('[data-action]')];
      const replacement = candidates.find(e=>e.getAttribute('data-action')===focusAction && (!focusId || e.getAttribute('data-id')===focusId) && (!focusFilter || e.getAttribute('data-filter')===focusFilter) && (!focusDay || e.getAttribute('data-day')===focusDay) && !e.disabled);
      (replacement || main).focus?.({preventScroll:true});
    }
    showNotice();
  }
  // Explicit option selection also works in DOM test environments that expose
  // select.value as a getter only. In browsers it matches the native value.
  function setSelect(select, value) {
    const options = [...select.querySelectorAll('option')];
    for (const option of options) {option.removeAttribute('selected');option.selected=false;}
    const selected = options.find(option=>option.value===String(value));
    if(selected){selected.setAttribute('selected','');selected.selected=true;}
  }
  function taskEditor(id = null) {
    editingId = id;
    const t = state.tasks.find(t=>t.id===id);
    $('#task-dialog-title').textContent = t ? 'Adjust task' : 'Add a task';
    const form = $('#task-form');
    form.querySelector('[name="title"]').value = t?.title || '';
    form.querySelector('[name="remaining"]').value = t?.remaining ?? 20;
    form.querySelector('[name="list"]').value = t?.list || (state.scenario==='student' ? 'School' : 'Work');
    setSelect(form.querySelector('[name="plannedDay"]'), t ? t.plannedDay ?? 'none' : view==='lists' ? 'none' : planDay===1 && view==='plan' ? 1 : 0);
    const due = t?.dueDay ?? 'none';
    const dueSelect = form.querySelector('[name="dueDay"]');
    if (![...dueSelect.querySelectorAll('option')].some(o=>o.value===String(due))) dueSelect.insertAdjacentHTML('beforeend',`<option value="${due}">In ${due} days</option>`);
    setSelect(dueSelect,due); setSelect(form.querySelector('[name="priority"]'),t?.priority ?? 2);
    form.querySelector('[name="note"]').value = t?.note || '';
    $('#list-names').innerHTML = [...new Set(state.tasks.map(t=>t.list))].map(name=>`<option value="${esc(name)}"></option>`).join('');
    $('#task-error').hidden = true; showDialog('task-dialog');
  }
  function renderReview() {
    const container = $('#change-options');
    $('#change-error').hidden = true;
    try {
      review = proposeChange(state, Number($('#lost-minutes').value)); selectedOption = 0;
      const nextPlan = review.options[0] ? getPlan(review.options[0].next) : null;
      container.innerHTML = `<div class="change-summary"><strong>${review.capacity} minutes available. ${review.effort} minutes of work.</strong><br>${review.overflow ? `${review.overflow} minutes over the available time.` : review.unplaced.length ? 'The gaps are too short for some whole tasks.' : 'Your work still fits.'} Fixed commitments and remaining breaks stay in place.</div>${review.options.map((o,i)=>{
        const moved = o.movedIds.map(id=>state.tasks.find(t=>t.id===id));
        const title = o.kind==='defer' ? `Keep your ${formatTime(state.end)} finish` : o.kind==='later' ? `Finish at ${formatTime(o.next.end)}` : 'Keep the work you planned';
        const detail = o.kind==='defer' ? moved.map(t=>`<strong>${esc(t.title)}</strong> moves to tomorrow.`).join('<br>') : o.kind==='later' ? `Keep every task today. Your finish moves ${o.next.end-state.end} minutes later.` : 'No tasks move; only the sample start time changes.';
        const tomorrow = o.kind==='defer' ? getPlan(o.next,{day:1}) : null;
        const verified = tomorrow ? moved.map(t=>{const p=tomorrow.placements.find(p=>p.task.id===t.id);return `<br>${formatTime(p.start)}–${formatTime(p.end)} tomorrow · ${esc(deadline(t) || 'No deadline')}`;}).join('') : '';
        return `<label class="proposal-option"><span class="option-top"><input type="radio" name="proposal" value="${i}" ${i===0?'checked':''}>${esc(title)}</span><p>${detail}</p><p class="option-detail">${o.kind==='defer' ? 'Verified space in tomorrow’s plan.' : o.kind==='later' ? 'Choose this only if the later finish works for you.' : 'Your fixed commitments are unchanged.'}${verified}</p></label>`;
      }).join('')}${!review.options.length ? '<div class="no-fit"><strong>There is no safe automatic adjustment.</strong>Tomorrow has too little space, deadlines prevent a move, or the work still needs longer gaps. Edit your tasks or available window instead.</div>' : `<div class="proposal-schedule" aria-label="Selected plan preview"><strong>Selected plan · today</strong><ul style="padding:0;margin:8px 0 0">${nextPlan.placements.map(p=>`<li>${formatTime(p.start)}–${formatTime(p.end)} · ${esc(p.task.title)}</li>`).join('')}</ul></div>`}`;
      $('[data-action="apply-proposal"]').disabled = !review.options.length;
    } catch(error) {
      container.innerHTML=''; review=null; $('[data-action="apply-proposal"]').disabled=true;
      $('#change-error').textContent=error.message; $('#change-error').hidden=false;
    }
  }
  function onClick(event) {
    const button = event.target.closest?.('[data-action]');
    if (!button || button.disabled) return;
    const action=button.dataset.action, id=button.dataset.id;
    if (button.tagName==='A') event.preventDefault();
    try {
      if (['today','plan','lists'].includes(action)) {view=action;render();main.focus?.({preventScroll:true});}
      else if(action==='add') taskEditor();
      else if(action==='edit') taskEditor(id);
      else if(action==='complete') {
        const stamp=now();
        // A double-click may land on the freshly rendered Reopen control (or
        // the next row). It must not reverse or complete more work by accident.
        if(event.detail>1 || stamp-(completedAt.get(id) ?? -Infinity)<350)return;
        completedAt.set(id,stamp);
        const t=state.tasks.find(t=>t.id===id);commit(setCompleted(state,id,!t.done,stamp),t.done?'Task reopened.':'Task complete.');
      }
      else if(action==='begin') {commit(beginSession(state,id,now()),'Session started. Pause whenever you need.',false);view='today';render();main.focus?.({preventScroll:true});}
      else if(action==='pause') {pausedId=state.session.taskId;const note=state.tasks.find(t=>t.id===pausedId).note;commit(pauseSession(state,note,now()),'Session paused. Your work stays open.',false);$('#resume-note').value=note;showDialog('pause-dialog');}
      else if(action==='change') {review=null;$('#change-options').innerHTML='';$('#change-error').hidden=true;$('[data-action="apply-proposal"]').disabled=true;const select=$('#lost-minutes');for(const option of select.querySelectorAll('option'))option.disabled=Number(option.value)>state.end-state.now;const first=[...select.querySelectorAll('option')].find(o=>!o.disabled);setSelect(select,state.end-state.now>=30?30:first?.value ?? 15);showDialog('change-dialog');}
      else if(action==='review-change') renderReview();
      else if(action==='apply-proposal') {if(!review?.options[selectedOption])return;const option=review.options[selectedOption];const next=applyProposal(state,option);closeDialog($('#change-dialog'));commit(next,'Revised plan applied. Your commitments stayed put.');}
      else if(action==='undo') {if(!undo)return;const restored={...clone(undo),revision:state.revision+1};state=restored;undo=null;completedAt.clear();save();render();feedback('Change undone.');}
      else if(action==='dismiss-feedback') {$('#feedback').hidden=true;}
      else if(action==='open-list') {view='lists';filter='all';search=button.dataset.list;render();main.focus?.({preventScroll:true});}
      else if(action==='filter') {filter=button.dataset.filter;render();}
      else if(action==='plan-day') {planDay=Number(button.dataset.day);render();}
      else if(action==='window') {$('#window-start').value=formatTime(view==='plan'&&planDay===1?state.tomorrow.start:state.now);$('#window-end').value=formatTime(view==='plan'&&planDay===1?state.tomorrow.end:state.end);$('#window-error').hidden=true;showDialog('window-dialog');}
      else if(action==='help') showDialog('help-dialog');
      else if(action==='theme') {const dark=document.body.classList.toggle('dark');$('#theme-label').textContent=dark?'Light appearance':'Dark appearance';}
      else if(action==='reset') {pendingScenario=state.scenario;$('#confirm-title').textContent='Reset this sample?';showDialog('confirm-dialog');}
      else if(action==='confirm-reset') {closeDialog($('#confirm-dialog'));state=createScenario(pendingScenario);undo=null;review=null;completedAt.clear();view='today';planDay=0;search='';filter='all';save();render();feedback('Fresh sample ready.');}
      else if(action==='cancel') closeDialog(button.closest('dialog'));
    } catch(error) {feedback(error.message);}
  }
  function onSubmit(event) {
    const form=event.target;
    if (!['task-form','pause-form','window-form'].includes(form.id))return;
    event.preventDefault();
    try {
      if(form.id==='task-form') {
        const field=name=>form.querySelector(`[name="${name}"]`).value;
        const input={title:field('title').trim(),remaining:Number(field('remaining')),list:field('list').trim(),plannedDay:field('plannedDay')==='none'?null:Number(field('plannedDay')),dueDay:field('dueDay')==='none'?null:Number(field('dueDay')),priority:Number(field('priority')),note:field('note').trim()};
        if(input.plannedDay!==null && input.dueDay!==null && input.plannedDay>input.dueDay)throw new Error('This plan would be after the deadline. Choose an earlier day or change the deadline.');
        const next=editingId?updateTask(state,editingId,input):addTask(state,input);
        // Capture notes use the same task field as later edits.
        if(!editingId)next.tasks.at(-1).note=input.note;
        closeDialog($('#task-dialog'));commit(next,editingId?'Task updated.':'Task added.');
      } else if(form.id==='pause-form') {
        const next=updateTask(state,pausedId,{note:$('#resume-note').value.trim()});
        closeDialog($('#pause-dialog'));commit(next,'Resume note saved with your task.');
      } else {
        const toMinutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
        const start=toMinutes($('#window-start').value),end=toMinutes($('#window-end').value);
        if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>1439||end<=start)throw new Error('Choose an end time after the start time.');
        const next=clone(state);next.revision++;
        if(view==='plan'&&planDay===1)next.tomorrow={start,end}; else {next.now=start;next.end=end;}
        if(!validateState(next))throw new Error('This window is not valid.');
        closeDialog($('#window-dialog'));commit(next,'Available window updated.');
      }
    } catch(error) {
      const target=form.id==='task-form' ? $('#task-error') : form.id==='window-form' ? $('#window-error') : null;
      if(target){target.textContent=error.message;target.hidden=false;}else feedback(error.message);
    }
  }
  function onChange(event) {
    if(event.target.id==='scenario') {
      const next=event.target.value;
      setSelect(event.target,state.scenario);
      if(next===state.scenario)return;
      pendingScenario=next;$('#confirm-title').textContent=`Switch to ${next==='student'?'School & life':'Work & life'}?`;showDialog('confirm-dialog');
    } else if(event.target.name==='proposal') {
      selectedOption=Number(event.target.value);
      const plan=getPlan(review.options[selectedOption].next);
      $('.proposal-schedule').innerHTML=`<strong>Selected plan · today</strong><ul style="padding:0;margin:8px 0 0">${plan.placements.map(p=>`<li>${formatTime(p.start)}–${formatTime(p.end)} · ${esc(p.task.title)}</li>`).join('')}</ul>`;
    } else if(event.target.id==='lost-minutes') {
      review=null;$('#change-options').innerHTML='';$('[data-action="apply-proposal"]').disabled=true;
    }
  }
  function onInput(event) {
    if(event.target.id==='task-search'){search=event.target.value;$('#list-content').innerHTML=listBody();}
  }
  const closeListeners=[];
  for(const dialog of document.querySelectorAll('dialog')) {
    const onClose=()=>{
      // A re-render can replace the invoking row. Focus the matching control or
      // main instead of leaving focus on a detached node.
      if(opener?.isConnected)opener.focus?.({preventScroll:true});else main.focus?.({preventScroll:true});
    };
    dialog.addEventListener('close',onClose);closeListeners.push([dialog,onClose]);
  }
  document.addEventListener('click',onClick);
  document.addEventListener('submit',onSubmit);
  document.addEventListener('change',onChange);
  document.addEventListener('input',onInput);
  const timer=tick?globalThis.setInterval(()=>{const output=$('#elapsed');if(output)output.textContent=elapsed(state,now());},1000):null;
  render();
  return {getState:()=>clone(state),destroy(){if(timer)globalThis.clearInterval(timer);document.removeEventListener('click',onClick);document.removeEventListener('submit',onSubmit);document.removeEventListener('change',onChange);document.removeEventListener('input',onInput);for(const[d,listener]of closeListeners)d.removeEventListener('close',listener);}};
}

if (typeof document !== 'undefined' && document.querySelector('#main')) {
  let storage;
  try { storage=globalThis.localStorage; } catch { storage={getItem(){throw new Error('Storage unavailable');},setItem(){throw new Error('Storage unavailable');}}; }
  mountPrototype({document,storage});
}
