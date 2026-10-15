const returnPages=new Set(['dashboard','ai','tasks','schedule','calendar','achievements','statistics','settings']);

export function mountStandalonePlans({document,window,auth,request,mount}) {
  const root=document.getElementById('plans-page'),message=document.getElementById('plans-auth-status');
  const requested=new URL(window.location.href).searchParams.get('return');
  const back='app.html?page='+(returnPages.has(requested)?requested:'dashboard');
  try {
    const settings=JSON.parse(window.localStorage.getItem('kairos_settings_cache')||'null');
    document.body.classList.toggle('mode-light',settings?.appearance?.mode==='light');
    for(const [prefix,value] of [['theme',settings?.appearance?.theme],['font',settings?.appearance?.font]]) {
      if(typeof value==='string' && /^[a-z0-9-]+$/.test(value))document.body.classList.add(prefix+'-'+value);
    }
    document.body.classList.toggle('reduce-motion',!!settings?.accessibility?.reduceMotion);
  } catch {}
  const panel=mount({root,auth,request,
    onClosePlans:()=>window.location.assign(back),
    onOpenPlans:()=>root.querySelector('h1')?.focus(),
    onExplore:()=>window.location.assign('app.html?page=ai')});
  function onAuth(user) {
    panel.reset();root.hidden=true;
    if(!user) {window.location.replace('login.html');return;}
    if(!user.emailVerified) {window.location.replace('verify-email.html?email='+encodeURIComponent(user.email||''));return;}
    message.hidden=true;root.hidden=false;void panel.refresh();
  }
  function onError() {
    panel.reset();root.hidden=true;message.hidden=false;
    message.textContent='Could not verify your account. Reload this page to try again.';
  }
  return {onAuth,onError,destroy:()=>panel.destroy()};
}
