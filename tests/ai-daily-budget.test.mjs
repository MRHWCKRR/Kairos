import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/ai.js';
import { createAiRequester } from '../ai-request.js';
import { aiIdentity, aiBody, aiHeaders, responseRecorder } from './helpers/server-fixtures.mjs';

function fixture(dailyBudget) {
  let sent = 0;
  const handler = createHandler({ ...aiIdentity, env: { KAIROS_RELAY_SECRET: 'fixture' }, dailyBudget,
    fetchImpl: async () => { sent++; return Response.json({ choices: [] }); } });
  return { get sent() { return sent; }, async request(patch = {}) {
    const res = responseRecorder(); await handler({ method: 'POST', headers: aiHeaders, body: aiBody, ...patch }, res); return res;
  } };
}

test('daily account allowance rejects provider calls and returns the actual reset time', async () => {
  const ctx = fixture({ async reserve() { return { allowed: false, reason: 'account', resetsAt: '2026-10-11T14:00:00.000Z', retryAfter: 600 }; } });
  const res = await ctx.request();
  assert.equal(res.statusCode, 429); assert.equal(res.body.code, 'daily-account');
  assert.equal(res.body.resetsAt, '2026-10-11T14:00:00.000Z'); assert.equal(res.headers['retry-after'], '600'); assert.equal(ctx.sent, 0);
});

test('site daily allowance stops all accounts before contacting the provider', async () => {
  const ctx = fixture({ async reserve() { return { allowed: false, reason: 'site', resetsAt: '2026-10-11T14:00:00.000Z', retryAfter: 600 }; } });
  const res = await ctx.request(); assert.equal(res.statusCode, 429); assert.equal(res.body.code, 'daily-site'); assert.equal(ctx.sent, 0);
});

test('missing or broken daily counter fails closed without exposing storage errors', async () => {
  for (const budget of [undefined, { async reserve() { throw Error('private storage detail'); } }, { async reserve() { return {}; } }]) {
    const ctx = fixture(budget); const res = await ctx.request(); assert.equal(res.statusCode, 503); assert.equal(ctx.sent, 0); assert.doesNotMatch(JSON.stringify(res.body), /private/);
  }
});

test('allowance is reserved using verified identity rather than claimed tier or credits', async () => {
  let identity;
  const ctx = fixture({ async reserve(uid) { identity = uid; return { allowed: true }; } });
  const res = await ctx.request({ body: { ...aiBody, uid: 'other', tier: 'paid', credits: 99999 } });
  assert.equal(res.statusCode, 200); assert.equal(identity, 'fixture-user'); assert.equal(ctx.sent, 1);
});

test('invalid and unsigned requests do not consume daily credits', async () => {
  let reservations = 0;
  const ctx = fixture({ async reserve() { reservations++; return { allowed: true }; } });
  assert.equal((await ctx.request({ headers: {} })).statusCode, 401);
  assert.equal((await ctx.request({ body: { messages: [] } })).statusCode, 400);
  assert.equal(reservations, 0);
});

test('browser shows a daily reset message rather than short burst-limit guidance', async () => {
  const request = createAiRequester({ getUser: () => ({ uid: 'u', emailVerified: true, async getIdToken() { return 'id'; } }), getAppToken: async () => 'app',
    fetchImpl: async () => Response.json({ code: 'daily-account', resetsAt: '2026-10-11T14:00:00.000Z' }, { status: 429 }) });
  await assert.rejects(request({}), error => /daily/i.test(error.message) && /Brisbane/i.test(error.message) && error.message !== 'rate');
});
