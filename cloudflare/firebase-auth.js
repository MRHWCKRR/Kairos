import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google's Secure Token signing keys; never accept a key URL supplied by a JWT.
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), { timeoutDuration: 10000 });
const appCheckKeys = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'), { timeoutDuration: 10000, cacheMaxAge: 6 * 3600000 });

export function createFirebaseAppCheck({ projectNumber, appId, keySet = appCheckKeys }) {
  if (!/^\d+$/.test(projectNumber || '') || !appId) throw Error('App Check configuration is required.');
  return {
    async verifyToken(token) {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ['RS256'], typ: 'JWT',
        issuer: `https://firebaseappcheck.googleapis.com/${projectNumber}`,
        audience: `projects/${projectNumber}`, requiredClaims: ['exp', 'iat', 'sub']
      });
      if (payload.sub !== appId || !Number.isFinite(payload.iat) || payload.iat > Math.floor(Date.now() / 1000)) throw Error('Invalid App Check claims.');
      return payload;
    }
  };
}

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
