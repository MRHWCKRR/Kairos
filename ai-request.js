function protectionError(message) {
  return Object.assign(new Error(message), { code: 'ai-protection' });
}

export function createAiRequester({ getUser, getAppToken, fetchImpl = fetch }) {
  return async function aiFetch(options) {
    const user = getUser();
    if (!user) throw protectionError('Please sign in to use Kairos AI.');
    if (!user.emailVerified) throw protectionError('Verify your email before using Kairos AI.');
    let idToken;
    try { idToken = await user.getIdToken(); }
    catch { throw protectionError('Please sign in again to use Kairos AI.'); }
    let appToken;
    try { appToken = await getAppToken(); if (!appToken) throw Error('No App Check token'); }
    catch { throw protectionError('Refresh Kairos and try again. Browser privacy settings may be blocking its security check.'); }
    if (getUser()?.uid !== user.uid) throw protectionError('Please sign in again to use Kairos AI.');
    const response = await fetchImpl('/api/ai', {
      ...options, method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': appToken }
    });
    if (response.status === 429) throw protectionError('rate');
    if (response.status === 401) throw protectionError('Please sign in again to use Kairos AI.');
    if (response.status === 403) throw protectionError('Verify your email, then refresh Kairos and try again.');
    if (response.status === 413) throw protectionError('This AI request is too large. Try a shorter message or a smaller plan.');
    if (!response.ok) throw protectionError('Kairos AI is temporarily unavailable. Please try again shortly.');
    return response;
  };
}

export function aiErrorMessage(error) {
  return error?.message === 'rate' ? 'Kairos AI is temporarily rate-limited. Please try again shortly.' : error?.message;
}
