import {auth} from './firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {requestBilling} from './billing-client.js?v=2';
import {mountPlanUsage} from './plan-usage.js?v=5';
import {mountStandalonePlans} from './plans-controller.js?v=1';

const controller=mountStandalonePlans({document,window,auth,request:requestBilling,mount:mountPlanUsage});
const unsubscribe=onAuthStateChanged(auth,controller.onAuth,controller.onError);
window.addEventListener('pagehide',event=>{if(!event.persisted){unsubscribe();controller.destroy();}});
window.addEventListener('pageshow',event=>{if(event.persisted)controller.onAuth(auth.currentUser);});
