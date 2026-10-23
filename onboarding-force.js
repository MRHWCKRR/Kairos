import { showNotice, confirmDialog, promptDialog } from './ui-dialogs.js?v=1';
/* Kairos Web onboarding — shared Firebase onboarding state across web/iOS/Android. */
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import ct from "https://cdn.jsdelivr.net/npm/countries-and-timezones@3.8.0/+esm";
import { LANGUAGES, getLocale } from "./i18n.js";

if (document.getElementById("app-loading-screen")) {
const style=document.createElement("style");style.id="kairos-onboarding-style-v8";style.textContent=`
#kairos-onboarding{position:fixed;inset:0;z-index:2147483647;background:var(--bg-main,#0f0f0f);color:var(--text-primary,#f5f5f5);font-family:Inter,system-ui,sans-serif;overflow:auto}#ko-shell{min-height:100vh;display:flex;flex-direction:column}#ko-main{flex:1;display:flex;align-items:center;justify-content:center;padding:42px 22px}#ko-page{width:min(680px,100%);text-align:center}#ko-icon{width:82px;height:82px;margin:0 auto 26px;border-radius:50%;display:grid;place-items:center;font-size:38px;background:rgba(168,85,247,.14)}#ko-page h1{margin:0;font-size:clamp(32px,5vw,50px);line-height:1.08;letter-spacing:-.04em}#ko-page p{max-width:580px;margin:16px auto 34px;font-size:17px;line-height:1.6;opacity:.72}.ko-card{padding:22px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);text-align:left}.ko-field{margin:14px 0}.ko-field label{display:block;font-size:13px;font-weight:700;margin:0 0 7px;opacity:.72}.ko-field input,.ko-field select{box-sizing:border-box;width:100%;height:52px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#121212;color:inherit;padding:0 14px;font:inherit}.ko-calendar{width:100%}.ko-calendar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}.ko-calendar-title{font-weight:800}.ko-cal-nav{border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit;border-radius:9px;width:42px;height:42px;cursor:pointer;font-size:22px}.ko-cal-nav:hover{background:rgba(168,85,247,.12)}.ko-cal-selects{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.ko-cal-selects select{box-sizing:border-box;width:100%;height:46px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#121212;color:inherit;padding:0 12px;font:inherit}.ko-week,.ko-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.ko-week div{text-align:center;font-size:11px;opacity:.5;padding:5px 0}.ko-day{border:0;background:transparent;color:inherit;border-radius:8px;min-height:40px;cursor:pointer;font:inherit}.ko-day:hover{background:rgba(168,85,247,.16)}.ko-day.muted{opacity:.25}.ko-day.disabled{opacity:.18;cursor:not-allowed}.ko-day.selected{background:#a855f7;color:#fff;font-weight:800}.ko-selected-date{margin-top:12px;opacity:.6;font-size:13px;text-align:center}.ko-task{display:flex;gap:12px;align-items:center;padding:10px 0}.ko-task input{appearance:none;width:22px;height:22px;border:2px solid rgba(255,255,255,.35);border-radius:6px;cursor:pointer;position:relative;margin:0}.ko-task input:checked{background:#a855f7;border-color:#a855f7}.ko-task input:checked:after{content:'✓';position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:15px;font-weight:900}.ko-success{display:none;color:#a855f7;font-weight:700;font-size:14px}.ko-item{display:flex;gap:12px;padding:10px 0}.ko-item b{display:block}.ko-item span{display:block;font-size:13px;opacity:.6;margin-top:3px}#ko-footer{display:flex;justify-content:space-between;align-items:center;padding:22px 30px 30px;gap:14px}.ko-left,.ko-right{display:flex;align-items:center;gap:14px}.ko-dots{display:flex;gap:8px}.ko-dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.2}.ko-dot.active{width:10px;height:10px;opacity:1;background:#a855f7}.ko-btn{border:0;border-radius:12px;padding:13px 22px;font:inherit;font-weight:800;cursor:pointer}.ko-next,.ko-start{background:#a855f7;color:#fff}.ko-next:disabled{background:#666;color:#aaa;cursor:not-allowed}.ko-back,.ko-skip{background:transparent;color:inherit;opacity:.65}.ko-back{font-size:22px;padding:10px}.ko-hidden{display:none!important}@media(max-width:600px){#ko-main{padding:26px 16px 20px}#ko-footer{padding:18px 16px}.ko-next,.ko-start{padding:12px 18px}.ko-cal-selects{grid-template-columns:1fr 1fr}.ko-day{min-height:36px}}
.ko-guide-outline{padding-left:22px;display:grid;gap:16px}.ko-guide-outline li{padding-left:6px}.ko-guide-outline b,.ko-guide-outline span{display:block}.ko-guide-outline span{font-size:14px;opacity:.72;margin-top:4px}#kairos-onboarding :focus-visible{outline:2px solid var(--accent-color,#a855f7);outline-offset:4px}
.ko-mode-choices{display:flex;gap:24px;justify-content:center}.ko-mode-choices legend{padding:0 8px;font-size:14px}.ko-mode-choices label{display:flex;gap:10px;align-items:center;cursor:pointer;padding:16px}.ko-mode-choices input{accent-color:#a855f7;width:20px;height:20px}
.mode-light #kairos-onboarding{background:#f7f7f9;color:#18181b}.mode-light #kairos-onboarding .ko-card{border-color:#d4d4d8;background:#fff}.mode-light #kairos-onboarding .ko-field input,.mode-light #kairos-onboarding select{background:#fff;border-color:#a1a1aa;color:#18181b}.mode-light #kairos-onboarding .ko-next,.mode-light #kairos-onboarding .ko-start{background:#7e22ce}
`;document.head.appendChild(style);

const allCountries=ct.getAllCountries();
const countries=Object.values(allCountries).sort((a,b)=>a.name.localeCompare(b.name));
// Only expose languages that the actual web app currently translates.
const languages=LANGUAGES.filter(l=>l&&l.id&&l.name);
const languageIds=new Set(languages.map(l=>l.id));
const state={name:'',country:'',language:'',timezone:'',birthDate:'',mode:'dark'};
let page=0;let startRevision=0;let calDate=new Date();calDate.setDate(1);let root=null;

function countryOptions(){return `<option value="">Select Region</option>${countries.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}`}
function timezoneLabel(zone){const city=zone.name.split('/').slice(-1)[0].replace(/_/g,' ');const offset=zone.utcOffsetStr||'';return `${city} — ${zone.name}${offset?` (${offset})`:''}`}
function timezoneOptions(){if(!state.country)return '<option value="">Select city / timezone</option>';const zones=ct.getTimezonesForCountry(state.country)||[];return '<option value="">Select city / timezone</option>'+zones.map(zone=>`<option value="${zone.name}">${timezoneLabel(zone)}</option>`).join('')}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function calendarMarkup(){
 const y=calDate.getFullYear(),m=calDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate(),today=new Date();today.setHours(23,59,59,999);let cells=[];
 for(let i=0;i<42;i++){let d=i-first+1,yy=y,mm=m;if(d<1){d=prevDays+d;mm=m-1;if(mm<0){mm=11;yy--}}else if(d>days){d-=days;mm=m+1;if(mm>11){mm=0;yy++}}const key=`${yy}-${String(mm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,date=new Date(yy,mm,d),muted=mm!==m,future=date>today;cells.push(`<button type="button" class="ko-day ${muted?'muted ':''}${future?'disabled ':''}${state.birthDate===key?'selected':''}" data-date="${key}" ${future?'disabled':''}>${d}</button>`)}
 const months=Array.from({length:12},(_,i)=>`<option value="${i}" ${i===m?'selected':''}>${new Date(2000,i,1).toLocaleString(getLocale(state.language||'en'),{month:'long'})}</option>`).join('');const currentYear=new Date().getFullYear();let years='';for(let yr=currentYear;yr>=1900;yr--)years+=`<option value="${yr}" ${yr===y?'selected':''}>${yr}</option>`;const selected=state.birthDate?new Date(state.birthDate+'T00:00:00').toLocaleDateString(getLocale(state.language||'en'),{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'No date selected';return `<div class="ko-calendar" id="ko-calendar"><div class="ko-calendar-head"><button type="button" class="ko-cal-nav" id="ko-cal-prev" aria-label="Previous month">‹</button><strong class="ko-calendar-title">${new Date(y,m,1).toLocaleString(getLocale(state.language||'en'),{month:'long',year:'numeric'})}</strong><button type="button" class="ko-cal-nav" id="ko-cal-next" aria-label="Next month">›</button></div><div class="ko-cal-selects"><select id="ko-cal-month" aria-label="Birth month">${months}</select><select id="ko-cal-year" aria-label="Birth year">${years}</select></div><div class="ko-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div>${x}</div>`).join('')}</div><div class="ko-days">${cells.join('')}</div><div class="ko-selected-date">Selected: ${selected}</div></div>`;
}
function renderCalendar(){
 const host=root?.querySelector('#ko-calendar-host');if(!host)return;host.innerHTML=calendarMarkup();
 host.querySelector('#ko-cal-prev')?.addEventListener('click',()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()});host.querySelector('#ko-cal-next')?.addEventListener('click',()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()});host.querySelector('#ko-cal-month')?.addEventListener('change',e=>{calDate.setMonth(Number(e.target.value));renderCalendar()});host.querySelector('#ko-cal-year')?.addEventListener('change',e=>{calDate.setFullYear(Number(e.target.value));renderCalendar()});host.querySelectorAll('.ko-day:not(.disabled)').forEach(button=>button.addEventListener('click',()=>{state.birthDate=button.dataset.date;calDate=new Date(state.birthDate+'T00:00:00');calDate.setDate(1);renderCalendar();sync()}));
}
function captureInputs(){const name=root?.querySelector('#ko-name');if(name)state.name=name.value.trim();const country=root?.querySelector('#ko-country');if(country)state.country=country.value;const language=root?.querySelector('#ko-language');if(language)state.language=language.value;const timezone=root?.querySelector('#ko-timezone');if(timezone)state.timezone=timezone.value}
function valid(){if(page===0)return !!state.name.trim();if(page===2)return !!state.country&&!!state.language&&!!state.timezone;return true}
function sync(){const b=root?.querySelector('#ko-next');if(!b)return;b.disabled=!valid();if(page===1)b.removeAttribute('disabled')}

