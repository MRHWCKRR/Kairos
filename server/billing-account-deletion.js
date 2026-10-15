export async function prepareBillingDeletion(uid,{store,stripe}) {
  return store.withAccountLease(uid,async(store)=>{
    await store.markDeleting(uid);
    const mapping=await store.readMapping(uid);
    if(mapping)await stripe.cancelAccountSubscriptions(mapping.customerId);
    return store.completeDeletion(uid);
  });
}
