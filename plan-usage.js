function dateLabel(value) {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '—';
  return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date)+' Brisbane';
}
export function mountPlanUsage({root,auth,request,onStatus=()=>{},navigate=url=>globalThis.location.assign(url)}) {
  if(!root)throw Error('Plan panel missing');
  const find=id=>root.querySelector('#'+id),message=find('plan-message');
  let generation=0,destroyed=false,busy=false,current=null,boundUid=null;
  const controls=['plan-refresh-btn','plan-upgrade-btn','plan-manage-btn','plan-code-btn','plan-code-input'];
  function setBusy(value) {
    busy=value;
    for(const id of controls)find(id).disabled=value;
    if(!value) {
      const enabled=current?.codesEnabled===true;
      find('plan-code-btn').disabled=!enabled;find('plan-code-input').disabled=!enabled;
    }
  }
  function clear() {
    current=null;boundUid=null;
    for(const id of ['plan-tier','plan-daily-remaining','plan-used','plan-allowance','plan-bonus','plan-reset','plan-subscription','plan-access-until'])find(id).textContent='—';
    find('plan-upgrade-btn').hidden=true;find('plan-manage-btn').hidden=true;
    find('plan-trial-note').hidden=true;
    setBusy(false);
  }
  function render(status) {
    if(!status || !['free','plus'].includes(status.access?.tier) || !Number.isInteger(status.access.dailyLimit) ||
        !status.usage || ['used','remaining','bonusCredits'].some(key=>!Number.isSafeInteger(status.usage[key]) || status.usage[key]<0)) throw Error('Plan service returned an invalid status.');
    current=status;
    find('plan-tier').textContent=status.access.tier==='plus'?'Plus':'Free';
    find('plan-daily-remaining').textContent=String(status.usage.remaining);
    find('plan-used').textContent=String(status.usage.used);
    find('plan-allowance').textContent=String(status.access.dailyLimit);
    find('plan-bonus').textContent=String(status.usage.bonusCredits);
    find('plan-reset').textContent=dateLabel(status.usage.resetsAt);
    find('plan-access-until').textContent=status.access.accessUntil?dateLabel(status.access.accessUntil):'—';
    const billing=status.billing||{status:'none'};
    const names={none:'No paid subscription',active:'Active',past_due:'Payment needs attention',canceled:'Canceled',unpaid:'Unpaid',incomplete:'Payment pending',incomplete_expired:'Payment expired',trialing:'Trial',paused:'Paused',refunded:'Refunded',disputed:'Payment disputed'};
    find('plan-subscription').textContent=(names[billing.status]||'Unavailable')+
      (billing.paidThrough?'; '+(billing.cancelAtPeriodEnd?'ends ':'paid through ')+dateLabel(billing.paidThrough):'');
    find('plan-trial-note').hidden=status.trial!==true;
    const offer=status.offers?.find(offer=>offer.planId==='plus');
    find('plan-upgrade-btn').hidden=!offer || ['active','past_due','trialing','incomplete','paused'].includes(billing.status);
    if(offer) {
      if(!Number.isSafeInteger(offer.amount) || !/^[a-z]{3}$/.test(offer.currency))throw Error('Invalid plan price');
      find('plan-upgrade-btn').textContent='Upgrade — '+new Intl.NumberFormat('en-AU',{style:'currency',currency:offer.currency.toUpperCase()}).format(offer.amount/100)+'/month';
    }
    find('plan-manage-btn').hidden=billing.status==='none';
    find('plan-code-hint').textContent=!status.codesEnabled?'Code redemption will be available soon.':
      ['active','past_due','trialing','paused'].includes(billing.status)?
      'Access codes do not change subscription billing. '+(billing.cancelAtPeriodEnd?'Your scheduled cancellation stays in place.':'Your renewal continues unless you cancel in Manage subscription.'):
      'Access codes grant Kairos access or features without starting a subscription. Subscription discounts are entered in Stripe Checkout.';
    setBusy(busy);
    onStatus(status);
  }
  async function refresh({preserveMessage=false}={}) {
    if(destroyed)return;
    const uid=auth.currentUser?.uid;
    if(busy && !preserveMessage && boundUid===uid)return;
    const ticket=++generation;
    if(!uid){clear();message.textContent='Please sign in to manage your plan.';onStatus(null);return;}
    if(boundUid && boundUid!==uid)clear();
    boundUid=uid;setBusy(true);
    if(!preserveMessage)message.textContent='Loading your plan…';
    try {
      const status=await request('status');
      if(destroyed || ticket!==generation)return;
      if(auth.currentUser?.uid!==uid){clear();onStatus(null);return;}
      boundUid=uid;render(status);
      if(!preserveMessage)message.textContent=new URL(root.ownerDocument.defaultView.location?.href||'https://kairos.invalid').searchParams.get('billing')==='return' &&
        status.billing?.status!=='active'?'Payment confirmation pending. Refresh after Stripe has confirmed it.':'Usage is up to date.';
    } catch(error) {
      if(destroyed || ticket!==generation || auth.currentUser?.uid!==uid)return;
      clear();message.textContent=error.message||'Plan service is temporarily unavailable.';onStatus(null);
    } finally {if(!destroyed && ticket===generation && !preserveMessage)setBusy(false);}
  }
  async function action(route,body) {
    if(busy || destroyed || !auth.currentUser?.uid || boundUid!==auth.currentUser.uid)return;
    const uid=auth.currentUser.uid;setBusy(true);message.textContent=route==='redeem'?'Checking your code…':'Opening subscription management…';
    try {
      const result=await request(route,body);
      if(destroyed || auth.currentUser?.uid!==uid)return;
      if(route==='redeem') {
        message.textContent='Code redeemed. Access granted until '+dateLabel(result.grant?.expiresAt)+'.'+(result.billingContinues?' Your subscription billing continues.':'');
        find('plan-code-input').value='';
        await refresh({preserveMessage:true});
      } else {
        const url=new URL(result.url);
        if(!['https://checkout.stripe.com','https://billing.stripe.com'].includes(url.origin))throw Error('Invalid payment destination.');
        navigate(url.href);
      }
    }catch(error){if(!destroyed && auth.currentUser?.uid===uid)message.textContent=error.message||'Please try again.';}
    finally{if(!destroyed)setBusy(false);}
  }
  const refreshClick=()=>{if(!busy)void refresh();};
  const upgradeClick=()=>void action('checkout',{planId:'plus',requestId:globalThis.crypto.randomUUID()});
  const manageClick=()=>void action('portal',{});
  const redeem=event=>{event.preventDefault();if(current?.codesEnabled)void action('redeem',{code:find('plan-code-input').value.trim()});};
  find('plan-refresh-btn').addEventListener('click',refreshClick);
  find('plan-upgrade-btn').addEventListener('click',upgradeClick);
  find('plan-manage-btn').addEventListener('click',manageClick);
  find('plan-code-form').addEventListener('submit',redeem);
  return {refresh,destroy(){
    destroyed=true;generation++;
    find('plan-refresh-btn').removeEventListener('click',refreshClick);
    find('plan-upgrade-btn').removeEventListener('click',upgradeClick);
    find('plan-manage-btn').removeEventListener('click',manageClick);
    find('plan-code-form').removeEventListener('submit',redeem);
  }};
}
