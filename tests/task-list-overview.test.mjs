import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mountTaskListWorkspace,renderTaskListRow} from '../task-list-workspace.js';

test('production overview refresh preserves the active title draft and caret',async()=>{
  const {document,window}=parseHTML('<html><body><main><section id="tasks-page" class="active"><div id="overview"></div></section></main></body></html>');
  const data={boards:[{id:'b',title:'Board',sections:[{id:'s',title:'Work',tasks:[{id:'a',title:'One'},{id:'b-task',title:'Two'}]}]}]},root=document.getElementById('tasks-page'),overview=document.getElementById('overview'),scroll=document.querySelector('main');let active=document.body,owner='one',plan='plan';
  Object.defineProperty(document,'activeElement',{get:()=>active?.isConnected?active:document.body});window.HTMLElement.prototype.focus=function(){active=this};window.HTMLInputElement.prototype.setSelectionRange=function(a,b){this.selectionStart=a;this.selectionEnd=b};
  const workspace=mountTaskListWorkspace({root,overview,document,window,scrollElement:scroll,getState:()=>data,getOwnerId:()=>owner,getPlanId:()=>plan,commit:async()=>{}});
  const html=board=>board.sections.map(section=>'<div class="board-section-block" data-board-id="b" data-section-id="s"><div class="section-title-row"></div><ul class="task-list">'+section.tasks.map(task=>renderTaskListRow(task,section.id)).join('')+'</ul></div>').join('');
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('    function renderBoardsGrid()'),end=source.indexOf('    // --- 3 Interactive State Updates ---',start);
  const context=vm.createContext({managerContainer:overview,taskWorkspace:workspace,pageRenders:{defer:()=>false},boardsData:data.boards,renderBoardCardHTML:html,tr:x=>x});vm.runInContext(source.slice(start,end),context);context.renderBoardsGrid();
  const input=[...overview.querySelectorAll('.task-text')].find(el=>el.dataset.task==='b-task');input.focus();input.value='Unsaved draft';input.setSelectionRange(2,5);scroll.scrollTop=230;context.renderBoardsGrid();
  const fresh=[...overview.querySelectorAll('.task-text')].find(el=>el.dataset.task==='b-task');assert.equal(fresh.value,'Unsaved draft');assert.ok(document.activeElement===fresh);assert.equal(fresh.selectionStart,2);assert.equal(fresh.selectionEnd,5);assert.equal(scroll.scrollTop,230);
  owner='two';workspace.sync();context.renderBoardsGrid();let other=[...overview.querySelectorAll('.task-text')].find(el=>el.dataset.task==='b-task');assert.equal(other.value,'Two');other.focus();other.value='Other private draft';plan='replacement';workspace.sync();context.renderBoardsGrid();other=[...overview.querySelectorAll('.task-text')].find(el=>el.dataset.task==='b-task');assert.equal(other.value,'Two');workspace.dispose();
});
