import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHandler as createAi } from '../server/ai.js';
import { createHandler as createTrack } from '../server/track.js';
import { createHandler as createAnalytics } from '../server/analytics.js';
import { createHandler as createCleanup, clearExpiredAnalytics } from '../server/cleanup-analytics.js';
import { fixtureDb, responseRecorder, aiIdentity, aiHeaders, aiBody } from './helpers/server-fixtures.mjs';

test('AI retains model and payload contract, without forwarding browser keys', async () => {
  let sent;
  const handler = createAi({ ...aiIdentity, env: { KAIROS_RELAY_SECRET: 'backend-test-key' }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://ai.hackclub.com/proxy/v1/chat/completions'); sent = options;
    return Response.json({ choices: [{ message: { content: 'hello' } }] });
  } });
  const res = responseRecorder();
  await handler({ method: 'POST', headers: aiHeaders, body: { messages: [{ role: 'user', content: 'hi' }], response_format: { type: 'json_object' }, model: 'other', apiKey: 'browser-key' } }, res);
  assert.equal(sent.headers.Authorization, 'Bearer backend-test-key');
  assert.deepEqual(JSON.parse(sent.body), { model: 'qwen/qwen3-32b', messages: [{ role: 'user', content: 'hi' }], response_format: { type: 'json_object' }, max_tokens: 8192, stream: false });
  assert.equal(res.body.choices[0].message.content, 'hello');
});

test('AI method, configuration and upstream failures preserve status codes', async () => {
  for (const [method, env, fetchImpl, status] of [
    ['GET', {}, undefined, 405], ['POST', {}, undefined, 503],
    ['POST', { KAIROS_RELAY_SECRET: 'test' }, async () => { throw Error('private upstream failure'); }, 502],
    ['POST', { KAIROS_RELAY_SECRET: 'test' }, async () => new Response('{"error":"busy"}', { status: 429 }), 429]
  ]) {
    const res = responseRecorder(); await createAi({ ...aiIdentity, env, fetchImpl })({ method, headers: aiHeaders, body: aiBody }, res);
    assert.equal(res.statusCode, status); assert.doesNotMatch(JSON.stringify(res.body), /private upstream/);
  }
});

test('Tracking preserves rotating HMAC, timestamps and privacy', async () => {
  const db = fixtureDb(); const ua = 'Mozilla/5.0 Windows NT Chrome/130.0';
  const handler = createTrack({ db, env: { ANALYTICS_HASH_SECRET: 'test-hash' }, getClientMetadata: () => ({ ip: '192.0.2.1', country: 'AU' }) });
  const res = responseRecorder(); await handler({ method: 'POST', headers: { 'user-agent': ua }, body: { page: '/app.html', referrer: 'https://example.com' } }, res);
  assert.equal(res.statusCode, 204); assert.equal(db.rows.size, 1);
  const event = [...db.rows.values()][0];
  const expected = createHmac('sha256', 'test-hash').update(event.day + '\0' + '192.0.2.1' + '\0' + ua).digest('hex').slice(0, 32);
  assert.equal(event.visitorId, expected); assert.equal(event.country, 'AU'); assert.equal(event.device, 'Desktop');
  assert.equal(event.expiresAt - event.timestamp, 90 * 86400000);
  assert.doesNotMatch(JSON.stringify(event), /192\.0\.2\.1|test-hash/);
  await handler({ method: 'POST', headers: { 'user-agent': 'Googlebot' }, body: {} }, responseRecorder());
  assert.equal(db.rows.size, 1);
});

test('Tracking failure never prevents a page visit and methods are restricted', async () => {
  const handler = createTrack({ db: fixtureDb(), env: {}, getClientMetadata: () => ({ ip: 'x' }) });
  let res = responseRecorder(); await handler({ method: 'POST', headers: {}, body: {} }, res); assert.equal(res.statusCode, 204);
  res = responseRecorder(); await handler({ method: 'GET' }, res); assert.equal(res.statusCode, 405); assert.equal(res.headers.allow, 'POST');
});

