import {monthEventEntries,calendarEventMarkup} from '../schedule-month.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const renderSource=source.slice(source.indexOf('    function renderDayPanel()'),source.indexOf('    if (dayDetailCloseBtn)'));
const generateSource=source.slice(source.indexOf('    async function generateDayInsight('),source.indexOf('    if (dayDetailAiBtn) {\n        dayDetailAiBtn.addEventListener'));
function setup(text) {
    const {document}=parseHTML('<div id="insight"></div>');
    const content=document.querySelector('#insight');
    let saves=0;
    const context=vm.createContext({monthEventEntries,calendarEventMarkup,scheduleData:[],document,console,selectedCalendarDate:'2026-10-19',dayDetailOverlay:{},dayDetailDateTitle:null,dayDetailTaskList:null,
        dayDetailTotal:null,dayDetailCompleted:null,dayDetailAiContent:content,dayDetailAiBtn:{disabled:false},dayInsights:{'2026-10-19':text},userSettings:{accessibility:{}},
        getTasksForDate:()=>[{title:'Revision',completed:false}],getLanguageName:()=> 'English',buildScheduleSummaryForAI:()=>'',buildUserContextForAI:()=>'',
        aiFetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:text}}]})}),updatePlanInFirestore:async()=>{saves++;},tr:key=>key});
    vm.runInContext(renderSource+'\n'+generateSource,context);
    return {content,context,saves:()=>saves};
}

for(const text of ['<img src=x onerror="alert(1)">','</p><svg onload="alert(1)"></svg><p>','Good progress: 2 < 3 & keep going.']) {
    test('saved day insight is literal text: '+text,()=>{
        const f=setup(text);vm.runInContext('renderDayPanel()',f.context);
        assert.equal(f.content.textContent,text);
        assert.equal(f.content.querySelector('img,svg,script,[onerror],[onload]'),null);
        assert.equal(f.content.querySelectorAll('p').length,1);
    });
    test('fresh day insight is literal text and still persists: '+text,async()=>{
        const f=setup(text);await vm.runInContext("generateDayInsight('2026-10-19')",f.context);
        assert.equal(f.content.textContent,text);
        assert.equal(f.content.querySelector('img,svg,script,[onerror],[onload]'),null);
        assert.equal(f.content.querySelectorAll('p').length,1);
        assert.equal(f.saves(),1);
        assert.equal(f.context.dayInsights['2026-10-19'],text);
        assert.equal(f.context.dayDetailAiBtn.disabled,false);
    });
}

test('an insight finishing after date navigation persists without replacing the current panel',async()=>{
    const f=setup('<img src=x onerror="alert(1)">');
    let finish;
    f.context.aiFetch=()=>new Promise(resolve=>{finish=resolve;});
    const pending=vm.runInContext("generateDayInsight('2026-10-19')",f.context);
    f.context.selectedCalendarDate='2026-10-20';
    f.content.textContent='Current day';
    finish({ok:true,json:async()=>({choices:[{message:{content:'Completed previous day'}}]})});
    await pending;
    assert.equal(f.content.textContent,'Current day');
    assert.equal(f.context.dayInsights['2026-10-19'],'Completed previous day');
    assert.equal(f.saves(),1);
});

test('an empty day never requests or persists an insight',async()=>{
    const f=setup('');f.context.getTasksForDate=()=>[];
    f.context.aiFetch=()=>{throw Error('Unexpected request');};
    await vm.runInContext("generateDayInsight('2026-10-19')",f.context);
    assert.equal(f.content.textContent,'no_tasks_nothing_to_comment');
    assert.equal(f.saves(),0);
});

test('a failed insight request restores regeneration without persisting',async()=>{
    const f=setup('');f.context.console={error(){}};
    f.context.aiFetch=async()=>{throw Error('Offline');};
    await vm.runInContext("generateDayInsight('2026-10-19')",f.context);
    assert.equal(f.content.textContent,'insight_error');
    assert.equal(f.context.dayDetailAiBtn.disabled,false);
    assert.equal(f.saves(),0);
});
