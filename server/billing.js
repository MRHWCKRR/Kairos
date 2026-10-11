import { flag,planCatalog } from './plans.js';
import { resolveAccess } from './entitlements.js';
import { codeDigest,generateAccessCode,redeemAccessCode } from './access-codes.js';
import { readBoundedText } from './http-body.js';
function response(body,status=200) {return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
export function createBillingHandlers({env,store,stripe,adminAuth,appCheck,rateLimiter,clock=Date.now,usage=uid=>store.readUsage(uid)}) {
  const catalog=planCatalog(env);
  async function authenticate(request) {
    const token=/^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization')||'')?.[1];
    if(!token) throw Object.assign(Error('Sign in to manage your plan.'),{status:401});
    let user;
    try {user=await adminAuth.verifyIdToken(token);}
    catch {throw Object.assign(Error('Please sign in again.'),{status:401});}
    if(!user.uid || user.email_verified!==true) throw Object.assign(Error('Verify your email first.'),{status:403});
    const appToken=request.headers.get('X-Firebase-AppCheck');
    if(!appToken) throw Object.assign(Error('Refresh Kairos and try again.'),{status:403});
    try {await appCheck.verifyToken(appToken);}
    catch {throw Object.assign(Error('Refresh Kairos and try again.'),{status:403});}
    return user.uid;
  }
  function route(method,allowed,action) {
    return async request=>{
      if(request.method!==method)return response({error:'Method Not Allowed'},405);
      try {
        const uid=await authenticate(request);
        if(!rateLimiter?.limit || (await rateLimiter.limit({key:'billing:'+allowed.join(',')+':'+uid})).success!==true)
          return response({error:'Please try again shortly.'},429);
        let body={};
        if(method==='POST') {
          try {body=JSON.parse(await readBoundedText(request,4096));}
          catch {return response({error:'Invalid request.'},400);}
          if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!allowed.includes(key))) return response({error:'Invalid request.'},400);
        }
        return response(await action(uid,body));
      } catch(error) {
        return response({error:error.status?error.message:'Plan service is temporarily unavailable.'},error.status||503);
      }
    };
  }
  function codesEnabled() {return flag(env.ACCESS_CODES_ENABLED)&&Boolean(env.REDEMPTION_HASH_SECRET);}
  const handlers={
    status:route('GET',[],async uid=>{
      const account=await store.readAccount(uid);
      if(account.deleting)throw Error('Account deleting');
      const access=resolveAccess({catalog,billing:account.billing,grants:account.grants,now:clock()});
      return {access,usage:await usage(uid),billing:account.billing||{status:'none',paidThrough:null,cancelAtPeriodEnd:false},offers:await stripe.offers(),codesEnabled:codesEnabled(),trial:!catalog.enforced};
    }),
    checkout:route('POST',['planId','requestId'],async(uid,body)=>{
      if(body.planId!=='plus' || typeof body.requestId!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.requestId)) throw Object.assign(Error('Invalid plan request.'),{status:400});
      return stripe.createCheckout(uid,body.planId,body.requestId);
    }),
    portal:route('POST',[],uid=>stripe.createPortal(uid)),
    redeem:route('POST',['code'],async(uid,body)=>{
      if(!codesEnabled())throw Object.assign(Error('Code redemption is not available yet.'),{status:503});
      try {return await redeemAccessCode({uid,code:body.code,store,env,now:clock()});}
      catch {throw Object.assign(Error('This code is invalid or unavailable.'),{status:400});}
    }),
    issueCode:route('POST',['kind','planId','featureId','months','maxUses','redeemBefore','intendedUid'],async(uid,body)=>{
      if(uid!==env.ANALYTICS_ADMIN_UID)throw Object.assign(Error('Owner access required.'),{status:403});
      if(!codesEnabled())throw Error('Codes unavailable');
      const code=generateAccessCode(),digest=codeDigest(code,env.REDEMPTION_HASH_SECRET,store.scope);
      const definition={scope:store.scope,kind:body.kind,months:body.months,maxUses:body.maxUses,redeemBefore:body.redeemBefore,
        perAccountLimit:1,intendedUid:body.intendedUid||null,revokedAt:null,...(body.kind==='plan'?{planId:body.planId}:{featureId:body.featureId})};
      await store.issueCode({digest,definition,ownerUid:uid});
      return {code};
    }),
    revokeCode:route('POST',['code'],async(uid,body)=>{
      if(uid!==env.ANALYTICS_ADMIN_UID)throw Object.assign(Error('Owner access required.'),{status:403});
      if(!codesEnabled())throw Error('Codes unavailable');
      return store.revokeCode({digest:codeDigest(body.code,env.REDEMPTION_HASH_SECRET,store.scope),ownerUid:uid,now:clock()});
    })
  };
  return handlers;
}
