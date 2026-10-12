// Pure, deterministic prototype model. Minutes are local sample-day minutes,
// not real dates; elapsed sessions use wall-clock milliseconds separately.
const copy = value => JSON.parse(JSON.stringify(value));
const minute = value => Number.isInteger(value) && value >= 0 && value <= 1440;
const day = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 7);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const bump = state => ({ ...copy(state), revision: state.revision + 1 });

export function createScenario(kind = 'adult') {
  const student = kind === 'student';
  const task = (id, title, remaining, list, priority, dueDay, plannedDay = 0, note = '') => ({id, title, remaining, duration: remaining, list, priority, dueDay, plannedDay, note, done: false, spentMs: 0});
  return {
    schemaVersion: 1, revision: 0, scenario: student ? 'student' : 'adult', now: 840, end: 960,
    tomorrow: {start: 900, end: 1020}, session: null,
    tasks: student ? [
      task('notes', 'Recall yesterday’s science topics', 15, 'School', 3, 0),
      task('draft', 'Draft the geography introduction', 25, 'School', 2, 0),
      task('expenses', 'Organise English research notes', 35, 'School', 1, 3),
      task('admin', 'Pack materials for tomorrow', 5, 'Personal', 1, 1),
      task('tomorrow', 'Review the next science chapter', 15, 'School', 2, 2, 1),
      task('inbox', 'Find ideas for the project cover', 20, 'Personal', 1, null, null)
    ] : [
      task('notes', 'Review meeting notes', 15, 'Work', 3, 0),
      task('draft', 'Draft the project introduction', 25, 'Work', 2, 0),
      task('expenses', 'Submit this month’s expenses', 35, 'Work', 1, 3),
      task('admin', 'Set out tomorrow’s priorities', 5, 'Personal', 1, 1),
      task('tomorrow', 'Review the project outline', 15, 'Work', 2, 2, 1),
      task('inbox', 'Find a weekend walking route', 20, 'Personal', 1, null, null)
    ],
    commitments: [{id:'fixed', title:student ? 'Afternoon ride' : 'Client call', day:0, start:890, end:920, type:'fixed'},
      {id:'next-fixed', title:student ? 'Club meeting' : 'Team check-in', day:1, start:960, end:975, type:'fixed'}],
    breaks: [{id:'break-1', title:'Short break', day:0, start:885, end:890, type:'break'}, {id:'break-2', title:'Short break', day:0, start:955, end:960, type:'break'}]
  };
}

export function validateState(value) {
  try {
    if (!value || value.schemaVersion !== 1 || !Number.isInteger(value.revision) || value.revision < 0 || !['adult','student'].includes(value.scenario) || !minute(value.now) || !minute(value.end) || value.now > value.end) return null;
    if (!value.tomorrow || !minute(value.tomorrow.start) || !minute(value.tomorrow.end) || value.tomorrow.start >= value.tomorrow.end) return null;
    if (!Array.isArray(value.tasks) || value.tasks.length > 200) return null;
    const ids = new Set();
    for (const t of value.tasks) {
      if (!text(t.id, 80) || !t.id || ids.has(t.id) || !text(t.title, 180) || !t.title.trim() || !text(t.list, 48) || !t.list.trim() || !text(t.note, 600) || typeof t.done !== 'boolean' || !Number.isInteger(t.remaining) || t.remaining < 1 || t.remaining > 240 || !Number.isInteger(t.duration) || t.duration < 1 || t.duration > 240 || ![1,2,3].includes(t.priority) || !day(t.dueDay) || ![0,1,null].includes(t.plannedDay) || !Number.isFinite(t.spentMs) || t.spentMs < 0) return null;
      ids.add(t.id);
      if(t.plannedDay!==null && t.dueDay!==null && t.plannedDay>t.dueDay) return null;
    }
    for (const blocks of [value.commitments, value.breaks]) {
      if (!Array.isArray(blocks) || blocks.length > 100) return null;
      for (const b of blocks) if (!text(b.id, 80) || !text(b.title, 180) || ![0,1].includes(b.day) || !minute(b.start) || !minute(b.end) || b.start >= b.end || !['fixed','break'].includes(b.type)) return null;
    }
    if (value.session !== null && (!value.session || !ids.has(value.session.taskId) || value.tasks.find(t => t.id === value.session.taskId).done || !Number.isFinite(value.session.startedAt) || value.session.startedAt < 0)) return null;
    return copy(value);
  } catch { return null; }
}

function rank(a, b) {
  return (a.dueDay ?? 99) - (b.dueDay ?? 99) || b.priority - a.priority;
}

export function getPlan(state, {day: targetDay = 0, now, end} = {}) {
  const start = now ?? (targetDay === 0 ? state.now : state.tomorrow.start);
  const finish = end ?? (targetDay === 0 ? state.end : state.tomorrow.end);
  const blocks = [...state.commitments, ...state.breaks].filter(b => b.day === targetDay && b.end > start && b.start < finish).sort((a,b) => a.start - b.start);
  const slots = [];
  let cursor = start;
  for (const block of blocks) {
    if (block.start > cursor) slots.push({start:cursor, end:Math.min(block.start, finish)});
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < finish) slots.push({start:cursor, end:finish});
  const available = slots.map(s => ({...s}));
  const tasks = state.tasks.filter(t => !t.done && t.plannedDay === targetDay).sort(rank);
  const placements = [], unplaced = [];
  for (const task of tasks) {
    const slot = available.find(s => s.end - s.start >= task.remaining);
    if (!slot) { unplaced.push(task); continue; }
    placements.push({task, start:slot.start, end:slot.start + task.remaining});
    slot.start += task.remaining;
  }
  placements.sort((a,b) => a.start - b.start);
  const capacity = slots.reduce((n,s) => n + s.end - s.start, 0);
  const effort = tasks.reduce((n,t) => n + t.remaining, 0);
  return {start, end:finish, slots, blocks, placements, unplaced, capacity, effort, overflow:Math.max(0, effort - capacity), spare:Math.max(0, capacity - effort)};
}

