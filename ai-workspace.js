function render(){
  sort();
  const l=$('ai-chat-list'),c=current(),m=$('ai-chat-messages'),home=$('ai-project-home'),composer=$('ai-chat-composer-wrap');
  if(!l||!c||!m)return;
  l.innerHTML=chats.map(x=>{
    const p=pendingChats.has(x.id),u=unreadChats.has(x.id),f=finishedChats.has(x.id),pr=projectFor(x);
    return '<button class="ai-chat-list-item '+(x.id===activeId?'active ':'')+(p?'generating ':'')+(u?'unread ':'')+(f?'finished ':'')+'" draggable="true" data-id="'+esc(x.id)+'" aria-current="'+(x.id===activeId?'true':'false')+'"><span class="ai-chat-list-state" aria-hidden="true"></span><span class="ai-chat-list-title">'+esc(title(x))+'</span>'+(pr?'<span class="ai-chat-list-project">'+esc(pr.title)+'</span>':'')+(p?'<span class="ai-chat-list-status">Thinking…</span>':f?'<span class="ai-chat-list-status">New</span>':'')+'<span class="ai-chat-list-menu" data-menu="'+esc(x.id)+'">⋯</span></button>'
  }).join('');
  const pl=$('ai-project-list');
  if(pl)pl.innerHTML='<button class="ai-project-item '+(!activeProjectId?'active':'')+'" type="button" data-project-id=""><span class="ai-project-folder">▦</span><span class="ai-project-title">All chats</span><span class="ai-project-count">'+chats.length+'</span></button>'+
    (projects.length?projects.map(p=>{const count=chats.filter(c=>c.projectId===p.id).length;return '<button class="ai-project-item '+(activeProjectId===p.id?'active':'')+'" type="button" data-project-id="'+esc(p.id)+'"><span class="ai-project-folder" style="color:'+esc(p.color||'var(--accent-glow)')+'">'+esc(p.icon||'▰')+'</span><span class="ai-project-title">'+esc(p.title)+'</span><span class="ai-project-count">'+count+'</span><span class="ai-project-menu" data-project-menu="'+esc(p.id)+'">⋯</span></button>'}).join(''):'<div class="ai-project-empty">Create a project to organise related chats.</div>');
  if(activeProjectId){
    const p=projects.find(x=>x.id===activeProjectId);
    if(p&&home){
      $('ai-chat-title').textContent=p.title;
      m.hidden=true;
      if(composer)composer.hidden=true;
      home.hidden=false;
      home.innerHTML=projectHomeMarkup(p);
      return;
    }
    activeProjectId=null;
  }
  $('ai-chat-title').textContent=title(c);
  m.hidden=false;
  if(composer)composer.hidden=false;
  if(home)home.hidden=true;
  m.innerHTML=c.messages.length?c.messages.map(x=>'<div class="ai-chat-bubble-row '+x.role+'"><div class="ai-chat-bubble">'+esc(x.content)+'</div></div>').join(''):'<div class="ai-chat-empty-state"><div class="ai-chat-empty-icon">✦</div><p>Start a conversation. Kairos can help with study, planning, organisation, and ideas.</p></div>';
  if(pendingChats.has(c.id))m.insertAdjacentHTML('beforeend','<div id="ai-chat-typing-row" class="ai-chat-bubble-row assistant"><div class="ai-chat-bubble"><span class="ai-chat-typing-dots"><span></span><span></span><span></span></span></div></div>');
  requestAnimationFrame(()=>{m.scrollTop=m.scrollHeight});
}
function formatChatDate(ts){const d=new Date(ts||Date.now());return d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
function chatDescription(c){return (c.summary||c.messages.find(m=>m.role==='user'&&m.content.trim())?.content||'No description yet.').replace(/\s+/g,' ').trim().slice(0,180)}
function allChatsMarkup(){
  const ordered=[...chats].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  return '<div class="ai-all-chats-inner"><div class="ai-all-chats-hero"><div><div class="ai-workspace-kicker">Workspace</div><h1>All chats</h1><p>All of your conversations in one place.</p></div><button class="action-btn small-btn" data-all-new-chat>+ New chat</button></div><div class="ai-all-chats-grid">'+(ordered.length?ordered.map(c=>{
    const p=projectFor(c);
    return '<button class="ai-all-chat-card" data-all-chat="'+esc(c.id)+'"><div class="ai-all-chat-card-top"><span class="ai-all-chat-date">'+esc(formatChatDate(c.updatedAt))+'</span>'+(p?'<span class="ai-all-chat-project">'+esc(p.icon||'▰')+' '+esc(p.title)+'</span>':'')+'</div><h3>'+esc(title(c))+'</h3><p>'+esc(chatDescription(c))+'</p><div class="ai-all-chat-meta">'+c.messages.length+' message'+(c.messages.length===1?'':'s')+'</div></button>'
  }).join(''):'<div class="ai-project-empty-large">No chats yet. Start a new conversation.</div>')+'</div></div>';
}

function render(){
  sort();
  const l=$('ai-chat-list'),c=current(),m=$('ai-chat-messages'),home=$('ai-project-home'),composer=$('ai-chat-composer-wrap');
  if(!l||!m)return;
  l.innerHTML=chats.map(x=>{
    const p=pendingChats.has(x.id),u=unreadChats.has(x.id),f=finishedChats.has(x.id),pr=projectFor(x);
    return '<button class="ai-chat-list-item '+(x.id===activeId?'active ':'')+(p?'generating ':'')+(u?'unread ':'')+(f?'finished ':'')+'" draggable="true" data-id="'+esc(x.id)+'" aria-current="'+(x.id===activeId?'true':'false')+'"><span class="ai-chat-list-state" aria-hidden="true"></span><span class="ai-chat-list-title">'+esc(title(x))+'</span>'+(pr?'<span class="ai-chat-list-project">'+esc(pr.title)+'</span>':'')+(p?'<span class="ai-chat-list-status">Thinking…</span>':f?'<span class="ai-chat-list-status">New</span>':'')+'<span class="ai-chat-list-menu" data-menu="'+esc(x.id)+'">⋯</span></button>'
  }).join('');
  const pl=$('ai-project-list');
  if(pl)pl.innerHTML='<button class="ai-project-item '+(!activeProjectId?'active':'')+'" type="button" data-project-id=""><span class="ai-project-folder">▦</span><span class="ai-project-title">All chats</span><span class="ai-project-count">'+chats.length+'</span></button>'+
    (projects.length?projects.map(p=>{const count=chats.filter(c=>c.projectId===p.id).length;return '<button class="ai-project-item '+(activeProjectId===p.id?'active':'')+'" type="button" data-project-id="'+esc(p.id)+'"><span class="ai-project-folder" style="color:'+esc(p.color||'var(--accent-glow)')+'">'+esc(p.icon||'▰')+'</span><span class="ai-project-title">'+esc(p.title)+'</span><span class="ai-project-count">'+count+'</span><span class="ai-project-menu" data-project-menu="'+esc(p.id)+'">⋯</span></button>'}).join(''):'<div class="ai-project-empty">Create a project to organise related chats.</div>');
  if(activeProjectId){
    const p=projects.find(x=>x.id===activeProjectId);
    if(p&&home){
      $('ai-chat-title').textContent=p.title;
      m.hidden=true;
      if(composer)composer.hidden=true;
      home.hidden=false;
      home.innerHTML=projectHomeMarkup(p);
      return;
    }
    activeProjectId=null;
  }
  if(home){
    $('ai-chat-title').textContent='All chats';
    m.hidden=true;
    if(composer)composer.hidden=true;
    home.hidden=false;
    home.innerHTML=allChatsMarkup();
    return;
  }
  if(!c)return;
  $('ai-chat-title').textContent=title(c);
  m.hidden=false;
  if(composer)composer.hidden=false;
  m.innerHTML=c.messages.length?c.messages.map(x=>'<div class="ai-chat-bubble-row '+x.role+'"><div class="ai-chat-bubble">'+esc(x.content)+'</div></div>').join(''):'<div class="ai-chat-empty-state"><div class="ai-chat-empty-icon">✦</div><p>Start a conversation. Kairos can help with study, planning, organisation, and ideas.</p></div>';
  if(pendingChats.has(c.id))m.insertAdjacentHTML('beforeend','<div id="ai-chat-typing-row" class="ai-chat-bubble-row assistant"><div class="ai-chat-bubble"><span class="ai-chat-typing-dots"><span></span><span></span><span></span></span></div></div>');
  requestAnimationFrame(()=>{m.scrollTop=m.scrollHeight});
}
function projectHomeMarkup(p){
  if(!p)return '';
  const projectChats=chats.filter(c=>c.projectId===p.id);
  return `<div class="ai-project-home-inner">
    <div class="ai-project-hero">
      <div class="ai-project-icon" style="background:${esc(p.color||'var(--accent-glow)')}">${esc(p.icon||'▰')}</div>
      <div class="ai-project-hero-copy"><div class="ai-workspace-kicker">Project</div><h1>${esc(p.title)}</h1><p>${esc(p.description||'No description yet.')}</p></div>
      <button class="ai-project-settings-btn" data-project-settings="${esc(p.id)}">•••</button>
    </div>
    <div class="ai-project-context-card"><div><h3>Shared context</h3><p>${esc(p.sharedContext||'Add shared context so Kairos can use the same instructions and information across every chat in this project.')}</p></div><button class="action-btn small-btn" data-project-settings="${esc(p.id)}">Edit</button></div>
    <div class="ai-project-chat-heading"><h2>Chats</h2><button class="action-btn small-btn" data-project-new-chat="${esc(p.id)}">+ New chat</button></div>
    <div class="ai-project-chat-grid">${projectChats.length?projectChats.map(c=>`<button class="ai-project-chat-card" data-project-chat="${esc(c.id)}"><span>${esc(title(c))}</span><small>${c.messages.length} messages</small></button>`).join(''):'<div class="ai-project-empty-large">No chats in this project yet. Start a new one.</div>'}</div>
  </div>`;
}
function projectDialog(project){
  const isEdit=!!project;
  const d=dialogBox(`<span class="close-modal" data-cancel>×</span><h2>${isEdit?'Edit project':'New project'}</h2><p>${isEdit?'Customize this project.':'Create a dedicated workspace for related AI chats.'}</p>
    <label class="settings-label">Name</label><input class="settings-input" data-project-title maxlength="80" placeholder="e.g. School" value="${esc(isEdit?project.title:'')}">
    <label class="settings-label">Description</label><input class="settings-input" data-project-description maxlength="180" placeholder="What is this project for?" value="${esc(isEdit?project.description:'')}">
    <label class="settings-label">Folder icon</label><input class="settings-input" data-project-icon maxlength="2" placeholder="▰" value="${esc(isEdit?project.icon:'▰')}">
    <label class="settings-label">Folder color</label><input class="settings-input" data-project-color type="color" value="${isEdit&&/^#[0-9a-f]{6}$/i.test(project.color)?project.color:'#7c5cff'}">
    <label class="settings-label">Shared context</label><textarea class="settings-input" data-project-context rows="4" maxlength="3000" placeholder="Instructions or information Kairos should use across this project's chats.">${esc(isEdit?project.sharedContext:'')}</textarea>
    <div class="ai-chat-dialog-actions"><button class="settings-cancel-btn" data-cancel>Cancel</button><button class="action-btn" data-ok>${isEdit?'Save':'Create'}</button></div>`);
  const i=d.querySelector('[data-project-title]');
  i.focus();
  d.querySelector('[data-ok]').onclick=()=>{
    const v=i.value.trim();
    if(!v)return;
    const data={title:v,description:d.querySelector('[data-project-description]').value.trim(),icon:d.querySelector('[data-project-icon]').value.trim()||'▰',color:d.querySelector('[data-project-color]').value,sharedContext:d.querySelector('[data-project-context]').value.trim()};
    if(isEdit)Object.assign(project,data,{updatedAt:Date.now()});
    else{const p=normProject(data);p.order=projects.length?Math.min(...projects.map(x=>x.order))-1:0;projects.unshift(p);}
    closeDialog();render();save();
  };
  i.onkeydown=e=>{if(e.key==='Enter')d.querySelector('[data-ok]').click()};
}
function projectDeleteDialog(project){const d=dialogBox('<span class="close-modal" data-cancel>×</span><h2>Delete project?</h2><p>The project folder will be removed. Its chats will stay here and will not be deleted.</p><div class="ai-chat-dialog-actions"><button class="settings-cancel-btn" data-cancel>Cancel</button><button class="action-btn ai-chat-dialog-danger" data-ok>Delete project</button></div>');d.querySelector('[data-ok]').onclick=()=>{projects=projects.filter(p=>p.id!==project.id);chats.forEach(c=>{if(c.projectId===project.id)c.projectId=''});closeDialog();render();save()}}
function projectMenuOpen(anchor,project){closeMenu();projectMenu=document.createElement('div');projectMenu.className='ai-chat-context-menu';projectMenu.innerHTML='<button data-a="rename">✎ <span>Rename project</span></button><button data-a="delete" class="danger">⌫ <span>Delete project</span></button>';document.body.appendChild(projectMenu);const r=anchor.getBoundingClientRect(),w=projectMenu.offsetWidth,h=projectMenu.offsetHeight;projectMenu.style.left=Math.max(10,Math.min(r.left,innerWidth-w-10))+'px';projectMenu.style.top=Math.max(10,Math.min(r.bottom+6,innerHeight-h-10))+'px';projectMenu.onclick=e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;closeMenu();a==='rename'?projectDialog(project):projectDeleteDialog(project)}}
function assignProjectDialog(chat){const d=dialogBox('<span class="close-modal" data-cancel>×</span><h2>Move chat to project</h2><p>Choose where this conversation should live.</p><select class="settings-input ai-chat-rename-input" data-project-select><option value="">No project</option>'+projects.map(p=>'<option value="'+esc(p.id)+'" '+(chat.projectId===p.id?'selected':'')+'>'+esc(p.title)+'</option>').join('')+'</select><div class="ai-chat-dialog-actions"><button class="settings-cancel-btn" data-cancel>Cancel</button><button class="action-btn" data-ok>Move</button></div>');d.querySelector('[data-ok]').onclick=()=>{chat.projectId=d.querySelector('[data-project-select]').value;chat.updatedAt=Date.now();closeDialog();render();save()}}

