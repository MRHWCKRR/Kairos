import {savedWeeklyAvailability} from '../weekly-availability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {ACTION_INSTRUCTIONS} from '../ai-action-schema.js';
import {aiPlanningSummary,resolveAiPlanningTimezone} from '../ai-planning.js';

async function fixture() {
  const events = {};
  const plan = {boards:[{id:'board-1',title:'Study',sections:[{id:'section-1',title:'Science',tasks:[
    {id:'task-1',title:'Revision',date:'2026-10-14',startTime:'13:00',endTime:'15:00',scheduleLocked:true,recurrence:{enabled:true}},
    {id:'task-2',title:'Revision',completed:true}
  ]}]}],scheduleEvents:[{id:'event-1',title:'School',day:3,start:'08:00',end:'15:00'}]};
  const context=vm.createContext({savedWeeklyAvailability,aiPlanningSummary,resolveAiPlanningTimezone,ACTION_INSTRUCTIONS,console,auth:{currentUser:{uid:'one'}},db:{},
    localStorage:{getItem:()=>null},doc:()=>({}),collection:()=>({}),query:x=>x,where:()=>({}),
    getDoc:async()=>({exists:()=>true,data:()=>({settings:{profile:{timezone:'Australia/Brisbane'}}})}),
    getDocs:async()=>({docs:[{id:'plan-1',data:()=>structuredClone(plan)}]}),
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
test('AI context exposes checklist counts without carrying every step title',async()=>{
  const {context,plan}=await fixture();const task=plan.boards[0].sections[0].tasks[1];task.checklist=[{id:'a',title:'Private step text',completed:true},{id:'b',title:'Another step',completed:false}];
  const data=await context.loadContextData(context.auth.currentUser);
  assert.equal(data.tasks[1].checklistProgress.total,2);assert.equal(data.tasks[1].checklistProgress.completed,1);
  const prompt=await context.getKairosContext();assert.match(prompt,/checklistProgress/);assert.doesNotMatch(prompt,/Private step text/);
});
test('chat receives current planning facts and linked session metadata without additional reads',async()=>{
 const {context,plan}=await fixture();const task=plan.boards[0].sections[0].tasks[1];
 Object.assign(task,{completed:false,dueDate:'2026-10-01',assignmentId:'parent',sessionIndex:2,estimatedMinutes:30,schedulingPreference:'afternoon'});
 const data=await context.loadContextData(context.auth.currentUser);assert.equal(data.planning.deadlines[0].status,'overdue');assert.equal(data.tasks.find(item=>item.id===task.id).assignmentId,'parent');
 const text=await context.getKairosContext();assert.match(text,/Current planning summary/);assert.match(text,/not historical completion dates/);
});
test('historical occurrence step titles are omitted from AI recurrence metadata',async()=>{
  const {context,plan}=await fixture();plan.boards[0].sections[0].tasks[0].recurrence.exceptions={'2026-10-15':{override:{checklist:[{id:'a',title:'Historical private step',completed:true}],date:'2026-10-16'}}};
  const prompt=await context.getKairosContext();assert.doesNotMatch(prompt,/Historical private step/);assert.match(prompt,/2026-10-16/);
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

test('the request date follows the profile timezone across a UTC year boundary',async()=>{
  const {context}=await fixture();
  const instant=Date.parse('2026-12-31T15:00:00Z');
  context.Date=class extends Date {constructor(value){super(value===undefined?instant:value)}static now(){return instant}};
  assert.match(await context.getKairosContext(),/Current local date \(YYYY-MM-DD\): 2027-01-01/);
});

test('archived board and section IDs are available for precise restoration in a fresh chat',async()=>{
  const {context,plan}=await fixture();
  plan.boards.push({id:'archive-b',title:'Study',archived:true,sections:[{id:'archive-s',title:'Science',archived:true,tasks:[]}]});
  const data=await context.loadContextData(context.auth.currentUser);
  const archived=data.boards.find(board=>board.id==='archive-b');
  assert.equal(archived?.archived,true);
  assert.equal(archived.sections[0].id,'archive-s');
  assert.equal(archived.sections[0].archived,true);
});


test('every chat request sees a schedule moved outside this chat within the cache lifetime',async()=>{
  const {context,plan}=await fixture();
  context.document={readyState:'loading',documentElement:{lang:'en'},addEventListener(){}};
  context.aiConversationMessages=x=>x;
  const source=await readFile(new URL('../ai-workspace.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),context);
  const chat={id:'chat-one',summary:'Revision starts at 13:00',messages:[{role:'assistant',content:'Your schedule has not changed.'}]};
  assert.match((await context.apiMessages(chat))[0].content,/"startTime":"13:00"/);
  Object.assign(plan.boards[0].sections[0].tasks[0],{startTime:'16:00',endTime:'18:00'});
  plan.scheduleEvents[0].start='09:00';
  const messages=await context.apiMessages(chat);
  assert.match(messages[0].content,/"startTime":"16:00"/);
  assert.match(messages[0].content,/"endTime":"18:00"/);
  assert.match(messages[0].content,/"start":"09:00"/);
  assert.match(messages[0].content,/Current planner values override.*conversation history/s);
  assert.match(messages[0].content,/not a change history/);
  assert.equal(chat.summary,'Revision starts at 13:00');
});

test('a pre-save context read cannot repopulate a stale planner cache after invalidation',async()=>{
  const {context,plan}=await fixture();
  let release;
  const stale=structuredClone(plan);
  context.getDocs=()=>new Promise(resolve=>{release=()=>resolve({docs:[{data:()=>stale}]})});
  const pending=context.getKairosContext();
  Object.assign(plan.boards[0].sections[0].tasks[0],{startTime:'17:00',endTime:'19:00'});
  context.invalidateKairosContext();
  release();await pending;
  context.getDocs=async()=>({docs:[{data:()=>structuredClone(plan)}]});
  assert.match(await context.getKairosContext(),/"startTime":"17:00"/);
});

test('a failed fresh planner read never falls back to the previous schedule',async()=>{
  const {context}=await fixture();
  assert.match(await context.getKairosContext(),/"startTime":"13:00"/);
  const warnings=[];context.console={warn:(...args)=>warnings.push(args)};
  context.getDocs=async()=>{throw new Error('Planner unavailable')};
  const prompt=await context.getKairosContext();
  assert.match(prompt,/Current planner data is unavailable/);
  assert.match(prompt,/Do not use older schedule values/);
  assert.doesNotMatch(prompt,/13:00/);
  assert.equal(warnings.length,1);
});

test('an account switch during a planner read discards the previous account snapshot',async()=>{
  const {context,plan}=await fixture();
  let release;
  context.getDocs=()=>new Promise(resolve=>{release=()=>resolve({docs:[{data:()=>structuredClone(plan)}]})});
  const pending=context.getKairosContext();
  context.auth.currentUser={uid:'two'};
  release();
  assert.equal(await pending,'');
});


test('recurring occurrence and weekly event moves include confirmed before/after values',async()=>{
  const {context,plan}=await fixture();
  const before=structuredClone(plan);
  plan.boards[0].sections[0].tasks[0].recurrence.exceptions={'2026-10-16':{override:{startTime:'16:00',endTime:'18:00',checklist:[{id:'private',title:'Private step',completed:true}]}}};
  plan.scheduleEvents[0].start='09:00';
  context.invalidateKairosContext({ownerId:'one',planId:'plan-1',before,after:plan});
  const prompt=await context.getKairosContext();
  const history=prompt.slice(prompt.indexOf('Recent confirmed schedule changes'));
  assert.match(history,/"kind":"occurrence".*"occurrenceDate":"2026-10-16".*"before":\{"date":"2026-10-16","startTime":"13:00".*"after":\{"date":"2026-10-16","startTime":"16:00"/);
  assert.match(history,/"kind":"event".*"before":\{"day":3,"start":"08:00".*"after":\{"day":3,"start":"09:00"/);
  assert.doesNotMatch(prompt,/Private step/);
  context.invalidateKairosContext();
  assert.match(await context.getKairosContext(),/Recent confirmed schedule changes/);
  plan.planId='another-plan';
  context.getDocs=async()=>({docs:[{id:'another-plan',data:()=>structuredClone(plan)}]});
  assert.doesNotMatch(await context.getKairosContext(),/Recent confirmed schedule changes/);
});

test('checklist-only edits never appear as schedule moves',async()=>{
  const {context,plan}=await fixture();const before=structuredClone(plan);
  plan.boards[0].sections[0].tasks[0].recurrence.exceptions={'2026-10-16':{override:{checklist:[{id:'one',title:'Private step',completed:true}]}}};
  context.invalidateKairosContext({ownerId:'one',planId:'plan-1',before,after:plan});
  assert.doesNotMatch(await context.getKairosContext(),/Recent confirmed schedule changes/);
});

test('monthly and yearly date-rule edits remain visible in confirmed history',async()=>{
  for (const [field,oldValue,newValue] of [['monthDay',15,20],['weekdayPosition','first','last'],['month',3,9]]) {
    const {context,plan}=await fixture();
    const task=plan.boards[0].sections[0].tasks[0];
    task.recurrence={enabled:true,frequency:field==='month'?'yearly':'monthly',[field]:oldValue};
    const before=structuredClone(plan);task.recurrence[field]=newValue;
    context.invalidateKairosContext({ownerId:'one',planId:'plan-1',before,after:plan});
    const prompt=await context.getKairosContext();
    assert.match(prompt,/Recent confirmed schedule changes/,field);
    const history=prompt.slice(prompt.indexOf('Recent confirmed schedule changes'));
    assert.ok(history.includes(JSON.stringify(field)+':'+JSON.stringify(oldValue)),field+' before');
    assert.ok(history.includes(JSON.stringify(field)+':'+JSON.stringify(newValue)),field+' after');
  }
});
