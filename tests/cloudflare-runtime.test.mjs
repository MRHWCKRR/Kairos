import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { buildCloudflare } from '../cloudflare/build.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Kairos serves static assets and rejects unauthorised APIs in the real Workers runtime', { timeout: 60000 }, async t => {
  await buildCloudflare();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kairos-runtime-'));
  const config = JSON.parse(await fs.readFile(path.join(repository, 'wrangler.jsonc'), 'utf8'));
  config.main = path.join(repository, config.main);
  config.assets.directory = path.join(repository, 'dist');
  const configFile = path.join(directory, 'wrangler.json'); await fs.writeFile(configFile, JSON.stringify(config));
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [path.join(repository, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--env', 'preview', '--config', configFile, '--port', String(port), '--ip', '127.0.0.1'], {
    cwd: directory, windowsHide: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', XDG_CONFIG_HOME: path.join(directory, 'config') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  t.after(async () => {
    if (process.platform === 'win32' && child.exitCode === null) {
      await new Promise(resolve => {
        const stop = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        stop.once('exit', resolve); stop.once('error', resolve);
      });
    } else if (child.exitCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill();
      await Promise.race([stopped, delay(3000)]);
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let tries = 0; tries < 200; tries++) {
    if (child.exitCode !== null) break;
    try { const response = await fetch(origin, { signal: AbortSignal.timeout(500) }); if (response.status === 200) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'Workers runtime did not start:\n' + output);
  for (const asset of ['/', '/app.html', '/login.html', '/signup.html', '/firebase.js', '/images/kairos-logo.png']) {
    const response = await fetch(origin + asset); assert.equal(response.status, 200, asset);
  }
  for (const absent of ['/missing.html', '/api/_firebaseAdmin.js', '/server/ai.js', '/cloudflare/worker.js', '/package.json', '/.dev.vars', '/waitlist/Code.gs']) {
    assert.equal((await fetch(origin + absent)).status, 404, absent);
  }
  for (const privateAsset of ['/analytics.html', '/analytics-dashboard.js']) assert.match((await fetch(origin + privateAsset)).headers.get('cache-control'), /no-store/);
  const method = await fetch(origin + '/api/ai'); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST');
  assert.equal((await fetch(origin + '/api/ai', { method: 'POST', body: '{}' })).status, 503);
  assert.equal((await fetch(origin + '/api/analytics')).status, 401);
  assert.equal((await fetch(origin + '/api/cleanup-analytics')).status, 401);
  assert.equal((await fetch(origin + '/api/track', { method: 'POST', body: '{' })).status, 400);
});
