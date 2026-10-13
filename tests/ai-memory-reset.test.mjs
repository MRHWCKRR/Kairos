import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../ai-workspace.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '');

test('deleting the last chat discards its memory and rejects an in-flight summary', async () => {
  let confirm, finishSummary;
  const context = vm.createContext({ document: { readyState: 'loading', addEventListener() {} }, console, setTimeout: () => 0,
    aiConversationMessages: messages => messages
  });
  vm.runInContext(source, context);
  vm.runInContext(`chats=[norm({id:'old',summary:'Old name',autoSummary:'Old name',messageTotal:24,
    summarizedCount:0,pendingActionRequest:'Delete a task',messages:Array.from({length:24},()=>({role:'user',content:'Old name'}))})];
    activeId='old'; render=()=>{}; save=async()=>{}; laterSave=()=>{}; closeDialog=()=>{};`, context);
  context.dialogBox = () => ({ querySelector: () => ({ set onclick(fn) { confirm = fn; } }) });
  context.ask = () => new Promise(resolve => { finishSummary = resolve; });
  const pending = vm.runInContext('updateAutoMemory(current())', context);
  context.deleteDialog(); confirm();
  finishSummary({ reply: 'Old name', actions: [] }); await pending;
  const chat = vm.runInContext('current()', context);
  assert.equal(chat.messages.length, 0);
  assert.equal(chat.summary, '');
  assert.equal(chat.autoSummary, '');
  assert.equal(chat.messageTotal, 0);
  assert.equal(chat.summarizedCount, 0);
  assert.equal(chat.pendingActionRequest, '');
  assert.equal(context.memory(chat), '');
});
