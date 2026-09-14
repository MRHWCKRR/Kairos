import { auth } from './firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginForm = document.getElementById('email-login-form');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authSubmit = document.getElementById('auth-submit');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const confirmPassword = document.getElementById('confirm-password');
const rememberGroup = document.getElementById('remember-group');
const passwordInput = document.getElementById('password');

let isSignup = false;

function setAuthMode(signup) {
    isSignup = signup;

    loginTab.classList.toggle('active', !signup);
    signupTab.classList.toggle('active', signup);
    loginTab.setAttribute('aria-selected', String(!signup));
    signupTab.setAttribute('aria-selected', String(signup));

    authTitle.textContent = signup ? 'Create your account' : 'Welcome back';
    authSubtitle.textContent = signup
        ? 'Create your Kairos account to start planning smarter.'
        : 'Log in to access your intelligent schedule.';
    authSubmit.textContent = signup ? 'Create account' : 'Sign In';

    confirmPasswordGroup.hidden = !signup;
    confirmPassword.required = signup;
    confirmPassword.value = '';

    rememberGroup.style.display = signup ? 'none' : 'flex';
    passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
}

loginTab.addEventListener('click', () => setAuthMode(false));
signupTab.addEventListener('click', () => setAuthMode(true));

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    const rememberMe = document.getElementById('remember-me').checked;

    if (isSignup && password !== confirmPassword.value) {
        alert("Passwords do not match.");
        return;
    }

    authSubmit.textContent = isSignup ? "Creating account..." : "Signing in...";
    authSubmit.disabled = true;

    try {
        if (isSignup) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await setPersistence(
                auth,
                rememberMe ? browserLocalPersistence : browserSessionPersistence
            );
            await signInWithEmailAndPassword(auth, email, password);
        }

        window.location.href = "index.html";
    } catch (error) {
        console.error("Authentication Error:", error.message);
        alert((isSignup ? "Sign up" : "Login") + " failed: " + error.message);
        authSubmit.textContent = isSignup ? "Create account" : "Sign In";
        authSubmit.disabled = false;
    }
});

const googleBtn = document.getElementById('btn-google');

googleBtn.addEventListener('click', async () => {
    try {
        const googleProvider = new GoogleAuthProvider();
        await signInWithPopup(auth, googleProvider);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Google Auth Error:", error.message);
        alert("Google sign-in failed: " + error.message);
    }
});

setAuthMode(false);