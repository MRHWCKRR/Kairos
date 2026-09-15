const AI_URL = 'https://ai.hackclub.com/proxy/v1/chat/completions';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // KAIROS_RELAY_SECRET is the Hack Club AI API key stored only in Vercel.
    // Never expose it to the browser or forward it to the Cloudflare Worker.
    const apiKey = process.env.KAIROS_RELAY_SECRET;
    if (!apiKey) {
        console.error('KAIROS_RELAY_SECRET is not configured on Vercel.');
        return res.status(503).json({ error: 'AI relay is not configured' });
    }

    try {
        const upstream = await fetch(AI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'qwen/qwen3-32b',
                messages: req.body?.messages,
                stream: false
            })
        });

        const text = await upstream.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text || 'AI server returned an invalid response' };
        }

        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error('AI relay error:', error);
        return res.status(502).json({ error: 'AI relay unavailable' });
    }
}
