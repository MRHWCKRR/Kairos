function protectionError(message) {
  return Object.assign(new Error(message), { code: 'ai-protection' });
}

export function aiConversationMessages(messages) {
  // Keep transport notices in the visible/persisted chat, never in model input.
  // Recognize the daily notice from the initial rollout before it was tagged.
  const legacyDailyNotice = /^(?:You have reached your daily Kairos AI allowance\.|Kairos has reached its daily AI allowance\.)(?: Resets at .+ Brisbane time\.| Please try again after the next daily reset\.)?$/;
  return messages.filter(message => message.notice !== true &&
    !(message.role === 'assistant' && legacyDailyNotice.test(message.content)));
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
    if (response.status === 429) {
      let budget;
      try { budget = await response.json(); } catch {}
      if (['daily-account', 'daily-site'].includes(budget?.code)) {
        const date = new Date(budget.resetsAt);
        const reset = Number.isFinite(date.getTime())
          ? ` Resets at ${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date)} Brisbane time.`
          : ' Please try again after the next daily reset.';
        const message = budget.code === 'daily-account' ? 'You have reached your daily Kairos AI allowance.' : 'Kairos has reached its daily AI allowance.';
        throw protectionError(message + reset);
      }
      throw protectionError('rate');
    }
    if (response.status === 401) throw protectionError('Please sign in again to use Kairos AI.');
    if (response.status === 403) throw protectionError('Verify your email, then refresh Kairos and try again.');
    if (response.status === 413) throw protectionError('This AI request is too large. Try a shorter message or a smaller plan.');
    if (!response.ok) {
      console.warn('Kairos AI returned HTTP status:', response.status);
      throw Object.assign(protectionError('Kairos AI is temporarily unavailable. Please try again shortly.'), { status: response.status });
    }
    return response;
  };
}

export function aiErrorMessage(error) {
  return error?.message === 'rate' ? 'Kairos AI is temporarily rate-limited. Please try again shortly.' : error?.message;
}
