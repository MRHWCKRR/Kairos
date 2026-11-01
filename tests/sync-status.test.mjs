import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountSyncStatus} from '../sync-status.js';

function fixture(){
 const {document}=parseHTML('<div id="status"></div>');const window=new EventTarget();window.navigator={onLine:true};
 let owner='one',value={ownerId:'one',pending:false,status:'idle'},listener,actions=0;
 const source={state:()=>value,subscribe:fn=>{listener=fn;return()=>{listener=null}},review:()=>actions++};
 const view=mountSyncStatus({root:document.querySelector('#status'),window,getOwnerId:()=>owner,sources:[source]});
 return {window,root:document.querySelector('#status'),view,set(value2){value=value2;listener?.()},owner(value2){owner=value2;view.sync()},get actions(){return actions}};
}
test('status follows submitted saves and reconnect never acknowledges or replays a write',()=>{
 const f=fixture();assert.equal(f.root.hidden,true);
 f.set({ownerId:'one',busy:true,pending:true});assert.match(f.root.textContent,/Saving/);
 f.window.navigator.onLine=false;f.window.dispatchEvent(new Event('offline'));assert.match(f.root.textContent,/Offline/);
 f.set({ownerId:'one',pending:true,retained:true});f.window.navigator.onLine=true;f.window.dispatchEvent(new Event('online'));
 assert.match(f.root.textContent,/Not synced/);assert.equal(f.actions,0);f.root.querySelector('button').click();assert.equal(f.actions,1);
 f.set({ownerId:'one',status:'saved'});assert.equal(f.root.textContent,'Saved');f.view.dispose();
});
test('live-only saves warn on leaving, conflicts request review and another account is hidden',()=>{
 const f=fixture();f.set({ownerId:'one',pending:true,retained:false});assert.match(f.root.textContent,/keep this tab open/);
 const event=new Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 f.set({ownerId:'one',pending:true,conflict:true});assert.match(f.root.textContent,/need review/);
 f.owner('two');assert.equal(f.root.hidden,true);const safe=new Event('beforeunload',{cancelable:true});f.window.dispatchEvent(safe);assert.equal(safe.defaultPrevented,false);
 f.view.dispose();
});
test('dispose removes subscriptions and network/leave listeners',()=>{
 const f=fixture();f.set({ownerId:'one',pending:true});f.view.dispose();const text=f.root.textContent;
 f.set({ownerId:'one',status:'saved'});f.window.dispatchEvent(new Event('offline'));assert.equal(f.root.textContent,text);
 const event=new Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
});
