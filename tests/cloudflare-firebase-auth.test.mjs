import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createFirebaseAuth } from '../cloudflare/firebase-auth.js';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
const keys = createLocalJWKSet({ keys: [jwk] });
const auth = createFirebaseAuth({ projectId: 'fixture-project', keySet: keys });
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'admin', aud: 'fixture-project', iss: 'https://securetoken.google.com/fixture-project', iat: now - 5, auth_time: now - 60, exp: now + 3600 };
const sign = (payload, key = privateKey, header = { alg: 'RS256', kid: 'fixture-key' }) => new SignJWT(payload).setProtectedHeader(header).sign(key);

test('Firebase verifier accepts a correctly signed project token and derives uid', async () => {
  assert.equal((await auth.verifyIdToken(await sign(claims))).uid, 'admin');
});

test('Firebase verifier rejects bad signatures, keys and algorithms', async () => {
  const token = await sign(claims);
  const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: 'intruder' })).toString('base64url');
  await assert.rejects(auth.verifyIdToken(parts.join('.')));
  const other = await generateKeyPair('RS256'); await assert.rejects(auth.verifyIdToken(await sign(claims, other.privateKey)));
  await assert.rejects(auth.verifyIdToken(await sign(claims, new TextEncoder().encode('fixture'), { alg: 'HS256' })));
});

test('Firebase verifier rejects wrong project, invalid subjects and invalid time claims', async () => {
  const variants = [
    { aud: 'other' }, { iss: 'https://securetoken.google.com/other' }, { exp: now - 10 },
    { sub: '' }, { sub: 'x'.repeat(129) }, { sub: undefined },
    { iat: undefined }, { iat: now + 3600 }, { auth_time: undefined }, { auth_time: now + 3600 },
    { exp: undefined }, { auth_time: 'invalid' }
  ];
  for (const patch of variants) await assert.rejects(auth.verifyIdToken(await sign({ ...claims, ...patch })), JSON.stringify(patch));
});

test('Firebase verifier fails closed without a project id', () => {
  assert.throws(() => createFirebaseAuth({ projectId: '', keySet: keys }), /project/i);
});
