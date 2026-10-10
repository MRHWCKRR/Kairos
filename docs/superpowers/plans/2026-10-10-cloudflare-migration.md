# Kairos Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prepare a tested Cloudflare replacement for Kairos hosting, all four server endpoints, and analytics cleanup, with production cutover reserved for owner review.

**Architecture:** Keep the browser app and Firebase data unchanged. Share endpoint logic between thin Vercel adapters and a Cloudflare Worker, using a narrow Firebase HTTPS adapter for Workers. Publish an explicit set of browser assets from a reproducible `dist/` build.

**Tech Stack:** Vanilla JavaScript; Node tests; Firebase Auth/Firestore; Cloudflare Workers/Static Assets; Wrangler 4; jose 6 for signed JWT handling. Pin resolved dependencies in a lockfile; retain Firebase Admin for Vercel rollback.

**Spec:** `docs/superpowers/specs/2026-10-10-cloudflare-migration-design.md` (approved 10 October 2026).

## Global Constraints

- Work on `codex/cloudflare-migration`; do not deploy from or commit to main during preparation.
- Preserve `/api/ai`, `/api/track`, `/api/analytics`, `/api/cleanup-analytics`, their methods, JSON contracts, and access controls.
- Preserve Firebase project `kairos-1a`, its browser configuration, email verification, account deletion, App Check, and Firestore schema.
- Preserve Hack Club AI endpoint, `qwen/qwen3-32b`, and `stream: false`.
- Preserve tracking's 2 KB body limit, daily HMAC visitor ID, bot filter, 90-day retention, dashboard cap of 10,000 events, and deletion batches of 400.
- Preserve UTC cron expression `0 3 * * *`; enable production cleanup only after preview checks.
- Keep credentials in runtime secrets. No credentials, server modules, tests, tooling, documentation, or Google Apps Script source in published assets.
- Preserve `.html` links, Schedule 3.0 transforms, media assets, and analytics no-store headers.
- Keep Vercel rollback operational. No UI/framework/database/CAPTCHA/AI-provider migration.

## Review Focus

- A browser request with forged forwarded-IP/country headers must not override trusted Cloudflare metadata (Task 3).
- A signed token for another Firebase project, or with invalid time claims, must not unlock analytics (Task 2).
- Simultaneous requests with different configurations must never mix service-account credentials or admin identities (Tasks 1–2).
- Interrupted multi-batch cleanup must report failure and be safe to resume, without deleting unexpired data (Tasks 1–3).
- A successful build must not mutate tracked source or expose newly added server/tooling JavaScript as public assets (Task 4).

## Task 1: Extract shared endpoint logic without changing Vercel behaviour

**Files:** Create `server/ai.js`, `server/track.js`, `server/analytics.js`, `server/cleanup-analytics.js`; modify the four corresponding `api/*.js` entrypoints; test `tests/server-handlers.test.mjs`, with helpers in `tests/helpers/server-fixtures.mjs`.

**Interfaces:** Each shared module exports `createHandler({ env, db, adminAuth, fetchImpl, getClientMetadata })` using only the services that endpoint needs. It returns `async handler(req, res)`, where `req` has `method`, `headers`, `query`, and `body`, and `res` supports chainable `status`, `setHeader`, `json`, and `end`. `cleanup-analytics.js` additionally exports `clearExpiredAnalytics(db, { deadlineMs = Infinity } = {}) -> Promise<number>`; a deadline breach throws and never returns a misleading total. `getClientMetadata(req)` returns `{ ip, country }`. Dependencies remain request-local; no mutable global configuration.

- [ ] Write behavioural tests using real handler code and in-memory fixture events. Assert: AI forwards only the existing payload/model fields with a backend key; method mismatch is 405; missing key is 503; fetch failure is 502. Tracking ignores bots, stores dates/90-day expiry, and excludes raw IP. Dashboard returns 401 without the exact verified admin UID and returns the existing aggregate shape for authorised fixtures. Cleanup selects `expiresAt <= now`, batches at 400, checks the HTTP cron secret, and reports interrupted deletion as failure.
- [ ] Run `node --test tests/server-handlers.test.mjs`; observe failures caused by missing shared handlers.
- [ ] Extract the existing endpoint logic into the declared factories, replacing `process.env` references with `env` and injecting Firebase dependencies. Use Web Crypto for the HMAC so shared logic is portable; compare its output against an independently computed Node HMAC fixture. Keep the same response shapes and fallback handling.
- [ ] Keep existing Vercel Firebase Admin initialisation in `api/_firebaseAdmin.js`; Vercel wrappers supply its `db`/`adminAuth` and trusted Vercel metadata. Keep tracking's exported bodyParser configuration. Test concurrent handlers with two distinct secret/admin configurations and assert each stays isolated.
- [ ] Run `node --test tests/*.test.mjs`; commit the passing extraction as `refactor: share Kairos server endpoint logic`.

## Task 2: Add the Firebase HTTPS compatibility boundary

