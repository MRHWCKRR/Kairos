function dateLabel(value) {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '—';
  return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date)+' Brisbane';
}
// Stripe charge units differ from ISK/UGX's ISO display decimals.
const zeroDecimalCharges=new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','vnd','vuv','xaf','xof','xpf']);
export function appendPlanLimitActions(root,messages){
  const doc=root.ownerDocument,rows=root.querySelectorAll('.ai-chat-bubble-row');
  messages.forEach((message,index)=>{
    if(!['daily-account','weekly-account'].includes(message.limit?.reason)||!rows[index])return;
    const button=doc.createElement('button');
    button.type='button';button.className='plan-link plan-limit-action';button.textContent='View plans';
    button.setAttribute('data-view-plans','');button.setAttribute('data-plan-limit-action','');
    button.dataset.resetsAt=message.limit.resetsAt||'';
    rows[index].appendChild(button);
  });
  doc.dispatchEvent(new doc.defaultView.Event('kairos-plan-notices'));
}
export function mountPlanUsage({root,auth,request,onStatus=()=>{},navigate=url=>globalThis.location.assign(url),storage,returnUrl,onExplore,onOpenPlans,onClosePlans}) {
  if(!root)throw Error('Plan panel missing');
  const find=id=>root.querySelector('#'+id),message=find('plan-message');
  let generation=0,destroyed=false,busy=false,current=null,boundUid=null,stale=true,retryAt=0,retryTimer=null,usageTimer=null,lastRefresh=0,showNear=false,usageDirty=false;
  const doc=root.ownerDocument,accountPlan=doc.getElementById('settings-account-plan'),welcome=doc.getElementById('plan-welcome');
  try {storage ??= doc.defaultView.sessionStorage;}catch{}
  const pendingKey='kairos_upgrade_pending';
  let pending=null,pollTimer=null,pollCount=0;
  const returnState=new URL(returnUrl||doc.defaultView.location?.href||'https://kairos.invalid').searchParams.get('billing');
  const returned=returnState==='return';
  let interval='month',returnNotice=true;
  const selectedOffer=status=>status?.offers?.find(offer=>offer.planId==='plus'&&(offer.interval||'month')===interval);
  const money=offer=>new Intl.NumberFormat('en-AU',{style:'currency',currency:offer.currency.toUpperCase()}).format(offer.amount/(zeroDecimalCharges.has(offer.currency)?1:100));
  function messageForReturn(){
    if(returnNotice&&returnState==='canceled')return 'Checkout canceled. Your current plan is shown below. You can choose a billing period when you’re ready.';
    if(pending?.uid===boundUid)return pollCount>=5?'We’re still confirming your payment. This is taking longer than usual. Refresh your plan shortly; you don’t need to pay again.':'Confirming your upgrade… Your plan will update once payment is verified. You can refresh here at any time.';
    if(returnNotice&&returnState==='portal')return 'Your subscription details are up to date.';
    if(returnNotice&&returned)return 'Your plan is up to date. Payment confirmation appears here once it is verified.';
    return 'Usage is up to date.';
  }
  try {const saved=JSON.parse(storage?.getItem(pendingKey)||'null');if(returned&&saved?.uid&&Number.isFinite(saved.startedAt)&&Date.now()-saved.startedAt<86400000&&saved.startedAt<=Date.now())pending=saved;}catch{}
  function closeWelcome(){if(welcome?.hasAttribute('open')){if(welcome.close)welcome.close();else welcome.removeAttribute('open');}}
  function openPlan(){void Promise.resolve(onOpenPlans?.()).then(()=>find('plan-comparison-title')?.focus());}
  const closePlan=()=>{if(onClosePlans)void onClosePlans();else doc.querySelector('.nav-item[data-target="home-page"]')?.click();};
  find('plan-back-btn')?.addEventListener('click',closePlan);
  const viewPlans=event=>{if(event.target.closest('[data-view-plans]'))openPlan();};
  doc.addEventListener('click',viewPlans);
  function renderLimitActions(){
    const useful=!stale&&current?.trial===false&&current?.access?.tier==='free'&&current?.plans?.plus?.dailyLimit>current.access.dailyLimit;
    for(const button of doc.querySelectorAll('[data-plan-limit-action]'))button.hidden=!useful||!(Date.parse(button.dataset.resetsAt)>Date.now());
  }
  doc.addEventListener('kairos-plan-notices',renderLimitActions);
  function nearKey(){return 'kairos_plan_notice:'+boundUid+':'+current?.usage?.resetsAt;}
  function hideNear(){const notice=doc.getElementById('ai-plan-notice');if(notice)notice.hidden=true;}
  const dismissNear=()=>{hideNear();try{storage?.setItem(nearKey(),'dismissed');}catch{}};
  doc.getElementById('ai-plan-notice-dismiss')?.addEventListener('click',dismissNear);
  function renderNear(){
    const notice=doc.getElementById('ai-plan-notice'),text=doc.getElementById('ai-plan-notice-copy');
    if(!notice||!text)return;
    let seen=null;try{seen=storage?.getItem(nearKey());}catch{}
    const dismissed=seen==='dismissed'||(seen==='seen'&&notice.hidden);
    const limit=current?.access?.dailyLimit;
    const eligible=showNear&&!stale&&!dismissed&&current?.trial===false&&current?.access?.tier==='free'&&limit>=5&&
      current?.plans?.plus?.dailyLimit>limit&&current.usage.used>=Math.ceil(limit*.8)&&current.usage.remaining>0;
    notice.hidden=!eligible;
    if(eligible){text.textContent=current.usage.remaining+' AI requests left today. Plus offers more room for busy weeks.';try{storage?.setItem(nearKey(),'seen');}catch{}}
  }
  const accountManage=()=>openPlan();
  const explore=()=>{closeWelcome();if(onExplore)onExplore();else doc.querySelector('.nav-item[data-target="ai-page"]')?.click();};
  const viewPlan=()=>{closeWelcome();openPlan();};
  doc.getElementById('settings-account-manage-plan')?.addEventListener('click',accountManage);
  doc.getElementById('plan-welcome-close')?.addEventListener('click',closeWelcome);
  doc.getElementById('plan-welcome-start')?.addEventListener('click',explore);
  doc.getElementById('plan-welcome-plan')?.addEventListener('click',viewPlan);
  function confirmUpgrade(status,uid){
    if(!pending||pending.uid!==uid)return false;
    if(status.access.tier==='plus'&&status.billing?.status==='active'&&status.billing.paidThrough>Date.now()&&!status.billing.paymentRisk){
      doc.getElementById('plan-welcome-benefit').textContent=String(status.access.dailyLimit)+' AI requests a day'+(status.access.weeklyLimit?', up to '+status.access.weeklyLimit+' a week':'')+' to explore ideas, break down tasks and keep your plans moving.';
      if(welcome.showModal)welcome.showModal();else welcome.setAttribute('open','');
      try {storage?.removeItem(pendingKey);}catch{}
      pending=null;clearTimeout(pollTimer);pollTimer=null;
      try {const url=new URL(doc.defaultView.location.href);url.searchParams.delete('billing');doc.defaultView.history.replaceState(null,'',url.href);}catch{}
      return true;
    }
    if(pollCount<5&&!pollTimer){pollCount++;pollTimer=setTimeout(()=>{pollTimer=null;if(!destroyed&&auth.currentUser?.uid===uid)void refresh();},2000);pollTimer.unref?.();}
    return false;
  }
  const controls=['plan-refresh-btn','plan-upgrade-btn','plan-manage-btn','plan-code-btn','plan-code-input','plan-interval-month','plan-interval-year','plan-retry-btn'];
  function setBusy(value) {
    busy=value;
    for(const id of controls)if(find(id))find(id).disabled=value;
    if(!value) {
      const enabled=current?.codesEnabled===true;
      find('plan-code-btn').disabled=!enabled;find('plan-code-input').disabled=!enabled;
      find('plan-upgrade-btn').disabled=stale||!selectedOffer(current);
      find('plan-refresh-btn').disabled=retryAt>Date.now();
      if(find('plan-retry-btn'))find('plan-retry-btn').disabled=retryAt>Date.now();
      if(usageDirty)scheduleUsage();
    }
  }
  function clear() {
    for(const id of ['plan-free-weekly-limit','plan-plus-weekly-limit','plan-compare-free-weekly','plan-compare-plus-weekly','plan-weekly-used','plan-weekly-allowance','plan-weekly-remaining','plan-weekly-reset'])if(find(id))find(id).textContent='—';
    if(find('plan-retry-btn'))find('plan-retry-btn').hidden=true;
    current=null;boundUid=null;interval='month';stale=true;retryAt=0;showNear=false;usageDirty=false;hideNear();clearTimeout(usageTimer);usageTimer=null;clearTimeout(retryTimer);retryTimer=null;renderLimitActions();
    if(accountPlan)accountPlan.textContent='—';closeWelcome();clearTimeout(pollTimer);pollTimer=null;
    for(const id of ['plan-compare-free','plan-compare-plus'])if(find(id))find(id).textContent='—';
    for(const id of ['plan-price-detail','plan-billing-notice'])if(find(id))find(id).textContent='';
    renderInterval();
    for(const id of ['plan-tier','plan-daily-remaining','plan-used','plan-allowance','plan-bonus','plan-reset','plan-subscription','plan-access-until'])find(id).textContent='—';
    find('plan-upgrade-btn').hidden=true;find('plan-manage-btn').hidden=true;
    for(const tier of ['free','plus']) {
      find('plan-'+tier+'-current').hidden=true;
      find('plan-'+tier+'-card').classList.remove('is-current');
    }
    find('plan-free-cta').textContent='Checking your plan…';
    find('plan-plus-price').textContent='Checking availability…';find('plan-plus-period').textContent='';
    find('plan-plus-unavailable').hidden=false;find('plan-plus-unavailable').textContent='Checking availability…';
    find('plan-trial-note').hidden=true;
    for(const id of ['plan-free-limit','plan-plus-limit'])if(find(id))find(id).textContent='—';
    if(find('plan-offer-status'))find('plan-offer-status').textContent='Check your plan to see availability.';
    if(find('plan-comparison-note'))find('plan-comparison-note').textContent='Current allowances and pricing appear after your plan loads.';
    setBusy(false);
  }
  function render(status,{preserveStale=false}={}) {
    if(!status || !['free','plus'].includes(status.access?.tier) || !Number.isInteger(status.access.dailyLimit) ||
        !status.usage || ['used','remaining','bonusCredits'].some(key=>!Number.isSafeInteger(status.usage[key]) || status.usage[key]<0)) throw Error('Plan service returned an invalid status.');
    if(status.offers!==undefined&&!Array.isArray(status.offers))throw Error('Invalid plan price');
    for(const item of status.offers||[])if(item.planId==='plus'&&(!Number.isSafeInteger(item.amount)||item.amount<1||!/^[a-z]{3}$/.test(item.currency||'')||!['month','year'].includes(item.interval||'month')))throw Error('Invalid plan price');
    if(find('plan-retry-btn')&&!preserveStale)find('plan-retry-btn').hidden=true;
    current=status;if(!preserveStale){stale=false;retryAt=0;}
    find('plan-tier').textContent=status.access.tier==='plus'?'Plus':'Free';
    if(accountPlan)accountPlan.textContent=status.access.tier==='plus'?'Kairos Plus':'Free';
    find('plan-daily-remaining').textContent=String(status.usage.remaining);
    find('plan-used').textContent=String(status.usage.used);
    find('plan-allowance').textContent=String(status.access.dailyLimit);
    find('plan-bonus').textContent=String(status.usage.bonusCredits);
    find('plan-reset').textContent=dateLabel(status.usage.resetsAt);
    find('plan-access-until').textContent=status.access.accessUntil?dateLabel(status.access.accessUntil):'—';
    for(const [id,value] of Object.entries({'plan-weekly-used':status.usage.weeklyUsed,'plan-weekly-allowance':status.access.weeklyLimit,'plan-weekly-remaining':status.usage.weeklyRemaining}))if(find(id))find(id).textContent=Number.isSafeInteger(value)?String(value):'—';
    if(find('plan-weekly-reset'))find('plan-weekly-reset').textContent=status.usage.weeklyResetsAt?dateLabel(status.usage.weeklyResetsAt):'—';
    for(const tier of ['free','plus'])for(const id of ['plan-'+tier+'-weekly-limit','plan-compare-'+tier+'-weekly'])if(find(id))find(id).textContent=Number.isSafeInteger(status.plans?.[tier]?.weeklyLimit)?String(status.plans[tier].weeklyLimit):'—';
    const billing=status.billing||{status:'none'};
    const names={none:'No paid subscription',active:'Active',past_due:'Payment needs attention',canceled:'Canceled',unpaid:'Unpaid',incomplete:'Payment pending',incomplete_expired:'Payment expired',trialing:'Trial',paused:'Paused',refunded:'Refunded',disputed:'Payment disputed'};
    find('plan-subscription').textContent=(names[billing.status]||'Unavailable')+
      (billing.paidThrough?'; '+(billing.cancelAtPeriodEnd?'ends ':'paid through ')+dateLabel(billing.paidThrough):'');
    find('plan-trial-note').hidden=true;
    const offer=selectedOffer(status);
    renderInterval();
    find('plan-upgrade-btn').hidden=!offer || ['active','past_due','trialing','incomplete','paused','unpaid'].includes(billing.status);
    if(offer) {
      if(!Number.isSafeInteger(offer.amount) || !/^[a-z]{3}$/.test(offer.currency))throw Error('Invalid plan price');
      find('plan-upgrade-btn').textContent=(status.billingMode==='test'?'Test checkout — ':'Upgrade to Plus — ')+money(offer)+'/'+interval;
    }
    for(const tier of ['free','plus']){const limit=status.trial===true?status.access.dailyLimit:status.plans?.[tier]?.dailyLimit;if(find('plan-'+tier+'-limit'))find('plan-'+tier+'-limit').textContent=Number.isInteger(limit)&&limit>0?String(limit):'—';}
    if(find('plan-offer-status'))find('plan-offer-status').textContent=offer?(status.billingMode==='test'?'Test checkout: use test payment details. No real money moves.':(interval==='year'?'Yearly':'Monthly')+' subscription. Manage renewal and cancellation in your billing portal.'):
      status.offers?.length?(interval==='year'?'Yearly':'Monthly')+' billing is currently unavailable. Choose another billing period.':'Plus coming soon. Purchases are not available here yet.';
    for(const tier of ['free','plus'])if(find('plan-compare-'+tier))find('plan-compare-'+tier).textContent=find('plan-'+tier+'-limit')?.textContent||'—';
    const detail=find('plan-price-detail');
    if(detail)detail.textContent=offer?offer.currency.toUpperCase()+' · '+money(offer)+' billed '+(interval==='year'?'yearly':'monthly')+'.':'';
    const notice=find('plan-billing-notice');
    if(notice)notice.textContent=billing.cancelAtPeriodEnd&&billing.paidThrough>Date.now()?'Your subscription will end on '+dateLabel(billing.paidThrough)+'. You can manage renewal in the billing portal.':
      billing.paymentRisk?'A payment needs attention. Review your subscription in the billing portal.':
      ['past_due','unpaid','incomplete','incomplete_expired'].includes(billing.status)?'Your payment needs attention. Open Manage subscription to review your payment details.':
      billing.status==='active'&&billing.paidThrough>Date.now()?'Your '+(billing.interval==='year'?'yearly':billing.interval==='month'?'monthly':'paid')+' subscription renews after '+dateLabel(billing.paidThrough)+'.':
      status.access.tier==='plus'&&status.access.accessUntil?'Your Plus access lasts until '+dateLabel(status.access.accessUntil)+'.':
      status.trial===true?'Your current daily allowance is '+status.access.dailyLimit+' AI requests.':'You’re on Free. Your tasks and conversations stay with you if you change plans.';
    if(find('plan-comparison-note'))find('plan-comparison-note').textContent='';
    const accountLink=doc.getElementById('settings-account-manage-plan');
    if(accountLink)accountLink.textContent=status.access.tier==='plus'?'Manage plan':'View plans';
    find('plan-manage-btn').hidden=billing.status==='none';
    // The same verified status drives both choice cards and existing payment
    // controls. No client-defined price, entitlement or checkout availability.
    for(const tier of ['free','plus']) {
      const selected=status.access.tier===tier;
      find('plan-'+tier+'-current').hidden=!selected;
      find('plan-'+tier+'-card').classList.toggle('is-current',selected);
    }
    find('plan-free-cta').textContent=status.access.tier==='free'?'Your current plan':'Free plan';
    const price=find('plan-plus-price'),period=find('plan-plus-period');
    if(offer) {
      price.textContent=money(offer);
      period.textContent=' / '+interval;
    } else {
      price.textContent=status.access.tier==='plus'?'Current plan':status.offers?.length?'Unavailable':'Coming soon';
      period.textContent='';
    }
    const unavailable=find('plan-plus-unavailable');
    unavailable.hidden=!find('plan-upgrade-btn').hidden || !find('plan-manage-btn').hidden;
    unavailable.textContent=status.access.tier==='plus'?'Your current plan':status.offers?.length?'Billing period unavailable':'Coming soon';
    for(const label of root.querySelectorAll('[data-plan-limit-period]'))label.textContent='AI requests a day';
    find('plan-code-hint').textContent=!status.codesEnabled?'Code redemption will be available soon.':
      ['active','past_due','trialing','paused'].includes(billing.status)?
      'Access codes do not change subscription billing. '+(billing.cancelAtPeriodEnd?'Your scheduled cancellation stays in place.':'Your renewal continues unless you cancel in Manage subscription.'):
      'Enter your access code. Subscription discounts apply at checkout.';
    setBusy(busy);
    onStatus(status);renderNear();renderLimitActions();
  }
  async function refresh({preserveMessage=false,fresh=false}={}) {
    if(destroyed)return;
    const uid=auth.currentUser?.uid;
    if(busy && !preserveMessage && boundUid===uid)return;
    const ticket=++generation;
    if(!uid){clear();message.textContent='Please sign in to manage your plan.';onStatus(null);return;}
    if(boundUid && boundUid!==uid)clear();
    boundUid=uid;
    if(returnState==='canceled'&&returnNotice){try{const saved=JSON.parse(storage?.getItem(pendingKey)||'null');if(saved?.uid===uid)storage?.removeItem(pendingKey);}catch{}pending=null;}
    setBusy(true);
    if(!preserveMessage)message.textContent='Loading your plan…';
    try {
      const status=await request('status',null,{fresh:fresh||pending?.uid===uid});
      if(destroyed || ticket!==generation)return;
      if(auth.currentUser?.uid!==uid){clear();onStatus(null);return;}
      boundUid=uid;lastRefresh=Date.now();render(status);
      const welcomed=confirmUpgrade(status,uid);
      if(!preserveMessage)message.textContent=welcomed?'Your Kairos Plus upgrade is ready.':messageForReturn();
    } catch(error) {
      if(destroyed || ticket!==generation || auth.currentUser?.uid!==uid)return;
      stale=true;retryAt=error.retryAt||0;hideNear();renderLimitActions();
      if(!current){clear();retryAt=error.retryAt||0;onStatus(null);
        find('plan-free-cta').textContent='Plan unavailable';
        find('plan-plus-price').textContent='Unavailable';
        find('plan-plus-unavailable').textContent='Could not check availability';
      }
      if(find('plan-retry-btn'))find('plan-retry-btn').hidden=false;
      message.textContent=(current?'We couldn’t refresh your plan. Showing your last update. ':'')+(error.message||'Plan service is temporarily unavailable.')+
        (retryAt>Date.now()?' Retry after '+dateLabel(retryAt)+'.':'');
      if(find('plan-offer-status'))find('plan-offer-status').textContent='Refresh your plan before purchasing. Plan availability could not be confirmed.';
      clearTimeout(retryTimer);
      if(retryAt>Date.now()){retryTimer=setTimeout(()=>{retryTimer=null;if(!destroyed&&auth.currentUser?.uid===uid)setBusy(busy);},retryAt-Date.now()+10);retryTimer.unref?.();}
    } finally {if(!destroyed && ticket===generation && !preserveMessage)setBusy(false);}
  }
  async function action(route,body) {
    if(busy || destroyed || !auth.currentUser?.uid || boundUid!==auth.currentUser.uid)return;
    const uid=auth.currentUser.uid;returnNotice=false;setBusy(true);message.textContent=route==='redeem'?'Checking your code…':route==='checkout'?'Opening secure checkout…':'Opening subscription management…';
    try {
      if(route==='checkout'){
        const status=await request('status',null,{fresh:true});
        if(destroyed||auth.currentUser?.uid!==uid)return;
        render(status);
        if(!selectedOffer(status))throw Error('This billing period is unavailable. Refresh your plan and choose another period.');
      }
      const result=await request(route,body);
      if(destroyed || auth.currentUser?.uid!==uid)return;
      if(route==='redeem') {
        message.textContent='Code redeemed. Access granted until '+dateLabel(result.grant?.expiresAt)+'.'+(result.billingContinues?' Your subscription billing continues.':'');
        find('plan-code-input').value='';
        await refresh({preserveMessage:true});
      } else {
        const url=new URL(result.url);
        if(!['https://checkout.stripe.com','https://billing.stripe.com'].includes(url.origin))throw Error('Invalid payment destination.');
        if(route==='checkout'&&url.origin==='https://checkout.stripe.com')try {storage?.setItem(pendingKey,JSON.stringify({uid,startedAt:Date.now()}));}catch{}
        navigate(url.href);
      }
    }catch(error){if(!destroyed && auth.currentUser?.uid===uid){if(route==='checkout'){stale=true;hideNear();renderLimitActions();}message.textContent=error.message||'Please try again.';}}
    finally{if(!destroyed&&auth.currentUser?.uid===uid)setBusy(false);}
  }
  const refreshClick=()=>{if(!busy)void refresh({fresh:true});};
  function renderInterval(){for(const period of ['month','year'])find('plan-interval-'+period)?.setAttribute('aria-pressed',String(period===interval));}
  const selectInterval=period=>{if(busy||destroyed)return;interval=period;if(current)render(current,{preserveStale:stale});else renderInterval();};
  const selectMonth=()=>selectInterval('month'),selectYear=()=>selectInterval('year');
  find('plan-interval-month')?.addEventListener('click',selectMonth);
  find('plan-interval-year')?.addEventListener('click',selectYear);
  let checkoutUid=null,checkoutRequestId=null,checkoutInterval=null;
  const upgradeClick=()=>{
    if(checkoutUid!==auth.currentUser?.uid||checkoutInterval!==interval){checkoutUid=auth.currentUser?.uid;checkoutInterval=interval;checkoutRequestId=null;}
    checkoutRequestId ||= globalThis.crypto.randomUUID();
    void action('checkout',{planId:'plus',interval,requestId:checkoutRequestId});
  };
  const manageClick=()=>void action('portal',{});
  const redeem=event=>{event.preventDefault();if(current?.codesEnabled)void action('redeem',{code:find('plan-code-input').value.trim()});};
  find('plan-refresh-btn').addEventListener('click',refreshClick);
  find('plan-retry-btn')?.addEventListener('click',refreshClick);
  find('plan-upgrade-btn').addEventListener('click',upgradeClick);
  find('plan-manage-btn').addEventListener('click',manageClick);
  find('plan-code-form').addEventListener('submit',redeem);
  function scheduleUsage(){
    if(destroyed||!auth.currentUser?.uid||usageTimer)return;
    usageTimer=setTimeout(()=>{
      usageTimer=null;
      if(destroyed||busy)return;
      usageDirty=false;void refresh();
    },Math.max(300,10000-(Date.now()-lastRefresh)));
    usageTimer.unref?.();
  }
  function usageChanged({success=false}={}){
    request.invalidate?.();showNear=success;usageDirty=true;scheduleUsage();
  }
  return {refresh,usageChanged,reset(){generation++;request.clear?.();clear();onStatus(null);},destroy(){
    destroyed=true;generation++;
    clearTimeout(pollTimer);clearTimeout(usageTimer);clearTimeout(retryTimer);closeWelcome();
    doc.removeEventListener('click',viewPlans);
    find('plan-back-btn')?.removeEventListener('click',closePlan);
    doc.removeEventListener('kairos-plan-notices',renderLimitActions);
    doc.getElementById('ai-plan-notice-dismiss')?.removeEventListener('click',dismissNear);
    doc.getElementById('settings-account-manage-plan')?.removeEventListener('click',accountManage);
    doc.getElementById('plan-welcome-close')?.removeEventListener('click',closeWelcome);
    doc.getElementById('plan-welcome-start')?.removeEventListener('click',explore);
    doc.getElementById('plan-welcome-plan')?.removeEventListener('click',viewPlan);
    find('plan-refresh-btn').removeEventListener('click',refreshClick);
    find('plan-retry-btn')?.removeEventListener('click',refreshClick);
    find('plan-upgrade-btn').removeEventListener('click',upgradeClick);
    find('plan-interval-month')?.removeEventListener('click',selectMonth);
    find('plan-interval-year')?.removeEventListener('click',selectYear);
    find('plan-manage-btn').removeEventListener('click',manageClick);
    find('plan-code-form').removeEventListener('submit',redeem);
  }};
}