function render(){
 const p=pages[page];root.innerHTML=`<div id="ko-shell"><main id="ko-main"><div id="ko-page"><div id="ko-icon" aria-hidden="true">${p.icon}</div><h1 tabindex="-1">${p.title}</h1><p>${p.desc}</p>${p.html}</div></main><footer id="ko-footer"><div class="ko-left"><button type="button" class="ko-btn ko-back ${page===0?'ko-hidden':''}" id="ko-back" aria-label="Previous step">Back</button><div class="ko-dots" aria-label="Step ${page+1} of ${pages.length}">${pages.map((_,i)=>'<i class="ko-dot '+(i===page?'active':'')+'"></i>').join('')}</div></div><div class="ko-right">${page===1?'<button type="button" class="ko-btn ko-skip" id="ko-skip">Skip birthday</button>':''}${page===pages.length-1?'<button type="button" class="ko-btn ko-skip" id="ko-guide-skip">Skip guide</button><button type="button" class="ko-btn ko-start" id="ko-start">Start guide</button>':'<button type="button" class="ko-btn ko-next" id="ko-next">Next</button>'}</div></footer></div>`;
 root.querySelector('#ko-next')?.addEventListener('click',()=>{if(!valid())return;captureInputs();page=Math.min(pages.length-1,page+1);render()});
 root.querySelector('#ko-skip')?.addEventListener('click',()=>{state.birthDate='';page=2;render()});
 root.querySelector('#ko-back')?.addEventListener('click',()=>{captureInputs();page=Math.max(0,page-1);render()});
 for(const [id,value] of [['ko-name',state.name],['ko-country',state.country],['ko-language',state.language],['ko-timezone',state.timezone]]){const input=root.querySelector('#'+id);if(input){if(id==='ko-timezone')input.innerHTML=timezoneOptions();input.value=value}}
 root.querySelector('#ko-name')?.addEventListener('input',e=>{state.name=e.target.value;sync()});
 root.querySelector('#ko-country')?.addEventListener('change',e=>{state.country=e.target.value;state.timezone='';const z=root.querySelector('#ko-timezone');if(z)z.innerHTML=timezoneOptions();sync()});
 root.querySelector('#ko-language')?.addEventListener('change',e=>{state.language=e.target.value;sync()});
 root.querySelector('#ko-timezone')?.addEventListener('change',e=>{state.timezone=e.target.value;sync()});
 root.querySelector('#ko-start')?.addEventListener('click',()=>void save(true));root.querySelector('#ko-guide-skip')?.addEventListener('click',()=>void save(false));
 for(const choice of root.querySelectorAll('[name="ko-mode"]')){
  choice.checked=choice.value===state.mode;
  choice.addEventListener('change',()=>{if(!choice.checked)return;state.mode=choice.value;document.body.classList.toggle('mode-light',state.mode==='light')});
 }
 if(page===1)renderCalendar();sync();root.querySelector('h1')?.focus();
}

