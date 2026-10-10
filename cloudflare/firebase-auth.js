import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google's Secure Token signing keys; never accept a key URL supplied by a JWT.
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), { timeoutDuration: 10000 });

export function createFirebaseAuth({ projectId, keySet = googleKeys }) {
  if (!projectId) throw new Error('Firebase project ID is required.');
  return {
    async verifyIdToken(token) {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ['RS256'], audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
        requiredClaims: ['exp', 'iat', 'sub', 'auth_time']
      });
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 ||
          !Number.isFinite(payload.iat) || payload.iat > now ||
          !Number.isFinite(payload.auth_time) || payload.auth_time > now) {
        throw new Error('Invalid Firebase ID token claims.');
      }
      return { ...payload, uid: payload.sub };
    }
  };
}
