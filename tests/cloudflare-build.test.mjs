import {createSettingsSync} from '../settings-sync.js';
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
  assert.match(await fs.readFile(path.join(fixture.outputDir, 'schedule-ai.js'), 'utf8'), /recurrence-utils\.js\?v=14/);
  const output = await tree(fixture.outputDir); assert.equal(output[path.join('images', 'fixture.png')], Buffer.from('media fixture').toString('base64'));
  for (const [name, contents] of Object.entries(before)) assert.equal(await fs.readFile(path.join(fixture.rootDir, name), 'base64'), contents);
  assert.ok(!Object.keys(output).some(name => /api|server-tooling|\.env|\.dev.vars/.test(name)));
  const headers = await fs.readFile(path.join(fixture.outputDir, '_headers'), 'utf8');
  assert.match(headers, /\/\*\s+Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'/);
  assert.match(headers, /\/\*[^]*Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(headers, /\/\*[^]*Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers, /\/\*[^]*Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(headers, /\/\*[^]*X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/\*[^]*X-Frame-Options: DENY/);
  assert.match(headers, /\/analytics\.html\s+Cache-Control: no-store, max-age=0/);
  assert.match(headers, /\/analytics-dashboard\.js\s+Cache-Control: no-store, max-age=0/);
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


test('real packaged shell includes focused controllers and bridge reads the confirmed settings baseline',async t=>{
 const fixture=await setup(t);
 const files=['app.js','app.html','app-bootstrap.js','notification-center.js','settings-sync.js','dashboard-controller.js'];
 for(const name of files)await fs.copyFile(path.join(repository,name),path.join(fixture.rootDir,name));
 await buildCloudflare(fixture);
 const app=await fs.readFile(path.join(fixture.outputDir,'app.js'),'utf8');
 assert.equal((app.match(/window.__kairosScheduleBridge =/g)||[]).length,1);
 assert.match(app,/notification-center\.js\?v=\d+/);assert.match(app,/settings-sync\.js\?v=\d+/);assert.match(app,/dashboard-controller\.js\?v=\d+/);
 for(const name of files.slice(3))assert.equal(await fs.readFile(path.join(fixture.outputDir,name),'utf8'),await fs.readFile(path.join(repository,name),'utf8'));
 assert.match(await fs.readFile(path.join(fixture.outputDir,'app-bootstrap.js'),'utf8'),/app\.js\?v=\d+/);
 assert.match(await fs.readFile(path.join(fixture.outputDir,'app.html'),'utf8'),/app-bootstrap\.js\?v=\d+/);
 let applied={planning:{rescheduleCompleted:true,dailyLimitMinutes:120,gapMinutes:10,weeklyAvailability:{1:[]}}},draft=applied;
 const settingsSync=createSettingsSync({getOwnerId:()=> 'one',getApplied:()=>applied,setApplied:value=>applied=value,setDraft:value=>draft=value,defaults:()=>({}),mergeDefaults:value=>value,storage:{getItem:()=>null,setItem(){}},readRemote:async()=>({settings:{planning:{rescheduleCompleted:false,dailyLimitMinutes:60,gapMinutes:0}},confirmed:true})});
 const window={dispatchEvent(){}};const start=app.indexOf('    // Schedule 3.0 bridge:');assert.ok(start>=0);
 const bridge=app.slice(start,app.indexOf('    // --- 14 Bedtime Reminder Engine ---',start));
 new Function('window','CustomEvent','settingsSync',bridge)(window,class{},settingsSync);
 assert.equal(window.__kairosScheduleBridge.getAllowCompletedReschedule(),true);assert.deepEqual(window.__kairosScheduleBridge.getPlanningPreferences(),{dailyLimitMinutes:120,gapMinutes:10});assert.deepEqual(window.__kairosScheduleBridge.getWeeklyAvailability(),{1:[]});
 await settingsSync.load('one');assert.equal(window.__kairosScheduleBridge.getAllowCompletedReschedule(),false);assert.equal(window.__kairosScheduleBridge.getPlanningPreferences().dailyLimitMinutes,60);settingsSync.dispose();
});
