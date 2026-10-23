// The existing rules allow creating an owned planner but cannot read a missing
// document. REST createDocument is create-only: concurrent tabs cannot overwrite.
export function createPlannerBootstrap({getUser,getAppToken,projectId,fetchImpl=fetch}) {
 return async function initializePlanner(uid) {
  const user=getUser();
  if(!user?.emailVerified||user.uid!==uid||!/^[a-z0-9-]+$/.test(projectId))throw Error('The signed-in account changed.');
  const token=await user.getIdToken(),appToken=await getAppToken();
  if(getUser()?.uid!==uid)throw Error('The signed-in account changed.');
  if(!appToken)throw Error('Could not initialize your planner. Refresh Kairos and try again.');
  const response=await fetchImpl('https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents/study_plans?documentId='+encodeURIComponent('plan-'+uid),{
   method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Firebase-AppCheck':appToken},
   body:JSON.stringify({fields:{userID:{stringValue:uid},boards:{arrayValue:{values:[]}},dayInsights:{mapValue:{fields:{}}},scheduleEvents:{arrayValue:{values:[]}},createdAt:{timestampValue:new Date().toISOString()}}})
  });
  if(getUser()?.uid!==uid)throw Error('The signed-in account changed.');
  if(response.ok)return;
  const data=await response.json().catch(()=>({}));
  if(response.status===409&&data.error?.status==='ALREADY_EXISTS')return;
  throw Error('Could not initialize your planner. Check your connection and try again.');
 };
}
