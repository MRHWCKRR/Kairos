# Single workspace tab

Kairos acquires an exclusive Web Lock before importing app.js and its Firebase-backed features. One workspace can initialize per origin/browser profile. Opening another workspace shows a full-page, keyboard-accessible message with “Use Kairos here”; close the original workspace, then retry. Retrying does not displace a live owner or sign the user out. Login/signup, mobile blocking and the separate plans/billing page remain independent.

The lock is held for the document lifetime, including background/suspended use. There is no expiring heartbeat, storage key, forced takeover or periodic unlock. A short retry window handles ordinary reload contention. Closing/crashing a document releases its browser-owned lock. API/storage denial fails closed with browser/reload guidance. After app imports begin, startup errors retain the lock until reload/close because partially initialized dependencies may exist. The guard module loads after mobile/billing exemptions; a failed guard download offers Reload recovery without loading app.js. BFCache restoration becomes inert and reloads through fresh ownership.

This coordinates participating tabs on the same origin in one browser profile. It does not prohibit separate devices, browser profiles, private sessions or deployment origins. Tabs running a pre-guard release must be closed/refreshed once after rollout. The guard does not replace transactional persistence or Firestore ownership checks.

Tests cover simultaneous acquisition, repeated starts/retries, denied locks, failed startup ownership, blocked app imports, prior inert state restoration and BFCache reload. The packaged Chrome journey uses multiple same-origin browsing contexts, real generated bootstrap/guard files and native Web Locks; only app.js is import-mapped to a harmless fixture, so the lock test never signs into Firebase. It verifies one owner, denied initialization, keyboard recovery, owner removal/retry, normal reload, and recovery when the guard asset returns 404.

Reference: https://www.w3.org/TR/web-locks/

Native lock checks use a real-time isolated Chrome debugging pipe and wait for the page result with a fixed deadline. They do not fast-forward the browser clock: native lock IPC can outlive a virtual-time DOM snapshot. Protocol waiting, deadline failure and graceful shutdown have separate runner tests. Existing planner and missing-module journeys retain their established runner.
