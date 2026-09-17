import { auth } from './firebase.js';
import { onAuthStateChanged, reload } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const email = params.get('email') || '';
const verified = params.get('verified') === '1';

const icon = document.getElementById('verification-icon');
const title = document.getElementById('verification-title');
const message = document.getElementById('verification-message');
const emailEl = document.getElementById('verification-email');
const checkBtn = document.getElementById('check-btn');
const loginBtn = document.getElementById('login-btn');
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
    message.textContent = 'Click the verification link in the email we sent you. Once it is verified, return here and continue to login.';
}

if (verified) {
    showVerified();
}

// If the page is opened while a Firebase session still exists, refresh it so
// the button can immediately recognize a verification completed in another tab.
onAuthStateChanged(auth, async user => {
    if (!user || verified) return;
    try {
        await reload(user);
        if (user.emailVerified) showVerified();
    } catch (error) {
        console.warn('Unable to refresh verification status:', error);
    }
});

checkBtn?.addEventListener('click', async () => {
    if (verified) {
        window.location.replace('login.html');
        return;
    }

    status.textContent = 'Checking your verification status…';
    checkBtn.disabled = true;

    try {
        const user = auth.currentUser;
        if (user) {
            await reload(user);
            if (auth.currentUser?.emailVerified) {
                showVerified();
                status.textContent = 'Verification confirmed.';
                return;
            }
        }

        status.textContent = 'We haven’t detected verification yet. Click the link in your email, then try again.';
    } catch (error) {
        console.error('Verification status check failed:', error);
        status.textContent = 'We could not check your status right now. Please try again.';
    } finally {
        checkBtn.disabled = false;
    }
});

loginBtn?.addEventListener('click', () => {
    window.location.replace('login.html');
});