const pages=[
{icon:'👋',title:'What should we call you?',desc:'This helps us personalize your greetings and notifications.',html:`<div class="ko-card"><div class="ko-field"><label>Display Name</label><input id="ko-name" autocomplete="name" placeholder="What should we call you?" value="${esc(state.name)}" required></div></div>`},
{icon:'🎂',title:'When is your birthday?',desc:'We use your birth date to calculate age-based productivity benchmarks and milestone celebrations!',html:`<div class="ko-card"><div id="ko-calendar-host"></div></div>`},
{icon:'🌎',title:'Localization',desc:'Tell us where you are to localize your experience.',html:`<div class="ko-card"><div class="ko-field"><label>Region</label><select id="ko-country">${countryOptions()}</select></div><div class="ko-field"><label>Language</label><select id="ko-language"><option value="">Select Language</option>${languages.map(l=>`<option value="${esc(l.id)}">${esc(l.flag||'')} ${esc(l.name)}</option>`).join('')}</select></div><div class="ko-field"><label>City / Timezone</label><select id="ko-timezone">${timezoneOptions()}</select></div></div>`},
{icon:'◐',title:'Make yourself at home',desc:'Choose a look for your workspace. You can change it later in Settings.',html:'<fieldset class="ko-card ko-mode-choices"><legend>Appearance</legend><label><input type="radio" name="ko-mode" id="ko-mode-light" value="light"> Light</label><label><input type="radio" name="ko-mode" id="ko-mode-dark" value="dark"> Dark</label></fieldset>'},
{icon:'✓',title:'Your workspace is ready',desc:'Plan something real with a short guide. Start the one-time tour, or skip it and explore at your own pace.',html:'<div class="ko-card"><ol class="ko-guide-outline"><li><b>Create a board and task</b><span>Organise something you want to do.</span></li><li><b>Schedule your task</b><span>Choose a time that fits your day.</span></li><li><b>Try AI Helper</b><span>Review an example before sending it.</span></li><li><b>Set up reminders</b><span>Choose how Kairos should notify you.</span></li><li><b>Commands and shortcuts</b><span>Find work faster and customise your keybinds.</span></li></ol></div>'}
];

