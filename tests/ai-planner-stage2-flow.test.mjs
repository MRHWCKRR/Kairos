import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture} from './helpers/ai-workspace-fixture.mjs';
import {explicitDurationIntent} from '../ai-action-schema.js';

test('explicit duration intent recognises end times but excludes ordinary moves and deadlines',()=>{
  for(const text of ['end at 5pm','finish at 17:00','make it last 90 minutes','shorten it'])
    assert.equal(explicitDurationIntent(text),true,text);
  for(const text of ['move it to 5pm','start at 5pm','extend the deadline to Friday','move it to tomorrow',"Move it tomorrow, don't change its duration",'Keep the same duration and end at 5pm','Change the start time from 1pm to 2pm','Set a reminder for 30 minutes before Science','Don’t extend the duration','Do not reduce it to 30 minutes',"Don't make it 90 minutes","Don't end at 5pm"])
    assert.equal(explicitDurationIntent(text),false,text);
});

test('rename follow-up instructions respect board and section target kinds',async()=>{
  const f=await fixture();
  const chat=f.chat();chat.lastActionTarget={kind:'board',id:'b',title:'Study'};
  const prompt=(await f.context.apiMessages(chat))[0].content;
  assert.doesNotMatch(prompt,/return an update_task action with newTitle/);
  assert.match(prompt,/matching the.*target kind/i);
});

test('a saved archive is reconciled on retry without another preview',async()=>{
  const f=await fixture({failAfterCommit:true,autoApprove:false});
  const show=f.context.dialogBox;let dialogs=0;
  f.context.dialogBox=html=>{dialogs++;const modal=show(html);queueMicrotask(()=>modal.querySelector('[data-ok]').click());return modal;};
  f.context.ask=async()=>({reply:'I will archive it.',actions:[{type:'delete_board',args:{title:'Study'}}]});
  f.input.value='Delete Study';await f.context.send();assert.equal(f.data().boards[0].archived,true);
  vm.runInContext('chats=chats.map(norm);',f.context);
  f.input.value='retry';await f.context.send();
  assert.equal(dialogs,1);assert.equal(f.chat().pendingActionBatch,null);assert.match(f.chat().messages.at(-1).content,/Archive/);
});

test('chat end-time follow-up executes an explicitly requested resize',async()=>{
  const f=await fixture();
  const task=await f.execute({type:'create_task',args:{title:'Science',date:'2026-10-14',startTime:'13:00',endTime:'15:00'}});
  f.context.ask=async()=>({reply:'I will change the end time.',actions:[{type:'resize_task',args:{taskId:task.task.id,endTime:'17:00'}}]});
  f.input.value='end at 5pm';await f.context.send();
  assert.equal(f.data().boards[0].sections[0].tasks[0].endTime,'17:00');
  assert.match(f.chat().messages.at(-1).content,/17:00/);
});
test('a model cannot change duration when the user only asks to move the task',async()=>{
  const f=await fixture();
  const task=await f.execute({type:'create_task',args:{title:'Science',date:'2026-10-14',startTime:'13:00',endTime:'15:00'}});
  f.context.ask=async()=>({reply:'I will move it.',actions:[{type:'resize_task',args:{taskId:task.task.id,endTime:'17:00'}}]});
  f.input.value='Move Science to tomorrow';await f.context.send();
  assert.equal(f.data().boards[0].sections[0].tasks[0].endTime,'15:00');
  assert.match(f.chat().messages.at(-1).content,/explicit.*duration/i);
});
test('section actions report their confirmed result and persist the section follow-up target',async()=>{
  const f=await fixture();
  f.context.ask=async()=>({reply:'I will create it.',actions:[{type:'create_section',args:{boardId:'b',title:'Research'}}]});
  f.input.value='Create a Research section';await f.context.send();
  assert.match(f.chat().messages.at(-1).content,/Created.*Research.*section/i);
  assert.equal(f.chat().lastActionTarget.kind,'section');
});
test('board preview escapes child text and cancellation performs no deletion',async()=>{
  const f=await fixture({autoApprove:false});await f.execute({type:'create_task',args:{title:'<script>bad</script>'}});
  const display=f.context.dialogBox;let show,markup;const shown=new Promise(resolve=>show=resolve);
  f.context.dialogBox=html=>{markup=html;const modal=display(html);show();return modal;};
  const promise=f.context.requestActionConfirmation('chat-one',{type:'delete_board',args:{boardId:'b'}},{ownerId:'one',planId:'plan',operationId:'preview-cancel',createdAt:Date.now()});
  await shown;assert.match(markup,/1 task/);assert.match(markup,/&lt;script&gt;bad&lt;\/script&gt;/);assert.doesNotMatch(markup,/<script>/);
  f.context.closeDialog();assert.equal(await promise,false);assert.equal(f.data().boards.length,1);
});
