import { createHandler as createAi } from '../server/ai.js';
import { createHandler as createTrack } from '../server/track.js';
import { createHandler as createAnalytics } from '../server/analytics.js';
import { createHandler as createCleanup, clearExpiredAnalytics } from '../server/cleanup-analytics.js';
import { createFirebaseServices } from './firebase-services.js';
import { invokeHandler, jsonResponse } from './http-adapter.js';
import { createBillingHandlers } from '../server/billing.js';
import { createStripeClient } from '../server/stripe-client.js';
import { handleStripeWebhook } from '../server/billing-webhook.js';

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
      const appCheck = { verifyToken(token) { return createServices(env).appCheck.verifyToken(token); } };
      if (path.startsWith('/api/billing/')) {
        try {
          const store = { scope: env.AI_BUDGET_SCOPE || 'production' };
          for (const method of ['readAccount','readUsage','readMapping','saveMapping','withAccountLease','customerUid','applyBillingSnapshot','markDeleting','completeDeletion','redeemCode','issueCode','revokeCode'])
            store[method] = (...args) => createServices(env).billingStore[method](...args);
          const stripe = createStripeClient(env, {store,fetchImpl});
          if (path === '/api/billing/webhook') return handleStripeWebhook(request,{env,stripe,store});
          const billing = createBillingHandlers({env,store,stripe,adminAuth,appCheck,rateLimiter:env.BILLING_RATE_LIMITER,
            usage:(uid,access)=>createServices(env).db.readAiUsage(uid,access)});
          const routes = {status:billing.status,checkout:billing.checkout,portal:billing.portal,redeem:billing.redeem,
            'delete-account':billing.deleteAccount,'codes/issue':billing.issueCode,'codes/revoke':billing.revokeCode};
          const route = path.slice('/api/billing/'.length);
          const action = Object.hasOwn(routes,route) ? routes[route] : null;
          return action ? action(request) : jsonResponse({error:'Not Found'},404);
        } catch { return jsonResponse({error:'Plan service is temporarily unavailable.'},503); }
      }
      let handler;
      let maxBodyBytes = 1024 * 1024;
      const clientMetadata = { ip: request.headers.get('cf-connecting-ip') || 'unknown', country: request.cf?.country || '' };
      switch (path) {
        case '/api/ai': handler = createAi({ env, adminAuth, appCheck, rateLimiter: env.AI_RATE_LIMITER,
          dailyBudget: { reserve(uid) { return createServices(env).db.reserveAiUsage(uid); } }, fetchImpl }); maxBodyBytes = 128 * 1024; break;
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
      await createServices(env).db.clearExpiredAiUsage();
    }
  };
}

export default createWorker();