function hydrateFromProfile(data){
 state.mode=data?.settings?.appearance?.mode==='light'?'light':'dark';document.body.classList.toggle('mode-light',state.mode==='light');
 const profile=data?.settings?.profile||{};const accessibility=data?.settings?.accessibility||{};
 state.name=profile.displayName||'';state.country=profile.country||'';state.timezone=profile.timezone||'';state.language=languageIds.has(accessibility.language)?accessibility.language:(languageIds.has(profile.language)?profile.language:'');
 const birthday=profile.birthday||'';if(/^\d{4}-\d{2}-\d{2}$/.test(birthday))state.birthDate=birthday;else if(/^\d{2}\/\d{2}\/\d{4}$/.test(birthday)){const [d,m,y]=birthday.split('/');state.birthDate=`${y}-${m}-${d}`}
}

async function save(showGuide=true){
 const user=auth.currentUser,view=root,button=view?.querySelector('#ko-start');if(!user||!button||button.disabled)return;
 captureInputs();const payload={settings:{profile:{displayName:state.name,birthday:state.birthDate?state.birthDate.split('-').reverse().join('/'):'',country:state.country,timezone:state.timezone},accessibility:{language:state.language||'en'},appearance:{mode:state.mode||'dark'}},onboardingCompleted:true,gettingStarted:{version:2,status:showGuide?'active':'skipped',step:0,updatedAt:Date.now()}};
 const controls=[...view.querySelectorAll('button,input,select')];controls.forEach(control=>control.disabled=true);button.textContent='Saving…';
 try{
  await setDoc(doc(db,'users',user.uid),payload,{merge:true});
  if(auth.currentUser?.uid!==user.uid||root!==view)return;
  view.remove();if(showGuide)window.__kairosGettingStartedOwner=user.uid;
  window.dispatchEvent(new CustomEvent('kairos:onboarding-complete',{detail:{ownerId:user.uid,guide:showGuide}}));
 }catch(error){
  if(auth.currentUser?.uid!==user.uid||root!==view)return;
  console.error('Kairos onboarding save failed',error);controls.forEach(control=>control.disabled=false);button.textContent='Start guide';
  showNotice("We couldn't save your setup. Please try again; your details are still here.");
 }
}

