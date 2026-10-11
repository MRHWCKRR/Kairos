import { createBillingStore } from '../cloudflare/billing-store.js';
export function fixture(env={}) {
  const docs=new Map(); let revision=0;
  const transport={
    async get(path) { const doc=docs.get(path); return doc?structuredClone(doc):null; },
    async commit(writes) {
      for(const write of writes) {
        const doc=docs.get(write.path);
        if ((write.version===null && doc) || (write.version!==null && doc?.version!==write.version))
          throw Object.assign(Error('Conflict'),{code:'ABORTED'});
      }
      for(const write of writes) {
        if(write.data===null) docs.delete(write.path);
        else docs.set(write.path,{data:structuredClone(write.data),version:String(++revision)});
      }
    }
  };
  let time=Date.parse('2026-10-11T12:00:00Z');
  const config={AI_BUDGET_SCOPE:'preview',ANALYTICS_HASH_SECRET:'test-identity-secret',ANALYTICS_ADMIN_UID:'owner',REDEMPTION_HASH_SECRET:'test-code-secret',...env};
  return {store:createBillingStore({env:config,transport,clock:()=>time}),env:config,docs,transport,setTime:value=>time=value,now:()=>time};
}
