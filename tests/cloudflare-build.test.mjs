import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCloudflare } from '../cloudflare/build.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function setup(t) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kairos-build-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const manifest = JSON.parse(await fs.readFile(path.join(repository, 'cloudflare/public-assets.json'), 'utf8'));
  for (const name of manifest.files) {
    const content = name.endsWith('.html') ? '<html><head></head><body><!-- Schedule Page: old --><div>legacy</div><!-- Calendar and Routines --></body></html>' : name.endsWith('.js') ? "import './recurrence-utils.js'; fetch('https://kairos.kirosapp.workers.dev');\n    // --- 14 Bedtime Reminder Engine ---" : 'fixture css';
    await fs.writeFile(path.join(rootDir, name), content);
  }
  for (const directory of manifest.directories) {
    await fs.mkdir(path.join(rootDir, directory), { recursive: true }); await fs.writeFile(path.join(rootDir, directory, 'fixture.png'), 'media fixture');
    await fs.writeFile(path.join(rootDir, directory, '.env'), 'secret fixture');
  }
  await fs.writeFile(path.join(rootDir, 'server-tooling.js'), 'secret fixture');
  await fs.writeFile(path.join(rootDir, '.dev.vars'), 'secret fixture');
  await fs.mkdir(path.join(rootDir, 'api')); await fs.writeFile(path.join(rootDir, 'api/ai.js'), 'secret fixture');
  return { rootDir, outputDir: path.join(rootDir, 'dist'), manifest };
}

async function tree(directory) {
  const entries = await fs.readdir(directory, { recursive: true }); const result = {};
  for (const entry of entries.sort()) { const full = path.join(directory, entry); if ((await fs.stat(full)).isFile()) result[entry] = (await fs.readFile(full)).toString('base64'); }
  return result;
}

test('Cloudflare build preserves source, transforms app assets, and excludes backend material', async t => {
  const fixture = await setup(t); const before = await tree(fixture.rootDir);
  await buildCloudflare(fixture);
  const app = await fs.readFile(path.join(fixture.outputDir, 'app.html'), 'utf8');
  assert.match(app, /id="schedule-calendar"/); assert.match(app, /schedule-workspace\.js\?v=10/);
  assert.equal((app.match(/analytics-tracker\.js/g) || []).length, 1);
  assert.doesNotMatch(await fs.readFile(path.join(fixture.outputDir, 'analytics.html'), 'utf8'), /analytics-tracker/);
  const js = await fs.readFile(path.join(fixture.outputDir, 'app.js'), 'utf8'); assert.match(js, /__kairosScheduleBridge/); assert.match(js, /fetch\('\/api\/ai'/); assert.doesNotMatch(js, /kirosapp\.workers\.dev/);
  assert.match(await fs.readFile(path.join(fixture.outputDir, 'schedule-ai.js'), 'utf8'), /recurrence-utils\.js\?v=10/);
  const output = await tree(fixture.outputDir); assert.equal(output[path.join('images', 'fixture.png')], Buffer.from('media fixture').toString('base64'));
  for (const [name, contents] of Object.entries(before)) assert.equal(await fs.readFile(path.join(fixture.rootDir, name), 'base64'), contents);
  assert.ok(!Object.keys(output).some(name => /api|server-tooling|\.env|\.dev.vars/.test(name)));
  assert.match(await fs.readFile(path.join(fixture.outputDir, '_headers'), 'utf8'), /\/analytics\.html\s+Cache-Control: no-store, max-age=0/);
});

test('Cloudflare build is repeatable and removes only stale output', async t => {
  const fixture = await setup(t); await buildCloudflare(fixture); const once = await tree(fixture.outputDir);
  await fs.writeFile(path.join(fixture.outputDir, 'stale-secret.js'), 'old'); await buildCloudflare(fixture);
  assert.deepEqual(await tree(fixture.outputDir), once);
  assert.equal(await fs.readFile(path.join(fixture.rootDir, 'server-tooling.js'), 'utf8'), 'secret fixture');
});

test('Cloudflare build refuses dangerous output targets and missing declared inputs', async t => {
  const fixture = await setup(t);
  await assert.rejects(buildCloudflare({ ...fixture, outputDir: fixture.rootDir }), /output/i);
  await assert.rejects(buildCloudflare({ ...fixture, outputDir: path.join(fixture.rootDir, '..') }), /output/i);
  await fs.unlink(path.join(fixture.rootDir, 'firebase.js')); await assert.rejects(buildCloudflare(fixture), /firebase\.js/);
  assert.equal(await fs.readFile(path.join(fixture.rootDir, 'server-tooling.js'), 'utf8'), 'secret fixture');
});
