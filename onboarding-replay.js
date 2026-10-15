/* Kairos Web onboarding replay: show the walkthrough whenever the app is opened. */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CONFIG = {
    apiKey: "AIzaSyChY9m5augQ2Z2Klmq1YGD2jLoMnCNA7fM",
    authDomain: "kairos-1a.firebaseapp.com",
    projectId: "kairos-1a",
    storageBucket: "kairos-1a.firebasestorage.app",
    messagingSenderId: "63554361",
    appId: "1:63554361:web:59b6e3a71ab30274411ee8",
    measurementId: "G-1W5P8BQ9ZM"
};

if (location.pathname.endsWith("/app.html") || location.pathname.endsWith("/app")) {
    const replayApp = getApps().find(app => app.name === "kairos-onboarding-replay") || initializeApp(CONFIG, "kairos-onboarding-replay");
    const replayAuth = getAuth(replayApp);
    const replayDb = getFirestore(replayApp);
    const REPLAY_KEY = "kairos-onboarding-replay-armed";

    // IMPORTANT: onboarding.js is loaded dynamically only after this state is
    // armed. This removes the Firebase/auth race that could cause the existing
    // account check to skip the walkthrough before the replay flag was written.
    const loadOnboarding = () => import("./onboarding.js");

    if (sessionStorage.getItem(REPLAY_KEY)) {
        loadOnboarding();
    } else {
        onAuthStateChanged(replayAuth, async user => {
            if (!user) return;
            sessionStorage.setItem(REPLAY_KEY, "1");
            try {
                await setDoc(doc(replayDb, "users", user.uid), { onboardingCompleted: false }, { merge: true });
            } catch (error) {
                console.warn("Kairos onboarding replay could not arm:", error);
            }
            await loadOnboarding();
        });
    }
}
