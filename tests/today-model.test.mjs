import test from 'node:test';
import assert from 'node:assert/strict';
import {buildToday, todayTaskCommand} from '../today-model.js';
const state=()=>({boards:[{id:'b',title:'School',sections:[{id:'s',title:'Work',tasks:[
{id:'late',title:'Overdue',dueDate:'2026-10-24',date:null},
{id:'day',title:'Today',date:'2026-10-25',startTime:'10:00',endTime:'10:30'},
{id:'free',title:'Unscheduled'},{id:'done',completed:true,date:'2026-10-25'},
{id:'hidden',archived:true},{id:'future',date:'2026-10-28'},
{id:'series',title:'Daily',date:'2026-10-25',startTime:'09:00',endTime:'09:15',recurrence:{enabled:true,frequency:'daily',interval:1,mode:'fixed',startDate:'2026-10-25'}}
]}]}],scheduleEvents:[{id:'e',title:'Ride',day:0,start:'16:30',end:'17:30'}]});
test('Today groups incomplete work, recurring occurrences and weekly events without duplicate due-today rows',()=>{
 const data=state();data.boards[0].sections[0].tasks[1].dueDate='2026-10-25';
 const view=buildToday(data,'2026-10-25');
 assert.deepEqual(view.overdue.map(r=>r.taskId),['late']);
 assert.deepEqual(view.unscheduled.map(r=>r.taskId),['free']);
 assert.deepEqual(view.today.map(r=>r.id),['series::2026-10-25','day','e']);
 assert.equal(view.today[0].occurrenceDate,'2026-10-25');assert.equal(view.today[0].canComplete,false);
 assert.equal(data.boards[0].sections[0].tasks[0].date,null);
});
test('Today actions use field expectations and refuse recurrence completion or ambiguous IDs',()=>{
 const data=state(),row=buildToday(data,'2026-10-25').unscheduled[0];
 const {command,expected}=todayTaskCommand(data,row,'plan','2026-10-25');
 assert.equal(command.type,'edit_task');assert.deepEqual(command.changes,{date:'2026-10-25'});assert.equal(expected.fields.date,null);
 assert.throws(()=>todayTaskCommand(data,buildToday(data,'2026-10-25').today[0],'complete','2026-10-25'),/occurrence/i);
 data.boards[0].sections[0].tasks.push({...data.boards[0].sections[0].tasks[2]});
 assert.ok(!buildToday(data,'2026-10-25').unscheduled.some(r=>r.taskId==='free'));
});
test('Today rejects invalid calendar dates',()=>assert.throws(()=>buildToday(state(),'2026-02-30'),/date/i));


test('Today includes future and old logical occurrences moved into today and retains older overdue work',()=>{
 const data=state(),task=data.boards[0].sections[0].tasks.find(t=>t.id==='series');
 task.date='2026-08-01';task.recurrence.startDate='2026-08-01';task.recurrence.exceptions={'2026-10-26':{override:{date:'2026-10-25',startTime:'08:00',endTime:'08:15'}},'2026-08-01':{override:{date:'2026-10-25'}}};
 const view=buildToday(data,'2026-10-25');
 assert.ok(view.today.some(row=>row.occurrenceDate==='2026-10-26'));assert.ok(view.today.some(row=>row.occurrenceDate==='2026-08-01'));assert.ok(view.overdue.some(row=>row.occurrenceDate==='2026-08-02'));
});

