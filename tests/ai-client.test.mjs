import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function client(overrides = {}) {
  // Load the transport without loading browser-only Firebase modules.
  const source = await fs.readFile(new URL('../ai-request.js', import.meta.url), 'utf8');
  const { createAiRequester } = await import('data:text/javascript,' + encodeURIComponent(source));
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
