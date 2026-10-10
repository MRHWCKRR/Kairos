import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedText } from '../server/http-body.js';
import { createHandler } from '../server/ai.js';
import { responseRecorder, aiIdentity, aiHeaders, aiBody } from './helpers/server-fixtures.mjs';

test('Bounded reader accepts the byte boundary and cancels oversized streams', async () => {
  assert.equal(await readBoundedText(new Response('abcd'), 4), 'abcd');
  await assert.rejects(readBoundedText(new Response('abcde'), 4), error => error.status === 413);
  await assert.rejects(readBoundedText(new Response('😀'), 3), error => error.status === 413);
});

test('AI relay fails safely when an upstream response exceeds the memory bound', async () => {
  const handler = createHandler({ ...aiIdentity, env: { KAIROS_RELAY_SECRET: 'test' }, fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)) });
  const res = responseRecorder(); await handler({ method: 'POST', headers: aiHeaders, body: aiBody }, res); assert.equal(res.statusCode, 502); assert.deepEqual(res.body, { error: 'AI relay unavailable' });
});
