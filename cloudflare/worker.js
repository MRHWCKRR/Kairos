import { createHandler as createAi } from '../server/ai.js';
import { createHandler as createTrack } from '../server/track.js';
import { createHandler as createAnalytics } from '../server/analytics.js';
import { createHandler as createCleanup, clearExpiredAnalytics } from '../server/cleanup-analytics.js';
import { createFirebaseServices } from './firebase-services.js';
import { invokeHandler, jsonResponse } from './http-adapter.js';

export function createWorker({ createServices = createFirebaseServices, fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (path !== '/api' && !path.startsWith('/api/')) {
        if (path === '/') {
          const url = new URL(request.url); url.pathname = '/index.html';
          return env.ASSETS.fetch(new Request(url, request));
        }
        return env.ASSETS.fetch(request);
      }
      // Lazy services let static pages and method/auth errors work without secrets.
      const db = {
        collection(name) { return createServices(env).db.collection(name); },
        batch() { return createServices(env).db.batch(); }
      };
      const adminAuth = { verifyIdToken(token) { return createServices(env).adminAuth.verifyIdToken(token); } };
      let handler;
      let maxBodyBytes = 1024 * 1024;
      const clientMetadata = { ip: request.headers.get('cf-connecting-ip') || 'unknown', country: request.cf?.country || '' };
      switch (path) {
        case '/api/ai': handler = createAi({ env, fetchImpl }); break;
        case '/api/track':
          handler = createTrack({ env, db, getClientMetadata: req => req.clientMetadata }); maxBodyBytes = 2048; break;
        case '/api/analytics': handler = createAnalytics({ env, db, adminAuth }); break;
        case '/api/cleanup-analytics': handler = createCleanup({ env, db, deadlineMs: Date.now() + 25000 }); break;
        default: return jsonResponse({ error: 'Not Found' }, 404);
      }
      try {
        return await invokeHandler(handler, request, { maxBodyBytes, clientMetadata });
      } catch {
        console.error(JSON.stringify({ event: 'kairos_api_failed', path }));
        return jsonResponse({ error: 'Service unavailable' }, 503);
      }
    },
    async scheduled(_controller, env) {
      // Reject on failure so the platform reports an unsuccessful scheduled run.
      await clearExpiredAnalytics(createServices(env).db, { deadlineMs: Date.now() + 10 * 60000 });
    }
  };
}

export default createWorker();
