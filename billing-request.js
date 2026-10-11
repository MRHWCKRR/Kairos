const routes=new Set(['status','checkout','portal','redeem','delete-account']);
export function createBillingRequester({getUser,getAppToken,fetchImpl=fetch}) {
  return async function requestBilling(route,body) {
    if(!routes.has(route))throw Error('Invalid plan action');
    const user=getUser();
    if(!user)throw Error('Please sign in to manage your plan.');
    if(route!=='delete-account' && !user.emailVerified)throw Error('Verify your email before managing your plan.');
    const idToken=await user.getIdToken(route==='delete-account'),appToken=await getAppToken();
    if(!appToken || getUser()?.uid!==user.uid)throw Error('Your sign-in changed. Please try again.');
    const response=await fetchImpl('/api/billing/'+route,{
      method:route==='status'?'GET':'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appToken},
      ...(route==='status'?{}:{body:JSON.stringify(body||{})})
    });
    const data=await response.json();
    if(getUser()?.uid!==user.uid)throw Error('Your sign-in changed. Please try again.');
    if(!response.ok)throw Error(data.error||'Plan service is temporarily unavailable.');
    return data;
  };
}