export function recommend(state) {
  const plan = getPlan(state);
  const placement = plan.placements.find(p => p.start === state.now);
  if (!placement) return null;
  const fixed = state.commitments.filter(b => b.day === 0 && b.start >= placement.end).sort((a,b) => a.start - b.start)[0];
  return {...placement, reason:fixed ? `Fits before your ${fixed.title.toLowerCase()}.` : 'Fits in the time you have left.'};
}

export function proposeChange(state, lostMinutes) {
  if (!Number.isInteger(lostMinutes) || lostMinutes < 0 || lostMinutes > 120 || state.now + lostMinutes > state.end) throw new Error('Choose a delay within the remaining day.');
  if (state.session) throw new Error('Pause your current session before changing the day.');
  const delayed = {...copy(state), now:state.now + lostMinutes};
  const plan = getPlan(delayed), options = [];
  const option = (kind, next, movedIds = []) => ({kind, baseRevision:state.revision, next, movedIds});
  if (!plan.unplaced.length) options.push(option('keep', delayed));
  else {
    const movable = delayed.tasks.filter(t => !t.done && t.plannedDay === 0 && (t.dueDay === null || t.dueDay >= 1)).sort((a,b) => a.priority - b.priority || (b.dueDay ?? 99) - (a.dueDay ?? 99) || b.remaining - a.remaining);
    let next = copy(delayed), moved = [];
    for (const task of movable) {
      const candidate = copy(next);
      candidate.tasks.find(t => t.id === task.id).plannedDay = 1;
      if (getPlan(candidate, {day:1}).unplaced.length) continue;
      next = candidate; moved.push(task.id);
      if (!getPlan(next).unplaced.length) { options.push(option('defer', next, moved)); break; }
    }
    // Later is offered only if whole tasks actually fit, including fixed blocks
    // beyond the original window. The user must explicitly choose this cost.
    for (let finish = state.end + 15; finish <= Math.min(1440, state.end + 120); finish += 15) {
      const next = {...copy(delayed), end:finish};
      if (!getPlan(next).unplaced.length) { options.push(option('later', next)); break; }
    }
  }
  return {lostMinutes, now:delayed.now, capacity:plan.capacity, effort:plan.effort, overflow:plan.overflow, unplaced:plan.unplaced, options};
}

export function applyProposal(state, proposal) {
  if (proposal.baseRevision !== state.revision) throw new Error('Your tasks changed. Review the options again.');
  const next = validateState(proposal.next);
  if (!next || getPlan(next).unplaced.length || (proposal.kind === 'defer' && getPlan(next, {day:1}).unplaced.length)) throw new Error('This option no longer fits. Review the plan again.');
  return {...next, revision:state.revision + 1};
}

export function updateTask(state, id, patch) {
  const next = bump(state), task = next.tasks.find(t => t.id === id);
  if (!task) throw new Error('Task not found.');
  for (const key of ['title','remaining','list','priority','dueDay','plannedDay','note']) if (Object.hasOwn(patch,key)) task[key] = patch[key];
  if(task.plannedDay!==null && task.dueDay!==null && task.plannedDay>task.dueDay) throw new Error('The planned day is after the deadline.');
  if (!validateState(next)) throw new Error('Enter a title, list and duration between 1 and 240 minutes.');
  return next;
}

export function addTask(state, input) {
  const next = bump(state);
  next.tasks.push({id:`task-${next.revision}-${Date.now().toString(36)}`, title:input.title?.trim(), remaining:input.remaining, duration:input.remaining, list:input.list?.trim() || 'Inbox', priority:input.priority ?? 2, dueDay:input.dueDay ?? null, plannedDay:input.plannedDay ?? null, note:'', done:false, spentMs:0});
  const task=next.tasks.at(-1);
  if(task.plannedDay!==null && task.dueDay!==null && task.plannedDay>task.dueDay) throw new Error('The planned day is after the deadline.');
  if (!validateState(next)) throw new Error('Enter a title and duration between 1 and 240 minutes. Keep fewer than 200 tasks.');
  return next;
}

export function setCompleted(state, id, done, nowMs = Date.now()) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) throw new Error('Task not found.');
  if (task.done === done) return state;
  const next = bump(state), target = next.tasks.find(t => t.id === id);
  target.done = done;
  if (next.session?.taskId === id) {
    target.spentMs += Math.max(0, nowMs - next.session.startedAt);
    next.session = null;
  }
  return next;
}

export function beginSession(state, taskId, nowMs = Date.now()) {
  if (state.session?.taskId === taskId) return state;
  if (state.session) throw new Error('Pause the current task first.');
  if (!state.tasks.some(t => t.id === taskId && !t.done)) throw new Error('Choose an unfinished task.');
  const next = bump(state);
  next.session = {taskId, startedAt:nowMs};
  return next;
}

export function pauseSession(state, note, nowMs = Date.now()) {
  if (!state.session) return state;
  if (!text(note,600)) throw new Error('Keep your resume note under 600 characters.');
  const next = bump(state), task = next.tasks.find(t => t.id === next.session.taskId);
  task.spentMs += Math.max(0, nowMs - next.session.startedAt);
  task.note = note.trim();
  next.session = null;
  return next;
}

export function formatTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}
