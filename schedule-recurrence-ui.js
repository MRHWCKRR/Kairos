import { normalizeRecurrence, formatRecurrenceSummary } from './recurrence-utils.js';

const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const DAY_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const localDateKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

function presetFor(rule){
  if(!rule?.enabled)return 'never';
  if(rule.frequency==='daily'&&rule.interval===1)return 'daily';
  if(rule.frequency==='weekly'&&rule.interval===1&&JSON.stringify(rule.weekdays)==='[1,2,3,4,5]')return 'weekdays';
  if(rule.frequency==='weekly'&&rule.interval===1)return 'weekly';
  if(rule.frequency==='monthly'&&rule.interval===1)return 'monthly';
  if(rule.frequency==='yearly'&&rule.interval===1)return 'yearly';
  return 'custom';
}
function unitFor(rule){return rule.frequency==='daily'?'days':rule.frequency==='weekly'?'weeks':rule.frequency==='monthly'?'months':'years'}
function unitFrequency(unit){return unit==='weeks'?'weekly':unit==='months'?'monthly':unit==='years'?'yearly':'daily'}
function selected(value,expected){return String(value)===String(expected)?'selected':''}

export function recurrenceFieldsMarkup(input={},context={}){
  const fallback=context.fallbackDate||input?.date||null,rule=normalizeRecurrence(input,fallback),preset=presetFor(rule),unit=unitFor(rule);
  const weekdays=rule.weekdays||[],month=rule.month||Number(String(fallback||'').slice(5,7))||new Date().getMonth()+1,monthDay=rule.monthDay||Number(String(fallback||'').slice(8,10))||new Date().getDate();
  return `<div class="ks-recurrence-fields" data-recurrence-fields>
    <input type="hidden" data-recurrence-exceptions value="${esc(JSON.stringify(rule.exceptions||{}))}">
    <label>Repeat<select data-recurrence-preset name="recurrencePreset">
      <option value="never" ${selected(preset,'never')}>Never</option><option value="daily" ${selected(preset,'daily')}>Daily</option><option value="weekdays" ${selected(preset,'weekdays')}>Every weekday</option><option value="weekly" ${selected(preset,'weekly')}>Weekly</option><option value="monthly" ${selected(preset,'monthly')}>Monthly</option><option value="yearly" ${selected(preset,'yearly')}>Yearly</option><option value="custom" ${selected(preset,'custom')}>Custom…</option>
    </select></label>
    <div class="ks-recurrence-details" data-recurrence-details ${preset==='never'?'hidden':''}>
      <div class="ks-form-grid" data-recurrence-custom-row ${preset==='custom'?'':'hidden'}><label>Repeat every<input type="number" min="1" step="1" value="${rule.interval||1}" data-recurrence-interval></label><label>Unit<select data-recurrence-unit><option value="days" ${selected(unit,'days')}>days</option><option value="weeks" ${selected(unit,'weeks')}>weeks</option><option value="months" ${selected(unit,'months')}>months</option><option value="years" ${selected(unit,'years')}>years</option></select></label></div>
      <div data-recurrence-weekly-row><span class="ks-recurrence-label">Repeat on</span><div class="ks-recurrence-weekdays">${DAY_SHORT.map((label,day)=>`<label><input type="checkbox" data-recurrence-weekday value="${day}" ${weekdays.includes(day)?'checked':''}><span>${label[0]}</span></label>`).join('')}</div></div>
      <div class="ks-form-grid" data-recurrence-monthly-row><label>Monthly pattern<select data-recurrence-monthly-mode><option value="date" ${selected(rule.monthlyMode,'date')}>Day of month</option><option value="weekdayPosition" ${selected(rule.monthlyMode,'weekdayPosition')}>Weekday position</option></select></label><label data-recurrence-month-day-label>Day<input type="number" min="1" max="31" value="${monthDay}" data-recurrence-month-day></label></div>
      <div class="ks-form-grid" data-recurrence-position-row><label>Position<select data-recurrence-position><option value="first" ${selected(rule.weekdayPosition,'first')}>First</option><option value="second" ${selected(rule.weekdayPosition,'second')}>Second</option><option value="third" ${selected(rule.weekdayPosition,'third')}>Third</option><option value="fourth" ${selected(rule.weekdayPosition,'fourth')}>Fourth</option><option value="last" ${selected(rule.weekdayPosition,'last')}>Last</option></select></label><label>Weekday<select data-recurrence-position-weekday>${DAY_SHORT.map((label,day)=>`<option value="${day}" ${selected(rule.weekday,day)}>${label}</option>`).join('')}</select></label></div>
      <div class="ks-form-grid" data-recurrence-yearly-row><label>Month<select data-recurrence-year-month>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${selected(month,i+1)}>${i+1}</option>`).join('')}</select></label><label>Day<input type="number" min="1" max="31" value="${monthDay}" data-recurrence-year-day></label></div>
      <div class="ks-form-grid"><label>Scheduling<select data-recurrence-mode><option value="flexible" ${selected(rule.mode,'flexible')}>Flexible time</option><option value="fixed" ${selected(rule.mode,'fixed')}>Fixed time</option></select></label><label>Ends<select data-recurrence-end-type><option value="never" ${selected(rule.endType,'never')}>Never</option><option value="date" ${selected(rule.endType,'date')}>On date</option><option value="count" ${selected(rule.endType,'count')}>After N occurrences</option></select></label></div>
      <div class="ks-form-grid" data-recurrence-end-row><label data-recurrence-end-date-label>End date<input type="date" value="${esc(rule.endDate||'')}" data-recurrence-end-date></label><label data-recurrence-count-label>Occurrences<input type="number" min="1" step="1" value="${rule.count||10}" data-recurrence-count></label></div>
      <small class="ks-recurrence-summary" data-recurrence-summary></small>
    </div>
  </div>`;
}

function seedPreset(form,preset,fallbackDate){
  const date=fallbackDate||form.elements?.date?.value||localDateKey(),day=new Date(`${date}T12:00:00`).getDay(),checks=[...form.querySelectorAll('[data-recurrence-weekday]')];
  if(preset==='weekdays')checks.forEach(el=>el.checked=[1,2,3,4,5].includes(Number(el.value)));
  if(preset==='weekly')checks.forEach(el=>el.checked=Number(el.value)===day);
  if(preset==='monthly'){
    const mode=form.querySelector('[data-recurrence-monthly-mode]'),monthDay=form.querySelector('[data-recurrence-month-day]');if(mode)mode.value='date';if(monthDay)monthDay.value=String(Number(date.slice(8,10))||new Date().getDate());
  }
  if(preset==='yearly'){
    const month=form.querySelector('[data-recurrence-year-month]'),yearDay=form.querySelector('[data-recurrence-year-day]');if(month)month.value=String(Number(date.slice(5,7))||new Date().getMonth()+1);if(yearDay)yearDay.value=String(Number(date.slice(8,10))||new Date().getDate());
  }
}
function refresh(form,options={}){
  const preset=form.querySelector('[data-recurrence-preset]')?.value||'never',details=form.querySelector('[data-recurrence-details]');if(details)details.hidden=preset==='never';
  const unit=preset==='daily'?'days':preset==='weekly'||preset==='weekdays'?'weeks':preset==='monthly'?'months':preset==='yearly'?'years':form.querySelector('[data-recurrence-unit]')?.value||'days';
  const custom=form.querySelector('[data-recurrence-custom-row]');if(custom)custom.hidden=preset!=='custom';
  const weekly=form.querySelector('[data-recurrence-weekly-row]');if(weekly)weekly.hidden=unit!=='weeks';
  const monthly=form.querySelector('[data-recurrence-monthly-row]');if(monthly)monthly.hidden=unit!=='months';
  const mode=form.querySelector('[data-recurrence-monthly-mode]')?.value||'date';
  const position=form.querySelector('[data-recurrence-position-row]');if(position)position.hidden=unit!=='months'||mode!=='weekdayPosition';
  const monthDay=form.querySelector('[data-recurrence-month-day-label]');if(monthDay)monthDay.hidden=unit!=='months'||mode!=='date';
  const yearly=form.querySelector('[data-recurrence-yearly-row]');if(yearly)yearly.hidden=unit!=='years';
  const endType=form.querySelector('[data-recurrence-end-type]')?.value||'never';
  const endDate=form.querySelector('[data-recurrence-end-date-label]'),count=form.querySelector('[data-recurrence-count-label]');if(endDate)endDate.hidden=endType!=='date';if(count)count.hidden=endType!=='count';
  const summary=form.querySelector('[data-recurrence-summary]');if(summary){const rule=readRecurrenceFields(form,options.fallbackDate||form.elements?.date?.value||null);summary.textContent=rule?formatRecurrenceSummary(rule):'Does not repeat'}
}

export function bindRecurrenceFields(form,options={}){
  if(!form)return ()=>{};
  const handler=()=>refresh(form,options),preset=form.querySelector('[data-recurrence-preset]');
  preset?.addEventListener('change',()=>{seedPreset(form,preset.value,form.elements?.date?.value||options.fallbackDate);refresh(form,options)});
  form.querySelectorAll('[data-recurrence-fields] input,[data-recurrence-fields] select').forEach(el=>{if(el===preset)return;el.addEventListener('input',handler);el.addEventListener('change',handler)});
  refresh(form,options);return handler;
}

export function readRecurrenceFields(form,fallbackDate=null){
  const preset=form?.querySelector('[data-recurrence-preset]')?.value||'never';if(preset==='never')return null;
  const unit=preset==='daily'?'days':preset==='weekly'||preset==='weekdays'?'weeks':preset==='monthly'?'months':preset==='yearly'?'years':form.querySelector('[data-recurrence-unit]')?.value||'days';
  const frequency=unitFrequency(unit),startDate=form.elements?.date?.value||fallbackDate||localDateKey();
  const weekdays=preset==='weekdays'?[1,2,3,4,5]:[...form.querySelectorAll('[data-recurrence-weekday]:checked')].map(el=>Number(el.value));
  let sourceExceptions={};
  try{sourceExceptions=JSON.parse(form.querySelector('[data-recurrence-exceptions]')?.value||'{}')}catch{sourceExceptions={}}
  const preservedExceptions=structuredClone(sourceExceptions);
  const rule={enabled:true,frequency,interval:preset==='custom'?Math.max(1,Number(form.querySelector('[data-recurrence-interval]')?.value)||1):1,weekdays,startDate,mode:form.querySelector('[data-recurrence-mode]')?.value||'flexible',endType:form.querySelector('[data-recurrence-end-type]')?.value||'never',endDate:form.querySelector('[data-recurrence-end-date]')?.value||null,count:Math.max(1,Number(form.querySelector('[data-recurrence-count]')?.value)||1),monthlyMode:form.querySelector('[data-recurrence-monthly-mode]')?.value||'date',monthDay:Number(frequency==='yearly'?form.querySelector('[data-recurrence-year-day]')?.value:form.querySelector('[data-recurrence-month-day]')?.value)||1,weekdayPosition:form.querySelector('[data-recurrence-position]')?.value||'first',weekday:Number(form.querySelector('[data-recurrence-position-weekday]')?.value)||0,month:Number(form.querySelector('[data-recurrence-year-month]')?.value)||1,exceptions:preservedExceptions};
  return normalizeRecurrence(rule,startDate);
}

export function showRecurrenceScopeDialog({title='Apply changes to',actionLabel='Apply',allowEntireSeries=true}={}){
  return new Promise(resolve=>{
    const existing=document.querySelector('.ks-recurrence-scope-dialog');existing?.remove();
    const overlay=document.createElement('div');overlay.className='ks-recurrence-scope-dialog';overlay.innerHTML=`<div class="ks-recurrence-scope-card" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>Choose which recurring tasks this should affect.</p><button type="button" data-scope="occurrence">This occurrence</button><button type="button" data-scope="future">This and future</button>${allowEntireSeries?'<button type="button" data-scope="series">Entire series</button>':''}<button type="button" data-scope="cancel">Cancel</button></div>`;
    const done=value=>{overlay.remove();resolve(value)};overlay.addEventListener('click',event=>{const value=event.target.closest?.('[data-scope]')?.dataset.scope;if(value)done(value);else if(event.target===overlay)done('cancel')});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape')done('cancel')});document.body.appendChild(overlay);overlay.querySelector('[data-scope="occurrence"]')?.focus();
  });
}
