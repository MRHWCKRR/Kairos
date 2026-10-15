import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './billing-store-fixture.mjs';
import { codeDigest, redeemAccessCode } from '../server/access-codes.js';
test('capacity is checked against the aggregate actually committed',async()=>{
  const f=fixture();await issued(f);const ap=f.store.accountPath('a');
  const grants=Array.from({length:255},(_,i)=>({id:'g'+i,sourceId:'fixture:'+i,kind:'plan',planId:'plus',startsAt:1,expiresAt:2,revokedAt:null}));
  f.docs.set(ap,{version:'initial',data:{schema:1,billing:null,deleting:false,grants}});
  const get=f.transport.get;let reads=0;
  f.transport.get=async p=>{const doc=await get(p);if(p===ap && ++reads===1)f.docs.set(ap,{version:'concurrent',data:{...doc.data,grants:[...grants,{...grants[0],id:'last'}]}});return doc;};
  await assert.rejects(()=>redeemAccessCode({uid:'a',code,store:f.store,env:f.env,now:f.now()}));
  assert.equal((await f.store.readAccount('a')).grants.length,256);
});
const code='ABCD-EFGH-1234-5678-ABCD-EFGH-1234-5678';
const definition=now=>({scope:'preview',kind:'plan',planId:'plus',months:1,redeemBefore:now+86400000,maxUses:1,perAccountLimit:1,intendedUid:null,revokedAt:null});
async function issued(f,definitionOverride={}) {
  const digest=codeDigest(code,f.env.REDEMPTION_HASH_SECRET,'preview');
  await f.store.issueCode({digest,definition:{...definition(f.now()),...definitionOverride},ownerUid:'owner'});
  return digest;
}
test('two accounts cannot claim the final code redemption and retry is idempotent',async()=>{
  const f=fixture();await issued(f);
  const results=await Promise.allSettled(['a','b'].map(uid=>redeemAccessCode({uid,code,store:f.store,env:f.env,now:f.now()})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const index=results.findIndex(r=>r.status==='fulfilled'),uid=['a','b'][index],first=results[index].value;
  const retry=await redeemAccessCode({uid,code,store:f.store,env:f.env,now:f.now()+1});
  assert.equal(retry.grant.id,first.grant.id);
  assert.equal(retry.grant.expiresAt,first.grant.expiresAt);
  assert.equal(retry.alreadyRedeemed,true);
});
test('expired, revoked, UID-bound and wrong-scope codes grant nothing',async()=>{
  for(const override of [{redeemBefore:0},{revokedAt:1},{intendedUid:'somebody'},{scope:'production'}]) {
    const f=fixture();await issued(f,override);
    await assert.rejects(()=>redeemAccessCode({uid:'a',code,store:f.store,env:f.env,now:f.now()}));
  }
});
test('access pass stacks after a pass but does not change paid billing',async()=>{
  const f=fixture();await issued(f,{maxUses:2});
  await f.store.applyBillingSnapshot({uid:'a',snapshot:{status:'active',paidThrough:f.now()+86400000,cancelAtPeriodEnd:false},eventId:'evt_1'});
  const result=await redeemAccessCode({uid:'a',code,store:f.store,env:f.env,now:f.now()});
  assert.equal(result.billingContinues,true);
  assert.equal((await f.store.readAccount('a')).billing.paidThrough,f.now()+86400000);
  assert.equal(result.grant.expiresAt,Date.parse('2026-11-11T12:00:00Z'));
  const code2=code.replace('ABCD','ZZZZ');
  await f.store.issueCode({digest:codeDigest(code2,f.env.REDEMPTION_HASH_SECRET,'preview'),definition:definition(f.now()),ownerUid:'owner'});
  const next=await redeemAccessCode({uid:'a',code:code2,store:f.store,env:f.env,now:f.now()});
  assert.equal(next.grant.startsAt,Date.parse('2026-11-11T12:00:00Z'));
  assert.equal(next.grant.expiresAt,Date.parse('2026-12-11T12:00:00Z'));
});
test('revocation removes code coverage and owner authorization is server enforced',async()=>{
  const f=fixture(),digest=await issued(f);
  await redeemAccessCode({uid:'a',code,store:f.store,env:f.env,now:f.now()});
  await assert.rejects(()=>f.store.revokeCode({digest,ownerUid:'a',now:f.now()}));
  await f.store.revokeCode({digest,ownerUid:'owner',now:f.now()});
  assert.equal((await f.store.readAccount('a')).grants[0].revokedAt,f.now());
});
test('unregistered feature and malformed code definitions cannot be issued',async()=>{
  const f=fixture();
  for(const value of [{months:0},{maxUses:-1},{kind:'feature',featureId:'arbitrary-admin'},{perAccountLimit:3}])
    await assert.rejects(()=>issued(f,value));
  assert.throws(()=>codeDigest('short',f.env.REDEMPTION_HASH_SECRET,'preview'));
  assert.notEqual(codeDigest(code,f.env.REDEMPTION_HASH_SECRET,'preview'),codeDigest(code,f.env.REDEMPTION_HASH_SECRET,'production'));
});
