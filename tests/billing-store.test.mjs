import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './billing-store-fixture.mjs';
test('scoped account mappings and delayed events cannot overwrite a deleting account',async()=>{
  const f=fixture();
  await f.store.applyBillingSnapshot({uid:'a',snapshot:{status:'active',paidThrough:f.now()+1},eventId:'evt'});
  await f.store.markDeleting('a');
  await assert.rejects(()=>f.store.applyBillingSnapshot({uid:'a',snapshot:{status:'active',paidThrough:f.now()+100},eventId:'evt2'}));
  assert.equal((await f.store.readAccount('a')).deleting,true);
  assert.ok([...f.docs.keys()].every(path=>path.includes('/preview-')));
});
test('account lease excludes concurrent operations and releases on failure',async()=>{
  const f=fixture();let release;
  const blocked=new Promise(resolve=>release=resolve);
  const first=f.store.withAccountLease('a',async()=>{await blocked;throw Error('provider down');});
  await new Promise(resolve=>setTimeout(resolve,0));
  await assert.rejects(()=>f.store.withAccountLease('a',async()=>{}));
  release();await assert.rejects(()=>first);
  assert.equal(await f.store.withAccountLease('a',async()=>42),42);
});
test('raw store documents with malformed aggregates fail closed',async()=>{
  const f=fixture();const path=f.store.accountPath('a');
  f.docs.set(path,{data:{grants:'forged'},version:'1'});
  await assert.rejects(()=>f.store.readAccount('a'));
  assert.throws(()=>f.store.accountPath('../b'));
});
