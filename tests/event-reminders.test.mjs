import test from 'node:test';import assert from 'node:assert/strict';
import {dueBedtimeReminders} from '../task-reminders.js';
const m=await import('../event-reminders.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e});
const event=()=>({id:'e',title:'Class',category:'class',date:'2026-10-30',start:'09:00',end:'10:00',reminderMinutes:15});
const due=(events,now,zone='UTC')=>{assert.equal(typeof m.dueEventReminders,'function');return m.dueEventReminders(events,Date.parse(now),zone)};
test('custom event windows catch delayed checks until start for each preset',()=>{
 for(const lead of [5,15,30,60]){const e={...event(),reminderMinutes:lead},start=Date.parse('2026-10-30T09:00Z'),at=t=>due([e],new Date(t).toISOString());assert.equal(at(start-lead*60000-1).length,0);assert.equal(at(start-lead*60000)[0].minutesBefore,lead);assert.equal(at(start-1).length,1);assert.equal(at(start).length,0);}
});
test('custom candidates exclude invalid, default, off, archived, all-day and imported events but include free timed events',()=>{
 for(const patch of [{reminderMinutes:null},{reminderMinutes:'default'},{reminderMinutes:undefined},{reminderMinutes:10},{reminderMinutes:'15'},{reminderMinutes:0},{reminderMinutes:Infinity},{archived:true},{allDay:true},{readOnly:true},{calendarSourceId:'import'},{date:'2026-02-30'},{start:'25:00'},{id:null}])assert.equal(due([{...event(),...patch}],'2026-10-30T08:50Z').length,0,JSON.stringify(patch));
 assert.equal(due([{...event(),transparent:true}],'2026-10-30T08:50Z').length,1);assert.equal(due([event()],'2026-10-30T08:50Z','Bad/Zone').length,0);
});
test('event reminder timezone and midnight use upcoming local occurrence',()=>{
 const e={...event(),date:'2026-10-31',start:'00:05',end:'01:00'};const c=due([e],'2026-10-30T13:55Z','Australia/Brisbane')[0];assert.equal(c.date,'2026-10-31');assert.equal(c.startsAt,Date.parse('2026-10-30T14:05Z'));assert.equal(due([e],'2026-10-30T13:55Z').length,0);
});
test('fortnightly moves and skips follow effective date with stable original identities',()=>{
 const e={...event(),day:5,date:undefined,intervalWeeks:2,anchorDate:'2026-10-30'};delete e.date;
 assert.equal(due([e],'2026-11-06T08:50Z').length,0);assert.equal(due([e],'2026-11-13T08:50Z')[0].occurrenceDate,'2026-11-13');
 e.exceptions={'2026-10-30':{skipped:true},'2026-11-13':{override:{date:'2026-10-31',start:'00:05',end:'01:00',reminderMinutes:30}}};assert.equal(due([e],'2026-10-30T08:50Z').length,0);
 const c=due([e],'2026-10-30T23:40Z')[0];assert.equal(c.occurrenceDate,'2026-11-13');assert.equal(c.minutesBefore,30);assert.match(c.id,/2026-11-13/);
});
test('custom sleep replaces automatic bedtime; explicit Off suppresses both; default preserves bedtime behavior',()=>{
 for(const reminderMinutes of [undefined,'default',null,15,30]){const e={...event(),category:'sleep',reminderMinutes};if(reminderMinutes===undefined)delete e.reminderMinutes;const custom=due([e],'2026-10-30T08:50Z'),bedtime=dueBedtimeReminders([e],Date.parse('2026-10-30T08:50Z'),'UTC');assert.equal(custom.length,[15,30].includes(reminderMinutes)?1:0);assert.equal(bedtime.length,reminderMinutes===undefined||reminderMinutes==='default'?1:0);}
});
test('nonexistent DST starts are suppressed and ambiguous starts use the earlier instant',()=>{
 assert.equal(due([{...event(),date:'2026-03-08',start:'02:30'}],'2026-03-08T07:20Z','America/New_York').length,0);
 const e={...event(),date:'2026-11-01',start:'01:30'};assert.equal(due([e],'2026-11-01T05:20Z','America/New_York')[0].startsAt,Date.parse('2026-11-01T05:30Z'));assert.equal(due([e],'2026-11-01T06:20Z','America/New_York').length,0);
});
