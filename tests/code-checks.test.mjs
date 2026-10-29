import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {lintSources} from '../scripts/check-code.mjs';
test('code gate rejects syntax errors and missing local exports',async t=>{
 const rootDir=await mkdtemp(path.join(os.tmpdir(),'kairos-lint-'));t.after(()=>rm(rootDir,{recursive:true,force:true}));
 await writeFile(path.join(rootDir,'main.js'),'export const x = ;');
 await assert.rejects(lintSources({rootDir,entries:['main.js']}),/Unexpected/);
 await writeFile(path.join(rootDir,'main.js'),"import {missing} from './leaf.js?v=1'; console.log(missing);");
 await writeFile(path.join(rootDir,'leaf.js'),'export const present=1;');
 await assert.rejects(lintSources({rootDir,entries:['main.js']}),/No matching export/);
 await writeFile(path.join(rootDir,'main.js'),"import {present} from './leaf.js?v=1'; console.log(present);");
 await lintSources({rootDir,entries:['main.js']});
});
