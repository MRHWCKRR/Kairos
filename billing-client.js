import {auth,appCheckReady} from './firebase.js';
import {getToken} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js';
import {createBillingRequester} from './billing-request.js?v=2';
export const requestBilling=createBillingRequester({
  getUser:()=>auth.currentUser,
  getAppToken:async()=>{
    const appCheck=await appCheckReady;
    if(!appCheck)throw Error('Refresh Kairos and try again.');
    return (await getToken(appCheck,false)).token;
  }
});