**Files:** Create `cloudflare/firebase-auth.js`, `cloudflare/firebase-firestore.js`, `cloudflare/firebase-services.js`; modify `package.json` and create its lockfile; test `tests/cloudflare-firebase-auth.test.mjs`, `tests/cloudflare-firestore.test.mjs`.

**Interfaces:** `createFirebaseAuth({ projectId, keySet }) -> { verifyIdToken(token): Promise<{ uid, ...claims }> }`; production `keySet` is a jose remote key set at Google's Secure Token signing-key URL. `createFirestore({ env, fetchImpl = fetch }) -> db` implements only `collection('kairosAnalytics').add(data)`, immutable chainable `where(field, op, date)`, `orderBy(field, direction)`, `limit(number)`, `get()`, and `batch().delete(ref)/commit()`. A snapshot has `docs`, `size`, and `empty`; documents have `id`, `ref`, and `data()`; decoded timestamps expose `toDate()`. `createFirebaseServices(env)` returns `{ db, adminAuth }` consumed by Tasks 1 and 3. Restrict this adapter to the analytics collection and its required fields/operators; do not build a generic database SDK.

- [ ] Write real RSA-signed token tests with a local key set: valid admin token, tampered signature, wrong key, wrong algorithm, expiry, wrong audience/issuer, missing/future `iat`, missing/future `auth_time`, and empty/overlong subject. Assert rejection for each invalid token and UID extraction from valid `sub`.
- [ ] Write HTTPS-boundary tests that validate exact Firestore/OAuth URLs, headers and request bodies against hand-written fixtures, then return documented Firebase response fixtures. Verify UTC timestamp encoding/decoding, ordered/limited query results, empty snapshots, create-event output, commit deletion payloads, API failure handling, access-token reuse/expiry, and credential-isolated concurrent calls. Verify short-lived service-account assertions with their public key rather than just decoding them.
- [ ] Run the two new test files and observe the missing adapter failures.
- [ ] Add jose and Wrangler for JWT verification/signing and actual Workers verification. Implement service-account OAuth exchange at Google's token endpoint with the datastore scope. Cache short-lived tokens by credentials with refresh before expiry; fail closed on missing/invalid configuration. Never log JWTs, keys, OAuth responses, or event payloads.
- [ ] Implement only the Firestore operations declared above through documented REST endpoints, preserving timestamp field types, query semantics, and 400-document batch deletion. Validate returned document paths before using them in a privileged delete.
- [ ] Run both adapter tests and `node --test tests/*.test.mjs`; commit as `feat: add Firebase HTTPS adapters for Workers`.

## Task 3: Add Worker routing, request handling, and scheduled cleanup

**Files:** Create `cloudflare/worker.js`, `cloudflare/http-adapter.js`, `wrangler.jsonc`; test `tests/cloudflare-worker.test.mjs`.

**Interfaces:** `createWorker({ createServices = createFirebaseServices, fetchImpl = fetch } = {}) -> { fetch(request, env, ctx), scheduled(controller, env, ctx) }`; the module default export is `createWorker()`. `invokeHandler(handler, request, { maxBodyBytes, clientMetadata }) -> Promise<Response>` converts Fetch objects into Task 1's handler contract, reading body streams with a byte limit instead of buffering unlimited input. Production metadata derives from Cloudflare's client-IP header and `request.cf.country`; never reuse spoofable forwarded/Vercel headers. Scheduled execution invokes the cleanup function directly and propagates failure to the platform.

- [ ] Write Fetch-level tests that assert static delegation, exact API routing, unknown API 404, 405/Allow headers, 401 admin rejection, 503 missing relay key, malformed JSON 400, oversized tracking body 413, valid empty-body cases, preserved response/cache headers, and no wildcard CORS. Exercise chunked oversized input with no Content-Length. Assert a forged forwarded-IP/country cannot change a stored event's trusted metadata.
- [ ] Write scheduled-handler tests with expired and fresh fixture events. Assert only expired documents are deleted, no HTTP cron secret is needed for internal scheduled invocation, and interruption/upstream failure rejects. Assert the public cleanup URL still requires the correct cron secret.
- [ ] Run `node --test tests/cloudflare-worker.test.mjs` and observe missing Worker failures.
- [ ] Implement the adapters using Tasks 1–2. Cap AI bodies at 1 MiB, preserving normal payload fields; tracking remains 2 KB. Lazy-create Firebase services for analytics routes so absent service-account secrets cannot prevent static serving or AI method errors. Apply no-store to API responses. Give cleanup an explicit runtime deadline with thrown failure when incomplete.
- [ ] Configure `main: cloudflare/worker.js`, provisional `name: kairos-web`, an ASSETS binding at `dist/`, API-first routes, HTML handling `none`, normal 404 handling, and the 03:00 UTC cron. Supply a named preview environment with no cron and no production domain routes; preview credentials are separately configured. Do not overwrite the older Kairos relay Worker.
- [ ] Run Worker and full repository tests; commit as `feat: add Cloudflare Worker endpoints and cleanup`.

