import test from 'node:test';import assert from 'node:assert/strict';
let parseCalendar;try{({parseCalendar}=await import('../calendar-parser.js'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const options={sourceId:'school',timezone:'Australia/Brisbane',from:'2026-10-01',to:'2026-11-30'};
const calendar=(...events)=>['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kairos Tests//EN','X-WR-CALNAME:School',...events,'END:VCALENDAR'].join('\r\n');
const event=(uid,lines)=>['BEGIN:VEVENT','UID:'+uid,...lines,'END:VEVENT'].join('\r\n');
test('UTC, floating and IANA times become bounded profile-local segments with stable identifiers',async()=>{
 assert.equal(typeof parseCalendar,'function');const text=calendar(event('utc',['DTSTART:20261002T230000Z','DTEND:20261003T010000Z','SUMMARY:Science\\, revision']),event('floating',['DTSTART:20261003T093000','DTEND:20261003T103000','SUMMARY:Read']),event('new-york',['DTSTART;TZID=America/New_York:20261003T090000','DTEND;TZID=America/New_York:20261003T100000','SUMMARY:Call']));
 const result=await parseCalendar(text,options);assert.equal(result.name,'School');assert.equal(result.events.length,3);assert.deepEqual(result.events.map(e=>[e.date,e.start,e.end]).sort(),[['2026-10-03','09:00','11:00'],['2026-10-03','09:30','10:30'],['2026-10-03','23:00','00:00']]);assert.match(result.events[0].externalId,/^[a-f0-9]{64}$/);assert.deepEqual(result.events,(await parseCalendar(text,options)).events);
 const moved=await parseCalendar(calendar(event('floating',['DTSTART:20261004T093000','DTEND:20261004T103000','SUMMARY:Read'])),options);assert.equal(moved.events[0].externalId,result.events.find(e=>e.title==='Read').externalId);
});
test('recurrence expands EXDATE, moved overrides and cancellations without duplicating series',async()=>{
 assert.equal(typeof parseCalendar,'function');const text=calendar(event('daily',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:FREQ=DAILY;COUNT=5','EXDATE:20261002T090000','SUMMARY:Class']),event('daily',['RECURRENCE-ID:20261003T090000','DTSTART:20261003T140000','DTEND:20261003T150000','SUMMARY:Moved']),event('daily',['RECURRENCE-ID:20261004T090000','STATUS:CANCELLED']));
 const rows=(await parseCalendar(text,options)).events;assert.deepEqual(rows.map(e=>[e.date,e.start]),[['2026-10-01','09:00'],['2026-10-03','14:00'],['2026-10-05','09:00']]);
});
test('all-day exclusive end dates, overnight boundaries and transparency retain their semantics',async()=>{
 assert.equal(typeof parseCalendar,'function');const rows=(await parseCalendar(calendar(event('holiday',['DTSTART;VALUE=DATE:20261001','DTEND;VALUE=DATE:20261003','SUMMARY:Holiday','TRANSP:TRANSPARENT']),event('overnight',['DTSTART:20261003T230000','DTEND:20261004T020000','SUMMARY:Trip'])),options)).events;
 assert.deepEqual(rows.map(e=>[e.date,e.start,e.end,e.allDay,e.transparent]),[['2026-10-01','00:00','00:00',true,true],['2026-10-02','00:00','00:00',true,true],['2026-10-03','23:00','00:00',false,false],['2026-10-04','00:00','02:00',false,false]]);
});
test('IANA DST changes preserve local recurrence and reject nonexistent wall times explicitly',async()=>{
 assert.equal(typeof parseCalendar,'function');const rows=(await parseCalendar(calendar(event('dst',['DTSTART;TZID=America/New_York:20261031T090000','DTEND;TZID=America/New_York:20261031T100000','RRULE:FREQ=DAILY;COUNT=3','SUMMARY:Class'])),options)).events;assert.deepEqual(rows.map(e=>[e.date,e.start]),[['2026-10-31','23:00'],['2026-11-02','00:00'],['2026-11-03','00:00']]);
 await assert.rejects(parseCalendar(calendar(event('gap',['DTSTART;TZID=America/New_York:20260308T023000','DTEND;TZID=America/New_York:20260308T033000'])),{...options,from:'2026-03-01',to:'2026-03-31'}),/timezone|daylight|exist/i);
});
test('VTIMEZONE definitions work independently and unknown timezone identifiers fail closed',async()=>{
 assert.equal(typeof parseCalendar,'function');const zone=['BEGIN:VTIMEZONE','TZID:Custom/School','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0930','TZOFFSETTO:+0930','END:STANDARD','END:VTIMEZONE'].join('\r\n');const rows=(await parseCalendar(calendar(zone,event('custom',['DTSTART;TZID=Custom/School:20261002T090000','DTEND;TZID=Custom/School:20261002T100000'])),options)).events;assert.equal(rows[0].start,'09:30');await assert.rejects(parseCalendar(calendar(event('unknown',['DTSTART;TZID=Unknown/Zone:20261002T090000','DTEND;TZID=Unknown/Zone:20261002T100000'])),options),/timezone/i);
});
test('malformed, oversized, excessive recurrence and unsupported constructs never yield partial imports',async()=>{
 assert.equal(typeof parseCalendar,'function');await assert.rejects(parseCalendar('broken',options));await assert.rejects(parseCalendar('x'.repeat(1024*1024+1),options),/large|size|MiB/i);await assert.rejects(parseCalendar(calendar(event('freq',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:FREQ=SECONDLY;COUNT=10000000'])),options),/supported|recurrence|frequency/i);await assert.rejects(parseCalendar(calendar(event('range',['DTSTART:20261001T090000','DTEND:20261001T100000'])),{...options,to:'2028-01-01'}),/range|366/i);
 const crowded=Array.from({length:1001},(_,i)=>event('e'+i,['DTSTART:20261001T090000','DTEND:20261001T100000']));await assert.rejects(parseCalendar(calendar(...crowded),options),/1000|many|limit/i);
});
test('an override moved into the window is included even when its logical occurrence is outside it',async()=>{
 assert.equal(typeof parseCalendar,'function');const rows=(await parseCalendar(calendar(event('moved-in',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:FREQ=DAILY;COUNT=5','SUMMARY:Original']),event('moved-in',['RECURRENCE-ID:20261001T090000','DTSTART:20261020T140000','DTEND:20261020T150000','SUMMARY:Moved in'])),{...options,from:'2026-10-19',to:'2026-10-21'})).events;assert.equal(rows.length,1);assert.equal(rows[0].start,'14:00');
});

test('provider timestamps with seconds do not restrict calendar scheduling precision',async()=>{
 const rows=(await parseCalendar(calendar(event('metadata',['DTSTAMP:20260930T123456Z','CREATED:20260930T123456Z','LAST-MODIFIED:20260930T123459Z','DTSTART:20261002T090000','DTEND:20261002T100000'])),options)).events;assert.equal(rows.length,1);assert.equal(rows[0].start,'09:00');
});
test('UTC recurrence identifiers correctly cancel or override local-zone instances',async()=>{
 const rows=(await parseCalendar(calendar(event('cross-zone',['DTSTART;TZID=America/New_York:20261001T090000','DTEND;TZID=America/New_York:20261001T100000','RRULE:FREQ=DAILY;COUNT=3','SUMMARY:Original']),event('cross-zone',['RECURRENCE-ID:20261002T130000Z','DTSTART;TZID=America/New_York:20261002T120000','DTEND;TZID=America/New_York:20261002T130000','SUMMARY:Moved']),event('cross-zone',['RECURRENCE-ID:20261003T130000Z','STATUS:CANCELLED'])),options)).events;assert.deepEqual(rows.map(e=>[e.date,e.start,e.title]),[['2026-10-01','23:00','Original'],['2026-10-03','02:00','Moved']]);
});
test('invalid dates and impossible rule constraints fail without a runaway internal search',async()=>{
 await assert.rejects(parseCalendar(calendar(event('bad-date',['DTSTART:20260230T090000','DTEND:20260230T100000'])),options),/date|invalid/i);
 await assert.rejects(parseCalendar(calendar(event('impossible',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'])),options),/impossible|recurrence/i);
 const start=Date.now();await assert.rejects(parseCalendar(calendar(event('never-matches',['DTSTART:20261005T090000','DTEND:20261005T100000','RRULE:FREQ=DAILY;INTERVAL=7;BYDAY=TU'])),options),/limit|recurrence/i);assert.ok(Date.now()-start<3000);
});

import {spawnSync} from 'node:child_process';
function boundedParserSubprocess(text){
 const url=new URL('../calendar-parser.js',import.meta.url).href,script=`import {parseCalendar} from ${JSON.stringify(url)};try{await parseCalendar(${JSON.stringify(text)},{sourceId:'bounded',timezone:'UTC',from:'2026-02-01',to:'2026-10-31'});console.error('Unexpected success');process.exitCode=2}catch(error){console.log(error.message)}`;
 return spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:1500});
}
test('constructor recurrence searches terminate before importing impossible ordinal months',()=>{
 const result=boundedParserSubprocess(calendar(event('constructor-loop',['DTSTART:20260202T090000','DTEND:20260202T100000','RRULE:FREQ=MONTHLY;INTERVAL=4800;BYDAY=5MO'])));
 assert.equal(result.error,undefined,'The parser subprocess must not time out');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/limit|recurrence|supported/i);
});
test('malicious VTIMEZONE observances cannot start unbounded sub-minute recurrence expansion',()=>{
 const zone=['BEGIN:VTIMEZONE','TZID:Custom/Bad','BEGIN:STANDARD','DTSTART:20200101T000000','TZOFFSETFROM:+0000','TZOFFSETTO:+0100','RRULE:FREQ=SECONDLY','END:STANDARD','END:VTIMEZONE'].join('\r\n');
 const result=boundedParserSubprocess(calendar(zone,event('timezone-loop',['DTSTART;TZID=Custom/Bad:20261002T090000','DTEND;TZID=Custom/Bad:20261002T100000'])));
 assert.equal(result.error,undefined,'The parser subprocess must not time out');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/limit|recurrence|supported/i);
});

test('raw recurrence syntax rejects normalized invalid dates, numbers and duplicate fields',async()=>{
 for(const rule of ['FREQ=DAILY;UNTIL=20261099T090000Z','FREQ=DAILY;UNTIL=20260230','FREQ=DAILY;COUNT=1.5','FREQ=DAILY;INTERVAL=1.5','FREQ=DAILY;COUNT=2;COUNT=3','FREQ=DAILY;COUNT=2;UNTIL=20261003T090000Z','FREQ=DAILY;UNKNOWN=1'])await assert.rejects(parseCalendar(calendar(event('raw',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:'+rule])),options),/invalid|recurrence|supported/i);
});

test('recurrence guards restore library methods before asynchronous hashing and after errors',async()=>{
 const {default:ICAL}=await import('../calendar-ical.js?v=1');const before=Object.getOwnPropertyDescriptors(ICAL.RecurIterator.prototype);
 const first=parseCalendar(calendar(event('one',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:FREQ=DAILY;COUNT=2'])),options);assert.deepEqual(Object.getOwnPropertyDescriptors(ICAL.RecurIterator.prototype),before);
 await Promise.all([first,parseCalendar(calendar(event('two',['DTSTART:20261002T090000','DTEND:20261002T100000'])),options)]);
 await assert.rejects(parseCalendar(calendar(event('bad',['DTSTART:20261001T090000','DTEND:20261001T100000','RRULE:FREQ=DAILY;COUNT=1.5'])),options));assert.deepEqual(Object.getOwnPropertyDescriptors(ICAL.RecurIterator.prototype),before);
});
