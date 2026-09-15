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
        // Firebase signs the newly-created account in automatically. Capture the
        // returned credential so the redirect is explicitly tied to the new UID.
        const credential = await createUserWithEmailAndPassword(
            auth,
            document.getElementById('email').value.trim(),
            password.value
        );

        const newUser = credential.user;
        if (!newUser?.uid) {
            throw new Error('Account was created, but no Firebase user session was returned.');
        }

        console.log('Created new Kairos account:', newUser.uid);

        // Remove account-scoped browser state from a previous account. The app
        // will load this account's state from Firestore using the new UID.
        localStorage.removeItem('kairos_settings_cache');
        localStorage.removeItem('kairos_bedtime_fired');

        // Keep the newly-created Firebase session active for app.html.
        window.location.replace("app.html");
    } catch (error) {
        console.error("Sign up error:", error);
        alert("Sign up failed: " + error.message);
        submit.textContent = "Create account";
        submit.disabled = false;
    }
});

document.getElementById('btn-google').addEventListener('click', async () => {
    try {
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        if (!credential?.user?.uid) {
            throw new Error('Google sign-in completed, but no Firebase user session was returned.');
        }

        localStorage.removeItem('kairos_settings_cache');
        localStorage.removeItem('kairos_bedtime_fired');
        window.location.replace("app.html");
    } catch (error) {
        console.error("Google Auth Error:", error);
        alert("Google sign-in failed: " + error.message);
    }
});