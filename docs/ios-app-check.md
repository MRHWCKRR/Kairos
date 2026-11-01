# Native iOS App Check

The native iOS app uses Firebase project `kairos-1a` and the registered app ID `1:63554361:ios:fb19651206b6c5e1411ee8` (bundle `com.bytebybyte.kairos`). `FIREBASE_IOS_APP_ID` allows this exact identity alongside `FIREBASE_WEB_APP_ID`; no other app in the project is implicitly trusted.

Before releasing iOS, register App Attest for this app in Firebase Console → App Check and enable the App Attest capability in its Apple signing configuration. Simulator debug tokens must be registered separately and never committed. The native app must send both a verified Firebase ID token and an App Check token to `/api/ai`.

Deploy this backend change before testing native AI against production. Missing, unsigned, expired, wrong-project and unlisted-app tokens remain rejected; account and site allowances remain shared with the web app. Existing web tokens continue to work. No Firestore migration or billing change is required.

See companion iOS implementation: https://github.com/MRHWCKRR/Kairos-IOS/pull/12.
