import { createHmac } from 'node:crypto';

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

export function reserveBudget(fields, uid, policy, secret, time) {
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw Error('Invalid AI budget identity');
  const window = budgetWindow(time);
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
  const key = createHmac('sha256', secret).update(`${policy.scope}\0${window.day}\0${uid}`).digest('hex');
  const used = Number(accounts[key]?.integerValue || 0);
  if (total >= policy.siteLimit) return { allowed: false, reason: 'site', ...window };
  if (used >= policy.accountLimit) return { allowed: false, reason: 'account', ...window };
  accounts[key] = { integerValue: String(used + 1) };
  return { allowed: true, ...window, fields: { day: { stringValue: window.day }, total: { integerValue: String(total + 1) }, accounts: { mapValue: { fields: accounts } } } };
}
