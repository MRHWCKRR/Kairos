import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function ask(result) {
  const source = (await fs.readFile(new URL('../ai-workspace.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '');
  const context = vm.createContext({ document: { readyState: 'loading', addEventListener() {} }, console,
    aiFetch: async () => Response.json({ choices: [{ message: { content: typeof result === 'string' ? result : JSON.stringify(result) } }] }) });
  vm.runInContext(source, context);
  return context.ask([]);
}
test('malformed action arrays are rejected instead of silently dropped', async () => {
  await assert.rejects(ask({ reply: 'Done', actions: [{ create_task: { title: 'Essay' } }] }), /relay-format/);
});
test('plain success claims without actions cannot be displayed as completed work', async () => {
  await assert.rejects(ask("I've created the task for you."), /no-action/);
});
test('passive and terse success claims without actions are rejected', async () => {
  for (const reply of ['Your task has been scheduled for tomorrow.', 'Done — scheduled for tomorrow', 'The board was created.']) {
    await assert.rejects(ask({ reply, actions: [] }), /no-action/);
  }
});
test('valid advice and executable flat actions remain supported', async () => {
  assert.equal((await ask({ reply: 'Try outlining first.', actions: [] })).reply, 'Try outlining first.');
  assert.equal((await ask({ reply: 'Proposed rename.', actions: [{ type: 'update_task', taskId: 'one', newTitle: 'Essay' }] })).actions[0].args.taskId, 'one');
});
