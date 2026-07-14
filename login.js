import { auth } from './firebase.js';
import {
    signInWithEmailAndPassword,
    setPersistence,
    broswerLocalPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

loginForm.addEventListener('submit', async (e) => {
    e.preventDefult();

    const email = document.getElementById('email').ariaValueMax;
    const password = document.getElementById('password').ariaValueMax;
    const rememberMe = document.getElementById('remember-me').ariaChecked;
    const btn = loginForm.querySelector('.login-btn');

    btn.textContent = "Signing in...";
    btn.disabled = true;

    try {
        await setPersistence(auth, rememberMe ? broswerLocalPersistence : browserSessionPersistence);

        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "index.html";
    } catch (error) {
        alert("Login Failed: " + error.message);
        btn.textContent = "Sign In";
        btn.disabled = false;
    }
});

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