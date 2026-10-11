import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './billing-store-fixture.mjs';
import { prepareBillingDeletion } from '../server/billing-account-deletion.js';
test('account cancellation completes before billing ownership is removed',async()=>{
  const f=fixture();await f.store.saveMapping('a',{customerId:'cus_1'});
  let canceled=false;
  const result=await prepareBillingDeletion('a',{store:f.store,stripe:{cancelAccountSubscriptions:async id=>{
    assert.equal(id,'cus_1');
    assert.equal((await f.store.readAccount('a')).deleting,true);
    canceled=true;
  }}});
  assert.equal(result.safeToDelete,true);assert.equal(canceled,true);
  assert.equal(await f.store.readMapping('a'),null);
  assert.equal((await f.store.readAccount('a')).deleting,true);
});
test('failed billing cancellation prevents identity deletion and can be retried',async()=>{
  const f=fixture();await f.store.saveMapping('a',{customerId:'cus_1'});
  await assert.rejects(()=>prepareBillingDeletion('a',{store:f.store,stripe:{cancelAccountSubscriptions:async()=>{throw Error('provider down');}}}));
  assert.equal((await f.store.readMapping('a')).customerId,'cus_1');
  assert.equal((await prepareBillingDeletion('a',{store:f.store,stripe:{cancelAccountSubscriptions:async()=>{}}})).safeToDelete,true);
});
test('account without a payment customer can delete without Stripe credentials',async()=>{
  const f=fixture();
  assert.equal((await prepareBillingDeletion('a',{store:f.store,stripe:{}})).safeToDelete,true);
});
