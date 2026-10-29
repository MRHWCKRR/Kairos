import {auth,db} from './firebase.js?v=2';
import {doc,runTransaction} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {createMessageRecorder} from './ai-usage.js?v=1';
import {createUsageOutbox} from './ai-usage-outbox.js?v=1';

const write=createMessageRecorder({
  getUser:()=>auth.currentUser,
  document:uid=>doc(db,'users',uid),
  transact:callback=>runTransaction(db,callback)
});
let storage;try {storage=window.localStorage;}catch{}
const outbox=createUsageOutbox({storage,getUser:()=>auth.currentUser,write,makeId:()=>crypto.randomUUID()});
export const recordSentMessage=outbox.record;
export const flushMessageUsage=outbox.flush;
export const initializeMessageUsage=(uid,baseline)=>write(uid,baseline,{initialize:true});
window.addEventListener('online',()=>{if(auth.currentUser?.uid)void outbox.flush(auth.currentUser.uid);});
