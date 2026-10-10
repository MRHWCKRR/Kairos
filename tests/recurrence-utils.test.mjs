import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecurrence, validateRecurrence, occurrenceId, generateOccurrenceDates, nextOccurrenceDate } from '../recurrence-utils.js';

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
