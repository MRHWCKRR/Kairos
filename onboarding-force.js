/* Kairos Web onboarding.
 * IMPORTANT: this file never creates or replaces the app's loading screen.
 * app.js owns #app-loading-screen; this module only adds the walkthrough after auth resolves.
 */
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

if (document.getElementById("app-loading-screen")) {
    const style = document.createElement("style");
    style.id = "kairos-onboarding-style-v4";
    style.textContent = `
      #kairos-onboarding{position:fixed;inset:0;z-index:2147483647;background:var(--bg-main,#0f0f0f);color:var(--text-primary,#f5f5f5);font-family:Inter,system-ui,sans-serif;overflow:auto}
      #ko-shell{min-height:100%;min-height:100vh;display:flex;flex-direction:column}
      #ko-main{flex:1;display:flex;align-items:center;justify-content:center;padding:42px 22px}
      #ko-page{width:min(680px,100%);text-align:center}
      #ko-icon{width:82px;height:82px;margin:0 auto 26px;border-radius:50%;display:grid;place-items:center;font-size:38px;background:rgba(168,85,247,.14)}
      #ko-page h1{margin:0;font-size:clamp(32px,5vw,50px);line-height:1.08;letter-spacing:-.04em}
      #ko-page p{max-width:580px;margin:16px auto 34px;font-size:17px;line-height:1.6;opacity:.72}
      .ko-card{padding:22px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);text-align:left}
      .ko-field{margin:14px 0}.ko-field label{display:block;font-size:13px;font-weight:700;margin:0 0 7px;opacity:.72}
      .ko-field input,.ko-field select{box-sizing:border-box;width:100%;height:52px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#121212;color:inherit;padding:0 14px;font:inherit}
      .ko-field input:focus,.ko-field select:focus{outline:2px solid rgba(168,85,247,.45);outline-offset:1px}
      .ko-required{color:#c084fc}.ko-error{display:none;margin-top:8px;font-size:12px;color:#f0abfc}.ko-field.invalid input,.ko-field.invalid select{border-color:#c084fc}.ko-field.invalid .ko-error{display:block}

      /* Interactive birthday calendar */
      .ko-calendar{padding:18px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(0,0,0,.12)}
      .ko-calendar-head{display:flex;align-items:center;gap:9px;margin-bottom:15px}
      .ko-calendar-select{flex:1;min-width:0;height:42px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#151515;color:inherit;padding:0 9px;font:inherit;font-size:14px;font-weight:700}
      .ko-cal-nav{width:42px;height:42px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:transparent;color:inherit;cursor:pointer;font-size:20px}
      .ko-cal-nav:hover{background:rgba(168,85,247,.12)}
      .ko-week,.ko-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
      .ko-week div{text-align:center;font-size:11px;font-weight:800;opacity:.45;padding:5px 0}
      .ko-day{height:40px;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px}
      .ko-day:hover{background:rgba(168,85,247,.14)}
      .ko-day.muted{opacity:.22}.ko-day.selected{background:#a855f7;color:#fff;font-weight:800}.ko-day.today{box-shadow:inset 0 0 0 1px rgba(192,132,252,.75)}
      .ko-selected-date{text-align:center;margin-top:13px;font-size:13px;font-weight:700;opacity:.7;min-height:18px}

      /* Kairos-style checklist checkmark */
      .ko-task{display:flex;gap:12px;align-items:center;padding:13px 0;cursor:pointer;user-select:none}
      .ko-task-check{position:relative;width:22px;height:22px;flex:0 0 22px;border:2px solid rgba(255,255,255,.28);border-radius:6px;background:transparent;transition:.16s ease}
      .ko-task-check svg{position:absolute;inset:2px;width:14px;height:14px;opacity:0;transform:scale(.7);transition:.16s ease}
      .ko-task input{position:absolute;opacity:0;pointer-events:none}
      .ko-task input:checked + .ko-task-check{border-color:#a855f7;background:#a855f7}
      .ko-task input:checked + .ko-task-check svg{opacity:1;transform:scale(1)}
      .ko-task-copy{font-size:14px;font-weight:700}
      .ko-task.completed .ko-task-copy{text-decoration:line-through;opacity:.6}
      #ko-success{display:none;color:#a855f7;font-weight:700;font-size:14px;line-height:1.5;padding:3px 0 0 34px}
      .ko-item{display:flex;gap:12px;padding:10px 0}.ko-item b{display:block}.ko-item span{display:block;font-size:13px;opacity:.6;margin-top:3px}
      .ko-feature-icon{width:22px;text-align:center;opacity:.8}
      #ko-footer{display:flex;justify-content:space-between;align-items:center;padding:22px 30px 30px;gap:14px}
      .ko-left,.ko-right{display:flex;align-items:center;gap:14px}.ko-dots{display:flex;gap:8px}
      .ko-dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.2}.ko-dot.active{width:10px;height:10px;opacity:1;background:#a855f7}
      .ko-btn{border:0;border-radius:12px;padding:13px 22px;font:inherit;font-weight:800;cursor:pointer}.ko-next,.ko-start{background:#a855f7;color:#fff}
      .ko-back{background:transparent;color:inherit;opacity:.65;font-size:22px;padding:10px}.ko-hidden{display:none!important}
      @media(max-width:600px){#ko-main{padding:26px 16px 20px;align-items:flex-start}#ko-footer{padding:18px 16px}.ko-next,.ko-start{padding:12px 18px}.ko-calendar{padding:12px}.ko-day{height:36px}.ko-calendar-head{gap:6px}}
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "kairos-onboarding";
    document.body.appendChild(root);

    const regionOptions = [
        "United States","Canada","Australia","United Kingdom","New Zealand","India","Germany","France","Japan","South Korea","Singapore","Brazil","Mexico","Spain","Italy","Netherlands","Ireland","Sweden","Norway","Denmark","Finland","Switzerland","Austria"
    ];
    const languageOptions = [
        ["en","English"],["es","Spanish"],["fr","French"],["de","German"],["zh","Chinese"],["ja","Japanese"],["ko","Korean"],["pt","Portuguese"],["hi","Hindi"],["ar","Arabic"],["ru","Russian"]
    ];
    const timezoneOptions = [
        "UTC","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","America/Toronto","America/Vancouver","Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Rome","Europe/Amsterdam","Europe/Stockholm","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Asia/Seoul","Australia/Sydney","Australia/Perth","Pacific/Auckland"
    ];
    const now = new Date();
    let calendarYear = now.getFullYear();
    let calendarMonth = now.getMonth();
    let selectedBirthday = "";

    const pages = [
        {
            icon:"👋",
            title:"What should we call you?",
            desc:"This helps us personalize your greetings and notifications.",
            html:`<div class="ko-card"><div class="ko-field" id="ko-name-field"><label>Display Name <span class="ko-required">*</span></label><input id="ko-name" required autocomplete="name" placeholder="What should we call you?"><div class="ko-error">Please enter your name to continue.</div></div></div>`
        },
        {
            icon:"🎂",
            title:"When is your birthday?",
            desc:"We use your birth date to calculate age-based productivity benchmarks and milestone celebrations!",
            html:`<div class="ko-card"><div class="ko-field"><label>Birthday <span style="opacity:.55">(optional)</span></label><div class="ko-calendar"><div class="ko-calendar-head"><button type="button" class="ko-cal-nav" id="ko-cal-prev" aria-label="Previous month">‹</button><select class="ko-calendar-select" id="ko-cal-month" aria-label="Month"></select><select class="ko-calendar-select" id="ko-cal-year" aria-label="Year"></select><button type="button" class="ko-cal-nav" id="ko-cal-next" aria-label="Next month">›</button></div><div class="ko-week"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div><div class="ko-days" id="ko-cal-days"></div><div class="ko-selected-date" id="ko-selected-date">No birthday selected</div></div></div></div>`
        },
        {
            icon:"🌎",
            title:"Localization",
            desc:"Tell us where you are to localize your experience.",
            html:`<div class="ko-card"><div class="ko-field" id="ko-region-field"><label>Region <span class="ko-required">*</span></label><select id="ko-region" required><option value="">Select Region</option>${regionOptions.map(x=>`<option value="${x}">${x}</option>`).join("")}</select><div class="ko-error">Please select your region.</div></div><div class="ko-field" id="ko-language-field"><label>Language <span class="ko-required">*</span></label><select id="ko-language" required><option value="">Select Language</option>${languageOptions.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select><div class="ko-error">Please select your language.</div></div><div class="ko-field" id="ko-timezone-field"><label>Timezone <span class="ko-required">*</span></label><select id="ko-timezone" required><option value="">Select Timezone</option>${timezoneOptions.map(x=>`<option value="${x}">${x}</option>`).join("")}</select><div class="ko-error">Please select your timezone.</div></div></div>`
        },
        {
            icon:"✨",
            title:"Master Your Time",
            desc:"Here's a quick tour of your new workspace.",
            html:`<div class="ko-card"><strong style="color:#a855f7">Tutorial Board</strong><label class="ko-task" id="ko-task-label"><input id="ko-task" type="checkbox"><span class="ko-task-check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5 6.3 12 13 4.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="ko-task-copy">click this checkbox</span></label><div id="ko-success">✨ Nice work! That was your first task you've finished in Kairos. Your completed tasks and stats can now start building your progress.</div><div style="height:12px"></div><div class="ko-item"><span class="ko-feature-icon">◷</span><div><b>Focus Timer</b><span>Log sessions to earn deep work rewards.</span></div></div><div class="ko-item"><span class="ko-feature-icon">◉</span><div><b>Discovery</b><span>Adopt routines from the global community.</span></div></div><div class="ko-item"><span class="ko-feature-icon">🏆</span><div><b>Achievements</b><span>Unlock badges as you level up your life.</span></div></div></div>`
        }
    ];

    function renderCalendar() {
        const monthSelect = root.querySelector("#ko-cal-month");
        const yearSelect = root.querySelector("#ko-cal-year");
        const days = root.querySelector("#ko-cal-days");
        if (!monthSelect || !yearSelect || !days) return;

        monthSelect.innerHTML = Array.from({length:12},(_,i)=>`<option value="${i}">${new Date(2000,i,1).toLocaleString(undefined,{month:"long"})}</option>`).join("");
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = Array.from({length:101},(_,i)=>currentYear-i).map(y=>`<option value="${y}">${y}</option>`).join("");
        monthSelect.value = String(calendarMonth);
        yearSelect.value = String(calendarYear);

        const firstDay = new Date(calendarYear,calendarMonth,1).getDay();
        const daysInMonth = new Date(calendarYear,calendarMonth+1,0).getDate();
        const prevDays = new Date(calendarYear,calendarMonth,0).getDate();
        const cells = [];
        for(let i=firstDay-1;i>=0;i--) cells.push({day:prevDays-i,muted:true,year:calendarMonth===0?calendarYear-1:calendarYear,month:calendarMonth===0?11:calendarMonth-1});
        for(let d=1;d<=daysInMonth;d++) cells.push({day:d,muted:false,year:calendarYear,month:calendarMonth});
        while(cells.length<42){const d=cells.length-firstDay-daysInMonth+1;cells.push({day:d,muted:true,year:calendarMonth===11?calendarYear+1:calendarYear,month:calendarMonth===11?0:calendarMonth+1});}

        days.innerHTML = cells.map(c=>{
            const iso=`${c.year}-${String(c.month+1).padStart(2,"0")}-${String(c.day).padStart(2,"0")}`;
            const selected=selectedBirthday===iso;
            const today=c.day===now.getDate()&&c.month===now.getMonth()&&c.year===now.getFullYear();
            return `<button type="button" class="ko-day ${c.muted?'muted':''} ${selected?'selected':''} ${today?'today':''}" data-date="${iso}">${c.day}</button>`;
        }).join("");
        root.querySelectorAll(".ko-day").forEach(btn=>btn.addEventListener("click",()=>{
            selectedBirthday=btn.dataset.date;
            const picked=new Date(`${selectedBirthday}T12:00:00`);
            calendarYear=picked.getFullYear();calendarMonth=picked.getMonth();
            const display=root.querySelector("#ko-selected-date");
            if(display) display.textContent=`Birthday: ${picked.toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`;
            renderCalendar();
        }));
        const display=root.querySelector("#ko-selected-date");
        if(display) display.textContent=selectedBirthday?`Birthday: ${new Date(`${selectedBirthday}T12:00:00`).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`:"No birthday selected";
    }

    let page = 0;
    function render() {
        const p = pages[page];
        root.innerHTML = `<div id="ko-shell"><main id="ko-main"><div id="ko-page"><div id="ko-icon">${p.icon}</div><h1>${p.title}</h1><p>${p.desc}</p>${p.html}</div></main><footer id="ko-footer"><div class="ko-left"><button class="ko-btn ko-back ${page===0?'ko-hidden':''}" id="ko-back">←</button><div class="ko-dots">${pages.map((_,i)=>`<i class="ko-dot ${i===page?'active':''}"></i>`).join("")}</div></div><div class="ko-right"><button class="ko-btn ko-next" id="ko-next">${page===3?'':'→'}</button><button class="ko-btn ko-start ${page!==3?'ko-hidden':''}" id="ko-start">Get Started</button></div></footer></div>`;

        root.querySelector("#ko-next")?.addEventListener("click",()=>{
            if(!validatePage()) return;
            page=Math.min(3,page+1);render();
        });
        root.querySelector("#ko-back")?.addEventListener("click",()=>{page=Math.max(0,page-1);render();});
        root.querySelector("#ko-task")?.addEventListener("change",e=>{
            const s=root.querySelector("#ko-success");
            const label=root.querySelector("#ko-task-label");
            if(s)s.style.display=e.target.checked?"block":"none";
            if(label)label.classList.toggle("completed",e.target.checked);
            if(e.target.checked && typeof window.confetti === "function"){
                window.confetti({particleCount:120,spread:80,startVelocity:35,origin:{x:.5,y:.62}});
                setTimeout(()=>window.confetti({particleCount:70,spread:100,origin:{x:.25,y:.65}}),120);
                setTimeout(()=>window.confetti({particleCount:70,spread:100,origin:{x:.75,y:.65}}),180);
            }
        });
        root.querySelector("#ko-start")?.addEventListener("click",save);
        root.querySelector("#ko-cal-prev")?.addEventListener("click",()=>{calendarMonth--;if(calendarMonth<0){calendarMonth=11;calendarYear--;}renderCalendar();});
        root.querySelector("#ko-cal-next")?.addEventListener("click",()=>{calendarMonth++;if(calendarMonth>11){calendarMonth=0;calendarYear++;}renderCalendar();});
        root.querySelector("#ko-cal-month")?.addEventListener("change",e=>{calendarMonth=Number(e.target.value);renderCalendar();});
        root.querySelector("#ko-cal-year")?.addEventListener("change",e=>{calendarYear=Number(e.target.value);renderCalendar();});
        if(page===1) renderCalendar();
    }

    function validatePage(){
        let valid=true;
        if(page===0){
            const field=root.querySelector("#ko-name-field");
            const input=root.querySelector("#ko-name");
            valid=!!input?.value.trim();
            field?.classList.toggle("invalid",!valid);
            if(!valid) input?.focus();
        }
        if(page===2){
            ["#ko-region-field","#ko-language-field","#ko-timezone-field"].forEach(sel=>{
                const field=root.querySelector(sel);const input=field?.querySelector("select");const ok=!!input?.value;field?.classList.toggle("invalid",!ok);if(!ok)valid=false;
            });
            if(!valid) root.querySelector("select:not([value])")?.focus();
        }
        return valid;
    }

    async function save() {
        if(!validatePage()) return;
        const button=root.querySelector("#ko-start");
        button.disabled=true;button.textContent="Saving…";
        const get=id=>root.querySelector(id)?.value||"";
        try {
            await setDoc(doc(db,"users",auth.currentUser.uid),{
                "settings.profile.displayName":get("#ko-name").trim(),
                "settings.profile.birthday":selectedBirthday?selectedBirthday.split("-").reverse().join("/"):"",
                "settings.profile.country":get("#ko-region"),
                "settings.profile.timezone":get("#ko-timezone"),
                "settings.accessibility.language":get("#ko-language"),
                onboardingCompleted:true
            },{merge:true});
            if(typeof window.confetti === "function") window.confetti({particleCount:90,spread:90,origin:{x:.5,y:.7}});
            root.remove();
            window.dispatchEvent(new CustomEvent("kairos:onboarding-complete"));
        } catch(error) {
            console.error("Kairos onboarding save failed",error);
            button.disabled=false;button.textContent="Get Started";
            alert("We couldn't save your onboarding details. Please try again.");
        }
    }

    // This uses the exact same Firebase Auth instance as app.js.
    // It intentionally does not check onboardingCompleted: the walkthrough is requested every time the app opens.
    onAuthStateChanged(auth, user => {
        if (user) render();
    });
}
