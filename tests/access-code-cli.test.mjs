import test from 'node:test';
import assert from 'node:assert/strict';
import { runAccessCodeCommand } from '../scripts/access-codes.mjs';
test('operator command posts authenticated issue request without credentials in its result',async()=>{
  const session={origin:'https://kairos-web-preview.kirosapp.workers.dev',idToken:'private-id',appCheckToken:'private-app'};
  const result=await runAccessCodeCommand({args:['issue','--months','3','--uses','5'],session,fetchImpl:async(url,options)=>{
    assert.equal(url,session.origin+'/api/billing/codes/issue');
    assert.equal(options.headers.Authorization,'Bearer private-id');
    assert.equal(options.headers['X-Firebase-AppCheck'],'private-app');
    assert.equal(JSON.parse(options.body).months,3);
    return Response.json({code:'ABCD-EFGH-1234-5678-ABCD-EFGH-1234-5678'});
  }});
  assert.equal(result.code,'ABCD-EFGH-1234-5678-ABCD-EFGH-1234-5678');
  assert.ok(!JSON.stringify(result).includes('private-'));
  await assert.rejects(()=>runAccessCodeCommand({args:['issue'],session:{...session,origin:'https://evil.example'},fetchImpl:()=>{throw Error('must not fetch');}}));
});
