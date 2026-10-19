import {db} from './firebase.js';
import {doc,runTransaction} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {applyFocusLog} from './focus-model.js?v=1';
export async function persistFocusLog(planId,uid,entry){
 if(!uid||entry.ownerId!==uid||entry.planId!==planId)throw Error('The signed-in account or planner changed.');
 return runTransaction(db,async transaction=>{const userRef=doc(db,'users',uid),user=await transaction.get(userRef),planRef=planId?doc(db,'study_plans',planId):null,plan=planRef?await transaction.get(planRef):null;
  const applied=applyFocusLog(user.exists()?user.data():{},plan?.exists()?plan.data():null,entry);
  if(applied.userPatch)transaction.set(userRef,applied.userPatch,{merge:true});if(applied.planPatch)transaction.set(planRef,applied.planPatch,{merge:true});return applied.result;
 });
}
