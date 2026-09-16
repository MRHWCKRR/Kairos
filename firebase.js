import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, initializeRecaptchaConfig } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import "./ai-markdown.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyChY9m5augQ2Z2Klmq1YGD2jLoMnCNA7fM",
    authDomain: "kairos-1a.firebaseapp.com",
    projectId: "kairos-1a",
    storageBucket: "kairos-1a.firebasestorage.app",
    messagingSenderId: "63554361",
    appId: "1:63554361:web:59b6e3a71ab30274411ee8",
    measurementId: "G-1W5P8BQ9ZM"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Preload Firebase Authentication's reCAPTCHA configuration. When reCAPTCHA
// Enterprise bot protection is enabled for this project, Firebase Auth can
// transparently challenge suspicious authentication traffic without requiring
// a separate CAPTCHA provider or exposing a secret key in the client.
export const authProtectionReady = initializeRecaptchaConfig(auth).catch(error => {
    // Keep authentication functional if the Firebase project has not enabled
    // reCAPTCHA protection yet. The console configuration can be enabled later
    // without another application-code change.
    console.warn("Kairos auth reCAPTCHA protection is not configured:", error);
});
export const db = getFirestore(app);

// Keep the real loading screen visible while the shared onboarding state is
// being checked. app.js may try to hide it as soon as Firebase auth resolves;
// the gate below prevents that from causing a flash of the main workspace.
if (typeof window !== "undefined") {
    const loadingScreen = document.getElementById("app-loading-screen");

    if (loadingScreen) {
        let onboardingGateActive = true;
        window.__kairosOnboardingGate = true;

        const releaseLoadingGate = () => {
            if (!onboardingGateActive) return;
            onboardingGateActive = false;
            window.__kairosOnboardingGate = false;
            loadingScreen.classList.add("hidden");
            observer.disconnect();
        };

        const observer = new MutationObserver(() => {
            if (!onboardingGateActive) return;

            // Once onboarding is actually mounted, let it replace the loading
            // screen. If onboarding was already completed, keep the loading
            // screen up until the completion event releases the gate.
            if (document.getElementById("kairos-onboarding")) {
                onboardingGateActive = false;
                window.__kairosOnboardingGate = false;
                loadingScreen.classList.add("hidden");
                observer.disconnect();
                return;
            }

            if (loadingScreen.classList.contains("hidden")) {
                loadingScreen.classList.remove("hidden");
            }
        });

        observer.observe(loadingScreen, {
            attributes: true,
            attributeFilter: ["class"]
        });

        window.addEventListener("kairos:onboarding-complete", releaseLoadingGate, { once: true });

        // Load onboarding only after this module has finished exporting the
        // primary Firebase app. This prevents onboarding from blocking app.js.
        import("./onboarding-force.js?v=4").catch(error => {
            console.error("Kairos onboarding module failed to load:", error);
            releaseLoadingGate();
        });
    }
}