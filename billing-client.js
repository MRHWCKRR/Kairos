import {auth,appCheckReady} from './firebase.js?v=2';
import {getToken} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import {createBillingRequester} from './billing-request.js?v=2';
export const requestBilling=createBillingRequester({
  getUser:()=>auth.currentUser,
  getAppToken:async()=>{
    const appCheck=await appCheckReady;
    if(!appCheck)throw Error('Refresh Kairos and try again.');
    return (await getToken(appCheck,false)).token;
  }
});
