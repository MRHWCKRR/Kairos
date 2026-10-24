import test from 'node:test';import assert from 'node:assert/strict';
import {buildRestoreCommand,applyRestoreCommand,archiveMarkup} from '../planner-archive.js';
import {createPlannerBackup} from '../planner-backup.js';
const state=()=>({boards:[{id:'b',title:'<script>alert(1)</script>',archived:true,sections:[{id:'s',title:'General',tasks:[{id:'t',title:'Read',archived:false}]}]}],scheduleEvents:[],dayInsights:{}});
test('restoring an archived board preserves tasks and rejects changed reviewed contents',()=>{
 const data=state(),{command,expected}=buildRestoreCommand(data,{kind:'board',boardId:'b'});
 const next=applyRestoreCommand(data,command,expected).next;assert.equal(next.boards[0].archived,false);assert.equal(next.boards[0].sections[0].tasks[0].title,'Read');assert.equal(data.boards[0].archived,true);
 data.boards[0].sections[0].tasks.push({id:'later',title:'Changed'});assert.throws(()=>applyRestoreCommand(data,command,expected),/changed/i);
});
test('archive escapes user labels and counts hidden descendants as one recoverable board',()=>{
 const view=archiveMarkup(state());assert.equal(view.count,1);assert.ok(!view.html.includes('<script>'));assert.match(view.html,/&lt;script&gt;/);
});
test('versioned export includes archived planner data, uses saved settings and rejects a loading planner',()=>{
 const data=state(),backup=createPlannerBackup({ownerId:'one',planId:'p',plan:data,settings:{profile:{timezone:'Australia/Brisbane'}},now:0});
 assert.equal(backup.schemaVersion,1);assert.equal(backup.format,'kairos-backup');assert.equal(backup.planner.boards[0].archived,true);data.boards[0].title='Changed';assert.notEqual(backup.planner.boards[0].title,'Changed');
 assert.throws(()=>createPlannerBackup({ownerId:'one',planId:null,plan:data}),/loading/i);
});

