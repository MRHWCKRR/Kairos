import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, getPlan, recommend, proposeChange, applyProposal, updateTask, addTask, setCompleted, validateState, beginSession, pauseSession } from '../prototypes/today/model.js';

test('sample day has 80 usable minutes and a thirty-minute delay leaves 50', () => {
  const state = createScenario('adult');
  assert.equal(getPlan(state).capacity, 80);
  const delayed = { ...state, now: 870 };
  assert.equal(getPlan(delayed).capacity, 50);
  assert.equal(getPlan(delayed).overflow, 30);
  assert.ok(getPlan(delayed).unplaced.some(t => t.id === 'expenses'));
});

test('recommendation respects deadlines and chooses a full task that fits before a commitment', () => {
  const state = { ...createScenario('adult'), now: 870 };
  const pick = recommend(state);
  assert.equal(pick.task.id, 'notes');
  assert.equal(pick.start, 870);
  assert.equal(pick.end, 885);
  assert.match(pick.reason, /call/i);
});

test('fragmented spare minutes never imply that a long task fits', () => {
  const state = createScenario('adult');
  state.tasks = [ { ...state.tasks[0], duration: 60, remaining: 60 } ];
  const plan = getPlan(state);
  assert.equal(plan.capacity, 80);
  assert.equal(plan.placements.length, 0);
  assert.equal(plan.unplaced.length, 1);
});

test('proposal previews are pure and every offered alternative really fits', () => {
  const state = createScenario('adult');
  const before = JSON.stringify(state);
  const review = proposeChange(state, 30);
  assert.equal(JSON.stringify(state), before);
  assert.equal(review.lostMinutes, 30);
  assert.equal(review.capacity, 50);
  assert.equal(review.options.length, 2);
  for (const option of review.options) {
    const next = applyProposal(state, option);
    assert.equal(next.now, 870);
    assert.equal(getPlan(next).unplaced.length, 0);
    assert.equal(next.commitments[0].start, 890);
  }
  const defer = review.options.find(o => o.kind === 'defer');
  assert.deepEqual(defer.movedIds, ['expenses']);
  const next = applyProposal(state, defer);
  assert.ok(getPlan(next, {day: 1}).placements.some(p => p.task.id === 'expenses'));
});

test('hard deadlines and lack of tomorrow capacity prevent a defer offer', () => {
  const state = createScenario('adult');
  state.tasks = state.tasks.map(t => ({ ...t, dueDay: 0 }));
  assert.ok(!proposeChange(state, 30).options.some(o => o.kind === 'defer'));
  const fullTomorrow = createScenario('adult');
  fullTomorrow.tomorrow.end = fullTomorrow.tomorrow.start + 15;
  assert.ok(!proposeChange(fullTomorrow, 30).options.some(o => o.kind === 'defer'));
});

test('stale proposals cannot overwrite an edited task', () => {
  const state = createScenario('student');
  const option = proposeChange(state, 30).options[0];
  const edited = updateTask(state, state.tasks[0].id, {title: 'Changed title'});
  assert.throws(() => applyProposal(edited, option), /changed/i);
});

test('completion is idempotent, reopen preserves duration and notes, and new work is visible', () => {
  let state = createScenario('adult');
  state = updateTask(state, 'notes', {note: 'Start at slide 3'});
  state = setCompleted(state, 'notes', true);
  assert.equal(setCompleted(state, 'notes', true), state);
  state = setCompleted(state, 'notes', false);
  assert.equal(state.tasks.find(t => t.id === 'notes').note, 'Start at slide 3');
  state = addTask(state, {title: 'Read chapter', remaining: 20, list: 'School', plannedDay: null, dueDay: 2, priority: 2});
  assert.equal(state.tasks.at(-1).plannedDay, null);
  assert.equal(state.tasks.at(-1).remaining, 20);
  assert.throws(() => addTask(state, {title:'', remaining: 0}), /title|duration/i);
});

test('pause and resume record elapsed sessions once without completing or shrinking work', () => {
  const baseline = createScenario('adult');
  const running = beginSession(baseline, 'notes', 1000);
  assert.equal(beginSession(running, 'notes', 2000), running);
  const paused = pauseSession(running, 'Slide 3 next', 61000);
  assert.equal(paused.session, null);
  const task = paused.tasks.find(t => t.id === 'notes');
  assert.equal(task.spentMs, 60000);
  assert.equal(task.remaining, 15);
  assert.equal(task.done, false);
  assert.equal(task.note, 'Slide 3 next');
  assert.equal(pauseSession(paused, '', 62000), paused);
  assert.equal(beginSession(paused, 'notes', 63000).session.taskId, 'notes');
});

test('saved data round-trips but invalid and unsupported structures are rejected', () => {
  const state = createScenario('adult');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  for (const value of [null, {}, { ...state, schemaVersion: 99 }, { ...state, tasks: [{id: 'x', title: '<x>'}] }, { ...state, now: NaN }]) {
    assert.equal(validateState(value), null);
  }
});

test('model rejects scheduling a task after its deadline even outside the editor', () => {
  const state=createScenario('adult');
  assert.throws(()=>updateTask(state,'notes',{plannedDay:1}),/deadline/i);
  assert.throws(()=>addTask(state,{title:'Urgent task',remaining:20,plannedDay:1,dueDay:0}),/deadline/i);
});
