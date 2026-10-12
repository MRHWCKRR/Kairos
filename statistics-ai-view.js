import {activityDays,usageDay} from './ai-usage.js?v=1';

export function mountAiActivity(root) {
  const find=selector=>root.querySelector(selector),doc=root.ownerDocument;
  let current=null,renderedDay=null;
  function clear() {
    current=null;find('[data-activity-total]').textContent='—';find('[data-activity-today]').textContent='—';
    find('[data-activity-calendar]').hidden=true;find('[data-activity-status]').hidden=false;
    find('[data-activity-status]').textContent='Loading AI activity…';find('[data-activity-note]').textContent='';
  }
  function render(state,day=usageDay()) {
    current=state;renderedDay=day;
    find('[data-activity-total]').textContent=state.totalSent.toLocaleString('en-AU');
    find('[data-activity-today]').textContent=(state.daily[day]||0).toLocaleString('en-AU');
    const grid=find('[data-activity-grid]');grid.replaceChildren();
    const cells=activityDays(state.daily,Date.parse(day+'T02:00:00Z'));
    const months=find('[data-activity-months]');months.replaceChildren();let lastMonth=null;
    for(let index=0;index<cells.length;index+=7) {
      const label=doc.createElement('span'),month=cells[index].day.slice(0,7);
      if(month!==lastMonth){label.textContent=new Date(cells[index].day+'T12:00:00Z').toLocaleDateString('en-AU',{month:'short',timeZone:'Australia/Brisbane'});lastMonth=month;}
      months.appendChild(label);
    }
    for(const cell of cells) {
      const button=doc.createElement(cell.padding?'span':'button');button.className='ai-activity-day';
      if(cell.padding){button.classList.add('ai-activity-padding');grid.appendChild(button);continue;}
      const unknown=!state.startedDay || cell.day<state.startedDay;
      button.type='button';button.dataset.level=String(cell.level);button.tabIndex=cell.day===day?0:-1;
      if(unknown)button.classList.add('ai-activity-unknown');
      const date=new Date(cell.day+'T12:00:00Z').toLocaleDateString('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'short',year:'numeric'});
      const label=date+' · '+(unknown?'No recorded data':cell.count+' message'+(cell.count===1?'':'s'));button.title=label;button.setAttribute('aria-label',label);
      const show=()=>find('[data-activity-detail]').textContent=label;
      button.addEventListener('focus',show);button.addEventListener('pointerenter',show);
      button.addEventListener('click',()=>{grid.querySelector('[tabindex="0"]')?.setAttribute('tabindex','-1');button.tabIndex=0;show();});
      grid.appendChild(button);
    }
    find('[data-activity-detail]').textContent='Past year · messages per day';
    find('[data-activity-calendar]').hidden=false;find('[data-activity-status]').hidden=true;
    find('[data-activity-note]').textContent='Messages you send in AI chats. '+(state.startedDay?'Daily history since '+new Date(state.startedDay+'T12:00:00Z').toLocaleDateString('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'short',year:'numeric'})+'.':'Daily history starts with your next message.')+' Total includes recoverable saved messages.';
  }
  find('[data-activity-grid]').addEventListener('keydown',event=>{
    const steps={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1};if(!(event.key in steps))return;
    const buttons=[...find('[data-activity-grid]').querySelectorAll('button')],index=buttons.indexOf(event.target);
    if(index<0)return;event.preventDefault();const next=buttons[Math.max(0,Math.min(buttons.length-1,index+steps[event.key]))];
    event.target.tabIndex=-1;next.tabIndex=0;next.focus();next.scrollIntoView?.({block:'nearest',inline:'nearest'});
  });
  return {clear,render,error:()=>{clear();find('[data-activity-status]').textContent='AI activity could not load. Try Refresh.';},tick:()=>{if(current && usageDay()!==renderedDay)render(current);}};
}
