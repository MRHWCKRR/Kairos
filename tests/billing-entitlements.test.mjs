import test from 'node:test';
import assert from 'node:assert/strict';
import { planCatalog } from '../server/plans.js';
import { addCalendarMonths, resolveAccess } from '../server/entitlements.js';
const now = Date.parse('2026-10-11T12:00:00Z');
const catalog = planCatalog({AI_TIER_ENFORCEMENT:'true'});
test('free allowance and trial mode are server policy, not profile claims', () => {
  assert.equal(resolveAccess({catalog,billing:null,grants:[],now}).dailyLimit,10);
  assert.equal(resolveAccess({catalog:planCatalog({}),billing:null,grants:[],now}).dailyLimit,100);
  assert.equal(resolveAccess({catalog,billing:{tier:'plus'},grants:[],now}).tier,'free');
});
test('verified paid coverage expires exactly at paid-through', () => {
  assert.equal(resolveAccess({catalog,billing:{status:'active',paidThrough:now+1},grants:[],now}).tier,'plus');
  assert.equal(resolveAccess({catalog,billing:{status:'canceled',paidThrough:now+1},grants:[],now}).tier,'plus');
  assert.equal(resolveAccess({catalog,billing:{status:'active',paidThrough:now},grants:[],now}).tier,'free');
  assert.equal(resolveAccess({catalog,billing:{status:'disputed',paidThrough:now+1},grants:[],now}).tier,'free');
});
test('valid access pass grants Plus independently from unpaid billing', () => {
  const grant = {id:'g1',sourceId:'code1',kind:'plan',planId:'plus',startsAt:now-1,expiresAt:now+1,revokedAt:null};
  assert.equal(resolveAccess({catalog,billing:{status:'unpaid',paidThrough:now},grants:[grant],now}).tier,'plus');
  assert.equal(resolveAccess({catalog,billing:null,grants:[{...grant,revokedAt:now}],now}).tier,'free');
  assert.throws(()=>resolveAccess({catalog,billing:null,grants:[{...grant,expiresAt:'forever'}],now}));
});
test('calendar-month grants clamp month-end and preserve UTC clock', () => {
  assert.equal(new Date(addCalendarMonths(Date.parse('2027-01-31T12:00:00Z'),1)).toISOString(),'2027-02-28T12:00:00.000Z');
  assert.equal(new Date(addCalendarMonths(Date.parse('2028-01-31T12:00:00Z'),1)).toISOString(),'2028-02-29T12:00:00.000Z');
  assert.equal(new Date(addCalendarMonths(Date.parse('2028-02-29T12:00:00Z'),12)).toISOString(),'2029-02-28T12:00:00.000Z');
  for (const months of [0,-1,1.5,121]) assert.throws(()=>addCalendarMonths(now,months));
});
test('malformed policy and coverage fail closed', () => {
  assert.throws(()=>planCatalog({AI_TIER_ENFORCEMENT:'perhaps'}));
  assert.throws(()=>planCatalog({AI_FREE_DAILY_LIMIT:'0'}));
  assert.throws(()=>resolveAccess({catalog,billing:{status:'active',paidThrough:'tomorrow'},grants:[],now}));
});
