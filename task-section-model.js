import {stableStringify} from './plan-merge.js?v=1';

export const sectionOrder=board=>(board.sections||[]).map(section=>section.id);
export function sectionBoard(state,id){
 const matches=(state.boards||[]).filter(board=>board.id===id);
 if(matches.length!==1||matches[0].archived)throw Error('This board is missing, archived or ambiguous.');
 return matches[0];
}
function checkOrder(state,board,expected){
 const order=sectionOrder(board),counts=new Map();
 for(const item of state.boards||[])for(const section of item.sections||[])counts.set(section.id,(counts.get(section.id)||0)+1);
 if(!Array.isArray(expected)||stableStringify(order)!==stableStringify(expected))throw Error('The section order changed. Review the board before retrying.');
 if(order.some(id=>typeof id!=='string'||!id||counts.get(id)!==1))throw Error('Ambiguous section IDs.');
 return order;
}
export function applySectionCommand(state,command,expected){
 const next=structuredClone(state),board=sectionBoard(next,command.target?.boardId);
 if(command.type==='reorder_sections'){
  const before=checkOrder(next,board,expected?.order),ids=command.sectionIds;
  if(!Array.isArray(ids)||ids.length!==before.length||new Set(ids).size!==before.length||ids.some(id=>!before.includes(id)))throw Error('Invalid section order.');
  if(board.sections.some((section,index)=>section.archived&&ids[index]!==section.id))throw Error('Archived sections cannot be moved.');
  const byId=new Map(board.sections.map(section=>[section.id,section]));board.sections=ids.map(id=>byId.get(id));
  return {next,result:{type:command.type,inverse:{command:{type:command.type,target:{boardId:board.id},sectionIds:before},expected:{order:ids}}}};
 }
 const destination=sectionBoard(next,command.destination?.boardId),sourceOrder=checkOrder(next,board,expected?.sourceOrder),destinationOrder=checkOrder(next,destination,expected?.destinationOrder);
 const originalIndex=sourceOrder.indexOf(command.target?.sectionId),section=board.sections[originalIndex],index=command.destination.index;
 if(board===destination||!section||section.archived||!Number.isInteger(index)||index<0||index>destinationOrder.length)throw Error('Invalid section destination.');
 board.sections.splice(originalIndex,1);(destination.sections??=[]).splice(index,0,section);
 return {next,result:{type:command.type,inverse:{command:{type:'move_section',target:{boardId:destination.id,sectionId:section.id},destination:{boardId:board.id,index:originalIndex}},expected:{sourceOrder:sectionOrder(destination),destinationOrder:sectionOrder(board)}}}};
}
