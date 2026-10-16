import test from 'node:test';
import assert from 'node:assert/strict';
import * as reminders from '../task-reminders.js';

const events=()=>[{id:'sleep',title:'Sleep',category:'sleep',day:5,start:'23:00',end:'07:00'}];
const due=(items,now,zone='Australia/Brisbane')=>{assert.equal(typeof reminders.dueBedtimeReminders,'function');return reminders.dueBedtimeReminders(items,Date.parse(now),zone)};

test('bedtime reminders catch delayed checks until bedtime, then stop',()=>{
 assert.equal(due(events(),'2026-10-16T12:44:59Z').length,0);
 assert.equal(due(events(),'2026-10-16T12:45:00Z').length,1);
 assert.equal(due(events(),'2026-10-16T12:46:00Z').length,1);
 assert.equal(due(events(),'2026-10-16T12:59:59Z').length,1);
 assert.equal(due(events(),'2026-10-16T13:00:00Z').length,0);
});

test('bedtime lead time crosses midnight and follows the profile timezone',()=>{
 const items=events();Object.assign(items[0],{day:6,start:'00:05'});
 const candidate=due(items,'2026-10-16T13:55:00Z')[0];assert.ok(candidate);assert.equal(candidate.date,'2026-10-17');assert.equal(candidate.startTime,'00:05');
 assert.equal(due(items,'2026-10-16T13:55:00Z','UTC').length,0);
});

test('bedtime receipts identify the actual occurrence so rescheduling creates a new window',()=>{
 const items=events(),first=due(items,'2026-10-16T12:46:00Z')[0];items[0].start='23:10';
 assert.equal(due(items,'2026-10-16T12:46:00Z').length,0);const moved=due(items,'2026-10-16T12:56:00Z')[0];assert.ok(moved);assert.notEqual(moved.id,first.id);
});

test('removed, archived, non-sleep and invalid bedtime events cannot fire',()=>{
 assert.equal(due([],'2026-10-16T12:46:00Z').length,0);
 for(const patch of [{archived:true},{category:'class'},{start:'25:00'},{id:null},{day:3}]){const items=events();Object.assign(items[0],patch);assert.equal(due(items,'2026-10-16T12:46:00Z').length,0)}
 assert.equal(due(events(),'2026-10-16T12:46:00Z','Invalid/Zone').length,0);
});

test('bedtime DST gaps do not fire and ambiguous starts use the earlier instant',()=>{
 const items=events();Object.assign(items[0],{day:0,start:'02:30'});
 assert.equal(due(items,'2026-10-03T15:15:00Z','Australia/Sydney').length,0);
 assert.equal(due(items,'2026-04-04T15:15:00Z','Australia/Sydney').length,1);
 assert.equal(due(items,'2026-04-04T16:15:00Z','Australia/Sydney').length,0);
});
