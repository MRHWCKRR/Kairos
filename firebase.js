import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";



// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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