const WORKER_URL = 'https://kairos.kirosapp.workers.dev';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const sharedSecret = process.env.KAIROS_RELAY_SECRET;
    if (!sharedSecret) {
        console.error('KAIROS_RELAY_SECRET is not configured on Vercel.');
        return res.status(503).json({ error: 'AI relay is not configured' });
    }

    try {
        const upstream = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Kairos-Auth': sharedSecret
            },
            body: JSON.stringify(req.body)
        });

        const text = await upstream.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text || 'Worker returned an invalid response' };
        }

        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error('AI worker relay error:', error);
        return res.status(502).json({ error: 'AI relay unavailable' });
    }
}
