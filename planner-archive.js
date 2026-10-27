import {stableStringify} from './plan-merge.js?v=1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function resolve(state,target){
 const matches=[];
 for(const board of state.boards||[]){
  if(target.kind==='board'&&board.id===target.boardId)matches.push({board,entity:board});
  for(const section of board.sections||[]){
   if(target.kind==='section'&&section.id===target.sectionId&&(!target.boardId||board.id===target.boardId))matches.push({board,section,entity:section});
   for(const task of section.tasks||[])if(target.kind==='task'&&task.id===target.taskId&&(!target.sectionId||section.id===target.sectionId))matches.push({board,section,entity:task});
  }
 }
 if(matches.length!==1)throw Error('This archived item is missing or ambiguous.');
 const found=matches[0];
 if(!found.entity.archived||(target.kind!=='board'&&found.board.archived)||(target.kind==='task'&&found.section.archived))throw Error('Restore the parent board or section first.');
 return found;
}
export function buildRestoreCommand(state,target){
 const found=resolve(state,target);
 return {command:{type:'restore_entity',target:structuredClone(target)},expected:{snapshot:structuredClone(found.entity)}};
}
export function applyRestoreCommand(state,command,expected){
 const next=structuredClone(state),found=resolve(next,command.target);
 if(stableStringify(found.entity)!==stableStringify(expected?.snapshot))throw Error('This archived item changed. Review it again before restoring.');
 found.entity.archived=false;
 return {next,result:{type:'restore_entity',[command.target.kind]:found.entity}};
}
export function archiveMarkup(state,{translate=key=>({archive_empty:'Nothing in Archive.',archived_boards:'Boards',archived_sections:'Sections',archived_tasks:'Tasks',restore:'Restore',delete_forever:'Delete forever'})[key]||key}={}){
 const rows=[];
 const row=(kind,entity,attrs,meta='')=>'<div class="archive-item-row"><span class="archive-item-label">'+esc(entity.title)+(meta?' <span class="archive-item-meta">— '+esc(meta)+'</span>':'')+'</span><div class="archive-item-actions"><button type="button" class="archive-restore-'+kind+'-btn" '+attrs+'>'+esc(translate('restore'))+'</button><button type="button" class="archive-delete-'+kind+'-btn danger-option" '+attrs+'>'+esc(translate('delete_forever'))+'</button></div></div>';
 for(const board of state.boards||[]){
  if(board.archived){rows.push(row('board',board,'data-board-id="'+esc(board.id)+'"'));continue;}
  for(const section of board.sections||[]){
   const attrs='data-board-id="'+esc(board.id)+'" data-section-id="'+esc(section.id)+'"';
   if(section.archived){rows.push(row('section',section,attrs,board.title));continue;}
   for(const task of section.tasks||[])if(task.archived)rows.push(row('task',task,attrs+' data-task-id="'+esc(task.id)+'"',board.title+' / '+section.title));
  }
 }
 return {count:rows.length,html:'<div class="archive-panel">'+(rows.length?'<p class="text-muted">Restore keeps the item’s saved tasks, notes and dates.</p>'+rows.join(''):'<p class="archive-empty">'+esc(translate('archive_empty'))+'</p>')+'</div>'};
}

