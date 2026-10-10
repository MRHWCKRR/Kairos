export function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

// An in-memory collection exercises handlers without writing production analytics.
export function fixtureDb(initial = []) {
  const rows = new Map(initial.map((row, i) => [String(i), { ...row }]));
  const commits = [];
  let nextId = initial.length;
  function query(filters = [], order = null, count = Infinity) {
    return {
      where(field, op, value) { return query([...filters, [field, op, value]], order, count); },
      orderBy(field, direction) { return query(filters, [field, direction], count); },
      limit(value) { return query(filters, order, value); },
      async add(data) { const id = String(nextId++); rows.set(id, data); return { id }; },
      async get() {
        let matches = [...rows].filter(([, row]) => filters.every(([field, op, value]) => op === '<=' ? row[field] <= value : row[field] >= value));
        if (order) matches.sort((a, b) => (a[1][order[0]] - b[1][order[0]]) * (order[1] === 'desc' ? -1 : 1));
        const docs = matches.slice(0, count).map(([id, data]) => ({ id, ref: { id }, data: () => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof Date ? { toDate: () => v } : v])) }));
        return { docs, size: docs.length, empty: !docs.length };
      }
    };
  }
  return {
    rows, commits,
    collection(name) { if (name !== 'kairosAnalytics') throw Error('Unexpected collection'); return query(); },
    batch() { const ids = []; return { delete(ref) { ids.push(ref.id); }, async commit() { commits.push(ids.length); ids.forEach(id => rows.delete(id)); } }; }
  };
}

export const aiIdentity = {
  adminAuth: { async verifyIdToken() { return { uid: 'fixture-user', email_verified: true }; } },
  appCheck: { async verifyToken() {} },
  rateLimiter: { async limit() { return { success: true }; } }
};
export const aiHeaders = { authorization: 'Bearer fixture-token', 'x-firebase-appcheck': 'fixture-app' };
export const aiBody = { messages: [{ role: 'user', content: 'hello' }] };
