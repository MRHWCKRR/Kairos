import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectScheduleAssets, injectScheduleBridge, injectScheduleShell, rewriteRelaySource, rewriteScheduleRecurrenceImports } from './build-transforms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The browser must never receive the relay secret. During the Vercel build,
// point the client at the same-origin serverless relay instead of the public
// Cloudflare Worker URL. Schedule 3.0 is included because its AI planning
// preview uses the same relay.
for (const name of ['app.js', 'ai-workspace.js', 'schedule-workspace.js']) {
    const filePath = path.join(__dirname, name);
    let fileContent = fs.readFileSync(filePath, 'utf8');
    if (name === 'app.js') fileContent = injectScheduleBridge(fileContent);
    fileContent = rewriteRelaySource(fileContent);
    fs.writeFileSync(filePath, fileContent);
}

// Schedule's recurring-task helpers are nested ES modules. Cache-bust their
// import graph with the same Schedule version as the top-level scripts so a
// deployment cannot mix old recurrence logic with new UI/rendering modules.
for (const name of [
    'schedule-workspace.js',
    'schedule-interactions.js',
    'schedule-inspector.js',
    'schedule-task-create.js',
    'schedule-ai.js',
    'schedule-recurrence-ui.js',
    'boards-recurrence.js'
]) {
    const filePath = path.join(__dirname, name);
    if (!fs.existsSync(filePath)) continue;
    const fileContent = rewriteScheduleRecurrenceImports(fs.readFileSync(filePath, 'utf8'));
    fs.writeFileSync(filePath, fileContent);
}

// Add the first-party privacy-minimised visitor tracker to public pages and
// install the Schedule 3.0 shell/assets into app.html. The source app.html keeps
// the legacy markup as a safe fallback; deployed builds receive the new shell.
for (const name of fs.readdirSync(__dirname)) {
    if (!name.endsWith('.html') || name === 'analytics.html') continue;
    const filePath = path.join(__dirname, name);
    let html = fs.readFileSync(filePath, 'utf8');
    if (name === 'app.html') {
        html = injectScheduleShell(html);
        html = injectScheduleAssets(html);
    }
    html = html.replace(/\s*<script src="analytics-tracker\.js"><\/script>/g, '');
    if (html.includes('</body>')) {
        html = html.replace('</body>', '<script src="analytics-tracker.js"></script></body>');
        fs.writeFileSync(filePath, html);
    }
}

console.log('Build complete: routed AI through Vercel relay, installed Schedule 3.0, and installed privacy-first analytics tracker');
