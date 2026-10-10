import { readBoundedText } from './http-body.js';

const AI_URL = 'https://ai.hackclub.com/proxy/v1/chat/completions';

export function createHandler({ env, fetchImpl = fetch }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

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
                messages: req.body?.messages,
                response_format: req.body?.response_format,
                stream: false
            })
        });

        const text = await readBoundedText(upstream, 1024 * 1024);
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text || 'AI server returned an invalid response' };
        }

        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error('AI relay request failed.');
        return res.status(502).json({ error: 'AI relay unavailable' });
    }
}

}
