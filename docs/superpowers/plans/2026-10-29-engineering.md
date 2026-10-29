# Kairos engineering implementation plan

**Goal:** Implement the five engineering improvements approved in this conversation.
**Architecture:** Preserve vanilla JS and current storage/security. Generate a deterministic release digest from public asset contents after build preparation; rewrite only declared local JS/CSS URLs. Extract small cohesive shell responsibilities without duplicating planner/settings state. Add static checks and exercise existing production modules in browser regressions.
**Execution:** Native implementation with one independent final review. User explicitly requested execution; no additional design approval round.

## Constraints

- Synced sources are read-only. Preserve authentication, verification, App Check, billing, mobile block and Firestore schema.
- Keep current UI and app behavior. Preserve one planner write queue for task, focus and ordinary saves.
- Author on isolated feature branch for review; existing local checkout already contains previously merged changes. Publish only changes from main b9b30c12819828645a9749248e482f000dbf04c4.
- Use existing dependencies for asset preparation and linting. Pin the compiler used for gradual JS checking; local network cannot reach npm, so hosted CI must verify compiler checks.

## Tasks

### 1. Generated cache versions
- [ ] Add failing tests for stable repeat builds, nested/cyclic imports, leaf changes propagating to entrypoints, query/fragment preservation and untouched external URLs.
- [ ] Implement `versionPublicAssets(Map<string,string>)` returning a version and rewritten file map; one digest avoids cyclic dependency hashing. Only declared local files are rewritten.
- [ ] Apply after transformations in Cloudflare build, update built-output regressions, and remove the manual source version-floor requirement.
- [ ] Run asset/build/release tests.

### 2. Smaller shell responsibilities
- [ ] Extract settings defaults/merge helpers, auth session loading lifecycle, and shared planner write coordination into focused modules.
- [ ] Preserve synchronous account reset before await, verification gates, independent loaders and one persistence queue. Test account races, queue recovery, defaults isolation and failed writes.
- [ ] Keep UI-specific closures in shell where extraction would create a broad dependency container. Run affected integration tests.

### 3. Code checks
- [ ] Add syntax/module-graph linting with existing esbuild and gradual JSDoc type checking of new boundary modules/contracts.
- [ ] Add npm scripts and CI gate. Verify negative fixtures reject invalid syntax/unknown exports and wrong typed inputs.

### 4. Build cleanup
- [ ] Materialize production Schedule markup and bridge wiring in checked-in sources; remove their source-text injection from the production build path.
- [ ] Replace relay literal in source and remove production recurrence cache rewrites covered by generated versions. Retain compatibility helpers/tests where needed.
- [ ] Verify source immutability and deterministic output.

### 5. Browser regressions
- [ ] Add event create/reminder edit/Undo with reload-style remount, legacy task metadata, failed-save recovery and account-switch isolation using real production modules.
- [ ] Add to existing real-browser runner and run hosted Chrome journey.

## Verification / review focus

- Old account async callbacks must never reveal old private state or redirect a new session.
- Rejected persistence work must not poison the shared queue; retries keep operation identity.
- Generated URLs must preserve external CDN parameters and lazy loading, including cycles and browser singleton modules.
- Builds must not mutate source or publish backend/test material.
- Run lint/types, full tests, production build, hosted browser/runtime checks, then independent diff review. Prepare a PR; report any unavailable live-browser verification accurately.
