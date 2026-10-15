# Web page loading

Kairos pages have shareable URLs such as `app.html?page=schedule` and
`app.html?page=ai`. Navigation uses browser history within one persistent app
shell. Back, Forward, refresh, and opening a sidebar link in another tab work
without restarting the session on each in-app switch.

The shared shell owns Firebase, plan state, settings, billing and account
deletion. Page navigation preserves unrelated URL parameters, including checkout
returns. Billing remains mounted while navigating and confirms upgrades using
the existing plan service.

`app-bootstrap.js` skips the desktop module graph for blocked mobile devices.
`page-loader.js` loads AI and Schedule code/styles on demand, once per session.
Firebase no longer imports AI markdown; optional markdown loads independently
of chat readiness and authentication. Text remains escaped until the existing
markdown sanitiser becomes available.

After verified authentication, `page-router.js` prepares Schedule and AI during
idle time, one at a time. Hover and keyboard focus prepare a destination too.
Automatic warming is skipped on data-saving and 2G connections. A cold visit
shows loading feedback after 120 ms; a failed workspace does not prevent access
to other pages. Loaded workspaces keep their DOM, drafts, scroll position and
pending AI requests.

`page-render-cache.js` coalesces hidden-page updates during idle time and flushes
pending work on navigation. Schedule marks hidden data changes dirty instead of
rebuilding the calendar every time the sidebar is clicked. Achievement progress
invalidates its cached page even below unlock thresholds. Schedule refreshes
date-dependent labels and recurring occurrences after midnight or suspension.

Cloudflare's public-asset manifest includes the new modules. Both hosting builds
retain the existing Schedule shell/bridge transforms and run `npm run test:pages`
before building. These tests cover routing, loading, page failures, concurrent
chat requests, persisted chat restoration, and checkout confirmation across
navigation. `npm run test:billing` covers the existing payment and plan logic.

For acceptance, use a verified test account to check direct page URLs, browser
history, a cold visit on a throttled connection, a warm revisit, Schedule editing,
chat switching during a response, reload persistence, and sandbox checkout
return/portal flows. Do not enable live billing as part of this refactor. Module
deferral is verified structurally; device-specific startup and switching timings
still need measurements in a real browser.
