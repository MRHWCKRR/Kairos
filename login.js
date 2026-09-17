import { auth } from './firebase.js';
import {
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginForm = document.getElementById('email-login-form');
const authSubmit = document.getElementById('auth-submit');
const rememberMe = document.getElementById('remember-me');
const googleBtn = document.getElementById('btn-google');

function clearAccountScopedBrowserState() {
    localStorage.removeItem('kairos_settings_cache');
    localStorage.removeItem('kairos_bedtime_fired');
}

function verificationActionSettings(email) {
    const params = new URLSearchParams({ email, verified: '1' });
    return {
        url: `${window.location.origin}/verify-email.html?${params.toString()}`,
        handleCodeInApp: false
    };
}

onAuthStateChanged(auth, (user) => {
    if (user) window.location.replace('app.html');
});

if (loginForm && authSubmit) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

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
                await sendEmailVerification(credential.user, verificationActionSettings(email)).catch(() => {});
                await signOut(auth);
                window.location.replace(`verify-email.html?email=${encodeURIComponent(email)}&resent=1`);
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
            alert(messages[error.code] || 'Login failed. Please try again.');
            authSubmit.textContent = 'Sign In';
            authSubmit.disabled = false;
        }
    });
}

googleBtn?.addEventListener('click', async () => {
    googleBtn.disabled = true;
    try {
        clearAccountScopedBrowserState();
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        if (!credential?.user?.uid) throw new Error('No Firebase user session was returned.');
        window.location.replace('app.html');
    } catch (error) {
        console.error('Google Auth Error:', error);
        alert(error.code === 'auth/popup-closed-by-user' ? 'Sign-in cancelled.' : 'Google sign-in failed. Please try again.');
        googleBtn.disabled = false;
    }
});