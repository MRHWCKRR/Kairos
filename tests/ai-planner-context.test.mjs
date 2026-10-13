import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function fixture() {
  const events = {};
  const plan = {boards:[{id:'board-1',title:'Study',sections:[{id:'section-1',title:'Science',tasks:[
    {id:'task-1',title:'Revision',date:'2026-10-14',startTime:'13:00',endTime:'15:00',scheduleLocked:true,recurrence:{enabled:true}},
    {id:'task-2',title:'Revision',completed:true}
  ]}]}],scheduleEvents:[{id:'event-1',title:'School',day:3,start:'08:00',end:'15:00'}]};
  const context=vm.createContext({console,auth:{currentUser:{uid:'one'}},db:{},
    localStorage:{getItem:()=>null},doc:()=>({}),collection:()=>({}),query:x=>x,where:()=>({}),
    getDoc:async()=>({exists:()=>true,data:()=>({settings:{profile:{timezone:'Australia/Brisbane'}}})}),
    getDocs:async()=>({docs:[{data:()=>structuredClone(plan)}]}),
    window:{addEventListener:(name,fn)=>events[name]=fn}});
  const source=await readFile(new URL('../ai-context.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,''),context);
  return {context,plan,events};
}

test('AI context includes stable targets, schedule times, locks and recurrence',async()=>{
  const {context}=await fixture();
  const data=await context.loadContextData(context.auth.currentUser);
  assert.equal(data.tasks[0].id,'task-1');
  assert.equal(data.tasks[0].boardId,'board-1');
  assert.equal(data.tasks[0].sectionId,'section-1');
  assert.equal(data.tasks[0].startTime,'13:00');
  assert.equal(data.tasks[0].endTime,'15:00');
  assert.equal(data.tasks[0].scheduleLocked,true);
  assert.equal(data.tasks[0].recurrence.enabled,true);
  assert.equal(data.scheduleEvents[0].id,'event-1');
  assert.match(await context.getKairosContext(),/task-1/);
  assert.match(await context.getKairosContext(),/13:00/);
});

test('planner change invalidates cached tasks before the next AI request',async()=>{
  const {context,plan,events}=await fixture();
  await context.getKairosContext();
  plan.boards[0].sections[0].tasks[0].title='Updated revision';
  events['kairos-data-changed']?.();
  assert.match(await context.getKairosContext(),/Updated revision/);
});

test('follow-up target travels with its own chat and survives normalisation',async()=>{
  const {context}=await fixture();
  context.document={readyState:'loading',documentElement:{lang:'en'},addEventListener(){}};
  context.aiConversationMessages=x=>x;
  const source=await readFile(new URL('../ai-workspace.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),context);
  const chat={id:'chat-one',messages:[],lastActionTarget:{kind:'task',id:'task-1',title:'Revision'}};
  assert.equal(context.norm(chat).lastActionTarget.id,'task-1');
  assert.match((await context.apiMessages(chat))[0].content,/Most recent confirmed action target.*task-1/s);
  const other={id:'chat-two',messages:[]};
  assert.doesNotMatch((await context.apiMessages(other))[0].content,/Most recent confirmed action target/);
});

test('completed historical tasks cannot crowd current work out of the context quota',async()=>{
  const {context,plan}=await fixture();
  const tasks=plan.boards[0].sections[0].tasks;
  tasks.unshift(...Array.from({length:130},(_,i)=>({id:'old-'+i,title:'Historical',date:'2020-01-01',completed:true})));
  const data=await context.loadContextData(context.auth.currentUser);
  assert.equal(data.tasks.some(task=>task.id==='task-1'),true);
});
