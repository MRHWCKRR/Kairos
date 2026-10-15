import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecurrence, validateRecurrence, occurrenceId, generateOccurrenceDates, nextOccurrenceDate, generateTaskOccurrences, generateTaskOccurrencesThrough, formatRecurrenceSummary } from '../recurrence-utils.js';

test('normalizes daily and weekday recurrence presets',()=>{
  const daily=normalizeRecurrence({enabled:true,frequency:'daily',interval:1,startDate:'2026-10-10',mode:'flexible'});
  assert.equal(daily.frequency,'daily');
  assert.equal(daily.interval,1);
  assert.deepEqual(daily.weekdays,[]);
  assert.equal(daily.startDate,'2026-10-10');
  assert.equal(daily.endType,'never');
  assert.equal(daily.mode,'flexible');
  const weekdays=normalizeRecurrence({enabled:true,preset:'weekdays',startDate:'2026-10-12'});
  assert.equal(weekdays.frequency,'weekly');
  assert.equal(weekdays.interval,1);
  assert.deepEqual(weekdays.weekdays,[1,2,3,4,5]);
});

test('normalizes weekly selected days and custom intervals',()=>{
  const wed=normalizeRecurrence({enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-14'});
  assert.deepEqual(wed.weekdays,[3]);
  const multi=normalizeRecurrence({enabled:true,frequency:'weekly',interval:2,weekdays:[5,1,3,3],startDate:'2026-10-12'});
  assert.equal(multi.interval,2);
  assert.deepEqual(multi.weekdays,[1,3,5]);
  const days=normalizeRecurrence({enabled:true,frequency:'daily',interval:3,startDate:'2026-10-10'});
  assert.equal(days.interval,3);
  const months=normalizeRecurrence({enabled:true,frequency:'monthly',interval:2,monthlyMode:'date',monthDay:10,startDate:'2026-10-10'});
  assert.equal(months.interval,2);
  const years=normalizeRecurrence({enabled:true,frequency:'yearly',interval:3,month:10,monthDay:10,startDate:'2026-10-10'});
  assert.equal(years.interval,3);
});

test('normalizes monthly and yearly recurrence modes',()=>{
  const monthlyDate=normalizeRecurrence({enabled:true,frequency:'monthly',monthlyMode:'date',monthDay:31,startDate:'2026-01-31'});
  assert.equal(monthlyDate.monthlyMode,'date');
  assert.equal(monthlyDate.monthDay,31);
  const monthlyPosition=normalizeRecurrence({enabled:true,frequency:'monthly',monthlyMode:'weekdayPosition',weekdayPosition:'first',weekday:1,startDate:'2026-10-05'});
  assert.equal(monthlyPosition.weekdayPosition,'first');
  assert.equal(monthlyPosition.weekday,1);
  const yearly=normalizeRecurrence({enabled:true,frequency:'yearly',month:10,monthDay:10,startDate:'2026-10-10'});
  assert.equal(yearly.month,10);
  assert.equal(yearly.monthDay,10);
});

test('normalizes recurrence end conditions and defaults',()=>{
  const byDate=normalizeRecurrence({enabled:true,frequency:'weekly',weekdays:[6],startDate:'2026-10-10',endType:'date',endDate:'2026-12-31'});
  assert.equal(byDate.endType,'date');
  assert.equal(byDate.endDate,'2026-12-31');
  assert.equal(byDate.count,null);
  const byCount=normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-10-10',endType:'count',count:8});
  assert.equal(byCount.endType,'count');
  assert.equal(byCount.count,8);
  assert.equal(byCount.endDate,null);
  assert.deepEqual(byCount.exceptions,{});
});

test('accepts task objects, validates canonical rules, and creates stable occurrence IDs',()=>{
  const rule=normalizeRecurrence({recurrence:{enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-14',mode:'fixed',exceptions:{'2026-10-21':{status:'skipped'}}}});
  assert.equal(rule.mode,'fixed');
  assert.equal(rule.exceptions['2026-10-21'].status,'skipped');
  assert.equal(validateRecurrence(rule),true);
  assert.equal(validateRecurrence({...rule,interval:0}),false);
  assert.equal(validateRecurrence({...rule,startDate:'not-a-date'}),false);
  assert.equal(occurrenceId('task-abc','2026-10-14'),'task-abc::2026-10-14');
});

test('generates daily intervals and respects count/end-date limits',()=>{
  const every3=normalizeRecurrence({enabled:true,frequency:'daily',interval:3,startDate:'2026-10-10'});
  assert.deepEqual(generateOccurrenceDates(every3,'2026-10-10','2026-10-21'),['2026-10-10','2026-10-13','2026-10-16','2026-10-19']);
  const counted=normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-10-10',endType:'count',count:3});
  assert.deepEqual(generateOccurrenceDates(counted,'2026-10-01','2026-11-01'),['2026-10-10','2026-10-11','2026-10-12']);
  const dated=normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-10-10',endType:'date',endDate:'2026-10-12'});
  assert.deepEqual(generateOccurrenceDates(dated,'2026-10-01','2026-11-01'),['2026-10-10','2026-10-11','2026-10-12']);
});

test('generates selected weekdays anchored to every-N-week cadence',()=>{
  const rule=normalizeRecurrence({enabled:true,frequency:'weekly',interval:2,weekdays:[1,3],startDate:'2026-10-12'});
  assert.deepEqual(generateOccurrenceDates(rule,'2026-10-12','2026-11-08'),['2026-10-12','2026-10-14','2026-10-26','2026-10-28']);
});

test('monthly date recurrence skips months that do not contain the requested date',()=>{
  const rule=normalizeRecurrence({enabled:true,frequency:'monthly',monthlyMode:'date',monthDay:31,startDate:'2026-01-31'});
  assert.deepEqual(generateOccurrenceDates(rule,'2026-01-01','2026-06-30'),['2026-01-31','2026-03-31','2026-05-31']);
});

test('generates monthly first and last weekday positions',()=>{
  const firstMonday=normalizeRecurrence({enabled:true,frequency:'monthly',monthlyMode:'weekdayPosition',weekdayPosition:'first',weekday:1,startDate:'2026-10-05'});
  assert.deepEqual(generateOccurrenceDates(firstMonday,'2026-10-01','2026-12-31'),['2026-10-05','2026-11-02','2026-12-07']);
  const lastFriday=normalizeRecurrence({enabled:true,frequency:'monthly',monthlyMode:'weekdayPosition',weekdayPosition:'last',weekday:5,startDate:'2026-10-30'});
  assert.deepEqual(generateOccurrenceDates(lastFriday,'2026-10-01','2026-12-31'),['2026-10-30','2026-11-27','2026-12-25']);
});

test('yearly Feb 29 recurrence occurs only in leap years',()=>{
  const leap=normalizeRecurrence({enabled:true,frequency:'yearly',month:2,monthDay:29,startDate:'2024-02-29'});
  assert.deepEqual(generateOccurrenceDates(leap,'2024-01-01','2033-12-31'),['2024-02-29','2028-02-29','2032-02-29']);
});

test('finds the next generated occurrence strictly after the supplied date',()=>{
  const rule=normalizeRecurrence({enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-14'});
  assert.equal(nextOccurrenceDate(rule,'2026-10-14'),'2026-10-21');
  assert.equal(nextOccurrenceDate(rule,'2026-10-20'),'2026-10-21');
});

test('fixed occurrences inherit schedule while flexible occurrences remain unscheduled',()=>{
  const fixed={id:'gym',title:'Gym',startTime:'17:30',endTime:'18:30',estimatedMinutes:60,priority:'medium',recurrence:{enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-14',mode:'fixed'}};
  const a=generateTaskOccurrences(fixed,'2026-10-14','2026-10-21',{today:'2026-10-14'});
  assert.deepEqual(a.map(x=>[x.occurrenceId,x.startTime,x.endTime,x.durationMinutes]),[['gym::2026-10-14','17:30','18:30',60],['gym::2026-10-21','17:30','18:30',60]]);
  const flexible={...fixed,id:'study',startTime:null,endTime:null,recurrence:{...fixed.recurrence,mode:'flexible'}};
  const b=generateTaskOccurrences(flexible,'2026-10-14','2026-10-14',{today:'2026-10-14'});
  assert.equal(b[0].startTime,null);assert.equal(b[0].endTime,null);assert.equal(b[0].durationMinutes,60);
});

test('occurrence exceptions preserve logical identity when moved and merge only supplied overrides',()=>{
  const task={id:'study',title:'Study',priority:'low',notes:'base',estimatedMinutes:45,recurrence:{enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-14',mode:'flexible',exceptions:{'2026-10-14':{override:{date:'2026-10-15',startTime:'16:10',endTime:'16:55',priority:'high'}}}}};
  const items=generateTaskOccurrences(task,'2026-10-14','2026-10-15',{today:'2026-10-14'});
  assert.equal(items.length,1);
  const item=items[0];
  assert.equal(item.occurrenceId,'study::2026-10-14');
  assert.equal(item.occurrenceDate,'2026-10-14');
  assert.equal(item.displayDate,'2026-10-15');
  assert.equal(item.task.priority,'high');
  assert.equal(item.task.notes,'base');
  assert.equal(item.isException,true);
});

test('completed skipped and deleted exceptions keep status but are not pending',()=>{
  const task={id:'habit',title:'Habit',estimatedMinutes:20,recurrence:{enabled:true,frequency:'daily',startDate:'2026-10-10',mode:'flexible',exceptions:{'2026-10-10':{status:'completed'},'2026-10-11':{status:'skipped'},'2026-10-12':{status:'deleted'}}}};
  const items=generateTaskOccurrences(task,'2026-10-10','2026-10-13',{today:'2026-10-13'});
  assert.deepEqual(items.map(x=>[x.occurrenceDate,x.status,x.isOverdue]),[['2026-10-10','completed',false],['2026-10-11','skipped',false],['2026-10-12','deleted',false],['2026-10-13','pending',false]]);
});

test('multiple overdue flexible occurrences coexist with the current occurrence',()=>{
  const task={id:'revision',title:'Revision',estimatedMinutes:60,recurrence:{enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-07',mode:'flexible'}};
  const items=generateTaskOccurrences(task,'2026-10-07','2026-10-21',{today:'2026-10-21'});
  assert.deepEqual(items.map(x=>[x.occurrenceDate,x.isOverdue]),[['2026-10-07',true],['2026-10-14',true],['2026-10-21',false]]);
});

test('through-range generation keeps all unfinished overdue occurrences, not an arbitrary lookback window',()=>{
  const task={id:'revision',title:'Revision',estimatedMinutes:60,recurrence:{enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-07-01',mode:'flexible',exceptions:{'2026-07-08':{status:'completed'},'2026-07-15':{status:'skipped'}}}};
  const items=generateTaskOccurrencesThrough(task,'2026-10-21',{today:'2026-10-21'});
  assert.equal(items[0].occurrenceDate,'2026-07-01');
  assert.equal(items[0].isOverdue,true);
  assert.ok(items.some(item=>item.occurrenceDate==='2026-10-21'));
  assert.ok(items.every(item=>item.status==='pending'));
  assert.ok(!items.some(item=>item.occurrenceDate==='2026-07-08'||item.occurrenceDate==='2026-07-15'));
});

test('through-range generation includes a future logical occurrence moved into the requested display range',()=>{
  const task={id:'revision',title:'Revision',estimatedMinutes:60,recurrence:{enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-07',mode:'flexible',exceptions:{'2026-10-28':{override:{date:'2026-10-20',startTime:'16:00',endTime:'17:00'}}}}};
  const items=generateTaskOccurrencesThrough(task,'2026-10-21',{today:'2026-10-21'});
  const moved=items.find(item=>item.occurrenceId==='revision::2026-10-28');
  assert.ok(moved);
  assert.equal(moved.occurrenceDate,'2026-10-28');
  assert.equal(moved.displayDate,'2026-10-20');
});

test('formats stable recurrence summaries',()=>{
  assert.equal(formatRecurrenceSummary({enabled:true,frequency:'weekly',weekdays:[3],startDate:'2026-10-14',mode:'flexible'}),'Every Wednesday · Flexible');
  assert.equal(formatRecurrenceSummary({enabled:true,frequency:'weekly',interval:2,weekdays:[1,3],startDate:'2026-10-12',mode:'fixed'}),'Every 2 weeks on Mon/Wed · Fixed time');
  assert.equal(formatRecurrenceSummary({enabled:true,frequency:'monthly',monthlyMode:'weekdayPosition',weekdayPosition:'first',weekday:1,startDate:'2026-10-05',mode:'flexible'}),'First Monday monthly · Flexible');
  assert.equal(formatRecurrenceSummary({enabled:true,frequency:'yearly',month:10,monthDay:10,startDate:'2026-10-10',mode:'fixed',endType:'count',count:5}),'Yearly on Oct 10 · Fixed time · 5 occurrences');
});
