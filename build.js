import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The browser must never receive the relay secret. During the Vercel build,
// point the client at the same-origin serverless relay instead of the public
// Cloudflare Worker URL.
const appPath = path.join(__dirname, 'app.js');
let appContent = fs.readFileSync(appPath, 'utf8');
appContent = appContent.replaceAll('https://kairos.kirosapp.workers.dev', '/api/ai');
fs.writeFileSync(appPath, appContent);

// Add the first-party privacy-minimised visitor tracker to public pages.
// analytics.html is intentionally excluded because the admin dashboard does not
// need to record the administrator's own dashboard visits.
for (const name of fs.readdirSync(__dirname)) {
    if (!name.endsWith('.html') || name === 'analytics.html') continue;
    const filePath = path.join(__dirname, name);
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/\s*<script src="analytics-tracker\.js"><\/script>/g, '');
    if (html.includes('</body>')) {
        html = html.replace('</body>', '<script src="analytics-tracker.js"></script></body>');
        fs.writeFileSync(filePath, html);
    }
}

console.log('Build complete: routed AI through Vercel relay and installed privacy-first analytics tracker');
