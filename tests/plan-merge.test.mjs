import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function merge(base,local,remote) {
  let source='';
  try {source=await readFile(new URL('../plan-merge.js',import.meta.url),'utf8')} catch(e){if(e.code!=='ENOENT')throw e}
  const context=vm.createContext({structuredClone});
  vm.runInContext(source.replace(/^export /gm,''),context);
  assert.equal(typeof context.mergePlanEdits,'function','shared conflict-safe merge exists');
  return JSON.parse(JSON.stringify(context.mergePlanEdits(base,local,remote)));
}
const plan=()=>({boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'one',title:'Essay',completed:false},{id:'two',title:'Revision'}]}]}],dayInsights:{},scheduleEvents:[]});
const task=(p,n=0)=>p.boards[0].sections[0].tasks[n];

test('manual task completion preserves a concurrent AI rename of another task',async()=>{
  const base=plan(),local=structuredClone(base),remote=structuredClone(base);
  task(local).completed=true;task(remote,1).title='Science revision';
  const saved=await merge(base,local,remote);
  assert.equal(task(saved).completed,true);assert.equal(task(saved,1).title,'Science revision');
});
test('merge keeps concurrent additions and remote deletions without resurrection',async()=>{
  const base=plan(),local=structuredClone(base),remote=structuredClone(base);
  task(local).completed=true;
  remote.boards[0].sections[0].tasks.splice(1,1,{id:'three',title:'New task'});
  const saved=await merge(base,local,remote);
  assert.deepEqual(saved.boards[0].sections[0].tasks.map(t=>t.id),['one','three']);
});
test('competing edits to the same field fail instead of silently overwriting',async()=>{
  const base=plan(),local=structuredClone(base),remote=structuredClone(base);
  task(local).title='Manual name';task(remote).title='AI name';
  await assert.rejects(merge(base,local,remote),/changed in another/i);
});
test('remote deletion conflicts with a local edit to that entity',async()=>{
  const base=plan(),local=structuredClone(base),remote=structuredClone(base);
  task(local).completed=true;remote.boards[0].sections[0].tasks.shift();
  await assert.rejects(merge(base,local,remote),/changed in another/i);
});

test('Firestore map key reordering does not turn a deletion into a conflict',async()=>{
  const base=plan(),local=structuredClone(base),remote=structuredClone(base);
  local.boards[0].sections[0].tasks.shift();
  remote.boards[0].sections[0].tasks[0]={completed:false,title:'Essay',id:'one'};
  const saved=await merge(base,local,remote);
  assert.deepEqual(saved.boards[0].sections[0].tasks.map(t=>t.id),['two']);
});
