import { createAuthFeedback } from './auth-feedback.js?v=1';
import { auth } from './firebase.js?v=2';
import {
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const feedback = createAuthFeedback(document);
const loginForm = document.getElementById('email-login-form');
const authSubmit = document.getElementById('auth-submit');
const rememberMe = document.getElementById('remember-me');
const googleBtn = document.getElementById('btn-google');

function clearAccountScopedBrowserState() {
    localStorage.removeItem('kairos_settings_cache');
    localStorage.removeItem('kairos_bedtime_fired');
}

onAuthStateChanged(auth, (user) => {
    if (user?.emailVerified) window.location.replace('app.html');
});

if (loginForm && authSubmit) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        feedback('');

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        if (!email || !password) return;

        authSubmit.textContent = 'Signing in...';
        authSubmit.disabled = true;

        try {
            await setPersistence(auth, rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence);
            clearAccountScopedBrowserState();
            const credential = await signInWithEmailAndPassword(auth, email, password);
            if (!credential?.user?.uid) throw new Error('No Firebase user session was returned.');

            if (!credential.user.emailVerified) {
                window.location.replace(`verify-email.html?email=${encodeURIComponent(email)}&resent=0`);
                return;
            }

            window.location.replace('app.html');
        } catch (error) {
            console.error('Authentication Error:', error);
            const messages = {
                'auth/invalid-credential': 'The email or password is incorrect.',
                'auth/user-not-found': 'No Kairos account was found with that email.',
                'auth/wrong-password': 'The email or password is incorrect.',
                'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
                'auth/network-request-failed': 'Network error. Please check your connection and try again.'
            };
            feedback(messages[error.code] || 'Login failed. Please try again.', { fields: ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(error.code) ? ['email', 'password'] : [] });
            authSubmit.textContent = 'Sign In';
            authSubmit.disabled = false;
        }
    });
}

googleBtn?.addEventListener('click', async () => {
    feedback('');
    googleBtn.disabled = true;
    try {
        clearAccountScopedBrowserState();
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        if (!credential?.user?.uid) throw new Error('No Firebase user session was returned.');
        window.location.replace('app.html');
    } catch (error) {
        console.error('Google Auth Error:', error);
        feedback(error.code === 'auth/popup-closed-by-user' ? 'Sign-in cancelled. You can try again.' : error.code === 'auth/popup-blocked' ? 'Your browser blocked Google sign-in. Allow popups for Kairos and try again.' : error.code === 'auth/network-request-failed' ? 'Check your connection and try Google sign-in again.' : 'Google sign-in failed. Please try again.');
        googleBtn.disabled = false;
    }
});

const resetForm = document.getElementById('password-reset-form');
const resetEmail = document.getElementById('reset-email');
const resetSubmit = document.getElementById('reset-submit');
const resetBack = document.getElementById('reset-back');
let resetPending = false;

document.getElementById('forgot-password')?.addEventListener('click', () => {
    feedback('');
    resetEmail.value = document.getElementById('email').value.trim();
    loginForm.hidden = true;
    resetForm.hidden = false;
    document.getElementById('auth-title').textContent = 'Reset your password';
    document.getElementById('auth-subtitle').textContent = 'Request a reset link for your email and password account.';
    resetEmail.focus();
});
resetBack?.addEventListener('click', () => {
    if (resetPending) return;
    feedback('');
    resetForm.hidden = true;
    loginForm.hidden = false;
    document.getElementById('auth-title').textContent = 'Welcome back';
    document.getElementById('auth-subtitle').textContent = 'Log in to access your intelligent schedule.';
    document.getElementById('forgot-password').focus();
});
resetForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (resetPending) return;
    if (!resetForm.checkValidity()) { resetForm.reportValidity(); return; }
    const email = resetEmail.value.trim();
    if (!email) return;
    resetPending = true;
    resetSubmit.disabled = true;
    resetBack.disabled = true;
    resetEmail.disabled = true;
    resetSubmit.textContent = 'Sending…';
    feedback('');
    try {
        try { await sendPasswordResetEmail(auth, email); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        // Use the same confirmation whether or not a password account exists.
        feedback('If this email has a password account, a reset link has been sent. Check your inbox and spam folder.', { type: 'success' });
    } catch (error) {
        const messages = {
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/network-request-failed': 'Check your connection and try sending the reset link again.',
            'auth/too-many-requests': 'Too many requests. Please wait a while before trying again.'
        };
        feedback(messages[error.code] || 'Could not send the reset link. Please try again.', { fields: error.code === 'auth/invalid-email' ? ['reset-email'] : [] });
    } finally {
        resetPending = false;
        resetSubmit.disabled = false;
        resetBack.disabled = false;
        resetEmail.disabled = false;
        resetSubmit.textContent = 'Send reset link';
    }
});
