import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { createFirestore } from '../cloudflare/firebase-firestore.js';
const {privateKey}=await generateKeyPair('RS256',{extractable:true});
const env={FIREBASE_PROJECT_ID:'fixture-project',FIREBASE_CLIENT_EMAIL:'fixture@example.com',FIREBASE_PRIVATE_KEY:await exportPKCS8(privateKey),AI_BUDGET_SCOPE:'preview'};
test('billing transport uses scoped paths and conditional writes without accepting arbitrary documents',async()=>{
  const calls=[];
  const db=createFirestore({env,fetchImpl:async(url,options)=>{
    if(url.endsWith('/token'))return Response.json({access_token:'fixture-token',expires_in:3600});
    calls.push({url,options});
    if(options.method==='GET')return Response.json({name:'projects/fixture-project/databases/(default)/documents/kairosBillingAccounts/preview-account',updateTime:'2026-10-11T12:00:00Z',fields:{payload:{stringValue:'{"schema":1}'}}});
    return Response.json({writeResults:[{updateTime:'2026-10-11T12:00:01Z'}]});
  }});
  const transport=db.billingTransport();
  assert.deepEqual(await transport.get('kairosBillingAccounts/preview-account'),{data:{schema:1},version:'2026-10-11T12:00:00Z'});
  await transport.commit([{path:'kairosBillingAccounts/preview-account',version:'2026-10-11T12:00:00Z',data:{schema:1}}]);
  assert.deepEqual(JSON.parse(calls[1].options.body).writes[0].currentDocument,{updateTime:'2026-10-11T12:00:00Z'});
  await assert.rejects(()=>transport.get('users/preview-owner'));
  await assert.rejects(()=>transport.get('kairosBillingAccounts/production-account'));
});
