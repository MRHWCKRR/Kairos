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

## Privacy model

- Raw IP addresses are never written to Firestore.
- The server uses IP + user-agent + current UTC day to create a short HMAC visitor identifier, then discards the raw IP.
- The visitor identifier rotates every day and is not a permanent cross-day identifier.
- Only coarse country code, device class, OS, browser, page and referrer are stored.
- No exact device model, GPS location, screen fingerprint, advertising ID, or third-party analytics platform is used.
- Analytics failures never affect Kairos.
