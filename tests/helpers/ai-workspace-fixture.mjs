import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {plannerFixture} from './planner-fixture.mjs';

export async function fixture(options={}) {
  const f=await plannerFixture({userID:'one',boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[]}]}]},options);
  let input={value:'Create two tasks',style:{}},asks=0,workspaces=[];
  Object.assign(f.context,{document:{readyState:'loading',documentElement:{lang:'en'},addEventListener(){},getElementById:id=>id==='ai-chat-input'?input:null},
    setTimeout:()=>0,clearTimeout(){},aiConversationMessages:x=>x,getKairosContext:async()=>'',recordSentMessage:async()=>{},aiErrorMessage:e=>e.message,
    setDoc:async(ref,value)=>workspaces.push({ref,...structuredClone(value)}),console:{log(){},warn(){},error(){}}});
  const source=await readFile(new URL('../../ai-workspace.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),f.context);
  f.context.planSuggestion=()=>{};
  f.context.ask=async()=>{
    asks++;
    return {reply:'I will create two tasks.',actions:[
      {type:'create_task',args:{title:'First'}},{type:'create_task',args:{title:'Second'}}
    ]};
  };
  vm.runInContext('user={uid:"one"};chats=[norm({id:"chat-one",messages:[]})];activeId="chat-one";',f.context);
  return {...f,input,asks:()=>asks,workspaces,chat:()=>vm.runInContext('chats[0]',f.context)};
}

