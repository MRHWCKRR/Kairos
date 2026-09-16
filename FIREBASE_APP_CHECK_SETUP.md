# Firebase App Check setup

After merging this PR, configure the public reCAPTCHA Enterprise site key in `firebase.js`.

1. In Google Cloud Console, select project `kairos-1a`.
2. Open reCAPTCHA Enterprise and create a Web key for the Kairos production domain.
3. In Firebase Console, open Build -> App Check and register the Kairos web app with reCAPTCHA Enterprise.
4. Copy the public site key into `RECAPTCHA_ENTERPRISE_SITE_KEY` in `firebase.js`. This is a public browser key; do not put a secret key in the repository.
5. Deploy Kairos and monitor App Check metrics before enabling enforcement.
6. Once legitimate traffic is receiving valid App Check tokens, enable enforcement for the Firebase products you want protected, including Authentication where available for the project's Firebase/Identity Platform configuration.

Do not use an IP/VPN detector in browser code. If stronger registration-risk scoring is needed later, use a server-side Auth blocking function and an IP reputation provider.