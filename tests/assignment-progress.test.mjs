import test from 'node:test';
import assert from 'node:assert/strict';
let m={};try{m=await import('../assignment-progress.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'p',title:'Essay',dueDate:'2026-10-19'},{id:'a',title:'Research',assignmentId:'p',sessionIndex:1,completed:true,estimatedMinutes:30},{id:'b',title:'Draft',assignmentId:'p',sessionIndex:2,date:'2026-10-20',estimatedMinutes:60}]}]}]});
function index(s){assert.equal(typeof m.assignmentProgressIndex,'function');return m.assignmentProgressIndex(s,'2026-10-18')}
test('progress counts sessions and remaining planned effort without completing the assignment',()=>{
 const s=state(),before=structuredClone(s),p=index(s).get('p');assert.equal(p.completed,1);assert.equal(p.total,2);assert.equal(p.remainingMinutes,60);assert.equal(p.lateSessions,1);assert.deepEqual(s,before);
 assert.equal(index(s).get('b').parentId,'p');assert.equal(index(s).get('b').sessionIndex,2);
});
test('archived sessions and missing parents do not inflate progress; duplicate IDs are ambiguous',()=>{
 const s=state();s.boards[0].sections[0].tasks[2].archived=true;assert.equal(index(s).get('p').total,1);
 s.boards[0].sections[0].tasks.shift();assert.equal(index(s).get('a'),undefined);
 const duplicate=state();duplicate.boards[0].sections[0].tasks.push({id:'p',title:'Duplicate'});assert.equal(index(duplicate).get('p'),undefined);
});
test('deadline status and session links are escaped readable markup',()=>{
 const s=state();s.boards[0].sections[0].tasks[0].title='<img src=x>';const p=index(s).get('p');
 assert.equal(typeof m.assignmentProgressMarkup,'function');const html=m.assignmentProgressMarkup(p,{details:true});assert.match(html,/1 of 2 sessions/);assert.match(html,/60 min/);assert.match(html,/Scheduled after deadline/);assert.match(html,/data-assignment-open="a"/);assert.doesNotMatch(html,/<img/);
});
test('opt-in sequence exposes ready and waiting prerequisites in cards and linked sessions',()=>{
 const s=state();s.boards[0].sections[0].tasks[0].sessionOrder='sequential';s.boards[0].sections[0].tasks[1].completed=false;s.boards[0].sections[0].tasks[1].title='<img src=x>';
 const p=index(s);assert.match(m.assignmentProgressMarkup(p.get('p'),{details:true}),/1 ready.*1 waiting/);const html=m.assignmentProgressMarkup(p.get('b'));assert.match(html,/Waiting for &lt;img/);assert.doesNotMatch(html,/<img/);
 s.boards[0].sections[0].tasks[1].completed=true;assert.match(m.assignmentProgressMarkup(index(s).get('b')),/Ready/);
});
