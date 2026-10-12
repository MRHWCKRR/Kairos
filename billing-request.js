const routes=new Set(['status','checkout','portal','redeem','delete-account']);
export function createBillingRequester({getUser,getAppToken,fetchImpl=fetch,clock=Date.now}) {
  let identity=null,state=null;
  function clear(){identity=null;state=null;}
  function account(uid){
    if(identity!==uid||!state){identity=uid;state={cached:null,expires:0,pending:null,revision:0,cooldowns:new Map()};}
    return state;
  }
  function invalidate(){if(state){state.cached=null;state.expires=0;state.revision++;}}
  async function requestBilling(route,body,{fresh=false}={}) {
    if(!routes.has(route))throw Error('Invalid plan action');
    const user=getUser();
    if(!user){clear();throw Error('Please sign in to manage your plan.');}
    if(route!=='delete-account' && !user.emailVerified)throw Error('Verify your email before managing your plan.');
    const scope=account(user.uid),retryAt=scope.cooldowns.get(route)||0;
    if(retryAt>clock())throw Object.assign(Error('Please try again shortly.'),{status:429,retryAt,retryAfter:Math.ceil((retryAt-clock())/1000)});
    if(route==='status'){
      if(scope.pending){
        const pendingRevision=scope.pendingRevision,result=await scope.pending;
        if(state!==scope||getUser()?.uid!==user.uid)throw Error('Your sign-in changed. Please try again.');
        return pendingRevision!==scope.revision?requestBilling(route,body,{fresh:true}):result;
      }
      if(!fresh&&scope.cached&&scope.expires>clock())return scope.cached;
    }
    const revision=scope.revision;
    const sameAccount=()=>state===scope&&getUser()?.uid===user.uid;
    const work=(async()=>{
      const idToken=await user.getIdToken(route==='delete-account'),appToken=await getAppToken();
      if(!appToken || !sameAccount())throw Error('Your sign-in changed. Please try again.');
      const response=await fetchImpl('/api/billing/'+route,{
        method:route==='status'?'GET':'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appToken},
        ...(route==='status'?{}:{body:JSON.stringify(body||{})})
      });
      if(!sameAccount())throw Error('Your sign-in changed. Please try again.');
      let data;try{data=await response.json();}catch{data={};}
      if(!sameAccount())throw Error('Your sign-in changed. Please try again.');
      if(!response.ok){
        const error=Object.assign(Error(data.error||'Plan service is temporarily unavailable.'),{status:response.status});
        if(response.status===429){
          const header=response.headers.get('Retry-After');
          const seconds=/^\d+$/.test(header||'')?Number(header):Math.ceil((Date.parse(header)-clock())/1000);
          error.retryAfter=Number.isSafeInteger(seconds)&&seconds>0&&seconds<=86400?seconds:60;
          error.retryAt=clock()+error.retryAfter*1000;scope.cooldowns.set(route,error.retryAt);
        }
        throw error;
      }
      scope.cooldowns.delete(route);
      if(route==='status'&&revision===scope.revision){scope.cached=data;scope.expires=clock()+30000;}
      if(route!=='status')invalidate();
      return data;
    })();
    if(route==='status'){scope.pending=work;scope.pendingRevision=revision;}
    try{return await work;}finally{if(scope.pending===work)scope.pending=null;}
  }
  requestBilling.invalidate=invalidate;
  requestBilling.clear=clear;
  return requestBilling;
}

