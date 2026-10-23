async function boot() {
  if (window.__kairosMobileDevice) {
    document.getElementById('mobile-access-screen')?.setAttribute('aria-hidden','false');
    return;
  }
  try { await import('./plans-page.js?v=3'); }
  catch (error) {
    console.error('[Kairos] Plans could not load.', error);
    const message=document.getElementById('plans-auth-status');
    message.hidden=false;
    message.textContent='Plans could not load. Check your connection and reload this page.';
  }
}
void boot();
