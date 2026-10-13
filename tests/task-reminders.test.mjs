import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {generateTaskOccurrences} from '../recurrence-utils.js';

async function collect(boards,now,zone='Australia/Brisbane'){
  let source='';try{source=await readFile(new URL('../task-reminders.js',import.meta.url),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  const context=vm.createContext({generateTaskOccurrences});
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,''),context);
  assert.equal(typeof context.dueTaskReminders,'function','task reminder collector exists');
  return context.dueTaskReminders(boards,now,zone);
}
const boards=()=>[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Science',date:'2026-10-15',startTime:'00:15',endTime:'01:15',reminderMinutes:30}]}]}];
test('relative reminders cross midnight using the profile timezone',async()=>{
  const result=await collect(boards(),Date.parse('2026-10-14T13:45:00Z'));
  assert.equal(result.length,1);
  assert.equal(result[0].taskId,'t');
});
test('late checks catch a due reminder before task start but never after start',async()=>{
  assert.equal((await collect(boards(),Date.parse('2026-10-14T13:50:00Z'))).length,1);
  assert.equal((await collect(boards(),Date.parse('2026-10-14T14:15:00Z'))).length,0);
});
test('removed, completed, archived and unscheduled reminders cannot fire',async()=>{
  for(const patch of [{reminderMinutes:null},{completed:true},{archived:true},{date:null},{startTime:null}]){
    const data=boards();Object.assign(data[0].sections[0].tasks[0],patch);
    assert.equal((await collect(data,Date.parse('2026-10-14T13:45:00Z'))).length,0);
  }
});
test('DST gaps are not guessed and lead times are real elapsed minutes',async()=>{
  const data=boards(),task=data[0].sections[0].tasks[0];
  task.date='2026-10-04';task.startTime='03:00';task.reminderMinutes=30;
  assert.equal((await collect(data,Date.parse('2026-10-03T15:30:00Z'),'Australia/Sydney')).length,1);
  task.startTime='02:30';
  assert.equal((await collect(data,Date.parse('2026-10-03T15:30:00Z'),'Australia/Sydney')).length,0);
});

test('recurring reminders use scheduled occurrences and skip completed exceptions',async()=>{
  const data=boards(),task=data[0].sections[0].tasks[0];
  task.recurrence={enabled:true,frequency:'daily',interval:1,mode:'fixed',startDate:'2026-10-14',endType:'never',exceptions:{}};
  const now=Date.parse('2026-10-14T13:45:00Z');
  assert.equal((await collect(data,now)).length,1);
  task.recurrence.exceptions['2026-10-15']={status:'completed'};
  assert.equal((await collect(data,now)).length,0);
});

test('archived boards and sections suppress descendant reminders',async()=>{
  for(const scope of ['board','section']){
    const data=boards();
    if(scope==='board')data[0].archived=true;else data[0].sections[0].archived=true;
    assert.equal((await collect(data,Date.parse('2026-10-14T13:45:00Z'))).length,0);
  }
});