async function send(){const i=$('ai-chat-input'),c=current(),t=i?.value.trim();if(!i||!c||!t||pendingChats.has(c.id))return;const chatId=c.id;const retry=RETRY_INTENT.test(t)&&!!c.pendingActionRequest;const followup=ACTION_FOLLOWUP_INTENT.test(t);const requestText=retry?c.pendingActionRequest:t;pendingChats.add(chatId);c.messages.push({role:'user',content:t});if(ACTION_INTENT.test(requestText))c.pendingActionRequest=requestText;c.updatedAt=Date.now();i.value='';i.style.height='auto';render();try{const forceAction=retry||followup;const actionRequestContext=forceAction?(c.pendingActionRequest&&requestText!==c.pendingActionRequest?'Original pending change: '+c.pendingActionRequest+'\nFollow-up from user: '+requestText:requestText):'';const result=await ask(await apiMessages(c, forceAction?{forceAction:true,requestText:actionRequestContext}:null));const reply=typeof result?.reply==='string'?result.reply.trim():'';
const actions=Array.isArray(result?.actions)?result.actions.map(a=>{if(!a||typeof a!=='object')return null;const type=typeof a.type==='string'?a.type:(typeof a.action==='string'?a.action:'');if(!type)return null;const args=a.args&&typeof a.args==='object'?a.args:Object.fromEntries(Object.entries(a).filter(([key])=>key!=='type'&&key!=='action'));return {...a,type,args};}).filter(Boolean):[];
console.log('[Kairos AI] Model result:', result);
console.log('[Kairos AI] Parsed actions:', actions);
const claimsChangeWithoutAction = !actions.length && /\\b(?:i(?:'ve| have)?|we|kairos)\\s+(?:have\\s+)?(?:created|scheduled|added|moved|updated|changed|completed|finished|deleted|removed|archived)\\b/i.test(reply);
if(claimsChangeWithoutAction) throw new Error('no-action');
const target=chats.find(x=>x.id===chatId);
const actionRequested=ACTION_INTENT.test(requestText)||retry||followup;
if(actionRequested&&!actions.length){
  throw new Error('no-action');
}
const results=[];
for(const action of actions){
  const result=actionNeedsConfirmation(action)?await requestActionConfirmation(chatId,action):await runAction(chatId,action);
  if(!result)throw new Error('cancelled');
  results.push(result);
}
if(target){
  if(actionRequested)c.pendingActionRequest='';
  target.messages.push({role:'assistant',content:actions.length?actionResultReply(results):(reply||'Done.')});
  target.updatedAt=Date.now();
  if(activeId!==chatId){unreadChats.add(chatId);finishedChats.add(chatId)}
  if(planLike(t)&&activeId===chatId)planSuggestion(target);
}}catch(e){const target=chats.find(x=>x.id===chatId);if(target){target.messages.push({role:'assistant',content:e.message==='rate'?'Kairos AI is temporarily rate-limited. Please try again shortly.':e.message==='no-action'?'I understood that you wanted me to make a change, but Kairos did not return an executable action, so I did not claim that the change was made. Please try again.':e.message==='cancelled'?'Okay, I did not make the change.':e.message?.startsWith('relay-')||e.message?.startsWith('relay:')?'Something went wrong while contacting Kairos AI ('+e.message+'). Check the browser console for the relay error.':'I could not apply that change: '+e.message});target.updatedAt=Date.now()}}finally{pendingChats.delete(chatId);if(activeId===chatId){unreadChats.delete(chatId);finishedChats.delete(chatId);render()}else{finishedChats.add(chatId);render()}try{await save()}catch(e){console.error('Kairos AI chat save failed:',e)}}}
async function runAction(chatId,action){
  console.log('[Kairos AI] Executing action:', action);
  const result=await executeKairosAction(action);
  console.log('[Kairos AI] Action completed:', result);
  return result;
}
function requestActionConfirmation(chatId,action){return new Promise(resolve=>{const target=chats.find(x=>x.id===chatId);if(!target){resolve(false);return}const label=action.type.replace(/_/g,' ');const detail=action.args?.title||action.args?.taskId||action.args?.eventId||'';const d=dialogBox('<span class="close-modal" data-cancel>×</span><h2>Confirm action</h2><p>Kairos is ready to '+esc(label)+(detail?' for “'+esc(detail)+'”.':'')+' This change cannot be undone automatically.</p><div class="ai-chat-dialog-actions"><button class="settings-cancel-btn" data-cancel>Cancel</button><button class="action-btn ai-chat-dialog-danger" data-ok>Confirm</button></div>');d.querySelector('[data-ok]').onclick=async()=>{closeDialog();try{const result=await runAction(chatId,action);resolve(result)}catch(e){target.messages.push({role:'assistant',content:'I could not complete that action: '+e.message});target.updatedAt=Date.now();render();resolve(false)}};d.querySelector('[data-cancel]')?.addEventListener('click',()=>resolve(false));});}
function replace(id){const x=$(id);if(!x)return null;const n=x.cloneNode(true);x.replaceWith(n);return n}
function bind(){replace('ai-chat-new-btn')?.addEventListener('click',()=>newChat(true));replace('ai-project-add-btn')?.addEventListener('click',()=>projectDialog());const sidebarToggle=replace('ai-chat-sidebar-toggle'),sidebarClose=replace('ai-chat-sidebar-close'),aiPage=$('ai-page');const setSidebarCollapsed=v=>{aiPage?.classList.toggle('sidebar-collapsed',v);sidebarToggle?.setAttribute('aria-label',v?'Open chat sidebar':'Collapse chat sidebar');try{localStorage.setItem('kairos-ai-sidebar-collapsed',v?'1':'0')}catch{}};let collapsed=false;try{collapsed=localStorage.getItem('kairos-ai-sidebar-collapsed')==='1'}catch{}setSidebarCollapsed(collapsed);sidebarToggle?.addEventListener('click',()=>setSidebarCollapsed(!aiPage?.classList.contains('sidebar-collapsed')));sidebarClose?.addEventListener('click',()=>setSidebarCollapsed(true));const b=replace('ai-chat-send-btn'),i=replace('ai-chat-input');$('ai-chat-plan-btn')?.remove();$('ai-chat-more-btn')?.remove();b?.addEventListener('click',send);i?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});i?.addEventListener('input',()=>{i.style.height='auto';i.style.height=Math.min(160,i.scrollHeight)+'px'});$('ai-chat-list')?.addEventListener('click',e=>{const o=e.target.closest('[data-menu]');if(o){e.preventDefault();e.stopPropagation();openMenu(o);return}const x=e.target.closest('[data-id]');if(x){activeProjectId=null;activeId=x.dataset.id;unreadChats.delete(activeId);finishedChats.delete(activeId);render();save()}});let draggedId=null;const chatList=$('ai-chat-list');chatList?.addEventListener('dragstart',e=>{const x=e.target.closest('[data-id]');if(!x)return;draggedId=x.dataset.id;x.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedId)});chatList?.addEventListener('dragend',e=>{e.target.closest('[data-id]')?.classList.remove('dragging');chatList.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));draggedId=null});chatList?.addEventListener('dragover',e=>{const x=e.target.closest('[data-id]');if(!x||!draggedId||x.dataset.id===draggedId)return;e.preventDefault();chatList.querySelectorAll('.drop-target').forEach(y=>y.classList.remove('drop-target'));x.classList.add('drop-target')});chatList?.addEventListener('drop',e=>{const x=e.target.closest('[data-id]');if(!x||!draggedId||x.dataset.id===draggedId)return;e.preventDefault();const from=chats.findIndex(c=>c.id===draggedId),to=chats.findIndex(c=>c.id===x.dataset.id);if(from<0||to<0)return;const moved=chats.splice(from,1)[0];chats.splice(to,0,moved);chats.forEach((c,n)=>c.order=n);render();save()});document.addEventListener('click',e=>{if(menu&&!menu.contains(e.target)&&!e.target.closest('[data-menu]')&&!e.target.closest('[data-project-menu]'))closeMenu()});const projectList=$('ai-project-list');projectList?.addEventListener('click',e=>{const pm=e.target.closest('[data-project-menu]');if(pm){e.preventDefault();e.stopPropagation();const p=projects.find(x=>x.id===pm.dataset.projectMenu);if(p)projectMenuOpen(pm,p);return}const pi=e.target.closest('[data-project-id]');if(!pi)return;if(pi.dataset.projectId===''){activeProjectId=null;render();save();return}const p=projects.find(x=>x.id===pi.dataset.projectId);if(!p)return;activeProjectId=p.id;render();save()});document.addEventListener('click',e=>{const s=e.target.closest('[data-project-settings]');if(s){const p=projects.find(x=>x.id===s.dataset.projectSettings);if(p)projectDialog(p);return}const n=e.target.closest('[data-project-new-chat]');if(n){activeProjectId=n.dataset.projectNewChat;newChat(true);return}const pc=e.target.closest('[data-project-chat]');if(pc){activeProjectId=null;activeId=pc.dataset.projectChat;render();save();return}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();closeDialog()}})}
function boot(){bind();onAuthStateChanged(auth,async u=>{user=u;if(user)await load()})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
