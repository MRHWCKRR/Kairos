import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/ai.js';
import { responseRecorder } from './helpers/server-fixtures.mjs';

const body = { messages: [{ role: 'user', content: 'Plan my day' }] };
const headers = { authorization: 'Bearer signed-user', 'x-firebase-appcheck': 'signed-app' };
function setup({ user = { uid: 'user-one', email_verified: true }, app = true, allowed = true, limiter = true } = {}) {
  const sent = [], keys = [];
  const handler = createHandler({
    env: { KAIROS_RELAY_SECRET: 'server-only' },
    adminAuth: { async verifyIdToken(token) { if (token !== 'signed-user') throw Error('invalid'); return user; } },
    appCheck: { async verifyToken(token) { if (!app || token !== 'signed-app') throw Error('invalid'); } },
    rateLimiter: limiter ? { async limit({ key }) { keys.push(key); return { success: allowed }; } } : undefined,
    fetchImpl: async (url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ choices: [{ message: { content: 'Hello' } }] }); }
  });
  return { sent, keys, async request(patch = {}) { const res = responseRecorder(); await handler({ method: 'POST', headers, body, ...patch }, res); return res; } };
}

test('anonymous and forged identities never reach the AI provider', async () => {
  const ctx = setup();
  for (const authorization of ['', 'Bearer forged']) {
    assert.equal((await ctx.request({ headers: { ...headers, authorization } })).statusCode, 401);
  }
  assert.equal(ctx.sent.length, 0);
});
test('unverified email cannot use AI', async () => {
  const ctx = setup({ user: { uid: 'user-one', email_verified: false } });
  assert.equal((await ctx.request()).statusCode, 403); assert.equal(ctx.sent.length, 0);
});
test('missing or invalid App Check blocks the provider', async () => {
  const ctx = setup();
  for (const token of ['', 'forged']) assert.equal((await ctx.request({ headers: { ...headers, 'x-firebase-appcheck': token } })).statusCode, 403);
  assert.equal(ctx.sent.length, 0);
});
test('limit uses verified UID and returns retry guidance without sending AI requests', async () => {
  const ctx = setup({ allowed: false }); const res = await ctx.request({ body: { ...body, uid: 'other' } });
  assert.equal(res.statusCode, 429); assert.equal(res.headers['retry-after'], '60');
  assert.deepEqual(ctx.keys, ['ai:user-one']); assert.equal(ctx.sent.length, 0);
});
test('missing limiter fails closed', async () => {
  const ctx = setup({ limiter: false }); assert.equal((await ctx.request()).statusCode, 503); assert.equal(ctx.sent.length, 0);
});
test('invalid messages and oversized content are rejected before AI use', async () => {
  const ctx = setup();
  for (const messages of [[], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: {} }], Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' }))]) {
    assert.equal((await ctx.request({ body: { messages } })).statusCode, 400);
  }
  assert.equal((await ctx.request({ body: { messages: [{ role: 'user', content: 'x'.repeat(131073) }] } })).statusCode, 413);
  assert.equal(ctx.sent.length, 0);
});
test('valid chat passes with server-owned output cap and strips unexpected message fields', async () => {
  const ctx = setup(); const res = await ctx.request({ body: { messages: [{ role: 'user', content: 'Hello', secret: 'ignored' }], max_tokens: 999999 } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.choices[0].message.content, 'Hello');
  assert.deepEqual(ctx.sent[0].messages, [{ role: 'user', content: 'Hello' }]); assert.equal(ctx.sent[0].max_tokens, 8192);
});
