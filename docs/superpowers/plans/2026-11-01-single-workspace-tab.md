# Single Kairos workspace tab implementation plan

> Use superpowers:executing-plans for native implementation, TDD and independent final review.

Goal: allow only one initialized Kairos workspace document per origin/browser profile. Other workspace tabs show an accessible blocked screen and can retry after the active tab closes.

Design: acquire an exclusive Web Lock before importing app.js/Firebase. Hold it for the document lifetime; do not steal it or release it on visibility/background changes. Existing app drafts and saves are not forced out. The browser releases a destroyed document's locks. Login, mobile-block and billing redirect paths retain their behavior. Unsupported/failed locking fails closed with useful recovery. BFCache restores reload through the guard before interaction.

Alternatives: localStorage heartbeat leases can race and expire in suspended tabs; forced takeover can discard drafts or leave old background saves/reminders running. Neither provides the intended single-workspace guarantee. The implementation uses Web Locks and explicit close/retry, with a brief contention grace period for ordinary reloads. This is cooperative same-origin/profile coordination, not cross-device account enforcement. Previously loaded old-release tabs need closing/refreshing after rollout.

Tasks:
- [ ] Add failing pure guard tests: first owner, simultaneous starts, duplicate enter, retry after release, background persistence, API failure, startup error retention, disposal.
- [ ] Implement focused app-single-tab.js controller/view and stylesheet; wire before dynamic app import. Preserve mobile and plans redirects. Add DOM/bootstrap tests for denied imports, recovery, BFCache and keyboard visibility.
- [ ] Add native packaged Chrome iframe journey using real bootstrap/guard and an import-map fake app boundary, proving concurrent documents, owner removal/retry and active reload. Keep existing planner persistence/missing-module journeys.
- [ ] Update public asset allowlist/docs; run syntax, full regression and browser journeys. Publish byte-verified isolated PR against main and run hosted CI; independent review then fix blocking findings with failing tests. No merge until requested.

Review focus: concurrent tabs/duplicate retries; frozen/background owner; close/crash/reload; unsupported locks; no Firebase import or duplicate reminder execution in blocked documents. Include matching tests at the controller, bootstrap and native browser layers.

Reference: https://www.w3.org/TR/web-locks/ — exclusive locks, ifAvailable, document lifetime.
