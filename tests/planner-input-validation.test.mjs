import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand,taskDetailValues} from '../task-list-model.js';
import {validateActionShape} from '../ai-action-schema.js';
const state=()=>({boards:[{id:'b',title:'Board',sections:[{id:'s',title:'Section',tasks:[{id:'t',title:'Read',date:'2026-10-31',startTime:null,endTime:null,completed:false}]}]}]});
const edit=(data,changes)=>applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t'},changes},{boardId:'b',sectionId:'s',fields:taskDetailValues(data.boards[0].sections[0].tasks[0])});

test('task edits reject coercible date and color values without changing the original',()=>{
 for(const changes of [{date:['2026-10-31']},{dueDate:['2026-11-01']},{color:['#123456']}]){const data=state(),before=structuredClone(data);assert.throws(()=>edit(data,changes),/date|color/i);assert.deepEqual(data,before);}
});
test('task repeat edits reject malformed supplied numbers instead of normalizing them',()=>{
 for(const fields of [{interval:'2'},{interval:0},{interval:1.5},{endType:'count',count:0},{endType:'count',count:'2'},{weekdays:[9],frequency:'weekly'},{mode:'unknown'},{monthDay:32,frequency:'monthly'},{startDate:['2026-10-31']}]){
  const data=state();assert.throws(()=>edit(data,{recurrence:{enabled:true,frequency:'daily',startDate:'2026-10-31',mode:'flexible',...fields}}),/repeat|recurrence/i);
 }
});
test('task create rejects an explicitly undefined optional field before producing a task',()=>{
 const data=state();assert.throws(()=>applyTaskListCommand(data,{type:'create_task',target:{boardId:'b',sectionId:'s'},task:{id:'new',title:'New',estimatedMinutes:undefined}},{boardId:'b',sectionId:'s'}),/estimate|undefined|planner/i);assert.equal(data.boards[0].sections[0].tasks.length,1);
});
test('task estimates accept the same 1440-minute boundary on create and edit',()=>{
 assert.equal(edit(state(),{estimatedMinutes:1440}).next.boards[0].sections[0].tasks[0].estimatedMinutes,1440);
 assert.throws(()=>edit(state(),{durationMinutes:1440}),/duration/i);
});
test('unrelated edits remain compatible with existing legacy recurrence values',()=>{
 const data=state();data.boards[0].sections[0].tasks[0].recurrence={enabled:true,frequency:'daily',interval:'2',startDate:'2026-10-31',mode:'flexible'};
 assert.equal(edit(data,{title:'Renamed'}).next.boards[0].sections[0].tasks[0].title,'Renamed');
});
test('AI shape rejects impossible task dates and malformed times before preview',()=>{
 for(const args of [{taskId:'t',date:'2026-02-30'},{taskId:'t',startTime:'9:00'},{taskId:'t',endTime:'24:00'}])assert.throws(()=>validateActionShape({type:'update_task',args}),/date|time/i);
});
test('AI shape rejects missing required task values and inherited action names',()=>{
 for(const action of [{type:'create_task',args:{}},{type:'set_task_reminder',args:{taskId:'t'}},{type:'update_task',args:{taskId:'t',newTitle:null}},{type:'update_task',args:{taskId:'t',newTitle:'x'.repeat(181)}},{type:'toString',args:{}}])assert.throws(()=>validateActionShape(action),/title|reminder|required|unsupported/i);
});
test('AI shape retains explicit null and empty schedule clearing',()=>{
 for(const value of [null,''])assert.doesNotThrow(()=>validateActionShape({type:'update_task',args:{taskId:'t',date:value,startTime:value,endTime:value}}));
});
test('explicit null repeat intervals cannot be repaired silently',()=>{
 assert.throws(()=>edit(state(),{recurrence:{enabled:true,frequency:'daily',interval:null,startDate:'2026-10-31',mode:'flexible'}}),/repeat|recurrence/i);
});
test('incomplete AI creation schedules and missing resize duration fail shape validation',()=>{
 for(const args of [{title:'New',startTime:'09:00'},{title:'New',date:'2026-10-31',startTime:'09:00'},{title:'New',date:'2026-10-31',startTime:'10:00',endTime:'09:00'}])assert.throws(()=>validateActionShape({type:'create_task',args}),/schedule|time|duration/i);
 assert.throws(()=>validateActionShape({type:'resize_task',args:{taskId:'t'}}),/duration/i);
});
