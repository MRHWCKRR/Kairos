import {auth,db} from './firebase.js?v=2';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {doc,onSnapshot} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {readMessageUsage,usageDay} from './ai-usage.js?v=1';
import {mountAiActivity} from './statistics-ai-view.js?v=1';
import {flushMessageUsage,initializeMessageUsage} from './ai-usage-store.js?v=2';

const root=document.getElementById('ai-activity');
if(root) {
  const view=mountAiActivity(root);let unsubscribe=null,observedUid=null;
  function observe({force=false}={}) {
    const user=auth.currentUser;
    const visible=document.getElementById('statistics-page').classList.contains('active');
    if(visible && user?.emailVerified && observedUid===user.uid && unsubscribe && !force)return;
    unsubscribe?.();unsubscribe=null;observedUid=null;view.clear();
    if(!visible || !user?.emailVerified)return;
    observedUid=user.uid;
    void flushMessageUsage(user.uid);
    unsubscribe=onSnapshot(doc(db,'users',user.uid),snapshot=>{
      if(auth.currentUser?.uid!==user.uid)return;
      const data=snapshot.exists()?snapshot.data():{};
      if(!data.aiMessageStats)void initializeMessageUsage(user.uid).catch(()=>{});
      view.render(readMessageUsage(data),usageDay());
    },()=>view.error());
  }
  const authUnsubscribe=onAuthStateChanged(auth,()=>observe());
  root.querySelector('[data-activity-refresh]').addEventListener('click',()=>observe({force:true}));
  window.addEventListener('kairos-page-ready',observe);
  const midnight=setInterval(()=>{
    if(!document.hidden && document.getElementById('statistics-page').classList.contains('active'))view.tick();
  },60000);
  window.addEventListener('pagehide',event=>{if(!event.persisted){unsubscribe?.();authUnsubscribe();clearInterval(midnight);} });
  window.addEventListener('pageshow',event=>{if(event.persisted)observe({force:true});});
}
