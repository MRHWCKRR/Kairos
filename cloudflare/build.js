import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectScheduleAssets, injectScheduleBridge, injectScheduleShell, rewriteRelaySource, rewriteScheduleRecurrenceImports } from '../build-transforms.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(new URL('./public-assets.json', import.meta.url), 'utf8'));
const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.avif', '.ico', '.mp3', '.wav', '.ogg', '.mp4', '.webm']);
const relayFiles = new Set(['app.js', 'ai-workspace.js', 'schedule-workspace.js']);
const recurrenceFiles = new Set(['schedule-workspace.js', 'schedule-interactions.js', 'schedule-inspector.js', 'schedule-task-create.js', 'schedule-ai.js', 'schedule-recurrence-ui.js', 'boards-recurrence.js']);

async function assertRegularInput(file, directory = false) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error(`Invalid public asset input: ${file}`);
}

async function copyMedia(source, target) {
  await assertRegularInput(source, true);
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic public asset is not allowed: ${entry.name}`);
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyMedia(from, to);
    else if (entry.isFile() && mediaExtensions.has(path.extname(entry.name).toLowerCase())) await fs.copyFile(from, to);
  }
}

export async function buildCloudflare({ rootDir = repository, outputDir = path.join(rootDir, 'dist') } = {}) {
  rootDir = await fs.realpath(rootDir);
  outputDir = path.resolve(outputDir);
  if (outputDir !== path.join(rootDir, 'dist')) throw new Error('Output must be the selected repository dist directory.');
  try {
    const existing = await fs.lstat(outputDir);
    if (existing.isSymbolicLink() || !existing.isDirectory()) throw new Error('Output must be a regular directory.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Validate all declared inputs before touching previously built output.
  for (const name of manifest.files) {
    if (path.basename(name) !== name) throw new Error('Public file manifest must contain root filenames.');
    await assertRegularInput(path.join(rootDir, name));
  }
  for (const directory of manifest.directories) {
    if (path.basename(directory) !== directory) throw new Error('Public media manifest must contain root directories.');
    await assertRegularInput(path.join(rootDir, directory), true);
  }
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  for (const name of manifest.files) {
    let content = await fs.readFile(path.join(rootDir, name), 'utf8');
    if (name === 'app.js') content = injectScheduleBridge(content);
    if (relayFiles.has(name)) content = rewriteRelaySource(content);
    if (recurrenceFiles.has(name)) content = rewriteScheduleRecurrenceImports(content);
    if (name.endsWith('.html')) {
      if (name === 'app.html') content = injectScheduleAssets(injectScheduleShell(content));
      if (name !== 'analytics.html') {
        content = content.replace(/\s*<script src="analytics-tracker\.js"><\/script>/g, '');
        content = content.replace('</body>', '<script src="analytics-tracker.js"></script></body>');
      }
    }
    await fs.writeFile(path.join(outputDir, name), content);
  }
  for (const directory of manifest.directories) await copyMedia(path.join(rootDir, directory), path.join(outputDir, directory));
  await fs.copyFile(new URL('./_headers', import.meta.url), path.join(outputDir, '_headers'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildCloudflare();
  console.log('Cloudflare assets built in dist; source files unchanged.');
}
