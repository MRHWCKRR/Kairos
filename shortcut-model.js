export const DEFAULT_SHORTCUTS=Object.freeze({search:'Mod+K',addTask:'N',showTaskShortcuts:'?',saveTaskDetails:'Mod+Enter'});
export const SHORTCUT_ACTIONS=Object.freeze([
 {id:'search',label:'Search planner'}, {id:'addTask',label:'Add task in current section'},
 {id:'showTaskShortcuts',label:'Show Tasks shortcuts'}, {id:'saveTaskDetails',label:'Save task details'}
]);
const modifiers=['Mod','Ctrl','Meta','Alt','Shift'];
const named=new Map(['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Delete','Home','End','PageUp','PageDown','Space'].map(key=>[key.toLowerCase(),key]));
export function parseShortcut(value){
 if(typeof value!=='string'||value.length>60)return null;
 const parts=value.trim().split('+').map(part=>part.trim()),raw=parts.pop();if(!raw)return null;
 const mods=parts.map(part=>modifiers.find(mod=>mod.toLowerCase()===part.toLowerCase()));
 if(mods.some(mod=>!mod)||new Set(mods).size!==mods.length||mods.includes('Mod')&&(mods.includes('Ctrl')||mods.includes('Meta')))return null;
 const key=named.get(raw.toLowerCase())||(raw.length===1&&/^[a-z0-9/?.,;\[\]\\'`=-]$/i.test(raw)?raw.toUpperCase():null);
 if(!key)return null;
 const ordered=modifiers.filter(mod=>mods.includes(mod)&&(key!=='?'||mod!=='Shift'));return {key,modifiers:ordered,value:[...ordered,key].join('+')};
}
function reserved(binding){
 const {key,modifiers:mods}=binding,command=mods.some(mod=>['Mod','Ctrl','Meta'].includes(mod));
 if(['Escape','Tab','Space','Backspace','Delete','Home','End','PageUp','PageDown','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return true;
 if(key==='Enter'&&!command&&!mods.includes('Alt'))return true;
 if(!mods.length&&key.length>1)return true;
 if(mods.includes('Alt')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F4'].includes(key))return true;
 if(command&&['A','C','V','X','Z','Y','W','T','N','R','L','Q','P','S','F','H','J','D','O','B','U','I','0','1','2','3','4','5','6','7','8','9'].includes(key))return true;
 return false;
}
function overlaps(a,b){
 const variants=binding=>['Ctrl','Meta'].map(platform=>[...binding.modifiers.map(mod=>mod==='Mod'?platform:mod)].sort().join('+')+'+'+binding.key);
 return variants(a).some(value=>variants(b).includes(value));
}
export function validateShortcut(action,value,bindings=DEFAULT_SHORTCUTS){
 if(!Object.hasOwn(DEFAULT_SHORTCUTS,action))return {valid:false,error:'Unknown shortcut action.'};
 const parsed=parseShortcut(value);if(!parsed)return {valid:false,error:'Use a letter, number or supported key, with optional Mod, Ctrl, Meta, Alt or Shift.'};
 if(reserved(parsed))return {valid:false,error:'This key combination is reserved for browser or built-in editing controls.'};
 for(const other of SHORTCUT_ACTIONS){if(other.id===action)continue;const existing=parseShortcut(bindings?.[other.id]||DEFAULT_SHORTCUTS[other.id]);if(existing&&overlaps(parsed,existing))return {valid:false,error:'Already used for '+other.label.toLowerCase()+'.'};}
 return {valid:true,value:parsed.value,error:''};
}
export function normaliseShortcuts(value){
 const result={...DEFAULT_SHORTCUTS};if(!value||typeof value!=='object'||Array.isArray(value))return result;
 // Reject each invalid value independently, then resolve conflicts against the complete set.
 for(const {id} of SHORTCUT_ACTIONS){const parsed=parseShortcut(value[id]);if(parsed&&!reserved(parsed))result[id]=parsed.value;}
 for(let pass=0;pass<SHORTCUT_ACTIONS.length;pass++)for(const {id} of SHORTCUT_ACTIONS)if(!validateShortcut(id,result[id],result).valid)result[id]=DEFAULT_SHORTCUTS[id];
 return result;
}
export function describeShortcut(action,bindings){return normaliseShortcuts(bindings)[action]||'';}
export const isShortcutEditing=element=>!!element?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-shortcut-editor]');
export function matchesShortcut(event,action,bindings,{allowInEditor=false,activeElement=null}={}){
 if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.repeat||event.getModifierState?.('AltGraph'))return false;
 const binding=parseShortcut(describeShortcut(action,bindings));if(!binding)return false;
 const mods=binding.modifiers,command=mods.includes('Mod');
 if(command?!(event.ctrlKey||event.metaKey)||event.ctrlKey&&event.metaKey:!!event.ctrlKey!==mods.includes('Ctrl')||!!event.metaKey!==mods.includes('Meta'))return false;
 if(!!event.altKey!==mods.includes('Alt')||binding.key!=='?'&&!!event.shiftKey!==mods.includes('Shift'))return false;
 if(String(event.key||'').toUpperCase()!==binding.key.toUpperCase())return false;
 if(!allowInEditor&&(isShortcutEditing(event.target)||isShortcutEditing(activeElement)))return false;
 if(allowInEditor&&!mods.some(mod=>['Mod','Ctrl','Meta','Alt'].includes(mod))&&(isShortcutEditing(event.target)||isShortcutEditing(activeElement)))return false;
 return true;
}