async function start(user,retry=false){
 const ticket=++startRevision;if(!retry){root?.remove();root=null}
 if(!user?.emailVerified)return;
 try{
   const snap=await getDoc(doc(db,'users',user.uid));
   if(auth.currentUser?.uid!==user.uid||ticket!==startRevision)return;
   const data=snap.exists()?snap.data():{};
   // This is the shared completion flag used by all Kairos clients. If any
   // platform has completed onboarding, web skips it too.
   if(data.onboardingCompleted===true){root?.remove();root=null;window.dispatchEvent(new CustomEvent('kairos:onboarding-complete'));return}
   hydrateFromProfile(data);
   root?.remove();
   root=document.createElement('div');root.id='kairos-onboarding';document.body.appendChild(root);page=0;render();
 }catch(error){
   if(auth.currentUser?.uid!==user.uid||ticket!==startRevision)return;
   console.error('Kairos onboarding status check failed:',error);
   // Keep the workspace gated until the account's saved setup is known.
   root?.remove();root=document.createElement('div');root.id='kairos-onboarding';
   root.innerHTML='<div id="ko-shell"><main id="ko-main"><div id="ko-page"><h1 tabindex="-1">We couldn’t load your setup</h1><p>Check your connection and try again. Your saved details have not changed.</p><button type="button" class="ko-btn ko-next" id="ko-retry">Retry</button></div></main></div>';
   document.body.appendChild(root);
   const button=root.querySelector('#ko-retry');
   button.addEventListener('click',()=>{if(button.disabled)return;button.disabled=true;button.textContent='Checking…';void start(user,true)});
   root.querySelector('h1').focus();
 }
}

onAuthStateChanged(auth,user=>{start(user)});
}
