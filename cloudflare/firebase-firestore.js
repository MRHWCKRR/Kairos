import { importPKCS8, SignJWT } from 'jose';

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const FIELDS = new Set(['visitorId', 'day', 'timestamp', 'expiresAt', 'page', 'referrer', 'country', 'device', 'os', 'browser']);

function encodeValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  throw new Error('Unsupported analytics field value.');
}

function decodeValue(value) {
  if ('timestampValue' in value) {
    const date = new Date(value.timestampValue);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid analytics timestamp.');
    return { toDate: () => new Date(date) };
  }
  if ('stringValue' in value) return value.stringValue;
  if ('nullValue' in value) return null;
  throw new Error('Unsupported analytics field type.');
}

// This is intentionally a narrow analytics adapter, not a browser or general SDK.
export function createFirestore({ env, fetchImpl = fetch, now = Date.now }) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const email = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !email || !privateKey || !/^[a-zA-Z0-9-]+$/.test(projectId)) {
    throw new Error('Firebase service-account environment variables are not configured.');
  }
  const database = `projects/${projectId}/databases/(default)`;
  const documents = `${database}/documents`;
  const documentPrefix = `${documents}/kairosAnalytics/`;
  const baseUrl = `https://firestore.googleapis.com/v1/${documents}`;
  // Only settled token data is cached. Never share an in-flight fetch between requests.
  let token = null;
  let expiresAt = 0;

  function validateDocument(name) {
    if (typeof name !== 'string' || !name.startsWith(documentPrefix) ||
        !/^[a-zA-Z0-9_-]+$/.test(name.slice(documentPrefix.length))) {
      throw new Error('Invalid analytics document path.');
    }
    return name;
  }

  async function accessToken() {
    if (token && now() < expiresAt - 60000) return token;
    const key = await importPKCS8(privateKey, 'RS256');
    const seconds = Math.floor(now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(email)
      .setAudience(OAUTH_URL).setIssuedAt(seconds).setExpirationTime(seconds + 3600).sign(key);
    const response = await fetchImpl(OAUTH_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Firebase credential exchange failed (${response.status}).`);
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 60) {
      throw new Error('Firebase credential exchange returned an invalid token.');
    }
    token = data.access_token; expiresAt = now() + data.expires_in * 1000;
    return token;
  }

  async function request(url, body) {
    const response = await fetchImpl(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Firebase analytics request failed (${response.status}).`);
    return response.json();
  }

  function query({ filter, order, count = 400 } = {}) {
    return {
      where(field, op, value) {
        if (filter || !((field === 'timestamp' && op === '>=') || (field === 'expiresAt' && op === '<=')) || !(value instanceof Date)) {
          throw new Error('Unsupported analytics query filter.');
        }
        return query({ filter: { field, op, value }, order, count });
      },
      orderBy(field, direction) {
        if (field !== 'timestamp' || direction !== 'desc') throw new Error('Unsupported analytics query order.');
        return query({ filter, order: { field, direction }, count });
      },
      limit(value) {
        if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error('Invalid analytics query limit.');
        return query({ filter, order, count: value });
      },
      async add(data) {
        const fields = {};
        for (const [key, value] of Object.entries(data)) {
          if (!FIELDS.has(key)) throw new Error('Unsupported analytics field.');
          fields[key] = encodeValue(value);
        }
        const result = await request(`${baseUrl}/kairosAnalytics`, { fields });
        validateDocument(result.name);
        return { id: result.name.slice(documentPrefix.length), name: result.name };
      },
      async get() {
        const structuredQuery = { from: [{ collectionId: 'kairosAnalytics' }] };
        if (filter) structuredQuery.where = { fieldFilter: {
          field: { fieldPath: filter.field }, op: filter.op === '>=' ? 'GREATER_THAN_OR_EQUAL' : 'LESS_THAN_OR_EQUAL', value: encodeValue(filter.value)
        } };
        if (order) structuredQuery.orderBy = [{ field: { fieldPath: order.field }, direction: 'DESCENDING' }];
        structuredQuery.limit = count;
        const result = await request(`${baseUrl}:runQuery`, { structuredQuery });
        if (!Array.isArray(result)) throw new Error('Invalid analytics query response.');
        const docs = result.filter(item => item.document).map(({ document }) => {
          validateDocument(document.name);
          const data = Object.fromEntries(Object.entries(document.fields || {}).filter(([key]) => FIELDS.has(key)).map(([key, value]) => [key, decodeValue(value)]));
          return { id: document.name.slice(documentPrefix.length), ref: { name: document.name }, data: () => data };
        });
        if (docs.length > count) throw new Error('Analytics query exceeded requested limit.');
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    };
  }

  return {
    collection(name) { if (name !== 'kairosAnalytics') throw new Error('Unsupported analytics collection.'); return query(); },
    batch() {
      const writes = [];
      return {
        delete(ref) {
          if (writes.length >= 400) throw new Error('Analytics deletion batch exceeded 400 documents.');
          writes.push({ delete: validateDocument(ref?.name) });
        },
        async commit() { if (writes.length) await request(`https://firestore.googleapis.com/v1/${database}/documents:commit`, { writes }); }
      };
    }
  };
}
