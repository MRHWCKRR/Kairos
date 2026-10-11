import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/ai.js';
import { aiIdentity, aiHeaders, aiBody, responseRecorder } from './helpers/server-fixtures.mjs';

test('OpenRouter uses server-owned model, credentials and cost controls', async () => {
  let sent;
  const handler = createHandler({ ...aiIdentity, env: { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'router-key', AI_MODEL: 'openai/gpt-oss-120b', KAIROS_RELAY_SECRET: 'legacy-key' },
    fetchImpl: async (url, options) => { sent = { url, ...options }; return Response.json({ choices: [{ message: { content: 'hello' } }] }); } });
  const res = responseRecorder();
  await handler({ method: 'POST', headers: aiHeaders, body: { ...aiBody, model: 'expensive', provider: { data_collection: 'allow' }, max_tokens: 999999 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(sent.headers.Authorization, 'Bearer router-key');
  const payload = JSON.parse(sent.body);
  assert.equal(payload.model, 'openai/gpt-oss-120b');
  assert.equal(payload.max_tokens, 2048);
  assert.deepEqual(payload.reasoning, { effort: 'low' });
  assert.deepEqual(payload.provider, { data_collection: 'deny', max_price: { prompt: 0.4, completion: 3 } });
});

test('OpenRouter missing key never uses the legacy provider or reserves usage', async () => {
  let calls = 0, reservations = 0;
  const handler = createHandler({ ...aiIdentity, env: { AI_PROVIDER: 'openrouter', KAIROS_RELAY_SECRET: 'legacy-key' },
    dailyBudget: { async reserve() { reservations++; return { allowed: true }; } }, fetchImpl: async () => { calls++; return Response.json({}); } });
  const res = responseRecorder(); await handler({ method: 'POST', headers: aiHeaders, body: aiBody }, res);
  assert.equal(res.statusCode, 503); assert.equal(calls, 0); assert.equal(reservations, 0);
});

test('provider errors do not expose upstream diagnostics or retry', async () => {
  let calls = 0;
  const handler = createHandler({ ...aiIdentity, env: { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'key' },
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'private routing diagnostic' } }, { status: 402 }); } });
  const res = responseRecorder(); await handler({ method: 'POST', headers: aiHeaders, body: aiBody }, res);
  assert.equal(res.statusCode, 503); assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(res.body), /private routing/);
});
