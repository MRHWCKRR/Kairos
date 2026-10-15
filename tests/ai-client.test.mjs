import test from 'node:test';
import assert from 'node:assert/strict';
import * as aiTransport from '../ai-request.js';
const { createAiRequester } = aiTransport;

async function client(overrides = {}) {
  // The transport is independent of the browser-only Firebase wrapper.
  let sent;
  const user = { uid: 'one', emailVerified: true, async getIdToken() { return 'user-token'; } };
  const request = createAiRequester({ getUser: () => user, getAppToken: async () => 'app-token', fetchImpl: async (url, options) => { sent = { url, options }; return Response.json({ choices: [] }); }, ...overrides });
  return { request, get sent() { return sent; } };
}
test('AI browser transport sends both tokens only to the same-origin route', async () => {
  const c = await client(); await c.request({ body: '{"messages":[]}' });
  assert.equal(c.sent?.url, '/api/ai'); assert.equal(c.sent.options.headers.Authorization, 'Bearer user-token');
  assert.equal(c.sent.options.headers['X-Firebase-AppCheck'], 'app-token');
});
test('AI usage observer sees admitted provider failures without hiding the original error',async()=>{
  let updates=0;
  const c=await client({onUsage:()=>updates++,fetchImpl:async()=>Response.json({error:'provider failure'},{status:502})});
  await assert.rejects(c.request({}),error=>error.status===502);
  assert.equal(updates,1);
});
test('signed-out browser makes no AI request', async () => {
  const c = await client({ getUser: () => null }); await assert.rejects(c.request({}), /sign in/i); assert.equal(c.sent, undefined);
});
test('missing App Check never falls back to an unprotected request', async () => {
  const c = await client({ getAppToken: async () => { throw Error('private provider detail'); } });
  await assert.rejects(c.request({}), /refresh/i); assert.equal(c.sent, undefined);
});
test('rate-limited requests show retry guidance and do not automatically retry', async () => {
  let calls = 0; const c = await client({ fetchImpl: async () => { calls++; return Response.json({ error: 'busy' }, { status: 429 }); } });
  await assert.rejects(c.request({}), error => error.message === 'rate' && error.code === 'ai-protection'); assert.equal(calls, 1);
});
test('account changes while obtaining tokens cannot send the previous user request', async () => {
  const user = { uid: 'one', emailVerified: true, async getIdToken() { return 'token'; } }; let current = user;
  const c = await client({ getUser: () => current, getAppToken: async () => { current = null; return 'token'; } });
  await assert.rejects(c.request({}), /sign in/i); assert.equal(c.sent, undefined);
});
test('provider failures retain the HTTP status without exposing its response body', async () => {
  const c = await client({ fetchImpl: async () => Response.json({ error: 'private upstream detail' }, { status: 502 }) });
  await assert.rejects(c.request({}), error => error.status === 502 && !error.message.includes('private'));
});

test('daily notices stay out of AI context after reload while ordinary messages remain', () => {
  const messages = JSON.parse(JSON.stringify([
    {role:'user',content:'Hello'},
    {role:'assistant',content:'Hi'},
    {role:'assistant',content:'You have reached your daily Kairos AI allowance. Resets at 12 Oct, 12:00 am Brisbane time.'},
    {role:'assistant',content:'Storage unavailable',notice:true},
    {role:'user',content:'What does the daily Kairos AI allowance mean?'}
  ]));
  const filtered = aiTransport.aiConversationMessages?.(messages);
  assert.deepEqual(filtered?.map(m=>m.content), ['Hello','Hi','What does the daily Kairos AI allowance mean?']);
  assert.equal(messages.length,5);
});

test('daily account errors retain structured reset reason for an upgrade notice',async()=>{
  const c=await client({fetchImpl:async()=>Response.json({code:'daily-account',resetsAt:'2026-10-12T14:00:00Z'},{status:429,headers:{'Retry-After':'60'}})});
  await assert.rejects(c.request({}),e=>e.reason==='daily-account'&&e.resetsAt==='2026-10-12T14:00:00Z'&&e.retryAfter===60);
});
test('an old account response cannot refresh the new accounts usage',async()=>{
  let user={uid:'one',emailVerified:true,getIdToken:async()=>'id'},updates=0;
  const c=await client({getUser:()=>user,onUsage:()=>updates++,fetchImpl:async()=>{user={uid:'two'};return Response.json({ok:true});}});
  await assert.rejects(c.request({}),/sign in/i);assert.equal(updates,0);
});
