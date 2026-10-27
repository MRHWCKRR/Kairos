export function createCalendarFeedRequester({getUser,getAppToken,fetchImpl=fetch,timeoutMs=15000}={}){
 return async function fetchCalendarFeed(url){
  const user=getUser();if(!user?.uid||!user.emailVerified)throw Error('Sign in with a verified email to import a calendar.');
  const controller=new AbortController();let expired=false,timer;
  const active=()=>{if(expired)throw Error('The calendar request took too long. Try again.');if(getUser()?.uid!==user.uid)throw Error('The signed-in account changed.');};
  const work=(async()=>{
   const idToken=await user.getIdToken();active();const appToken=await getAppToken();active();if(!appToken)throw Error('Refresh Kairos to verify this request.');
   const response=await fetchImpl('/api/calendar-feed',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appToken},body:JSON.stringify({url})});active();
   let data;try{data=await response.json();}catch{throw Error('Could not read this calendar. Try again.');}active();
   if(!response.ok)throw Error(data?.error||'Could not fetch this calendar. Try again.');
   if(typeof data.calendar!=='string'||data.calendar.length>1024*1024||typeof data.url!=='string')throw Error('The calendar service returned an invalid response.');
   return {calendar:data.calendar,url:data.url};
  })();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('The calendar request took too long. Try again.'));controller.abort();},timeoutMs)});
  try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);}
 };
}