test('Dashboard verifies the exact admin and retains aggregate shape', async () => {
  const now = new Date(); const db = fixtureDb([{ timestamp: now, day: now.toISOString().slice(0, 10), visitorId: 'v', page: '/app.html', device: 'Desktop', country: 'AU' }]);
  const adminAuth = { async verifyIdToken(token) { if (token === 'tampered') throw Error('bad signature'); return { uid: token }; } };
  const handler = createAnalytics({ db, adminAuth, env: { ANALYTICS_ADMIN_UID: 'admin' } });
  for (const token of ['', 'other', 'tampered']) { const res = responseRecorder(); await handler({ method: 'GET', headers: { authorization: token ? `Bearer ${token}` : '' }, query: {} }, res); assert.equal(res.statusCode, 401); }
  const res = responseRecorder(); await handler({ method: 'GET', headers: { authorization: 'Bearer admin' }, query: { days: '90' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.rangeDays, 90); assert.equal(res.body.retentionDays, 90);
  assert.equal(res.body.maxEventsPerLoad, 10000); assert.equal(res.body.totals.pageViews, 1); assert.equal(res.body.totals.uniqueVisitors, 1);
  assert.equal(res.body.recent[0].timestamp, now.toISOString()); assert.equal(res.headers['cache-control'], 'no-store');
  const cleared = responseRecorder(); await handler({ method: 'DELETE', headers: { authorization: 'Bearer admin' } }, cleared);
  assert.deepEqual(cleared.body, { deleted: 1 }); assert.equal(db.rows.size, 0);
});

test('Cleanup deletes expired data in 400-event batches and preserves fresh events', async () => {
  const db = fixtureDb([...Array.from({ length: 801 }, () => ({ expiresAt: new Date(0) })), { expiresAt: new Date(Date.now() + 86400000) }]);
  assert.equal(await clearExpiredAnalytics(db), 801); assert.equal(db.rows.size, 1); assert.deepEqual(db.commits, [400, 400, 1]);
  const handler = createCleanup({ db, env: { CRON_SECRET: 'cron' } });
  for (const authorization of ['', 'Bearer wrong']) { const res = responseRecorder(); await handler({ method: 'GET', headers: { authorization } }, res); assert.equal(res.statusCode, 401); }
  const res = responseRecorder(); await handler({ method: 'GET', headers: { authorization: 'Bearer cron' } }, res); assert.deepEqual(res.body, { deleted: 0 });
});

test('Interrupted cleanup fails explicitly and can be resumed safely', async () => {
  const db = fixtureDb([{ expiresAt: new Date(0) }, { expiresAt: new Date(Date.now() + 86400000) }]);
  await assert.rejects(clearExpiredAnalytics(db, { deadlineMs: 0 }), /incomplete/i);
  assert.equal(db.rows.size, 2); assert.equal(await clearExpiredAnalytics(db), 1); assert.equal(db.rows.size, 1);
});

test('Concurrent configurations never mix AI keys or admin identities', async () => {
  const keys = [];
  const fetchImpl = async (_, options) => { await Promise.resolve(); keys.push(options.headers.Authorization); return Response.json({ choices: [] }); };
  await Promise.all(['one', 'two'].map(key => createAi({ ...aiIdentity, env: { KAIROS_RELAY_SECRET: key }, fetchImpl })({ method: 'POST', headers: aiHeaders, body: aiBody }, responseRecorder())));
  assert.deepEqual(keys.sort(), ['Bearer one', 'Bearer two']);
  const db = fixtureDb(); const adminAuth = { async verifyIdToken(token) { return { uid: token }; } };
  const responses = await Promise.all(['one', 'two'].map(async uid => { const res = responseRecorder(); await createAnalytics({ db, adminAuth, env: { ANALYTICS_ADMIN_UID: uid } })({ method: 'GET', headers: { authorization: 'Bearer one' }, query: {} }, res); return res.statusCode; }));
  assert.deepEqual(responses, [200, 401]);
});
