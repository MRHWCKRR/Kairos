import { auth } from './firebase.js';
import { onAuthStateChanged, reload } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const email = params.get('email') || '';
const verified = params.get('verified') === '1';
const resent = params.get('resent') === '1';

const icon = document.getElementById('verification-icon');
const title = document.getElementById('verification-title');
const message = document.getElementById('verification-message');
const emailEl = document.getElementById('verification-email');
const checkBtn = document.getElementById('check-btn');
const status = document.getElementById('verification-status');

if (email) {
    emailEl.textContent = email;
    emailEl.hidden = false;
}

function showVerified() {
    icon.textContent = '✓';
    icon.classList.add('success');
    title.textContent = 'Email verified!';
    message.textContent = 'Your email address has been verified successfully. Your Kairos account is ready to use.';
    checkBtn.textContent = 'Continue to login';
    status.textContent = '';
}

function showPending() {
    icon.textContent = '✉';
    icon.classList.remove('success');
    title.textContent = "You're almost there.";
    message.textContent = resent
        ? 'We sent you a new verification link. Click the link in the latest email to activate your Kairos account.'
        : 'We sent you a verification link. Click the link in that email to activate your Kairos account.';
}

if (verified) showVerified();
else showPending();

// Also supports a future flow where the user remains signed in while verifying.
onAuthStateChanged(auth, async user => {
    if (!user || verified) return;
    try {
        await reload(user);
        if (user.emailVerified) showVerified();
    } catch (error) {
        console.warn('Unable to refresh verification status:', error);
    }
});

checkBtn?.addEventListener('click', () => {
    window.location.replace('login.html');
});