const RELAY_URL = 'https://kairos.kirosapp.workers.dev';
const RELAY_SECRET = '__KAIROS_RELAY_SECRET__';
const GEMINI_ENDPOINT = 'generativelanguage.googleapis.com';

const nativeFetch = window.fetch.bind(window);

async function relayCompletion(messages) {
    const response = await nativeFetch(RELAY_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Kairos-Auth': RELAY_SECRET
        },
        body: JSON.stringify({ messages })
    });

    if (!response.ok) return response;

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? '';

    return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }]
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';

    if (!url.includes(GEMINI_ENDPOINT)) {
        return nativeFetch(input, init);
    }

    try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        const contents = Array.isArray(body.contents) ? body.contents : [];
        const messages = contents.flatMap(item => {
            const text = Array.isArray(item?.parts)
                ? item.parts.map(part => part?.text || '').join('')
                : '';
            return text ? [{ role: 'user', content: text }] : [];
        });

        if (!messages.length) {
            return new Response(JSON.stringify({ error: { message: 'No AI prompt supplied.' } }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return await relayCompletion(messages);
    } catch (error) {
        console.error('AI relay error:', error);
        return new Response(JSON.stringify({ error: { message: 'AI relay request failed.' } }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

function removeLegacyAiSettings() {
    const tab = document.querySelector('.settings-tab[data-settings-tab="ai"]');
    const panel = document.getElementById('settings-ai');
    tab?.remove();
    panel?.remove();

    // Remove credentials left behind by older Kairos versions.
    localStorage.removeItem('kairos_api_key');
    localStorage.removeItem('kairos_hackclub_key');

    // The existing app code still checks the old Gemini key before its legacy
    // generation paths run. Supply an in-memory relay marker without storing a key.
    const originalGetItem = Storage.prototype.getItem;
    if (!Storage.prototype.__kairosRelayPatched) {
        Storage.prototype.getItem = function (key) {
            if (key === 'kairos_api_key') return '__KAIROS_RELAY__';
            return originalGetItem.call(this, key);
        };
        Storage.prototype.__kairosRelayPatched = true;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeLegacyAiSettings, { once: true });
} else {
    removeLegacyAiSettings();
}
