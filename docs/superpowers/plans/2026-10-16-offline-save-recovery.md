# Offline save recovery

Preserve the current vanilla JS UI and Firebase model. Settings use an account-scoped local outbox with the last acknowledged baseline; explicit retries apply only the local edits over current cloud settings. Schedule uses account/planner-scoped session storage for changed form fields, preserving unrelated current fields when restored. Recovery never saves automatically.

- [x] Reproduce settings save failure/reload loss and Schedule reload loss.
- [x] Add account-scoped settings recovery, visible Retry/Discard, transactional retry, and stale callback guards.
- [x] Persist Schedule field drafts, restore task/occurrence editors, clear recovery on explicit discard or successful save, and warn on unload.
- [x] Verify ordinary/recurring reloads, account/planner switches, quota failures, and pending save races in tests and Chrome.
- [x] Run the full suite/build, resolve independent review findings, and prepare a pull request.

Validation: full suite 744 tests, 743 passed, one existing skip; Cloudflare production build passed. Chrome checks passed for settings failure/reload/retry/discard, edits during pending saves, old-account completion, ordinary Schedule moves, and recurring draft reload/save. Cloud persistence failures were simulated; no production data was written. Independent review findings were resolved and confirmed.
