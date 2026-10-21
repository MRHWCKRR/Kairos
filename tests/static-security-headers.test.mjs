import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const expected = new Map([
  ['Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY']
]);

test('Vercel rollback keeps the static response security policy', async () => {
  const config = JSON.parse(await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = config.headers.find(item => item.source === '/(.*)');
  assert.ok(rule, 'Vercel needs a wildcard security-header rule');
  const actual = new Map(rule.headers.map(item => [item.key, item.value]));
  assert.deepEqual(actual, expected);
  for (const source of ['/analytics.html', '/analytics-dashboard.js']) {
    const privateRule = config.headers.find(item => item.source === source);
    assert.equal(privateRule?.headers.find(item => item.key === 'Cache-Control')?.value, 'no-store, max-age=0');
  }
});
