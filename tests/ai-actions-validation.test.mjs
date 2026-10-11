import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { taskDurationMinutes } from '../schedule-utils.js';

async function fixture(tasks) {
  const data = { boards: [{ id: 'b', title: 'Study', sections: [{ id: 's', title: 'General', tasks }] }] };
  const writes = [];
  const source = (await fs.readFile(new URL('../ai-actions.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\s*/gm, '').replace(/export /g, '');
  const context = vm.createContext({ auth: { currentUser: { uid: 'one' } }, db: {},
    collection: () => ({}), query: x => x, where: () => ({}), doc: () => ({}), getDoc: async () => ({}),
    getDocs: async () => ({ docs: [{ id: 'plan', data: () => structuredClone(data) }] }),
    setDoc: async (_, next) => { writes.push(structuredClone(next)); },
    window: { dispatchEvent() {} }, CustomEvent: class {}, taskDurationMinutes, console });
  vm.runInContext(source, context);
  return { writes, execute: action => context.executeKairosAction(action) };
}

test('a supplied nonexistent ID never falls back to another task title', async () => {
  const f = await fixture([{ id: 'real', title: 'Essay outline' }]);
  await assert.rejects(f.execute({ type: 'update_task', args: { taskId: 'missing', title: 'Essay outline', newTitle: 'Wrong task' } }), /not found/i);
  assert.equal(f.writes.length, 0);
});
test('ambiguous or partial titles never select a destructive target', async () => {
  const f = await fixture([{ id: 'one', title: 'Essay outline' }, { id: 'two', title: 'Essay research' }]);
  await assert.rejects(f.execute({ type: 'delete_task', args: { title: 'outline' } }), /not found/i);
  assert.equal(f.writes.length, 0);
});
test('parenthetical names must match exactly for destructive actions', async () => {
  const f = await fixture([{ id: 'one', title: 'Essay (research)' }]);
  await assert.rejects(f.execute({ type: 'delete_task', args: { title: 'Essay (draft)' } }), /not found/i);
  assert.equal(f.writes.length, 0);
});
test('locked schedule cannot be changed through chat actions', async () => {
  const f = await fixture([{ id: 'one', title: 'Essay', scheduleLocked: true, date: '2026-10-12', startTime: '09:00', endTime: '09:45' }]);
  await assert.rejects(f.execute({ type: 'update_task', args: { taskId: 'one', startTime: '10:00', endTime: '10:45' } }), /locked/i);
  assert.equal(f.writes.length, 0);
});
test('unknown fields and invalid times fail before any write', async () => {
  for (const args of [{ title: 'Task', documentPath: 'other/account' }, { title: 'Task', startTime: '25:00', endTime: '26:00', date: '2026-10-12' }]) {
    const f = await fixture([]);
    await assert.rejects(f.execute({ type: 'create_task', args }), /invalid|unsupported/i);
    assert.equal(f.writes.length, 0);
  }
});
test('valid exact rename changes only the selected task', async () => {
  const f = await fixture([{ id: 'one', title: 'Essay', completed: false }, { id: 'two', title: 'Research' }]);
  await f.execute({ type: 'update_task', args: { taskId: 'one', newTitle: 'Draft introduction' } });
  assert.equal(f.writes[0].boards[0].sections[0].tasks[0].title, 'Draft introduction');
  assert.equal(f.writes[0].boards[0].sections[0].tasks[1].title, 'Research');
});
test('chat schedule updates preserve saved duration when estimate is missing or stale', async () => {
  for (const estimate of [null, 30]) {
    const f = await fixture([{ id: 'one', title: 'Essay', date: '2026-10-12', startTime: '09:00', endTime: '10:00', estimatedMinutes: estimate }]);
    await assert.rejects(f.execute({ type: 'update_task', args: { taskId: 'one', startTime: '11:00', endTime: '11:15' } }), /duration/i);
    assert.equal(f.writes.length, 0);
    await f.execute({ type: 'update_task', args: { taskId: 'one', startTime: '11:00', endTime: '12:00' } });
    assert.equal(f.writes.length, 1);
  }
});
