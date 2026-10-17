import test from 'node:test';
import assert from 'node:assert/strict';
let m={};try{m=await import('../planning-model.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
export const state=(tasks=[],events=[])=>({boards:[{id:'b',title:'Study',sections:[{id:'s',title:'Tasks',tasks}]}],scheduleEvents:events});
const task=(id,extra={})=>({id,title:id,completed:false,archived:false,...extra});

test('deadline triage distinguishes planned work from due dates and excludes archived/completed/recurring tasks',()=>{
 assert.equal(typeof m.deadlineSummary,'function');
 const rows=m.deadlineSummary(state([task('overdue',{dueDate:'2026-10-15',date:'2026-10-20'}),task('today',{dueDate:'2026-10-17'}),task('scheduled',{date:'2026-10-17'}),task('done',{dueDate:'2026-10-01',completed:true}),task('archived',{dueDate:'2026-10-01',archived:true}),task('series',{dueDate:'2026-10-01',recurrence:{enabled:true}})]),'2026-10-17');
 assert.deepEqual(rows.map(x=>[x.task.id,x.status,x.afterDeadline]),[['overdue','overdue',true],['today','today',false],['scheduled','no-deadline',false]]);
});

test('invalid dates never become deadlines, including non-leap February 29',()=>{
 assert.equal(typeof m.deadlineSummary,'function');const rows=m.deadlineSummary(state([task('bad',{dueDate:'2026-02-29'}),task('leap',{dueDate:'2028-02-29'})]),'2026-10-17');assert.deepEqual(rows.map(x=>x.status),['upcoming','no-deadline']);assert.throws(()=>m.deadlineSummary(state(),'2026-02-30'),/date/i);
});

test('planning clock follows profile timezone across the UTC date boundary',()=>{
 assert.equal(typeof m.planningClock,'function');assert.deepEqual(m.planningClock(Date.parse('2026-10-16T22:00:00Z'),'Australia/Brisbane'),{date:'2026-10-17',time:'08:00'});assert.throws(()=>m.planningClock(Date.now(),'Not/AZone'),/zone|time/i);
});

test('weekly review counts status of scheduled work, not its due date or invented completion history',()=>{
 assert.equal(typeof m.weeklyReview,'function');const review=m.weeklyReview(state([task('done',{date:'2026-10-12',completed:true}),task('slipped',{date:'2026-10-13'}),task('future',{date:'2026-10-18'}),task('due-only',{dueDate:'2026-10-20'}),task('old-done',{date:'2026-10-04',completed:true})]),'2026-10-12','2026-10-17');assert.deepEqual(review.completed.map(x=>x.id),['done']);assert.deepEqual(review.slipped.map(x=>x.id),['slipped']);assert.deepEqual(review.pending.map(x=>x.id),['slipped','future']);assert.deepEqual(review.nextDeadlines.map(x=>x.task.id),['due-only']);
});

test('weekly recurring review uses occurrence status and moved dates rather than series-template completion',()=>{
 assert.equal(typeof m.weeklyReview,'function');const series=task('r',{date:'2026-10-12',startTime:'09:00',endTime:'09:30',recurrence:{enabled:true,frequency:'daily',interval:1,startDate:'2026-10-12',endType:'count',count:2,mode:'fixed',exceptions:{'2026-10-12':{status:'completed'},'2026-10-13':{override:{date:'2026-10-19'}}}}});const r=m.weeklyReview(state([series]),'2026-10-12','2026-10-17');assert.deepEqual(r.completed.map(x=>x.id),['r::2026-10-12']);assert.equal(r.pending.length,0);const next=m.weeklyReview(state([series]),'2026-10-19','2026-10-17');assert.deepEqual(next.pending.map(x=>x.id),['r::2026-10-13']);
});
