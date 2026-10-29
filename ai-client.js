import { auth, appCheckReady } from './firebase.js?v=2';
import { getToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import { createAiRequester } from './ai-request.js?v=2';
export { aiErrorMessage, aiConversationMessages } from './ai-request.js?v=2';

export const aiFetch = createAiRequester({
  onUsage: detail => window.dispatchEvent(new CustomEvent('kairos-ai-usage',{detail})),
  getUser: () => auth.currentUser,
  getAppToken: async () => {
    const appCheck = await appCheckReady;
    if (!appCheck) throw Error('App Check unavailable');
    return (await getToken(appCheck, false)).token;
  }
});
