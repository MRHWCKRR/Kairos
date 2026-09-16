import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
export const db = getFirestore(app);

// Load onboarding only after this module has finished exporting the primary
// Firebase app. This prevents onboarding from ever blocking app.js startup.
if (typeof window !== "undefined" && document.getElementById("app-loading-screen")) {
    import("./onboarding-force.js?v=3").catch(error => {
        console.error("Kairos onboarding module failed to load:", error);
    });
}