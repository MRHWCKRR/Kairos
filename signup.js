import { auth, authProtectionReady } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const form = document.getElementById('signup-form');
const password = document.getElementById('password');
const confirmPassword = document.getElementById('confirm-password');
const emailInput = document.getElementById('email');
const submit = document.getElementById('signup-submit');
const googleBtn = document.getElementById('btn-google');
const honeypot = document.getElementById('website');
const VERIFICATION_COOLDOWN_KEY = 'kairos_verification_resend_available_at';

const SIGNUP_LIMIT_KEY = 'kairos_signup_attempts';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;
const MIN_FORM_AGE_MS = 1500;
const formLoadedAt = Date.now();

function readSignupAttempts() {
    try {
        const raw = JSON.parse(localStorage.getItem(SIGNUP_LIMIT_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter(ts => Number.isFinite(ts) && Date.now() - ts < WINDOW_MS) : [];
    } catch { return []; }
}
function recordSignupAttempt() {
    const attempts = readSignupAttempts();
    attempts.push(Date.now());
    localStorage.setItem(SIGNUP_LIMIT_KEY, JSON.stringify(attempts));
}
function enforceSignupRateLimit() {
    const attempts = readSignupAttempts();
    if (attempts.length >= MAX_ATTEMPTS) {
        const waitMs = WINDOW_MS - (Date.now() - attempts[0]);
        const minutes = Math.max(1, Math.ceil(waitMs / 60000));
        throw new Error(`Too many sign-up attempts from this browser. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
}
function clearAccountScopedBrowserState() {
    localStorage.removeItem('kairos_settings_cache');
    localStorage.removeItem('kairos_bedtime_fired');
}
function isLikelyBot() {
    return Boolean(honeypot?.value?.trim()) || Date.now() - formLoadedAt < MIN_FORM_AGE_MS;
}
async function waitForAuthProtection() { await authProtectionReady; }
function verificationActionSettings(email) {
    const params = new URLSearchParams({ email, verified: '1' });
    return { url: `${window.location.origin}/verify-email.html?${params.toString()}`, handleCodeInApp: false };
}
function showSignupError(error) {
    const messages = {
        'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Please choose a stronger password.',
        'auth/too-many-requests': 'Too many attempts were detected. Please wait a while and try again.',
        'auth/network-request-failed': 'Network error. Please check your connection and try again.',
        'auth/missing-recaptcha-token': 'Security verification could not be completed. Please try again.',
        'auth/invalid-recaptcha-token': 'Security verification failed. Please try again.',
        'auth/invalid-recaptcha-action': 'Security verification failed. Please refresh the page and try again.'
    };
    alert(messages[error?.code] || error?.message || 'Sign up failed. Please try again.');
}
async function createEmailAccount() {
    enforceSignupRateLimit();
    if (isLikelyBot()) throw new Error('Sign up could not be completed. Please refresh the page and try again.');
    recordSignupAttempt();
    await waitForAuthProtection();

    const email = emailInput.value.trim();
    const credential = await createUserWithEmailAndPassword(auth, email, password.value);
    const newUser = credential.user;
    if (!newUser?.uid) throw new Error('Account was created, but no Firebase user session was returned.');

    await sendEmailVerification(newUser, verificationActionSettings(email));
    clearAccountScopedBrowserState();
    try { sessionStorage.setItem(VERIFICATION_COOLDOWN_KEY, String(Date.now() + 60000)); } catch (e) {}
    window.location.replace(`verify-email.html?email=${encodeURIComponent(email)}&resent=0`);
}

form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (password.value !== confirmPassword.value) { alert('Passwords do not match.'); return; }
    submit.textContent = 'Checking security...';
    submit.disabled = true;
    try {
        await createEmailAccount();
        submit.textContent = 'Account created';
    } catch (error) {
        console.error('Sign up error:', error);
        showSignupError(error);
        submit.textContent = 'Create account';
        submit.disabled = false;
    }
});

googleBtn?.addEventListener('click', async () => {
    try {
        enforceSignupRateLimit();
        if (isLikelyBot()) throw new Error('Sign up could not be completed. Please refresh the page and try again.');
        recordSignupAttempt();
        await waitForAuthProtection();
        googleBtn.disabled = true;
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        if (!credential?.user?.uid) throw new Error('Google sign-in completed, but no Firebase user session was returned.');
        clearAccountScopedBrowserState();
        window.location.replace('app.html');
    } catch (error) {
        console.error('Google Auth Error:', error);
        showSignupError(error);
        googleBtn.disabled = false;
    }
});
