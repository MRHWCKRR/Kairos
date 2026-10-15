import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { createFirestore } from '../cloudflare/firebase-firestore.js';

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const env = { FIREBASE_PROJECT_ID: 'fixture-project', FIREBASE_CLIENT_EMAIL: 'fixture@fixture-project.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: await exportPKCS8(privateKey) };
const prefix = 'projects/fixture-project/databases/(default)/documents';

function fixtureTransport(reply = []) {
  const calls = []; let oauthCalls = 0;
  const fetchImpl = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      oauthCalls++;
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const { payload } = await jwtVerify(form.get('assertion'), publicKey, { audience: url, issuer: env.FIREBASE_CLIENT_EMAIL });
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/datastore'); assert.equal(payload.exp - payload.iat, 3600);
      return Response.json({ access_token: 'fixture-token', token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    calls.push({ url, body: JSON.parse(options.body), method: options.method });
    return Response.json(typeof reply === 'function' ? reply(url) : reply);
  };
  return { fetchImpl, calls, get oauthCalls() { return oauthCalls; } };
}

test('Firestore adapter creates events with typed timestamps and reuses short-lived access tokens', async () => {
  const transport = fixtureTransport({ name: `${prefix}/kairosAnalytics/event-1` });
  const db = createFirestore({ env, fetchImpl: transport.fetchImpl });
  const timestamp = new Date('2026-10-10T00:00:00.000Z');
  const ref = await db.collection('kairosAnalytics').add({ visitorId: 'abc', timestamp, expiresAt: timestamp, page: '/app.html' });
  await db.collection('kairosAnalytics').add({ day: '2026-10-10' });
  assert.equal(ref.id, 'event-1'); assert.equal(transport.oauthCalls, 1);
  assert.equal(transport.calls[0].url, `https://firestore.googleapis.com/v1/${prefix}/kairosAnalytics`);
  assert.deepEqual(transport.calls[0].body, { fields: { visitorId: { stringValue: 'abc' }, timestamp: { timestampValue: '2026-10-10T00:00:00.000Z' }, expiresAt: { timestampValue: '2026-10-10T00:00:00.000Z' }, page: { stringValue: '/app.html' } } });
});

test('Firestore adapter sends ordered bounded queries and decodes snapshot timestamps', async () => {
  const transport = fixtureTransport([{ document: { name: `${prefix}/kairosAnalytics/a`, fields: { timestamp: { timestampValue: '2026-10-10T00:00:00Z' }, day: { stringValue: '2026-10-10' } } }, readTime: '2026-10-10T00:01:00Z' }]);
  const db = createFirestore({ env, fetchImpl: transport.fetchImpl });
  const snapshot = await db.collection('kairosAnalytics').where('timestamp', '>=', new Date('2026-10-01T00:00:00Z')).orderBy('timestamp', 'desc').limit(10000).get();
  assert.equal(snapshot.size, 1); assert.equal(snapshot.empty, false); assert.equal(snapshot.docs[0].id, 'a'); assert.equal(snapshot.docs[0].data().timestamp.toDate().toISOString(), '2026-10-10T00:00:00.000Z');
  assert.equal(transport.calls[0].url, `https://firestore.googleapis.com/v1/${prefix}:runQuery`);
  assert.deepEqual(transport.calls[0].body, { structuredQuery: { from: [{ collectionId: 'kairosAnalytics' }], where: { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: '2026-10-01T00:00:00.000Z' } } }, orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }], limit: 10000 } });
  const batch = db.batch(); batch.delete(snapshot.docs[0].ref); await batch.commit();
  assert.deepEqual(transport.calls[1].body, { writes: [{ delete: `${prefix}/kairosAnalytics/a` }] });
});

test('Firestore query builders are immutable and empty snapshots remain empty', async () => {
  const transport = fixtureTransport([{ readTime: '2026-10-10T00:00:00Z' }]); const db = createFirestore({ env, fetchImpl: transport.fetchImpl });
  const base = db.collection('kairosAnalytics'); await base.where('expiresAt', '<=', new Date(0)).limit(400).get();
  const empty = await base.limit(1).get(); assert.equal(empty.empty, true); assert.equal(empty.size, 0);
  assert.equal(transport.calls[1].body.structuredQuery.where, undefined);
});

test('Firestore adapter refuses privileged access outside analytics and malformed returned paths', async () => {
  const transport = fixtureTransport([{ document: { name: `${prefix}/users/admin`, fields: {} } }]); const db = createFirestore({ env, fetchImpl: transport.fetchImpl });
  assert.throws(() => db.collection('users'), /collection/i); await assert.rejects(db.collection('kairosAnalytics').limit(1).get(), /document/i);
  assert.throws(() => db.batch().delete({ name: `${prefix}/users/admin` }), /document/i);
  assert.throws(() => db.collection('kairosAnalytics').limit(10001), /limit/i);
});

test('Firestore access tokens refresh before expiry and configurations stay isolated', async () => {
  let time = Date.now(); const transport = fixtureTransport([]); const db = createFirestore({ env, fetchImpl: transport.fetchImpl, now: () => time });
  await db.collection('kairosAnalytics').limit(1).get(); time += 3550 * 1000; await db.collection('kairosAnalytics').limit(1).get(); assert.equal(transport.oauthCalls, 2);
  const urls = [];
  const otherEnv = { ...env, FIREBASE_PROJECT_ID: 'other-project' };
  const getDb = config => createFirestore({ env: config, fetchImpl: async (url, options) => {
    if (url.endsWith('/token')) return Response.json({ access_token: config.FIREBASE_PROJECT_ID, expires_in: 3600 });
    assert.equal(options.headers.Authorization, `Bearer ${config.FIREBASE_PROJECT_ID}`); urls.push(url); return Response.json([]);
  } });
  await Promise.all([getDb(env), getDb(otherEnv)].map(item => item.collection('kairosAnalytics').limit(1).get()));
  assert.ok(urls.some(url => url.includes('/fixture-project/'))); assert.ok(urls.some(url => url.includes('/other-project/')));
});

test('Firestore configuration and upstream failures do not expose credentials', async () => {
  assert.throws(() => createFirestore({ env: {} }), /configured/i);
  const transport = fixtureTransport([]);
  const db = createFirestore({ env, fetchImpl: async (url, options) => url.endsWith('/token') ? transport.fetchImpl(url, options) : new Response('secret server details', { status: 403 }) });
  await assert.rejects(db.collection('kairosAnalytics').limit(1).get(), error => /403/.test(error.message) && !error.message.includes('secret server'));
});
