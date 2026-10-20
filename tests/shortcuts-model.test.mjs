import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SHORTCUTS,normaliseShortcuts,validateShortcut,matchesShortcut,describeShortcut} from '../shortcut-model.js';
test('settings normalize safely and preserve valid overrides',()=>{
 assert.deepEqual(normaliseShortcuts(null),DEFAULT_SHORTCUTS);
 assert.equal(normaliseShortcuts({search:'alt+g',addTask:'Escape'}).search,'Alt+G');
 assert.equal(normaliseShortcuts({addTask:'Escape'}).addTask,'N');
 assert.equal(describeShortcut('saveTaskDetails'),'Mod+Enter');
 for(const value of ['Mod+W','Ctrl+R','Meta+L','Escape','Enter','Shift+Enter','Alt+ArrowUp','Mod+Backspace','Alt+Space'])assert.equal(validateShortcut('search',value).valid,false,value);
 assert.equal(validateShortcut('search','N').valid,false);
 assert.equal(validateShortcut('search','Alt+G').valid,true);
});
test('matcher honors modifiers, typing, composition and held keys',()=>{
 const match=(event,action='search',bindings)=>matchesShortcut({key:'k',ctrlKey:true,...event},action,bindings,{allowInEditor:true});
 assert.equal(match({}),true);assert.equal(match({ctrlKey:false,metaKey:true}),true);
 for(const props of [{altKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229},{defaultPrevented:true}])assert.equal(match(props),false);
 const input={closest:()=>true};assert.equal(match({key:'g',ctrlKey:false,target:input},'search',{search:'G'}),false);
 assert.equal(match({key:'g',ctrlKey:false,altKey:true,target:input},'search',{search:'Alt+G'}),true);
 assert.equal(matchesShortcut({key:'?',shiftKey:true},'showTaskShortcuts'),true);
 assert.equal(matchesShortcut({key:'N',shiftKey:true},'addTask'),false);
});
