export function flag(value, fallback=false) {
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw Error('Invalid billing flag');
}
function allowance(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw Error('Invalid plan allowance');
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 5000) throw Error('Invalid plan allowance');
  return number;
}
export function planCatalog(env) {
  return {
    enforced: flag(env.AI_TIER_ENFORCEMENT),
    trialLimit: allowance(env.AI_DAILY_ACCOUNT_LIMIT,100),
    free: {id:'free',name:'Free',dailyLimit:allowance(env.AI_FREE_DAILY_LIMIT,10),weeklyLimit:allowance(env.AI_FREE_WEEKLY_LIMIT,50)},
    plus: {id:'plus',name:'Plus',dailyLimit:allowance(env.AI_PLUS_DAILY_LIMIT,100),weeklyLimit:allowance(env.AI_PLUS_WEEKLY_LIMIT,350)},
    features: []
  };
}
