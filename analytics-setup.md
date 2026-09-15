# Kairos private analytics setup

This analytics system is first-party and privacy-minimised.

## Vercel environment variables

Add these to the Kairos Vercel project:

- FIREBASE_PROJECT_ID = kairos-1a
- FIREBASE_CLIENT_EMAIL = the Firebase Admin service-account email
- FIREBASE_PRIVATE_KEY = the Firebase Admin service-account private key
- ANALYTICS_HASH_SECRET = a long random secret
- ANALYTICS_ADMIN_UID = the Firebase Auth UID of the account allowed to access /analytics.html

Never commit the service-account JSON file or these secrets to GitHub. After changing Vercel environment variables, redeploy.

## Firebase

Enable Cloud Firestore in the existing kairos-1a project. The analytics API uses the Firebase Admin SDK, so ordinary browser users never receive Firestore analytics read/write access.

The analytics dashboard uses the existing Firebase Authentication system. Only ANALYTICS_ADMIN_UID can read analytics through the server.

## Analytics retention / storage cost control

Each `kairosAnalytics` event contains an `expiresAt` timestamp set to 90 days after the event is created.

**Enable Firestore TTL for `expiresAt`:**

1. Open Firebase Console → Firestore Database → **Time-to-live**.
2. Create a TTL policy for the `kairosAnalytics` collection group.
3. Select the field `expiresAt`.
4. Save the policy and wait for Firestore to begin expiring old events.

TTL deletion is automatic and asynchronous. It is preferable to keeping an ever-growing analytics collection indefinitely. The dashboard advertises the 90-day retention period and supports 7, 30 and 90-day views.

The dashboard limits each load to 10,000 recent events. If that limit is reached, it explicitly warns that the selected range is truncated. This prevents an accidental very large read from being hidden behind the UI.

The tracker also avoids duplicate page tracking for the same pathname during a browser session using `sessionStorage`.

## Privacy model

- Raw IP addresses are never written to Firestore.
- The server uses IP + user-agent + current UTC day to create a short HMAC visitor identifier, then discards the raw IP.
- The visitor identifier rotates every day and is not a permanent cross-day identifier.
- Only coarse country code, device class, OS, browser, page and referrer are stored.
- No exact device model, GPS location, screen fingerprint, advertising ID, or third-party analytics platform is used.
- Analytics failures never affect Kairos.

## Dashboard features

The private dashboard provides:

- Page views
- Unique visitors
- Visitors today
- Active visitors in the last 5 minutes
- 7 / 30 / 90-day range selection
- Daily page-view and unique-visitor activity
- Device, OS, browser and country breakdowns
- Page and referrer breakdowns
- Recent visits
- Retention and privacy status
- Explicit warning when the 10,000-event dashboard read limit is reached
