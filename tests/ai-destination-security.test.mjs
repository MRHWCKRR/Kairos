import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const modalSource=source.slice(source.indexOf('    function openAiDestinationModal()'),source.indexOf('    if (aiDestinationModal) {'));
function setup({boards=[],events=[]}={}) {
    const {document}=parseHTML('<div id="ai-destination-modal"><input name="ai-destination" type="radio" value="new"><input name="ai-destination" type="radio" value="existing"><input id="ai-destination-new-name" value="Previous name"><select id="ai-destination-existing-select"><option>Stale</option></select><div id="ai-destination-recurring-preview"><ul id="ai-destination-recurring-list"><li>Stale</li></ul></div></div>');
    const context=vm.createContext({document,boardsData:boards,pendingAiRecurringEvents:events,pendingAiSections:[],
        aiDestinationModal:document.querySelector('#ai-destination-modal'),aiDestinationNewName:document.querySelector('#ai-destination-new-name'),aiDestinationExistingSelect:document.querySelector('select'),
        SCHEDULE_CATEGORIES:{training:{},other:{}},getScheduleDayLabels:()=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
        scheduleTimeToMinutes:value=>value.split(':').reduce((hours,minutes)=>Number(hours)*60+Number(minutes)),
        scheduleMinutesToLabel:value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0'),tr:key=>key});
    vm.runInContext(modalSource,context);
    return {document,context,open:()=>vm.runInContext('openAiDestinationModal()',context)};
}

for(const title of ['<img src=x onerror="alert(1)">','<svg onload="alert(1)"></svg>','Football < 3 & revision — "Tuesday"']) {
    test('AI recurring preview treats its title as literal text: '+title,()=>{
        const f=setup({events:[{title,day:2,start:'16:00',end:'18:00',category:'training'}]});f.open();
        const list=f.document.querySelector('ul');
        assert.equal(list.textContent,title+' — Tue, 16:00–18:00 (cat_training)');
        assert.equal(list.querySelector('img,svg,script,[onerror],[onload]'),null);
        assert.equal(list.children.length,1);
        assert.equal(list.firstElementChild.tagName,'LI');
    });
}

test('board labels and IDs remain literal without adding options or attributes',()=>{
    const title='Board </option><option value="forged">Injected & "quoted"';
    const id='board" onclick="alert(1)';
    const f=setup({boards:[{id,title}]});f.open();
    const options=f.document.querySelectorAll('option');
    assert.equal(options.length,1);
    assert.equal(options[0].textContent,title);
    assert.equal(options[0].value,id);
    assert.equal(f.document.querySelector('[onclick]'),null);
});

test('reopening replaces previous rows and options while preserving destination defaults',()=>{
    const f=setup({boards:[{id:'one',title:'Study'}],events:[{title:'Training',day:2,start:'16:00',end:'18:00',category:'training'}]});f.open();f.open();
    assert.equal(f.document.querySelectorAll('option').length,1);
    assert.equal(f.document.querySelectorAll('li').length,1);
    assert.equal(f.context.aiDestinationNewName.value,'');
    assert.equal(f.document.querySelector('input[value="new"]').checked,true);
    assert.equal(f.document.querySelector('input[value="existing"]').disabled,false);
    assert.equal(f.context.aiDestinationModal.classList.contains('active'),true);
    f.context.boardsData=[];f.context.pendingAiRecurringEvents=[];f.open();
    assert.equal(f.document.querySelectorAll('option').length,0);
    assert.equal(f.document.querySelector('input[value="existing"]').disabled,true);
    assert.equal(f.document.querySelector('#ai-destination-recurring-preview').style.display,'none');
});

test('unknown model categories are literal text too',()=>{
    const category='other<img src=x onerror="alert(1)">';
    const f=setup({events:[{title:'Study',day:2,start:'16:00',end:'18:00',category}]});f.open();
    assert.equal(f.document.querySelector('li').textContent,'Study — Tue, 16:00–18:00 (cat_'+category+')');
    assert.equal(f.document.querySelector('img,[onerror]'),null);
});

test('missing optional preview nodes and missing modal remain safe no-ops',()=>{
    const f=setup();f.document.querySelector('#ai-destination-recurring-preview').remove();f.open();
    assert.equal(f.context.aiDestinationModal.classList.contains('active'),true);
    f.context.aiDestinationModal=null;assert.doesNotThrow(f.open);
});

test('model JSON reaches a safe preview without saving before confirmation',async()=>{
    const f=setup();let saves=0;
    const title='<img src=x onerror="alert(1)">';
    Object.assign(f.context,{userSettings:{accessibility:{}},getLanguageName:()=> 'English',buildScheduleSummaryForAI:()=>'',buildUserContextForAI:()=>'',
        scheduleData:[],isGeneratingPlan:false,console:{error(){}},showNotice:message=>assert.fail(message),updatePlanInFirestore:async()=>{saves++;},
        aiFetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({sections:[],recurringEvents:[{title,category:'training',day:2,start:'16:00',end:'18:00'}]})}}]})})});
    const duplicateSource=source.slice(source.indexOf('    function isDuplicateScheduleEvent('),source.indexOf('    function calculateAge('));
    const generatorSource=source.slice(source.indexOf('    async function generatePlanFromText('),source.indexOf('    // --- AI workspace shell ---'));
    vm.runInContext(duplicateSource+generatorSource,f.context);
    await vm.runInContext("generatePlanFromText('Plan training',null)",f.context);
    assert.equal(f.document.querySelector('li').textContent,title+' — Tue, 16:00–18:00 (cat_training)');
    assert.equal(f.document.querySelector('img,[onerror]'),null);
    assert.equal(f.context.pendingAiRecurringEvents[0].title,title);
    assert.equal(f.context.isGeneratingPlan,false);
    assert.equal(saves,0);
});
