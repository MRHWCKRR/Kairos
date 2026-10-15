import { createHmac, randomBytes } from 'node:crypto';
export function codeDigest(code,secret,scope) {
  if (typeof secret !== 'string' || secret.length < 16 || !['preview','production'].includes(scope) || typeof code !== 'string' || code.length>64) throw Error('Invalid code configuration');
  const normalized=code.replace(/[- ]/g,'').toUpperCase();
  if (!/^[A-Z0-9]{32}$/.test(normalized)) throw Error('Code unavailable');
  return createHmac('sha256',secret).update(scope+'\0'+normalized).digest('hex');
}
export function generateAccessCode() {
  return randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
}
export function validateCodeDefinition(definition,catalog,scope) {
  const d=definition;
  if (!d || !['preview','production'].includes(d.scope) || !['plan','feature'].includes(d.kind) ||
      !Number.isInteger(d.months) || d.months<1 || d.months>120 ||
      !Number.isSafeInteger(d.redeemBefore) || d.redeemBefore<0 ||
      !Number.isSafeInteger(d.maxUses) || d.maxUses<1 || d.maxUses>10000 || d.perAccountLimit!==1 ||
      (d.intendedUid!==null && (typeof d.intendedUid!=='string' || !d.intendedUid || d.intendedUid.length>128)) ||
      (d.revokedAt!==null && !Number.isSafeInteger(d.revokedAt))) throw Error('Invalid code definition');
  if (d.kind==='plan' && d.planId!=='plus') throw Error('Invalid code plan');
  if (d.kind==='feature' && !catalog.features.includes(d.featureId)) throw Error('Unknown code feature');
  // Scope mismatch is permitted in the private definition store only to reject it on redemption.
  return d;
}
export async function redeemAccessCode({uid,code,store,env,now}) {
  const digest=codeDigest(code,env.REDEMPTION_HASH_SECRET,env.AI_BUDGET_SCOPE||'production');
  return store.redeemCode({uid,digest,now});
}
