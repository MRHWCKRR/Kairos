# Schedule editor guards

Goal: serialize inspector writes and protect drafts when switching or closing tasks.

Keep the existing vanilla JS, Firebase persistence, and recurrence scopes. A focused inspector session owns draft comparison, Save / Discard / Stay, and the pending operation. Workspace navigation consults it before selection changes; refreshes retain the live form. Failed writes retain the draft, and callbacks from an old account or planner cannot restore data into a new scope.

- [x] Reproduce overlapping saves, lost failure drafts, switching loss, and refresh loss with regression tests.
- [x] Add the inspector session and integrate ordinary/recurring actions and workspace selection.
- [x] Protect other inspector entry points and pointer gestures from replacing a draft or overlapping a save.
- [x] Test Save, Discard, Stay, failure/retry, scope changes, recurrence scopes, and slow saves in Chrome.
- [x] Run the full test suite and Cloudflare build, review the diff, and prepare a pull request.

Validation: 711 tests total, 710 passed, 1 existing skip; build:cloudflare passed. Chrome at 6× CPU throttling passed the Save/Discard/Stay, failed-save/retry, and recurring scope flows at 1000, 1366, and 3440 pixels in both themes. Independent review findings were fixed with regression tests; final review found no remaining blockers.
