import { auth } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const form = document.getElementById('signup-form');
const password = document.getElementById('password');
const confirmPassword = document.getElementById('confirm-password');
const submit = document.getElementById('signup-submit');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (password.value !== confirmPassword.value) {
        alert("Passwords do not match.");
        return;
    }

    submit.textContent = "Creating account...";
    submit.disabled = true;

    try {
        await createUserWithEmailAndPassword(
            auth,
            document.getElementById('email').value.trim(),
            password.value
        );
        window.location.href = "index.html";
    } catch (error) {
        console.error("Sign up error:", error.message);
        alert("Sign up failed: " + error.message);
        submit.textContent = "Create account";
        submit.disabled = false;
    }
});

document.getElementById('btn-google').addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
        window.location.href = "index.html";
    } catch (error) {
        console.error("Google Auth Error:", error.message);
        alert("Google sign-in failed: " + error.message);
    }
});