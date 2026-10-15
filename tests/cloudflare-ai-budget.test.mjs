import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { createFirestore } from '../cloudflare/firebase-firestore.js';

const { privateKey } = await generateKeyPair('RS256', { extractable: true });
const env = { FIREBASE_PROJECT_ID: 'fixture-project', FIREBASE_CLIENT_EMAIL: 'fixture@example.test', FIREBASE_PRIVATE_KEY: await exportPKCS8(privateKey), ANALYTICS_HASH_SECRET: 'test-only-hash', AI_BUDGET_SCOPE: 'preview' };
const name = 'projects/fixture-project/databases/(default)/documents/kairosAiUsage/preview';

// Model only the external Firestore API: conditional commits are atomic, reads are snapshots.
function storageFixture({ readBarrier = 0 } = {}) {
  let document, version = 0, conflicts = 0, fail = false;
  let reads = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const writes = [];
  return {
    get document() { return document; }, get writes() { return writes; }, get conflicts() { return conflicts; },
    corrupt(fields) { document = { name, fields, updateTime: '2026-01-01T00:00:01.000000Z' }; },
    fail() { fail = true; },
    async fetchImpl(url, options) {
      if (url.endsWith('/token')) return Response.json({ access_token: 'fixture', expires_in: 3600 });
      if (fail) return Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 });
      if (options.method === 'GET') {
        assert.equal(url, 'https://firestore.googleapis.com/v1/' + name);
        const snapshot = document ? structuredClone(document) : null;
        if (readBarrier && reads++ < readBarrier) { if (reads === readBarrier) release(); await gate; }
        return snapshot ? Response.json(snapshot) : Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
      }
      assert.ok(url.endsWith('/documents:commit'));
      const [write] = JSON.parse(options.body).writes;
      assert.equal(write.update?.name || write.delete, name);
      const matches = document ? write.currentDocument.updateTime === document.updateTime : write.currentDocument.exists === false;
      if (!matches) { conflicts++; return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 }); }
      version++;
      document = write.delete ? undefined : { ...structuredClone(write.update), updateTime: `2026-01-01T00:00:${String(version).padStart(2, '0')}.000000Z` };
      writes.push(structuredClone(write));
      return Response.json({ writeResults: [{}], commitTime: `2026-01-01T00:00:${String(version).padStart(2, '0')}.000000Z` });
    }
  };
}

function database(storage, config = {}, clock = () => Date.parse('2026-10-11T00:00:00Z')) {
  return createFirestore({ env: { ...env, ...config }, fetchImpl: storage.fetchImpl, now: clock });
}

test('persistent account budget survives new service instances and blocks request 101', async () => {
  const storage = storageFixture(); let db = database(storage);
  for (let i = 0; i < 100; i++) assert.equal((await db.reserveAiUsage?.('one'))?.allowed, true);
  db = database(storage);
  const limited = await db.reserveAiUsage('one');
  assert.equal(limited.allowed, false); assert.equal(limited.reason, 'account'); assert.equal(storage.writes.length, 100);
  assert.equal(limited.resetsAt, '2026-10-11T14:00:00.000Z'); assert.equal(limited.retryAfter, 50400);
  assert.doesNotMatch(JSON.stringify(storage.document), /test-only-hash|"one"/);
});

test('site cap applies across accounts and cannot partially spend an account allowance', async () => {
  const storage = storageFixture(), db = database(storage, { AI_DAILY_SITE_LIMIT: '2' });
  assert.equal((await db.reserveAiUsage?.('a'))?.allowed, true);
  assert.equal((await db.reserveAiUsage('b')).allowed, true);
  assert.equal((await db.reserveAiUsage('c')).reason, 'site');
  assert.equal(storage.document.fields.total.integerValue, '2'); assert.equal(storage.writes.length, 2);
});

test('midnight Brisbane resets both caps and discards previous account pseudonyms', async () => {
  let time = Date.parse('2026-10-11T13:59:59.000Z');
  const storage = storageFixture(), db = database(storage, { AI_DAILY_ACCOUNT_LIMIT: '1', AI_DAILY_SITE_LIMIT: '1' }, () => time);
  assert.equal((await db.reserveAiUsage?.('a'))?.allowed, true);
  const oldKey = Object.keys(storage.document.fields.accounts.mapValue.fields)[0];
  assert.equal((await db.reserveAiUsage('a')).allowed, false);
  time = Date.parse('2026-10-11T14:00:00.000Z');
  assert.equal((await db.reserveAiUsage('a')).allowed, true);
  assert.equal(storage.document.fields.day.stringValue, '2026-10-12'); assert.equal(storage.document.fields.total.integerValue, '1');
  assert.equal(Object.hasOwn(storage.document.fields.accounts.mapValue.fields, oldKey), false);
});

test('concurrent reservations cannot overspend the final site credit', async () => {
  const storage = storageFixture({ readBarrier: 5 }), db = database(storage, { AI_DAILY_SITE_LIMIT: '1' });
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => db.reserveAiUsage?.('u' + i)));
  assert.equal(results.filter(r => r?.allowed).length, 1); assert.equal(storage.writes.length, 1);
  assert.ok(storage.conflicts > 0);
});

test('counter failure and corrupted snapshots never reset a spent budget', async () => {
  const storage = storageFixture(), db = database(storage);
  assert.equal((await db.reserveAiUsage?.('u'))?.allowed, true);
  storage.corrupt({ day: { stringValue: '2026-10-11' }, total: { integerValue: '-1' }, accounts: { mapValue: { fields: {} } } });
  await assert.rejects(db.reserveAiUsage('u'), /counter/i);
  storage.fail(); await assert.rejects(db.reserveAiUsage('u'), /403/);
  assert.equal(storage.writes.length, 1);
});

test('invalid server policy and missing hash secret fail closed', async () => {
  for (const config of [{ AI_DAILY_ACCOUNT_LIMIT: '0' }, { AI_DAILY_SITE_LIMIT: 'garbage' }, { AI_DAILY_SITE_LIMIT: '99999999' }, { AI_BUDGET_SCOPE: 'users/admin' }, { ANALYTICS_HASH_SECRET: '' }]) {
    const storage = storageFixture(), db = database(storage, config);
    assert.equal(typeof db.reserveAiUsage, 'function');
    await assert.rejects(db.reserveAiUsage('u')); assert.equal(storage.writes.length, 0);
  }
});

test('daily cleanup removes old account pseudonyms without deleting current allowances', async () => {
  let time = Date.parse('2026-10-11T00:00:00Z');
  const storage = storageFixture(), db = database(storage, {}, () => time);
  await db.reserveAiUsage('one');
  assert.equal(await db.clearExpiredAiUsage?.(), 0); assert.ok(storage.document);
  time = Date.parse('2026-10-11T14:00:00Z');
  assert.equal(await db.clearExpiredAiUsage(), 1); assert.equal(storage.document, undefined);
  assert.equal(await db.clearExpiredAiUsage(), 0);
});
