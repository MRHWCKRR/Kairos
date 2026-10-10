import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../cloudflare/worker.js';
import { fixtureDb, aiHeaders } from './helpers/server-fixtures.mjs';

function setup() {
  const db = fixtureDb();
  db.reserveAiUsage = async () => ({ allowed: true });
  db.clearExpiredAiUsage = async () => 0;
  const worker = createWorker({ createServices: () => ({ db, appCheck: { async verifyToken() {} }, adminAuth: { async verifyIdToken(token) { if (token === 'bad') throw Error('bad signature'); return { uid: token, email_verified: true }; } } }), fetchImpl: async () => Response.json({ choices: [{ message: { content: 'hello' } }] }) });
  const env = { AI_RATE_LIMITER: { async limit() { return { success: true }; } }, ASSETS: { async fetch(request) { return new Response(new URL(request.url).pathname, { status: 200 }); } }, ANALYTICS_ADMIN_UID: 'admin', ANALYTICS_HASH_SECRET: 'hash', CRON_SECRET: 'cron', KAIROS_RELAY_SECRET: 'relay' };
  return { db, worker, env };
}
const request = (path, options) => new Request(`https://fixture.example${path}`, options);

test('Worker delegates static pages, returns API 404, and preserves methods', async () => {
  const { worker, env } = setup();
  assert.equal(await (await worker.fetch(request('/app.html'), env, {})).text(), '/app.html');
  const missing = await worker.fetch(request('/api/missing'), env, {}); assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type'), /json/);
  const method = await worker.fetch(request('/api/ai'), env, {}); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST'); assert.equal(method.headers.get('access-control-allow-origin'), null);
});

test('Worker handles AI replies and absent configuration with verified identity and attestation', async () => {
  const { worker, env } = setup();
  const response = await worker.fetch(request('/api/ai', { method: 'POST', headers: aiHeaders, body: '{"messages":[{"role":"user","content":"hi"}]}' }), env, {});
  assert.equal(response.status, 200); assert.equal((await response.json()).choices[0].message.content, 'hello'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const unavailable = await createWorker().fetch(request('/api/ai', { method: 'POST', body: '{}' }), {}, {}); assert.equal(unavailable.status, 401);
});

test('Worker rejects malformed JSON and limits chunked bodies without Content-Length', async () => {
  const { worker, env } = setup();
  const malformed = await worker.fetch(request('/api/track', { method: 'POST', body: '{' }), env, {}); assert.equal(malformed.status, 400);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2048)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  const oversized = await worker.fetch(request('/api/track', { method: 'POST', body: stream, duplex: 'half' }), env, {}); assert.equal(oversized.status, 413);
  const aiLarge = await worker.fetch(request('/api/ai', { method: 'POST', body: ' '.repeat(1024 * 1024 + 1) }), env, {}); assert.equal(aiLarge.status, 413);
});

test('Tracking uses trusted Cloudflare metadata instead of forwarded values', async () => {
  const { worker, env, db } = setup();
  const visit = request('/api/track', { method: 'POST', headers: { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.99', 'x-vercel-ip-country': 'US', 'user-agent': 'Mozilla Chrome/130.0' }, body: '{"page":"/app.html"}' });
  Object.defineProperty(visit, 'cf', { value: { country: 'AU' } });
  assert.equal((await worker.fetch(visit, env, {})).status, 204);
  const event = [...db.rows.values()][0]; assert.equal(event.country, 'AU'); assert.doesNotMatch(JSON.stringify(event), /192\.0\.2\./);
  const second = request('/api/track', { method: 'POST', headers: { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '203.0.113.3', 'user-agent': 'Mozilla Chrome/130.0' }, body: '{}' });
  Object.defineProperty(second, 'cf', { value: { country: 'AU' } }); await worker.fetch(second, env, {});
  assert.equal([...db.rows.values()][1].visitorId, event.visitorId);
});

test('Worker refuses dashboard access without the exact verified admin identity', async () => {
  const { worker, env } = setup();
  for (const token of ['', 'other', 'bad']) {
    const response = await worker.fetch(request('/api/analytics', { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env, {}); assert.equal(response.status, 401);
  }
  const response = await worker.fetch(request('/api/analytics?days=7', { headers: { Authorization: 'Bearer admin' } }), env, {});
  assert.equal(response.status, 200); assert.equal((await response.json()).rangeDays, 7);
  assert.equal((await createWorker().fetch(request('/api/analytics'), {}, {})).status, 401);
});

test('Worker schedules expiry cleanup internally and protects the public cleanup URL', async () => {
  const { worker, env, db } = setup(); db.rows.set('expired', { expiresAt: new Date(0) }); db.rows.set('fresh', { expiresAt: new Date(Date.now() + 86400000) });
  assert.equal((await worker.fetch(request('/api/cleanup-analytics'), env, {})).status, 401);
  await worker.scheduled({}, env, {}); assert.equal(db.rows.has('expired'), false); assert.equal(db.rows.has('fresh'), true);
  assert.equal((await worker.fetch(request('/api/cleanup-analytics', { headers: { Authorization: 'Bearer cron' } }), env, {})).status, 200);
  await assert.rejects(createWorker({ createServices: () => { throw Error('upstream unavailable'); } }).scheduled({}, env, {}), /unavailable/);
});
