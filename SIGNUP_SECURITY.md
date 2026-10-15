# Kairos Signup Abuse Protection

Kairos now uses layered signup abuse protection:

- Firebase Authentication reCAPTCHA Enterprise configuration is preloaded before signup.
- Firebase Auth can transparently challenge suspicious authentication traffic when project-level reCAPTCHA bot protection is enabled.
- Signup forms include a honeypot field and minimum interaction time to reject simple automated submissions.
- The browser applies a soft rate limit of 5 signup attempts per hour.
- Email/password accounts must verify their email before they can log in.
- Firebase Auth's server-side abuse controls remain authoritative; the browser checks are only an additional layer.

## Firebase Console setup

For the strongest protection, enable reCAPTCHA Enterprise bot protection for Firebase Authentication in the Firebase/Google Cloud console and configure the Kairos web domain as an allowed domain.

This repository intentionally does not contain a reCAPTCHA secret or third-party CAPTCHA secret. Firebase Auth provisions and manages the reCAPTCHA configuration for the project.

Also keep Firebase Authentication's built-in abuse protections enabled.

## Important limitation

The browser-side rate limit is deliberately not treated as a security boundary because users can clear local storage or use another browser/device. The actual protection should come from Firebase Authentication's server-side controls.

VPN/proxy detection should be added at the authentication boundary rather than trusting a client-side IP API. If Kairos later upgrades to Firebase Authentication with Identity Platform, a beforeUserCreated blocking function can use the registration IP/user-agent context and an IP reputation provider to add a server-side risk score or block clearly abusive traffic.

## Expected signup flow

1. User submits the signup form.
2. Firebase Auth loads the configured reCAPTCHA policy.
3. Suspicious traffic can be challenged by Firebase Auth.
4. The account is created only if Firebase Auth accepts the request.
5. Email/password users receive a verification email and are signed out.
6. Unverified email/password accounts cannot enter Kairos.
7. OAuth users such as Google continue through the normal verified-provider flow.
