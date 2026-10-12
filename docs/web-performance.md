# Web page loading

Kairos keeps one authenticated shell and one owner of its application data. Each sidebar section has a URL such as `app.html?page=schedule` or `app.html?page=settings`. Navigation uses browser history without a document reload; direct links, refreshes, opening a link in a new tab, and Back/Forward select the requested section.

The AI and Schedule workspaces have separate asset groups in `page-loader.js`. They load once and remain mounted, preserving pending chat requests, chat selection, schedule edits, and scroll position. Styles load before a feature becomes interactive. Slow first visits show local loading feedback; failed assets show a reload action without preventing use of other pages.

After verified authentication and the first paint, idle background work prepares Schedule and AI. Hovering or focusing a navigation link starts preparation sooner. Automatic background downloads are skipped on data-saving and 2G connections. First visits can still take network time if background preparation has not completed; there is no guarantee of zero latency on a cold connection.

`page-render-cache.js` coalesces hidden-page updates, prepares them during idle time, and flushes outstanding work immediately when a page becomes visible. A clean revisit preserves existing markup. Schedule tracks invalidation so a clean revisit avoids rebuilding the calendar. Changes to the shared plan invalidate the schedule.

Firebase no longer imports Markdown rendering. Authentication and ordinary pages do not wait for the Markdown CDN. Markdown remains sanitized in the existing viewer; chat uses escaped plain text if that dependency fails. The AI loader waits for saved chats to load before enabling its page.

Billing stays mounted in the shared shell with its original status, checkout-return, polling, and upgrade-welcome lifecycle. Routing preserves unrelated query parameters, including `billing=return`, URL fragments, and history state. No backend payment handlers, Stripe configuration, plan policy, or billing data model are changed.

The core markup and legacy app logic remain shared because existing controls bind to their DOM during startup. This is an incremental performance refactor, not a framework migration or full conversion to separate HTML documents.

Verification: `npm test`, `npm run build:cloudflare`, and the new page-loading, routing, and render-cache tests. The full local suite passed 253 tests; the existing deployed Firebase rules test was skipped. The built app also passed the local Workers runtime check. A final browser walkthrough remains pending after the local execution environment disconnected.
