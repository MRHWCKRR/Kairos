# One-time web tour

Profile onboarding still uses the shared `users/<uid>.onboardingCompleted` flag. Completing profile setup now also writes `gettingStarted: {version: 2, status: 'active' | 'skipped', step: 0, updatedAt: <milliseconds>}` to the same user document. The five-step web tour persists progress there; finishing or skipping changes its status to `completed` or `skipped`. Terminal states cannot be reopened by a delayed progress write. No new collection, listener, or security-rule change is needed.

Welcome (`misc_welcome`) and the existing eligible OG award are granted in a transaction after profile onboarding is complete and the tour is finished or skipped. Existing achievements and counters are preserved. Accounts recreated with the same email use their new Firebase UID and qualify independently.

Existing users without a version 2 tour record do not receive an automatic tour or a permanent launcher. Already onboarded users with a missing Welcome award are reconciled once when progress loads. Existing earned awards are retained. Legacy browser-only tour state is not used to reopen a completed tour.

Shortcut preferences live under `settings.accessibility.shortcuts`. Missing or invalid bindings fall back to the original defaults. They use the existing settings save/retry flow; Escape, native editing controls, and browser-reserved combinations remain fixed.
