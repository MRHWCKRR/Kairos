import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as scheduleUtils from '../schedule-utils.js';
import {generateTaskOccurrencesThrough} from '../recurrence-utils.js';
import {createPageRenderCache} from '../page-render-cache.js';
import {injectScheduleShell} from '../build-transforms.js';

const html=injectScheduleShell(await readFile(new URL('../app.html',import.meta.url),'utf8'));
const scheduleSource=(await readFile(new URL('../schedule-workspace.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace('export function initScheduleWorkspace','function initScheduleWorkspace');
const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8');
const progressSource=appSource.slice(appSource.indexOf('    function checkFocusAchievements()'),appSource.indexOf('    function triggerMiscAchievement('));

for(const category of ['focus','tasks'])test(`${category} progress invalidates cached achievements before an unlock`,()=>{
  const idle=[];let renders=0;
  const cache=createPageRenderCache({isActive:()=>false,scheduleIdle:fn=>idle.push(fn)});
  function render(){if(cache.defer('achievements-page',render))return;renders++;}
  render();idle.shift()();assert.equal(renders,1);
  const context=vm.createContext({ACHIEVEMENTS:[{id:'next',category,threshold:100000}],achievementsData:{unlocked:{},lifetimeTasksCompleted:1},focusData:{totalSeconds:60},
    renderAchievementsPage:render,unlockAchievement:()=>assert.fail('Progress is below the next threshold')});
  vm.runInContext(progressSource,context);
  category==='focus'?context.checkFocusAchievements():context.checkTaskAchievements();
  cache.activate('achievements-page');assert.equal(renders,2);
});

function scheduleFixture(){
  const {document,window}=parseHTML(html);Object.defineProperty(document,'readyState',{value:'loading'});
  let now=new Date(2026,9,12,23,59),tick;
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now.getTime()]));}}
  const context=vm.createContext({document,window,Date:Clock,...scheduleUtils,generateTaskOccurrencesThrough,
    requestAnimationFrame:fn=>fn(),setInterval:fn=>{tick=fn;return 1;},clearInterval(){}});
  vm.runInContext(scheduleSource,context);
  const workspace=context.initScheduleWorkspace({getBoards:()=>[],getScheduleEvents:()=>[]});
  return {document,workspace,tick:()=>tick(),tomorrow:()=>{now=new Date(2026,9,13,0,1);}};
}

test('returning to Schedule after midnight refreshes the today header',()=>{
  const f=scheduleFixture();
  assert.equal(f.document.querySelector('.ks-day-head.is-today').dataset.date,'2026-10-12');
  f.tomorrow();f.workspace.activate();
  assert.equal(f.document.querySelector('.ks-day-head.is-today').dataset.date,'2026-10-13');
});

test('the active Schedule updates on midnight while clean revisits retain its DOM',()=>{
  const f=scheduleFixture(),root=f.document.getElementById('schedule-page');root.classList.add('active');
  const scroller=f.document.querySelector('.ks-timeline-scroll');scroller.scrollTop=700;
  f.workspace.activate();assert.equal(f.document.querySelector('.ks-timeline-scroll'),scroller);
  f.tomorrow();f.tick();
  assert.equal(f.document.querySelector('.ks-day-head.is-today').dataset.date,'2026-10-13');
  assert.equal(f.document.querySelector('.ks-timeline-scroll').scrollTop,700);
});

test('Statistics refreshes its current month after rollover without redrawing a clean visit',()=>{
  const {document}=parseHTML(html),root=document.getElementById('statistics-page');root.classList.add('active');
  let now=new Date(2026,9,31,23,59);
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now.getTime()]));}}
  const context=vm.createContext({document,Date:Clock,statisticsRenderedDate:null,statsRange:'month',
    pageRenders:createPageRenderCache({isActive:page=>document.getElementById(page).classList.contains('active'),scheduleIdle:()=>{}}),
    toDateKey:scheduleUtils.toDateKey,getLocale:()=> 'en',tr:key=>key,trFmt:(_,values)=>String(values.n),formatHMS:String,
    userSettings:{accessibility:{language:'en'}},achievementsData:{lifetimeTasksCompleted:0},
    focusData:{totalSeconds:10,longestSessionSeconds:7,dailyFocusLog:{'2026-10-02':7,'2026-11-02':3},dailyTasksLog:{}}});
  const stats=appSource.slice(appSource.indexOf('    function aggregateDailyLog('),appSource.indexOf("    document.querySelectorAll('#stats-range-toggle"));
  const activate=appSource.match(/onNavigate:targetName=>\{([\s\S]*?)\n\s*if \(targetName === "settings-page"\)/)[1];
  vm.runInContext(stats+'\nfunction activatePage(targetName){'+activate+'}',context);
  context.renderStatisticsPage();
  const bar=document.querySelector('.bar-chart-bar');assert.equal(bar.getAttribute('title'),'7');
  context.activatePage('statistics-page');assert.equal(document.querySelector('.bar-chart-bar'),bar);
  now=new Date(2026,10,1,0,1);context.activatePage('statistics-page');
  assert.equal(document.querySelector('.bar-chart-bar').getAttribute('title'),'3');
});
