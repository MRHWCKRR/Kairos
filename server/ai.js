import { readBoundedText } from './http-body.js';

const AI_URL = 'https://ai.hackclub.com/proxy/v1/chat/completions';

export function createHandler({ env, adminAuth, appCheck, rateLimiter, dailyBudget, fetchImpl = fetch }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    res.setHeader('Cache-Control', 'no-store');
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers?.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in to use Kairos AI.', code: 'sign-in' });
    let user;
    try { user = await adminAuth.verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Please sign in again to use Kairos AI.', code: 'sign-in' }); }
    if (!user.uid || user.email_verified !== true) return res.status(403).json({ error: 'Verify your email before using Kairos AI.', code: 'verify-email' });
    const appToken = req.headers?.['x-firebase-appcheck'];
    if (!appToken) return res.status(403).json({ error: 'Refresh Kairos and try again.', code: 'app-check' });
    try { await appCheck.verifyToken(appToken); }
    catch { return res.status(403).json({ error: 'Refresh Kairos and try again.', code: 'app-check' }); }

    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 40 || messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim())) {
      return res.status(400).json({ error: 'AI messages are invalid.' });
    }
    if (new TextEncoder().encode(JSON.stringify(req.body)).byteLength > 128 * 1024) return res.status(413).json({ error: 'This AI request is too large. Try a shorter message.' });
    const format = req.body?.response_format;
    if (format !== undefined && (!format || !['json_object', 'text'].includes(format.type))) return res.status(400).json({ error: 'AI response format is invalid.' });
    try {
      if (!rateLimiter?.limit) throw Error('Missing rate limiter');
      const result = await rateLimiter.limit({ key: `ai:${user.uid}` });
      if (result.success !== true) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Kairos AI is busy for your account. Please try again shortly.', code: 'rate' });
      }
    } catch { return res.status(503).json({ error: 'Kairos AI is temporarily unavailable.' }); }

    // The upstream API key is supplied by the host, never by the browser.
    const provider = env.AI_PROVIDER || 'hackclub';
    const openrouter = provider === 'openrouter';
    const apiKey = openrouter ? env.OPENROUTER_API_KEY : env.KAIROS_RELAY_SECRET;
    const model = openrouter ? (env.AI_MODEL || 'openai/gpt-oss-120b') : 'qwen/qwen3-32b';
    if (!['openrouter', 'hackclub'].includes(provider) || !apiKey || !/^[a-zA-Z0-9._:/-]+$/.test(model)) {
        console.error(JSON.stringify({ event: 'kairos_ai_configuration_missing' }));
        return res.status(503).json({ error: 'AI relay is not configured' });
    }

    // Reserve before contacting the provider. Attempts count even if it fails;
    // refunding failures would permit unlimited upstream requests during outages.
    try {
        const budget = await dailyBudget?.reserve(user.uid);
        if (budget?.allowed !== true) {
            if (budget?.allowed !== false || !['account', 'site'].includes(budget.reason) ||
                !Number.isFinite(Date.parse(budget.resetsAt)) || !Number.isInteger(budget.retryAfter) || budget.retryAfter < 1) throw Error('Invalid daily allowance');
            res.setHeader('Retry-After', String(budget.retryAfter));
            return res.status(429).json({ code: `daily-${budget.reason}`, resetsAt: budget.resetsAt,
                error: budget.reason === 'account' ? 'You have reached your daily Kairos AI allowance.' : 'Kairos has reached its daily AI allowance.' });
        }
    } catch {
        console.error(JSON.stringify({ event: 'kairos_ai_budget_unavailable' }));
        return res.status(503).json({ error: 'Kairos AI is temporarily unavailable.' });
    }

    try {
        const upstream = await fetchImpl(openrouter ? 'https://openrouter.ai/api/v1/chat/completions' : AI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({
                model,
                messages: messages.map(({ role, content }) => ({ role, content })),
                response_format: format ? { type: format.type } : undefined,
                max_tokens: openrouter ? 2048 : 8192,
                stream: false,
                ...(openrouter ? { provider: { data_collection: 'deny', max_price: { prompt: 0.4, completion: 3 } },
                    ...(model.startsWith('openai/gpt-oss-') ? { reasoning: { effort: 'low' } } : {}) } : {})
            })
        });

        if (!upstream.ok) console.warn(JSON.stringify({ event: 'kairos_ai_upstream_status', status: upstream.status }));
        if (openrouter && !upstream.ok) {
            await upstream.body?.cancel();
            return res.status(upstream.status === 429 ? 429 : 503).json({ error: 'Kairos AI is temporarily unavailable.' });
        }
        const text = await readBoundedText(upstream, 1024 * 1024);
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text || 'AI server returned an invalid response' };
        }

        if (openrouter && (data.error || !data.choices?.[0]?.message?.content || data.choices[0].finish_reason === 'length')) {
            return res.status(502).json({ error: 'Kairos AI could not finish its response. Try a shorter request.' });
        }
        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error(JSON.stringify({ event: 'kairos_ai_upstream_failed', reason: error?.name === 'TimeoutError' ? 'timeout' : 'request-failed' }));
        return res.status(502).json({ error: 'AI relay unavailable' });
    }
}

}
