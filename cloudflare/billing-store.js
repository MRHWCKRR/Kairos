import { createHmac, randomUUID } from 'node:crypto';
import { planCatalog } from '../server/plans.js';
import { validateGrant, resolveAccess, addCalendarMonths } from '../server/entitlements.js';
import { validateCodeDefinition } from '../server/access-codes.js';

export const BILLING_COLLECTIONS=new Set(['kairosBillingAccounts','kairosBillingCustomers','kairosBillingEntitlements','kairosBillingEvents','kairosBillingLocks','kairosCreditAccounts','kairosCreditGrants','kairosAccessCodes','kairosCodeRedemptions']);
export function createBillingStore({env,transport,clock=Date.now}) {
  const scope=env.AI_BUDGET_SCOPE||'production',secret=env.ANALYTICS_HASH_SECRET,catalog=planCatalog(env);
  if (!['preview','production'].includes(scope) || !secret || !transport?.get || !transport?.commit) throw Error('Invalid billing store configuration');
  function identity(uid) {
    if(typeof uid!=='string' || !uid || uid.length>128 || /[/\\\x00]/.test(uid)) throw Error('Invalid account identity');
    return createHmac('sha256',secret).update(scope+'\0'+uid).digest('hex');
  }
  function path(collection,id) {
    if(!BILLING_COLLECTIONS.has(collection) || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw Error('Invalid billing path');
    return collection+'/'+scope+'-'+id;
  }
  const accountPath=uid=>path('kairosBillingEntitlements',identity(uid));
  const empty=()=>({schema:1,billing:null,grants:[],deleting:false});
  function accountData(raw) {
    if(!raw) return empty();
    if(raw.schema!==1 || !Array.isArray(raw.grants) || raw.grants.length>256 || typeof raw.deleting!=='boolean') throw Error('Invalid billing account');
    raw.grants.forEach(validateGrant);
    resolveAccess({catalog,billing:raw.billing,grants:raw.grants,now:clock()});
    return raw;
  }
  async function get(p) {
    const doc=await transport.get(p);
    if(doc && (!doc.version || !doc.data || typeof doc.data!=='object')) throw Error('Invalid billing snapshot');
    return doc;
  }
  async function atomic(operation) {
    for(let attempt=0;attempt<5;attempt++) {
      try { return await operation(); }
      catch(error) { if(!['ABORTED','ALREADY_EXISTS','FAILED_PRECONDITION'].includes(error.code) || attempt===4) throw error; }
    }
  }
  function write(p,doc,data) { return {path:p,version:doc?.version||null,data}; }
  async function loadAccount(uid) {
    const p=accountPath(uid),doc=await get(p),account=accountData(doc?.data),versions=[write(p,doc,account)];
    // A revoked code must invalidate its grant without scanning all recipients.
    const grants=[];
    for(const grant of account.grants) {
      if(grant.sourceId.startsWith('code:') && grant.revokedAt===null && (grant.expiresAt===null || grant.expiresAt>clock())) {
        const digest=grant.sourceId.slice(5),cp=path('kairosAccessCodes',digest),code=await get(cp);
        if(!code || !code.data.definition) throw Error('Missing code source');
        validateCodeDefinition(code.data.definition,catalog,scope);
        versions.push(write(cp,code,code.data));
        grants.push({...grant,revokedAt:code.data.definition.revokedAt});
      } else grants.push(grant);
    }
    return {account:{...account,grants},versions};
  }
  async function readAccount(uid) { return (await loadAccount(uid)).account; }
  async function updateAccount(uid,operation) {
    return atomic(async()=>{
      const p=accountPath(uid),doc=await get(p),account=accountData(doc?.data);
      const {data,result}=await operation(account);
      await transport.commit([write(p,doc,data)]);
      return result;
    });
  }
  function owner(uid) { if(!env.ANALYTICS_ADMIN_UID || uid!==env.ANALYTICS_ADMIN_UID) throw Error('Owner access required'); }
  return {
    scope,accountPath,loadAccount,readAccount,path,get,atomic,write,commit:writes=>transport.commit(writes),
    async readMapping(uid) {
      const doc=await get(path('kairosBillingAccounts',identity(uid)));
      if(doc && (doc.data.uid!==uid || !/^cus_[a-zA-Z0-9]+$/.test(doc.data.customerId||''))) throw Error('Invalid customer mapping');
      return doc?.data||null;
    },
    async saveMapping(uid,mapping) {
      if(!/^cus_[a-zA-Z0-9]+$/.test(mapping.customerId||'')) throw Error('Invalid customer');
      return atomic(async()=>{
        const p=path('kairosBillingAccounts',identity(uid)),cp=path('kairosBillingCustomers',mapping.customerId);
        const [doc,reverse,account]=await Promise.all([get(p),get(cp),get(accountPath(uid))]);
        if(accountData(account?.data).deleting || (reverse && reverse.data.uid!==uid) || (doc && doc.data.customerId!==mapping.customerId)) throw Error('Invalid billing ownership');
        await transport.commit([write(p,doc,{...doc?.data,...mapping,uid}),write(cp,reverse,{uid}),write(accountPath(uid),account,accountData(account?.data))]);
        return {customerId:mapping.customerId};
      });
    },
    async customerUid(customerId) {
      const doc=await get(path('kairosBillingCustomers',customerId));
      if(!doc) return null;
      const mapping=await this.readMapping(doc.data.uid);
      if(mapping?.customerId!==customerId) throw Error('Invalid billing ownership');
      return doc.data.uid;
    },
    async issueCode({digest,definition,ownerUid}) {
      owner(ownerUid);validateCodeDefinition(definition,catalog,scope);
      const p=path('kairosAccessCodes',digest);
      await transport.commit([{path:p,version:null,data:{schema:1,definition,uses:0,issuedAt:clock()}}]);
      return {issued:true};
    },
    async revokeCode({digest,ownerUid,now}) {
      owner(ownerUid);
      return atomic(async()=>{
        const p=path('kairosAccessCodes',digest),doc=await get(p);
        if(!doc) throw Error('Code unavailable');
        await transport.commit([write(p,doc,{...doc.data,definition:{...doc.data.definition,revokedAt:now}})]);
        return {revoked:true};
      });
    },
    async redeemCode({uid,digest,now}) {
      if(!Number.isSafeInteger(now)) throw Error('Invalid redemption clock');
      const key=identity(uid),cp=path('kairosAccessCodes',digest),rp=path('kairosCodeRedemptions',digest+'-'+key),ap=accountPath(uid);
      return atomic(async()=>{
        const [code,prior,doc]=await Promise.all([get(cp),get(rp),get(ap)]),account=accountData(doc?.data);
        if(account.deleting) throw Error('Account unavailable');
        if(!code) throw Error('Code unavailable');
        const definition=validateCodeDefinition(code.data.definition,catalog,scope);
        if(definition.scope!==scope || definition.revokedAt!==null) throw Error('Code unavailable');
        if(prior) {
          validateGrant(prior.data.grant);
          return {...prior.data,alreadyRedeemed:true,billingContinues:account.billing?.status==='active'};
        }
        if(definition.redeemBefore<=now || (definition.intendedUid!==null && definition.intendedUid!==uid) ||
           !Number.isSafeInteger(code.data.uses) || code.data.uses<0 || code.data.uses>=definition.maxUses || account.grants.length>=256) throw Error('Code unavailable');
        const loaded=await loadAccount(uid);
        // Use the reloaded version to include revocation checks in the same commit.
        const current=loaded.account;
        if(current.deleting) throw Error('Account unavailable');
        let startsAt=now;
        if(definition.kind==='plan') for(const grant of current.grants) {
          if(grant.kind==='plan' && grant.planId===definition.planId && grant.revokedAt===null && grant.expiresAt>now) startsAt=Math.max(startsAt,grant.expiresAt);
        }
        const grant={id:'code-'+digest+'-'+key,sourceId:'code:'+digest,kind:definition.kind,
          ...(definition.kind==='plan'?{planId:definition.planId}:{featureId:definition.featureId}),
          startsAt,expiresAt:addCalendarMonths(startsAt,definition.months),revokedAt:null};
        const result={grant,alreadyRedeemed:false,billingContinues:['active','past_due'].includes(current.billing?.status)};
        const writes=loaded.versions.filter(w=>w.path!==cp && w.path!==ap);
        writes.push(write(cp,code,{...code.data,uses:code.data.uses+1}),{path:rp,version:null,data:result},
          {...loaded.versions[0],data:{...current,grants:[...current.grants,grant]}});
        await transport.commit(writes);
        return result;
      });
    },
    async applyBillingSnapshot({uid,snapshot,eventId}) {
      const eventPath=path('kairosBillingEvents',eventId);
      return atomic(async()=>{
        const [event,doc]=await Promise.all([get(eventPath),get(accountPath(uid))]),account=accountData(doc?.data);
        if(account.deleting) throw Error('Account deleting');
        if(event) return {duplicate:true};
        resolveAccess({catalog,billing:snapshot,grants:account.grants,now:clock()});
        await transport.commit([write(accountPath(uid),doc,{...account,billing:snapshot}),
          {path:eventPath,version:null,data:{schema:1,accountKey:identity(uid),processedAt:clock()}}]);
        return {duplicate:false};
      });
    },
    async markDeleting(uid) {
      return updateAccount(uid,account=>({data:{...account,deleting:true},result:{marked:true}}));
    },
    async withAccountLease(uid,operation) {
      const p=path('kairosBillingLocks',identity(uid)),id=randomUUID();
      await atomic(async()=>{
        const doc=await get(p);
        if(doc && (!Number.isSafeInteger(doc.data.until) || doc.data.until>clock())) throw Error('Billing busy; retry shortly');
        await transport.commit([write(p,doc,{id,until:clock()+90000})]);
      });
      try { return await operation(); }
      finally {
        const doc=await get(p);
        if(doc?.data.id===id) await transport.commit([write(p,doc,null)]);
      }
    }
  };
}
