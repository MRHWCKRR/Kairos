import { auth } from './firebase.js';
import {
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    GoogleAuthProvider,  
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


const loginForm = document.getElementById('email-login-form');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();


    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const btn = loginForm.querySelector('.login-btn');

    btn.textContent = "Signing in...";
    btn.disabled = true;

    try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "index.html";
    } catch (error) {
        alert("Login Failed: " + error.message);
        btn.textContent = "Sign In";
        btn.disabled = false;
    }
});

const googleBtn = document.getElementById('btn-google');

googleBtn.addEventListener('click', async () => {
    try {
        const googleProvider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, googleProvider);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Google Auth Error:", error.message);
        alert("Google sign-in failed: " + error.message);
    }
});