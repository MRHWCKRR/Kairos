export function addCalendarMonths(startMs, months) {
  if (!Number.isSafeInteger(startMs) || !Number.isInteger(months) || months < 1 || months > 120) throw Error('Invalid access duration');
  const result = new Date(startMs);
  if (!Number.isFinite(result.getTime())) throw Error('Invalid access date');
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth()+months);
  const last = new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();
  result.setUTCDate(Math.min(day,last));
  return result.getTime();
}
export function validateGrant(grant) {
  if (!grant || typeof grant.id !== 'string' || !grant.id || typeof grant.sourceId !== 'string' || !grant.sourceId ||
      !['plan','feature','credits'].includes(grant.kind) || !Number.isSafeInteger(grant.startsAt) ||
      (grant.expiresAt !== null && (!Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= grant.startsAt)) ||
      (grant.revokedAt !== null && !Number.isSafeInteger(grant.revokedAt))) throw Error('Invalid access grant');
  if (grant.kind === 'plan' && grant.planId !== 'plus') throw Error('Invalid grant plan');
  if (grant.kind === 'feature' && (typeof grant.featureId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(grant.featureId))) throw Error('Invalid grant feature');
  if (grant.kind === 'credits' && (!Number.isSafeInteger(grant.amount) || grant.amount < 1 || grant.amount > 100000)) throw Error('Invalid grant credits');
  return grant;
}
export function resolveAccess({catalog,billing,grants,now}) {
  if (!Number.isSafeInteger(now) || !Array.isArray(grants) || grants.length > 256) throw Error('Invalid account access');
  let tier='free',accessUntil=null;
  if (billing?.status !== undefined) {
    if (!['active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused','refunded','disputed','none'].includes(billing.status) ||
        (billing.paidThrough !== null && !Number.isSafeInteger(billing.paidThrough))) throw Error('Invalid billing coverage');
    if (['active','past_due','canceled'].includes(billing.status) && billing.paidThrough > now) {
      tier='plus';accessUntil=billing.paidThrough;
    }
  }
  const features=new Set();
  for (const grant of grants) {
    validateGrant(grant);
    if (grant.revokedAt !== null || grant.startsAt > now || (grant.expiresAt !== null && grant.expiresAt <= now)) continue;
    if (grant.kind === 'plan') { tier='plus'; accessUntil=Math.max(accessUntil||0,grant.expiresAt||Number.MAX_SAFE_INTEGER); }
    if (grant.kind === 'feature' && catalog.features.includes(grant.featureId)) features.add(grant.featureId);
  }
  return {tier,dailyLimit:catalog.enforced?catalog[tier].dailyLimit:catalog.trialLimit,features:[...features],accessUntil};
}
