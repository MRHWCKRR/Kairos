import { createHmac } from 'node:crypto';
import { validateGrant } from './entitlements.js';

const DAY_MS = 86400000;
const BRISBANE_OFFSET_MS = 10 * 3600000;

function limit(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) throw Error('Invalid AI budget policy');
  const number = Number(value);
  // Bound the single daily snapshot's size. Larger scale requires a different
  // counter layout rather than silently exceeding Firestore's document limit.
  if (!Number.isInteger(number) || number < 1 || number > 5000) throw Error('Invalid AI budget policy');
  return number;
}

export function budgetPolicy(env) {
  const scope = env.AI_BUDGET_SCOPE || 'production';
  if (!['production', 'preview'].includes(scope) || !env.ANALYTICS_HASH_SECRET) throw Error('Invalid AI budget configuration');
  return { scope, accountLimit: limit(env.AI_DAILY_ACCOUNT_LIMIT, 100), siteLimit: limit(env.AI_DAILY_SITE_LIMIT, 1000) };
}

export function budgetWindow(time) {
  if (!Number.isFinite(time)) throw Error('Invalid AI budget clock');
  const midnight = Math.floor((time + BRISBANE_OFFSET_MS) / DAY_MS) * DAY_MS;
  return { day: new Date(midnight).toISOString().slice(0, 10),
    resetsAt: new Date(midnight + DAY_MS - BRISBANE_OFFSET_MS).toISOString(),
    retryAfter: Math.max(1, Math.ceil((midnight + DAY_MS - BRISBANE_OFFSET_MS - time) / 1000)) };
}

export function budgetWeek(time) {
  if (!Number.isFinite(time)) throw Error('Invalid AI budget clock');
  const date=new Date(time), start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-((date.getUTCDay()+6)%7)*DAY_MS;
  return {week:new Date(start).toISOString().slice(0,10),weeklyResetsAt:new Date(start+7*DAY_MS).toISOString(),weeklyRetryAfter:Math.max(1,Math.ceil((start+7*DAY_MS-time)/1000))};
}
function weeklyState(fields,uid,policy,secret,time) {
  const window=budgetWeek(time), stored=fields?.weeklyStart?.stringValue;
  let accounts={},migration;
  if(fields?.weeklyStart!==undefined || fields?.weeklyAccounts!==undefined) {
    const records=fields.weeklyAccounts?.mapValue?.fields;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(stored||'') || new Date(stored+'T00:00:00Z').getUTCDay()!==1 || stored>window.week || !records || typeof records!=='object' || Array.isArray(records) || Object.keys(records).length>5000)throw Error('Invalid weekly AI counter');
    for(const [key,value]of Object.entries(records))if(!/^[a-f0-9]{64}$/.test(key)||!/^\d+$/.test(value.integerValue||'')||!Number.isSafeInteger(Number(value.integerValue))||Number(value.integerValue)<1)throw Error('Invalid weekly AI counter');
    if(stored===window.week)accounts={...records};
  }
  if(stored===window.week && fields?.weeklyMigration) {
    const legacy=fields.weeklyMigration.mapValue?.fields;
    counterState(legacy,{day:budgetWindow(time).day});
    if(!legacy || legacy.day.stringValue<window.week)throw Error('Invalid weekly migration');
    migration=legacy;
  } else if(stored===undefined && fields?.day?.stringValue>=window.week) {
    migration={day:fields.day,total:fields.total,accounts:fields.accounts};
  }
  const key=createHmac('sha256',secret).update(policy.scope+'\0week\0'+window.week+'\0'+uid).digest('hex');
  // Existing snapshots contain only the current day; seed it once on migration.
  const legacyKey=migration?createHmac('sha256',secret).update(policy.scope+'\0'+migration.day.stringValue+'\0'+uid).digest('hex'):null;
  const used=Number(accounts[key]?.integerValue || migration?.accounts.mapValue.fields[legacyKey]?.integerValue || 0);
  return {...window,accounts,key,used,migration};
}
function counterState(fields, window) {
  let total = 0, accounts = {};
  if (fields) {
    const day = fields.day?.stringValue;
    const count = fields.total?.integerValue;
    const records = fields.accounts?.mapValue?.fields;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^\d+$/.test(count || '') || !records || typeof records !== 'object' || Array.isArray(records)) throw Error('Invalid AI counter');
    let sum = 0;
    for (const [key, value] of Object.entries(records)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !/^\d+$/.test(value.integerValue || '') || !Number.isSafeInteger(Number(value.integerValue)) || Number(value.integerValue) < 1) throw Error('Invalid AI counter');
      sum += Number(value.integerValue);
    }
    if (!Number.isSafeInteger(Number(count)) || sum !== Number(count) || Object.keys(records).length > 5000 || day > window.day) throw Error('Invalid AI counter');
    if (day === window.day) { total = Number(count); accounts = { ...records }; }
  }
  return {total,accounts};
}
export function readBudgetUsage(fields,uid,policy,secret,time) {
  if(typeof uid!=='string' || !uid || uid.length>128)throw Error('Invalid AI budget identity');
  const window=budgetWindow(time),{total,accounts}=counterState(fields,window);
  const key=createHmac('sha256',secret).update(`${policy.scope}\0${window.day}\0${uid}`).digest('hex');
  const used=Number(accounts[key]?.integerValue||0),weekly=weeklyState(fields,uid,policy,secret,time);
  return {used,total,...window,weeklyUsed:weekly.used,weeklyResetsAt:weekly.weeklyResetsAt};
}
export function reserveBudget(fields, uid, policy, secret, time) {
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw Error('Invalid AI budget identity');
  const window = budgetWindow(time);
  const {total,accounts}=counterState(fields,window);
  const key = createHmac('sha256', secret).update(`${policy.scope}\0${window.day}\0${uid}`).digest('hex');
  const used = Number(accounts[key]?.integerValue || 0);
  const weekly=weeklyState(fields,uid,policy,secret,time,used);
  if (total >= policy.siteLimit) return { allowed: false, reason: 'site', ...window };
  if(policy.weeklyLimit!==undefined && weekly.used>=policy.weeklyLimit)return {allowed:false,reason:'weekly-account',day:window.day,resetsAt:weekly.weeklyResetsAt,retryAfter:weekly.weeklyRetryAfter};
  if (used >= policy.accountLimit) return { allowed: false, reason: 'account', ...window };
  if(!weekly.accounts[weekly.key] && Object.keys(weekly.accounts).length>=5000)throw Error('Weekly AI counter capacity');
  weekly.accounts[weekly.key]={integerValue:String(weekly.used+1)};
  accounts[key] = { integerValue: String(used + 1) };
  return { allowed: true, ...window, fields: { ...(weekly.migration?{weeklyMigration:{mapValue:{fields:weekly.migration}}}:{}),weeklyStart:{stringValue:weekly.week},weeklyAccounts:{mapValue:{fields:weekly.accounts}},day: { stringValue: window.day }, total: { integerValue: String(total + 1) }, accounts: { mapValue: { fields: accounts } } } };
}

