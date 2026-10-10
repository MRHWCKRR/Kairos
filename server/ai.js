import { readBoundedText } from './http-body.js';

const AI_URL = 'https://ai.hackclub.com/proxy/v1/chat/completions';

export function createHandler({ env, adminAuth, appCheck, rateLimiter, fetchImpl = fetch }) {
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
    const apiKey = env.KAIROS_RELAY_SECRET;
    if (!apiKey) {
        console.error('KAIROS_RELAY_SECRET is not configured.');
        return res.status(503).json({ error: 'AI relay is not configured' });
    }

    try {
        const upstream = await fetchImpl(AI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({
                model: 'qwen/qwen3-32b',
                messages: messages.map(({ role, content }) => ({ role, content })),
                response_format: format ? { type: format.type } : undefined,
                max_tokens: 8192,
                stream: false
            })
        });

        if (!upstream.ok) console.warn(JSON.stringify({ event: 'kairos_ai_upstream_status', status: upstream.status }));
        const text = await readBoundedText(upstream, 1024 * 1024);
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text || 'AI server returned an invalid response' };
        }

        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error(JSON.stringify({ event: 'kairos_ai_upstream_failed', reason: error?.name === 'TimeoutError' ? 'timeout' : 'request-failed' }));
        return res.status(502).json({ error: 'AI relay unavailable' });
    }
}

}
