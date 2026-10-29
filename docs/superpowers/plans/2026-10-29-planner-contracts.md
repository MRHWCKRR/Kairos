# Planner contracts, extraction and packaged smoke plan

**Goal:** Implement the three follow-up engineering improvements approved in conversation after PR140.
**Architecture:** Retain vanilla JS, Firebase schema and security. Add gradual JSDoc contracts for real event/recurrence exports plus a checked JSON write guard. Extract coherent persistence/settings controllers with explicit host callbacks and one queue/state owner. Exercise generated modules over HTTP in headless Chrome.
**Base:** main 8e7339aaf758a240e95cad213d4064d369f6175c. Existing checkout mirrors deployed code; no prior work is reverted. Publish a focused PR, no automatic merge.

## Constraints

- Read-only sources remain untouched; no UI redesign, schema migration, auth/App Check/billing changes.
- Keep the existing shared queue, live arrays, ownership guards, lost-acknowledgement recovery and approved apply/Undo flows.
- No new dependency; TypeScript5.9.3 and esbuild0.28.2 already locked. Hosted CI supplies compiler/runtime when local sandbox cannot.

## Tasks

1. Define typed native event/recurrence inputs and checked planner JSON write validation. Attach JSDoc to existing exports; compiler negative fixtures reject missing/invalid fields. Runtime tests reject undefined, cycles and unsupported values before a transaction write, while preserving valid legacy fields and shared references.
2. Extract planner save/load orchestration and a coherent settings UI section into focused host-injected modules. Add tests for stale account loads, empty plans, one queue, same-owner updates and retained drafts; migrate source-slice tests deliberately.
3. Build a packaged HTTP smoke fixture with native module imports and lazy navigation, preserving final generated URLs. Test unavailable-module failure and successful desktop route loads with isolated dependencies. Include it in CI with existing browser journeys.

## Verification

Observe regression RED before implementation; run focused tests, lint/typechecks, full suite, Cloudflare build, existing and packaged Chrome journeys. Independent final diff review before marking PR ready. Report live App Check renewal and OS popup checks separately; these are not simulated proof of live security services.
