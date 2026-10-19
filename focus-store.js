import {db} from './firebase.js';
import {doc,getDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {applyFocusLog} from './focus-model.js?v=3';
import {applyFocusCorrection} from './focus-history-model.js?v=1';
export async function loadFocusHistory(uid){if(!uid)throw Error('Sign in to view focus history.');const user=await getDoc(doc(db,'users',uid));return user.exists()?user.data().focusHistory||{sessions:[]}:{sessions:[]}}
export function persistFocusLog(planId,uid,entry){return persistFocusChange(planId,uid,entry,applyFocusLog)}
export function persistFocusCorrection(planId,uid,entry){return persistFocusChange(planId,uid,entry,applyFocusCorrection)}
async function persistFocusChange(planId,uid,entry,apply){
 if(!uid||entry.ownerId!==uid||entry.planId!==planId)throw Error('The signed-in account or planner changed.');
 return runTransaction(db,async transaction=>{const userRef=doc(db,'users',uid),user=await transaction.get(userRef),planRef=planId?doc(db,'study_plans',planId):null,plan=planRef?await transaction.get(planRef):null;
  const applied=apply(user.exists()?user.data():{},plan?.exists()?plan.data():null,entry);
  if(applied.userPatch)transaction.set(userRef,applied.userPatch,{merge:true});if(applied.planPatch)transaction.set(planRef,applied.planPatch,{merge:true});return applied.result;
 });
}
