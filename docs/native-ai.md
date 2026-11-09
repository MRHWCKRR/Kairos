# Native AI integration

Web, iOS, and Android AI use `https://kairos-web.kirosapp.workers.dev/api/ai`.
Requests carry a verified Firebase account ID token in `Authorization: Bearer …`
and an App Check token in `X-Firebase-AppCheck`. Provider keys and the old relay
shared secret must never be embedded in an app. The server owns models, access,
and allowance counters; no native-only bypass or fallback relay is supported.

The Worker accepts only the web app ID and explicitly configured native app IDs
from the same Firebase project. `FIREBASE_IOS_APP_ID` and
`FIREBASE_ANDROID_APP_ID` configure those identities independently for production,
automatic previews, and the named preview environment. Missing native identities
leave that client blocked; they never disable App Check.

Android uses Play Integrity in release builds and the Firebase debug provider
only in debug builds. Register the Android app's release SHA-256 certificate and
Play Integrity provider in Firebase App Check. For local testing, register the
device's generated debug token privately in Firebase; never commit or share it.
Deploy the backend allowlist before releasing the migrated Android app. Existing
installed Android versions continue to use the separate legacy relay until updated.

References: [Play Integrity setup](https://firebase.google.com/docs/app-check/android/play-integrity-provider),
[debug provider](https://firebase.google.com/docs/app-check/android/debug-provider),
[custom backend requests](https://firebase.google.com/docs/app-check/android/custom-resource).

## Shared planner data

Native edits must preserve raw fields they do not understand, including recurrence
rules, exceptions, and occurrence history. iOS uses `KairosPlannerMerge`; Android
uses `SharedDataMerge` in Firestore transactions. Do not replace whole plans from
the older typed model or treat Android's limited recurrence UI as feature parity.

## Acceptance before release

Use a verified test account and a registered App Check test device. Check chat,
plan generation, account switching during a request, reload persistence, and
daily/weekly allowance errors. Anonymous, unverified, and unregistered-app
requests must fail without contacting the provider. Edit a web recurring task
from each native client and confirm its rule and occurrence history survive.

Do not infer live billing state from the October staged-release notes. Current
checked-in configuration enables billing and tier enforcement, with `STRIPE_MODE`
set to `test`. Runtime bindings and real Checkout/Portal/webhook behavior require
separate verification. Keep acceptance purchases in an isolated Stripe sandbox;
never use a real card. This native AI change does not alter billing flags, prices,
keys, grants, or subscription records.
