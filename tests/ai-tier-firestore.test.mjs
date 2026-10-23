import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportPKCS8} from 'jose';
import {createFirestore} from '../cloudflare/firebase-firestore.js';
import {createBillingStore} from '../cloudflare/billing-store.js';
const {privateKey}=await generateKeyPair('RS256',{extractable:true});
const now=Date.parse('2026-10-11T12:00:00Z');
async function setup() {
  const env={FIREBASE_PROJECT_ID:'fixture-project',FIREBASE_CLIENT_EMAIL:'fixture@example.com',FIREBASE_PRIVATE_KEY:await exportPKCS8(privateKey),AI_BUDGET_SCOPE:'preview',ANALYTICS_HASH_SECRET:'test-identity-secret',AI_TIER_ENFORCEMENT:'true',AI_DAILY_SITE_LIMIT:'1000'};
  const docs=new Map();let revision=0;
  const fetchImpl=async(url,options)=>{
    if(url.endsWith('/token'))return Response.json({access_token:'fixture-token',expires_in:3600});
    const name=decodeURIComponent(new URL(url).pathname.slice(4));
    if(options.method==='GET')return docs.has(name)?Response.json(docs.get(name)):Response.json({error:{status:'NOT_FOUND'}},{status:404});
    const {writes}=JSON.parse(options.body);
    for(const write of writes) {
      const existing=docs.get(write.update?.name||write.delete),pre=write.currentDocument;
      if((pre.exists===false && existing) || (pre.updateTime && pre.updateTime!==existing?.updateTime))return Response.json({error:{status:'ABORTED'}},{status:409});
    }
    for(const write of writes) {
      if(write.delete)docs.delete(write.delete);
      else docs.set(write.update.name,{...write.update,updateTime:new Date(now+(++revision)*1000).toISOString()});
    }
    return Response.json({writeResults:writes.map(()=>({updateTime:new Date(now+revision*1000).toISOString()}))});
  };
  const db=createFirestore({env,fetchImpl,now:()=>now}),store=createBillingStore({env,transport:db.billingTransport(),clock:()=>now});
  return {db,store,docs,env,put(path,data){docs.set('projects/fixture-project/databases/(default)/documents/'+path,{name:'projects/fixture-project/databases/(default)/documents/'+path,fields:{payload:{stringValue:JSON.stringify(data)}},updateTime:new Date(now+(++revision)*1000).toISOString()});}};
}
test('atomic REST admission spends the last bonus credit only once across parallel requests',async()=>{
  const f=await setup();
  for(let i=0;i<10;i++)assert.equal((await f.db.reserveAiUsage('a')).allowed,true);
  const path=f.store.accountPath('a').replace('kairosBillingEntitlements','kairosCreditAccounts');
  f.put(path,{schema:1,grants:[{grant:{id:'g1',sourceId:'fixture',kind:'credits',amount:1,startsAt:now-1,expiresAt:now+86400000,revokedAt:null},spent:0}]});
  const results=await Promise.all([f.db.reserveAiUsage('a'),f.db.reserveAiUsage('a')]);
  assert.equal(results.filter(result=>result.allowed).length,1);
  const status=await f.db.readAiUsage('a');
  assert.equal(status.used,11);assert.equal(status.bonusCredits,0);
});
test('malformed entitlement storage prevents any admission or counter reset',async()=>{
  const f=await setup();f.put(f.store.accountPath('a'),{schema:1,billing:null,grants:'forged',deleting:false});
  await assert.rejects(()=>f.db.reserveAiUsage('a'));
  assert.ok(![...f.docs.keys()].some(path=>path.includes('/kairosAiUsage/')));
});

test('parallel requests cannot exceed the last weekly allowance',async()=>{
 const f=await setup();f.env.AI_FREE_WEEKLY_LIMIT='1';const results=await Promise.all([f.db.reserveAiUsage('a'),f.db.reserveAiUsage('a')]);assert.equal(results.filter(r=>r.allowed).length,1);assert.equal(results.find(r=>!r.allowed).reason,'weekly-account');const usage=await f.db.readAiUsage('a');assert.equal(usage.weeklyUsed,1);assert.equal(usage.weeklyRemaining,0);assert.equal(usage.remaining,0);
});
