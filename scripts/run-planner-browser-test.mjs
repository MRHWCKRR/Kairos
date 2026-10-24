import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './build-planner-browser-test.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url=pathToFileURL(path.join(root,'.superpowers/browser-workflows/planner-workflows.html'));url.searchParams.set('autorun','1');
const result=spawnSync(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--allow-file-access-from-files','--virtual-time-budget=10000','--dump-dom',url.href],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
if(result.error)throw result.error;
const markup=result.stdout.replace(/<script[\s\S]*?<\/script>/gi,'');
const passed=/<p[^>]*id="browser-test-result"[^>]*data-result="passed"/.test(markup);
if(result.status!==0||!passed){console.error(markup.match(/<p[^>]*id="browser-test-result"[\s\S]*?<\/p>/)?.[0]||result.stderr);process.exitCode=1;}else console.log('Browser planner journeys passed.');

