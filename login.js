 import { auth } from './firebase.js';
 import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

 const loginForm = document.getElementById('email-login-form');

 loginForm.addEventListener('submit', async (e) => {
    e.preventDefult();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = loginForm.querySelector('.login-btn');

    btn.textContent = "Signing in...";
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Successful login, redirect to the main app
        window.location.href = "index.html"; 
    } catch (error) {
        console.error("Authentication error:", error.message);
        alert("Login failed: " + error.message);
        btn.textContent = "Sign In";
        btn.disabled = false;
    }
});

document.querySelectorAll('.social-btn').forEach(button => {
    button.addEventListener('click', () => {
        alert("This provider is coming soon!");
    });
});