import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveTierBudget,readBudgetUsage } from '../server/ai-budget.js';
const now=Date.parse('2026-10-11T12:00:00Z'),policy={scope:'preview',accountLimit:100,siteLimit:1000},secret='fixture-identity';
const access={tier:'free',dailyLimit:10,features:[],accessUntil:null};
const creditAccount={schema:1,grants:[{grant:{id:'g1',sourceId:'fixture1',kind:'credits',amount:1,startsAt:now-1,expiresAt:now+86400000,revokedAt:null},spent:0}]};
function reserve(fields,other={}) {return reserveTierBudget({fields,uid:'a',policy,secret,time:now,access,creditAccount:null,...other});}
test('free ten requests admit; eleventh requires a valid extra credit',()=>{
  let fields;
  for(let i=0;i<10;i++){const result=reserve(fields);assert.equal(result.allowed,true);fields=result.fields;}
  assert.equal(reserve(fields).reason,'account');
  const bonus=reserve(fields,{creditAccount});
  assert.equal(bonus.allowed,true);assert.equal(bonus.creditAccount.grants[0].spent,1);
  assert.equal(reserve(bonus.fields,{creditAccount:bonus.creditAccount}).allowed,false);
});
test('site exhaustion never spends credit and expired credit never extends allowance',()=>{
  let fields;
  for(let i=0;i<10;i++)fields=reserve(fields).fields;
  assert.equal(reserve(fields,{policy:{...policy,siteLimit:10},creditAccount}).reason,'site');
  assert.equal(creditAccount.grants[0].spent,0);
  assert.equal(reserve(fields,{creditAccount:{schema:1,grants:[{...creditAccount.grants[0],grant:{...creditAccount.grants[0].grant,expiresAt:now}}]}}).allowed,false);
});
test('upgrade and launch policy preserve admitted count; Brisbane midnight resets usage only',()=>{
  let fields;
  for(let i=0;i<12;i++)fields=reserve(fields,{access:{...access,dailyLimit:100}}).fields;
  const before=readBudgetUsage(fields,'a',policy,secret,now);
  assert.equal(before.used,12);
  const upgraded=reserve(fields,{access:{...access,tier:'plus',dailyLimit:100}});
  assert.equal(readBudgetUsage(upgraded.fields,'a',policy,secret,now).used,13);
  assert.equal(reserve(fields).allowed,false);
  assert.equal(readBudgetUsage(fields,'a',policy,secret,Date.parse('2026-10-11T14:00:00Z')).used,0);
  assert.equal(readBudgetUsage(fields,'a',policy,secret,now).resetsAt,'2026-10-11T14:00:00.000Z');
});
test('malformed credits and untrusted allowance fail closed',()=>{
  assert.throws(()=>reserve(undefined,{creditAccount:{schema:1,grants:[{...creditAccount.grants[0],spent:-1}]}}));
  assert.throws(()=>reserve(undefined,{access:{...access,dailyLimit:'100'}}));
});
