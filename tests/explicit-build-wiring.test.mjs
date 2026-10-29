import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('production Schedule shell and bridge are explicit source, available before packaging',async()=>{
 const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="schedule-calendar"/);
 assert.equal((app.match(/window\.__kairosScheduleBridge =/g)||[]).length,1);
 assert.match(app,/window\.dispatchEvent\(new CustomEvent\('kairos-schedule-bridge-ready'\)\)/);
});
test('production client sources already use the same-origin AI endpoint',async()=>{
 for(const file of ['app.js','ai-workspace.js','schedule-workspace.js']){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/https:\/\/kairos\.kirosapp\.workers\.dev/);
 }
});
