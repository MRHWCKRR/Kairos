import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveTierBudget,readBudgetUsage} from '../server/ai-budget.js';
const start=Date.parse('2026-10-19T01:00:00Z'),day=86400000,secret='weekly-fixture',policy={scope:'preview',siteLimit:1000,accountLimit:100};
const access={dailyLimit:15,weeklyLimit:50};
function reserve(fields,time=start,extra={}){return reserveTierBudget({fields,time,secret,policy,access,uid:'a',...extra});}
test('weekly cap survives daily resets and releases at Monday UTC',()=>{
 let fields;for(let i=0;i<50;i++){const r=reserve(fields,start+Math.floor(i/15)*day);assert.equal(r.allowed,true);fields=r.fields;}
 const denied=reserve(fields,start+4*day);assert.equal(denied.allowed,false);assert.equal(denied.reason,'weekly-account');assert.equal(denied.resetsAt,'2026-10-26T00:00:00.000Z');
 assert.equal(readBudgetUsage(fields,'a',policy,secret,start+4*day).weeklyUsed,50);
 const next=reserve(fields,Date.parse('2026-10-26T00:00:00Z'));assert.equal(next.allowed,true);assert.equal(readBudgetUsage(next.fields,'a',policy,secret,Date.parse('2026-10-26T00:00:00Z')).weeklyUsed,1);
});
test('daily cap stops sooner and changing plan preserves the weekly count',()=>{
 let fields;for(let i=0;i<15;i++)fields=reserve(fields).fields;
 assert.equal(reserve(fields).reason,'account');
 const plus=reserve(fields,start,{access:{dailyLimit:50,weeklyLimit:350}});assert.equal(plus.allowed,true);assert.equal(readBudgetUsage(plus.fields,'a',policy,secret,start).weeklyUsed,16);
});
test('weekly counters isolate accounts and reject corrupt stored counts',()=>{
 const first=reserve(undefined);assert.equal(readBudgetUsage(first.fields,'b',policy,secret,start).weeklyUsed,0);
 const bad=structuredClone(first.fields);bad.weeklyAccounts.mapValue.fields[Object.keys(bad.weeklyAccounts.mapValue.fields)[0]].integerValue='-1';
 assert.throws(()=>reserve(bad));
});
test('migration counts existing daily usage and denied requests do not spend site budget',()=>{
 let fields;for(let i=0;i<10;i++)fields=reserve(fields).fields;
 delete fields.weeklyStart;delete fields.weeklyAccounts;
 const migrated=reserve(fields);assert.equal(readBudgetUsage(migrated.fields,'a',policy,secret,start).weeklyUsed,11);
 const denied=reserve(migrated.fields,start,{access:{dailyLimit:15,weeklyLimit:11}});assert.equal(denied.allowed,false);assert.equal(readBudgetUsage(migrated.fields,'a',policy,secret,start).total,11);
});

test('Plus permits 50 each day and 350 weekly, then resets at the week boundary',()=>{
 let fields;for(let i=0;i<350;i++){const time=start+Math.floor(i/50)*day,r=reserve(fields,time,{access:{dailyLimit:50,weeklyLimit:350}});assert.equal(r.allowed,true);fields=r.fields;if(i%50===49)assert.equal(reserve(fields,time,{access:{dailyLimit:50,weeklyLimit:350}}).allowed,false);}
 const denied=reserve(fields,start+6*day,{access:{dailyLimit:50,weeklyLimit:350}});assert.equal(denied.reason,'weekly-account');assert.equal(reserve(fields,start+7*day,{access:{dailyLimit:50,weeklyLimit:350}}).allowed,true);
});

test('migration preserves every account daily usage even when another account migrates first',()=>{
 let fields;for(let i=0;i<3;i++)fields=reserve(fields).fields;for(let i=0;i<2;i++)fields=reserve(fields,start,{uid:'b'}).fields;delete fields.weeklyStart;delete fields.weeklyAccounts;const migrated=reserve(fields).fields;assert.equal(readBudgetUsage(migrated,'b',policy,secret,start).weeklyUsed,2);const tomorrow=reserve(migrated,start+day,{uid:'b'});assert.equal(readBudgetUsage(tomorrow.fields,'b',policy,secret,start+day).weeklyUsed,3);
});
