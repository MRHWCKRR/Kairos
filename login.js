import { auth } from './firebase.js';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ... (Keep your existing email/password form logic here)

// Implementation for Google Sign In
const googleProvider = new GoogleAuthProvider();
const googleBtn = document.getElementById('btn-google');

googleBtn.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        // Successful login
        window.location.href = "index.html";
    } catch (error) {
        console.error("Google Auth Error:", error.message);
        alert("Google sign-in failed: " + error.message);
    }
});