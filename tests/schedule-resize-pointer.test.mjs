import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as utils from '../schedule-utils.js';

test('resizing from anywhere inside the grip follows pointer distance without jumping',async()=>{
  const source=(await readFile(new URL('../schedule-interactions.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
  for(const isOccurrence of [false,true]){
    const task={id:'t',startTime:'10:00',endTime:'11:00'},label={textContent:''};
    const grid={getBoundingClientRect:()=>({top:0,height:1440})};
    const context=vm.createContext({...utils,task,label,grid,isOccurrence,
      document:{readyState:'loading',addEventListener(){}},window:{addEventListener(){},__kairosScheduleBridge:{getBoards:()=>[{sections:[{tasks:[task]}]}],getTimeFormat:()=> '24'}}});
    vm.runInContext(source,context);
    vm.runInContext(`placePreview=()=>{};interaction={mode:'resize',pointerId:1,startX:0,startY:650,isOccurrence,taskId:'t',effectiveTask:task,original:{...task},originElement:{closest:()=>grid},ghost:{style:{},querySelector:()=>label}}`,context);
    context.onMove({pointerId:1,clientX:0,clientY:650});
    assert.equal(vm.runInContext('interaction.preview.endMin',context),660);
    context.onMove({pointerId:1,clientX:0,clientY:665});
    assert.equal(vm.runInContext('interaction.preview.endMin',context),675);
    assert.match(label.textContent,/75 min/);
    context.onMove({pointerId:1,clientX:0,clientY:500});
    assert.equal(vm.runInContext('interaction.preview.endMin',context),601);
  }
});
