// Set this to the deployed Google Apps Script Web App URL described in waitlist/README.md.
const WAITLIST_ENDPOINT = 'https://script.google.com/macros/s/AKfycbze7YVyvZJ32qA5BAyCpycN9fM4imnpodBK2gwGlPMDjgGlsmn7tdX5FoRjdKQFleUlLw/exec';

const form = document.getElementById('waitlist-form');
const status = document.getElementById('form-status');
const submit = form?.querySelector('button[type="submit"]');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.className = 'form-status';
  status.textContent = '';

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!name || !email || !email.includes('@')) {
    status.className = 'form-status error';
    status.textContent = 'Please enter your name and a valid email address.';
    return;
  }

  if (WAITLIST_ENDPOINT.includes('PASTE_GOOGLE')) {
    status.className = 'form-status error';
    status.textContent = 'The waitlist is not connected yet. Add the Google Apps Script URL in waitlist.js.';
    return;
  }

  submit.disabled = true;
  submit.querySelector('span').textContent = 'Joining…';

  try {
    const response = await fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ name, email })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Unable to join the waitlist.');

    form.reset();
    status.className = 'form-status success';
    status.textContent = "You're on the list. We'll be in touch when Kairos launches.";
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = 'Something went wrong. Please try again in a moment.';
  } finally {
    submit.disabled = false;
    submit.querySelector('span').textContent = 'Join the waitlist';
  }
});