export function creditBalance(account,time) {
  if(account===null || account===undefined)return 0;
  if(account.schema!==1 || !Array.isArray(account.grants) || account.grants.length>256)throw Error('Invalid credit account');
  const ids=new Set();let balance=0;
  for(const entry of account.grants) {
    validateGrant(entry.grant);
    if(entry.grant.kind!=='credits' || ids.has(entry.grant.id) || !Number.isSafeInteger(entry.spent) || entry.spent<0 || entry.spent>entry.grant.amount)throw Error('Invalid credit ledger');
    ids.add(entry.grant.id);
    if(entry.grant.revokedAt===null && entry.grant.startsAt<=time && (entry.grant.expiresAt===null || entry.grant.expiresAt>time))balance+=entry.grant.amount-entry.spent;
  }
  return balance;
}
export function reserveTierBudget({fields,uid,policy,secret,time,access,creditAccount}) {
  if(!Number.isInteger(access?.dailyLimit) || access.dailyLimit<1 || access.dailyLimit>5000)throw Error('Invalid trusted allowance');
  if(access.weeklyLimit!==undefined && (!Number.isInteger(access.weeklyLimit)||access.weeklyLimit<1||access.weeklyLimit>5000))throw Error('Invalid trusted weekly allowance');
  const balance=creditBalance(creditAccount,time);
  const result=reserveBudget(fields,uid,{...policy,accountLimit:access.dailyLimit,weeklyLimit:access.weeklyLimit},secret,time);
  if(result.allowed || result.reason==='site' || !balance)return result;
  const next=structuredClone(creditAccount);
  const spendable=next.grants.filter(entry=>entry.grant.revokedAt===null && entry.grant.startsAt<=time &&
    (entry.grant.expiresAt===null || entry.grant.expiresAt>time) && entry.spent<entry.grant.amount)
    .sort((a,b)=>(a.grant.expiresAt??Number.MAX_SAFE_INTEGER)-(b.grant.expiresAt??Number.MAX_SAFE_INTEGER));
  spendable[0].spent++;
  const reserved=reserveBudget(fields,uid,{...policy,accountLimit:5000},secret,time);
  if(!reserved.allowed)return reserved;
  return {...reserved,creditAccount:next};
}
