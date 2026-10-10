import { auth, appCheckReady } from './firebase.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js';
import { createAiRequester } from './ai-request.js';
export { aiErrorMessage, aiConversationMessages } from './ai-request.js';

export const aiFetch = createAiRequester({
  getUser: () => auth.currentUser,
  getAppToken: async () => {
    const appCheck = await appCheckReady;
    if (!appCheck) throw Error('App Check unavailable');
    return (await getToken(appCheck, false)).token;
  }
});
