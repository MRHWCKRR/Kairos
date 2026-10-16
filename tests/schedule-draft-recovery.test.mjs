import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createScheduleInspectorSession} from '../schedule-inspector-session.js';

function fixture({store=new Map(),owner='one',plan='plan',title='Revision',notes='Saved notes',blocked=false}={}){
 const {document,window}=parseHTML('<html><body><aside><form data-ks-rich-inspector><input name="title"><textarea name="notes"></textarea><input type="checkbox" data-recurrence-weekday value="2"></form></aside></body></html>');
 const form=document.querySelector('form'),inspector=document.querySelector('aside');form.elements={};form.querySelector('[name="title"]').value=title;form.querySelector('[name="notes"]').value=notes;
 const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('Quota exceeded');store.set(key,value)},removeItem:key=>store.delete(key)};
 const selection={type:'task',id:'t'},session=createScheduleInspectorSession({inspector,getIdentity:()=>[owner,plan],getSelection:()=>selection,render(){},document,storage});
 session.track(form,async()=>true);
 const type=(name,value)=>{const field=form.querySelector('[name="'+name+'"]');field.value=value;field.dispatchEvent(new window.Event('input',{bubbles:true}))};
 return {document,window,form,inspector,session,store,type,value:name=>form.querySelector('[name="'+name+'"]').value};
}

test('Schedule reload recovers edited fields while keeping newer unrelated saved fields',()=>{
 const first=fixture();first.type('title','Recover title');const next=fixture({store:first.store,notes:'Updated elsewhere'});assert.equal(next.value('title'),'Recover title');assert.equal(next.value('notes'),'Updated elsewhere');assert.equal(next.session.hasDraft(),true);
});

test('failed save keeps reload recovery and a successful save clears it',async()=>{
 const first=fixture();first.type('notes','Recover notes');await first.session.run(async()=>false,{save:true});assert.equal(fixture({store:first.store}).value('notes'),'Recover notes');await first.session.run(async()=>true,{save:true});assert.equal(fixture({store:first.store}).value('notes'),'Saved notes');
});

test('discarding a recovered draft explicitly clears it',async()=>{
 const first=fixture();first.type('title','Discard me');const closing=first.session.requestLeave();first.document.querySelector('[data-schedule-draft-choice="discard"]').click();assert.equal(await closing,true);assert.equal(fixture({store:first.store}).value('title'),'Revision');
});

test('Schedule drafts cannot cross account or planner boundaries',()=>{
 const first=fixture();first.type('title','Private');assert.equal(fixture({store:first.store,owner:'two'}).value('title'),'Revision');assert.equal(fixture({store:first.store,plan:'other'}).value('title'),'Revision');
});

test('reload recovery includes nameless recurrence controls',()=>{
 const first=fixture(),check=first.form.querySelector('[data-recurrence-weekday]');check.checked=true;check.dispatchEvent(new first.window.Event('change',{bubbles:true}));assert.equal(fixture({store:first.store}).form.querySelector('[data-recurrence-weekday]').checked,true);
});

test('blocked storage keeps the draft editable and warns before unloading',()=>{
 const first=fixture({blocked:true});first.type('title','Keep this tab');const event=new first.window.Event('beforeunload',{cancelable:true});first.window.dispatchEvent(event);assert.equal(first.session.hasDraft(),true);assert.equal(event.defaultPrevented,true);
});