## Task 4: Build only browser assets without source mutation

**Files:** Create `cloudflare/build.js`, `cloudflare/public-assets.json`, `cloudflare/_headers`, `.gitignore`; modify `package.json`, `.github/workflows/schedule-build.yml`; test `tests/cloudflare-build.test.mjs`. Leave the existing Vercel `build.js` operational.

**Interfaces:** `buildCloudflare({ rootDir, outputDir }) -> Promise<void>`; direct CLI invocation builds the repository into `dist/`. `public-assets.json` enumerates every current root browser HTML/CSS/JS file explicitly and the four media directories. Missing declared inputs fail the build. Output deletion is permitted only after resolving it to this repository's `dist/` or the test fixture's output directory.

- [ ] Write filesystem-fixture tests for same-origin AI rewriting, Schedule shell/bridge/import versions, tracker injection exactly once, source-file hash preservation, repeat-build byte equality, stale-output removal, media preservation, `.html` assets, and exclusions of API/server/Worker code, `.env`, `.dev.vars`, dependencies, tests, docs, and `waitlist/Code.gs`. Add a root server-tooling JS fixture and assert it remains unpublished.
- [ ] Run `node --test tests/cloudflare-build.test.mjs` and observe missing build failures.
- [ ] Implement build copying and transformation with the existing `build-transforms.js` exports. Add the analytics no-store headers to generated `_headers`. Reject output paths that could delete source, follow no untrusted directory symlinks, and copy only the explicit asset manifest.
- [ ] Add `test:cloudflare`, `build:cloudflare`, `dev:cloudflare`, and `deploy:cloudflare` scripts; build must test before packaging. Ignore `dist/`, `node_modules/`, `.wrangler/`, `.dev.vars*`, and local environment/credential files. CI runs the existing tests and the Cloudflare build; it does not deploy.
- [ ] Run all tests, build twice, and inspect Git status for unintended mutations. Verify a local Wrangler bundle with `npx wrangler deploy --dry-run --env preview`; commit as `feat: build Kairos static assets for Cloudflare`.

## Task 5: Verify the runtime and prepare a reviewable deployment

**Files:** Create `docs/cloudflare-migration.md`, `.dev.vars.example`, `tests/cloudflare-runtime.test.mjs`; update `README.md`, `analytics-setup.md`, and the plan status. Example secrets must be empty placeholders, never real values.

**Interfaces:** Deployment documentation names the seven existing required variables, separate preview credentials, exact build/deploy commands, Firebase authorised domains/reCAPTCHA checks, production cron enablement, custom-domain cutover, and Vercel rollback. The runtime test starts Wrangler preview locally with test-only configuration and closes the process in test teardown.

- [ ] Write local-runtime tests for landing/app/login static pages, media, unknown page/API 404, backend source exclusion, analytics no-store headers, AI 405/503, anonymous analytics 401, and unauthorised cleanup 401. Verify through real HTTP in workerd, not only the Node handler tests.
- [ ] Run the runtime test, then correct bundling/routing issues if it fails. Run the full test suite and Cloudflare build once more after any corrections. Review the branch diff for secrets, exposed source files, altered Firebase browser configuration, and rollback regressions.
- [ ] Document that the public AI relay currently lacks explicit per-user authentication/rate limiting; do not advertise migration as adding those protections. Preview testing must use owner-controlled access or a test upstream/key with bounded exposure. Production service-account credentials must not be casually shared with an unrestricted preview.
- [ ] Commit verified code/docs and create a draft PR from `codex/cloudflare-migration` to main. Attach it to this chat. A PR is preparation, not approval to merge or switch production traffic.
- [ ] When account access is available, connect the preview branch to Cloudflare Builds with `npm run build:cloudflare` and `npx wrangler deploy --env preview`. Configure secrets securely and exact Firebase/reCAPTCHA host allowances. Test signup/verification, verified login, Google popup login, save/reload, account deletion with a disposable account, concurrent chats, AI scheduling, private analytics, and cleanup on isolated fixtures.
- [ ] Report automated results separately from live results and list any account-dependent checks still outstanding. Present the actual preview and PR for production approval. Only then configure production secrets/cron/domain, merge and cut over, verify, and disable redundant Vercel automatic deployment. Keep the last Vercel deployment available for rollback.

## Plan review and execution

This plan implements the approved design; it does not yet represent completed code. Self-review checked spec coverage, interface consistency, failure cases, and separation of local versus account-dependent verification.

Recommended execution: **Native** — one implementer in this chat, completing each test cycle in order, followed by a fresh whole-branch review. The five tasks share interfaces closely, so sequential work avoids coordination overhead. **Subagent-driven** execution is also available if the owner prefers an independent implementer/reviewer cycle per task.

Awaiting owner review of this written plan and execution-method choice before product implementation, as required by the writing-plans skill.
