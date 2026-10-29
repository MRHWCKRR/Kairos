// @ts-check
/** @typedef {{uid:string,emailVerified?:boolean,email?:string|null,reload:()=>Promise<void>}} SessionUser */
/**
 * Runs only after the host synchronously clears private account views.
 * @param {{getUser:()=>SessionUser|null,redirect:(url:string)=>void,isDeletionPending:()=>boolean,showDeleted:()=>void,hideLoading:()=>void,onVerified:()=>void,loaders:Array<{name:string,load:(user:SessionUser)=>unknown}>,onError:(phase:string,error:unknown)=>void,setTimer?:typeof setTimeout,clearTimer?:typeof clearTimeout}} host
 */
export function createAuthSession(host) {
    let revision=0;
    const setTimer=host.setTimer||setTimeout,clearTimer=host.clearTimer||clearTimeout;
    /** @param {SessionUser|null} user */
    async function load(user) {
        const ticket=++revision;
        if(!user){if(host.isDeletionPending())host.showDeleted();else host.redirect('login.html');return;}
        const current=()=>ticket===revision&&host.getUser()?.uid===user.uid;
        const fallback=setTimer(()=>{if(current())host.hideLoading();},8000);
        try {await user.reload();}catch(error){if(current())host.onError('authentication refresh',error);}
        if(!current()){clearTimer(fallback);return;}
        const refreshed=host.getUser();
        if(!refreshed?.emailVerified){clearTimer(fallback);host.redirect('verify-email.html'+(refreshed?.email?'?email='+encodeURIComponent(refreshed.email):''));return;}
        host.onVerified();host.hideLoading();
        // Each loader has its own failure boundary, so one outage cannot block the rest.
        for(const loader of host.loaders)void Promise.resolve().then(()=>{if(current())return loader.load(user);}).catch(error=>{if(current())host.onError(loader.name,error);});
    }
    return {load};
}
