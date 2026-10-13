import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fixture} from './helpers/ai-workspace-fixture.mjs';

test('saved reminder feedback distinguishes blocked browser notifications from delivery',async()=>{
  const f=await fixture();
  const created=await f.execute({type:'create_task',args:{title:'Science',date:'2026-10-15',startTime:'13:00',endTime:'14:00'}});
  f.context.window.__kairosTaskReminders={status:()=>({enabled:true,browserEnabled:true,permission:'denied'})};
  f.context.ask=async()=>({reply:'I will set it.',actions:[{type:'set_task_reminder',args:{taskId:created.task.id,minutesBefore:30}}]});
  f.input.value='Remind me 30 minutes before Science';await f.context.send();
  const reply=f.chat().messages.at(-1).content;
  assert.match(reply,/Saved.*30.*reminder/i);assert.match(reply,/blocked/i);assert.match(reply,/remain open/i);
  assert.equal(f.chat().lastActionTarget.kind,'reminder');
});
test('notification titles, messages and IDs render as escaped text',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const source=app.slice(app.indexOf('    function renderNotifPanel()'),app.indexOf('    function setupNotificationBell()'));
  const store=(await readFile(new URL('../reminder-notifications.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
  const list={innerHTML:''};
  const context=vm.createContext({document:{getElementById:()=>list},notificationsData:[{id:'"><script>x</script>',title:'<script>x</script>',message:'<img src=x onerror=x>'}],notifTimeAgo:()=>''});
  vm.runInContext(store+'\n'+source,context);context.renderNotifPanel();
  assert.doesNotMatch(list.innerHTML,/<script>|<img/);
  assert.match(list.innerHTML,/&lt;script&gt;/);
});

test('implicit removal of a reminder cannot be executed as task deletion',async()=>{
  const f=await fixture();
  const created=await f.execute({type:'create_task',args:{title:'Science'}});
  f.chat().lastActionTarget={kind:'reminder',id:created.task.id,title:'Science'};
  await assert.rejects(f.context.runAction('chat-one',{type:'delete_task',args:{taskId:created.task.id}},{ownerId:'one',reminderFollowup:true}),/must not delete/i);
  assert.equal(f.data().boards[0].sections[0].tasks.length,1);
});

test('implicit reminder removal never prompts a task deletion confirmation',async()=>{
  for(const request of ['remove it','delete that reminder','remove it please']){
  const f=await fixture(),created=await f.execute({type:'create_task',args:{title:'Science'}});
  f.chat().lastActionTarget={kind:'reminder',id:created.task.id,title:'Science'};
  let confirmations=0;
  f.context.requestActionConfirmation=async()=>{confirmations++;return false};
  f.context.ask=async()=>({reply:'I will delete it.',actions:[{type:'delete_task',args:{taskId:created.task.id}}]});
  f.input.value=request;await f.context.send();
  assert.equal(confirmations,0);
  assert.equal(f.data().boards[0].sections[0].tasks.length,1);
  }
});
