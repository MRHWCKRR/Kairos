import { auth, authProtectionReady } from './firebase.js';
import {
    onAuthStateChanged,
    reload,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const email = params.get('email') || '';
const verified = params.get('verified') === '1';
const resent = params.get('resent') === '1';
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_KEY = 'kairos_verification_resend_available_at';
let resendCooldownTimer = null;

const icon = document.getElementById('verification-icon');
const title = document.getElementById('verification-title');
const message = document.getElementById('verification-message');
const emailEl = document.getElementById('verification-email');
const checkBtn = document.getElementById('check-btn');
const resendBtn = document.getElementById('resend-btn');
const status = document.getElementById('verification-status');

if (email) {
    emailEl.textContent = email;
    emailEl.hidden = false;
}

function verificationActionSettings(targetEmail) {
    const verificationParams = new URLSearchParams({ email: targetEmail, verified: '1' });
    return {
        url: `${window.location.origin}/verify-email.html?${verificationParams.toString()}`,
        handleCodeInApp: false
    };
}

function showVerified() {
    icon.textContent = '✓';
    icon.classList.add('success');
    title.textContent = 'Email verified!';
    message.textContent = 'Your email address has been verified successfully. Your Kairos account is ready to use.';
    checkBtn.textContent = 'Continue to login';
    checkBtn.hidden = false;
    resendBtn.hidden = true;
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

function startResendCooldown(durationSeconds = RESEND_COOLDOWN_SECONDS) {
    if (!resendBtn) return;
    clearInterval(resendCooldownTimer);

    let remaining = Math.max(0, Math.ceil(durationSeconds));
    resendBtn.disabled = remaining > 0;
    resendBtn.textContent = remaining > 0
        ? 'Resend verification email (' + remaining + 's)'
        : 'Resend verification email';

    if (remaining <= 0) return;

    resendCooldownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend verification email';
            return;
        }
        resendBtn.textContent = 'Resend verification email (' + remaining + 's)';
    }, 1000);
}

function startStoredCooldown() {
    try {
        const availableAt = Number(sessionStorage.getItem(RESEND_COOLDOWN_KEY) || 0);
        const remaining = Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
        if (remaining > 0) startResendCooldown(remaining);
    } catch (e) {}
}

async function resendVerificationEmail(user) {
    if (!user || user.emailVerified) return;
    resendBtn.disabled = true;
    status.textContent = 'Sending a new verification email...';
    try {
        await authProtectionReady;
        await sendEmailVerification(user, verificationActionSettings(user.email));
        try { sessionStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() + 60000)); } catch (e) {}
        status.textContent = 'A new verification email has been sent. Use the latest email.';
    } catch (error) {
        console.error('Verification resend error:', error);
        const messageByCode = {
            'auth/too-many-requests': 'Too many verification emails were requested. Please wait before trying again.',
            'auth/network-request-failed': 'Network error. Please check your connection and try again.'
        };
        status.textContent = messageByCode[error?.code] || 'Unable to send a new verification email. Please try again.';
        resendBtn.disabled = false;
        return;
    }
    startResendCooldown();
}

if (verified) showVerified();
else {
    showPending();
    startStoredCooldown();
}

let currentUser = null;
onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (!user || verified) return;
    try {
        await reload(user);
        if (user.emailVerified) showVerified();
    } catch (error) {
        console.warn('Unable to refresh verification status:', error);
    }
});

resendBtn?.addEventListener('click', () => resendVerificationEmail(currentUser));
checkBtn?.addEventListener('click', () => {
    window.location.replace('login.html');
});