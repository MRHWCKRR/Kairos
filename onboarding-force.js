/* Kairos Web onboarding.
 * IMPORTANT: this file never creates or replaces the app's loading screen.
 * app.js owns #app-loading-screen; this module only adds the walkthrough after auth resolves.
 */
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

if (document.getElementById("app-loading-screen")) {
    const style = document.createElement("style");
    style.id = "kairos-onboarding-style-v3";
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
      .ko-task{display:flex;gap:12px;align-items:center;padding:10px 0}.ko-task input{width:20px;height:20px}
      .ko-item{display:flex;gap:12px;padding:10px 0}.ko-item b{display:block}.ko-item span{display:block;font-size:13px;opacity:.6;margin-top:3px}
      #ko-footer{display:flex;justify-content:space-between;align-items:center;padding:22px 30px 30px;gap:14px}
      .ko-left,.ko-right{display:flex;align-items:center;gap:14px}.ko-dots{display:flex;gap:8px}
      .ko-dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.2}.ko-dot.active{width:10px;height:10px;opacity:1;background:#a855f7}
      .ko-btn{border:0;border-radius:12px;padding:13px 22px;font:inherit;font-weight:800;cursor:pointer}.ko-next,.ko-start{background:#a855f7;color:#fff}
      .ko-back,.ko-skip{background:transparent;color:inherit;opacity:.65}.ko-back{font-size:22px;padding:10px}.ko-hidden{display:none!important}
      @media(max-width:600px){#ko-main{padding:26px 16px 20px}#ko-footer{padding:18px 16px}.ko-next,.ko-start{padding:12px 18px}}
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "kairos-onboarding";
    document.body.appendChild(root);

    const pages = [
        { icon:"👋", title:"What should we call you?", desc:"This helps us personalize your greetings and notifications.", html:`<div class="ko-card"><div class="ko-field"><label>Display Name (optional)</label><input id="ko-name" autocomplete="name" placeholder="What should we call you?"></div></div>` },
        { icon:"🎂", title:"When is your birthday?", desc:"We use your birth date to calculate age-based productivity benchmarks and milestone celebrations!", html:`<div class="ko-card"><div class="ko-field"><label>Birthday</label><input id="ko-birthday" type="date"></div></div>` },
        { icon:"🌎", title:"Localization", desc:"Tell us where you are to localize your experience.", html:`<div class="ko-card"><div class="ko-field"><label>Country</label><select id="ko-country"><option value="">Select Country</option><option>United States</option><option>Canada</option><option>Australia</option><option>United Kingdom</option><option>New Zealand</option><option>India</option><option>Germany</option><option>France</option><option>Japan</option><option>South Korea</option><option>Singapore</option><option>Brazil</option></select></div><div class="ko-field"><label>Language</label><select id="ko-language"><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="pt">Portuguese</option><option value="hi">Hindi</option><option value="ar">Arabic</option><option value="ru">Russian</option></select></div><div class="ko-field"><label>Timezone</label><select id="ko-timezone"><option value="">Select Timezone</option><option>UTC</option><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>America/Phoenix</option><option>Europe/London</option><option>Europe/Paris</option><option>Asia/Tokyo</option><option>Australia/Sydney</option><option>Pacific/Auckland</option></select></div></div>` },
        { icon:"✨", title:"Master Your Time", desc:"Here's a quick tour of your new workspace.", html:`<div class="ko-card"><strong style="color:#a855f7">Tutorial Board</strong><label class="ko-task"><input id="ko-task" type="checkbox"><span>Complete your first task!</span></label><div id="ko-success" style="display:none;color:#a855f7;font-weight:700;font-size:14px">✨ Great job! Notice how your stats update in real-time.</div><div style="height:12px"></div><div class="ko-item">◷<div><b>Focus Timer</b><span>Log sessions to earn deep work rewards.</span></div></div><div class="ko-item">◉<div><b>Discovery</b><span>Adopt routines from the global community.</span></div></div><div class="ko-item">🏆<div><b>Achievements</b><span>Unlock badges as you level up your life.</span></div></div></div>` }
    ];

    let page = 0;
    function render() {
        const p = pages[page];
        root.innerHTML = `<div id="ko-shell"><main id="ko-main"><div id="ko-page"><div id="ko-icon">${p.icon}</div><h1>${p.title}</h1><p>${p.desc}</p>${p.html}</div></main><footer id="ko-footer"><div class="ko-left"><button class="ko-btn ko-back ${page===0?'ko-hidden':''}" id="ko-back">←</button><div class="ko-dots">${pages.map((_,i)=>`<i class="ko-dot ${i===page?'active':''}"></i>`).join("")}</div></div><div class="ko-right"><button class="ko-btn ko-skip ${page===3?'ko-hidden':''}" id="ko-skip">Skip</button><button class="ko-btn ko-next ${page===3?'ko-hidden':''}" id="ko-next">→</button><button class="ko-btn ko-start ${page!==3?'ko-hidden':''}" id="ko-start">Get Started</button></div></footer></div>`;
        root.querySelector("#ko-next")?.addEventListener("click",()=>{page=Math.min(3,page+1);render();});
        root.querySelector("#ko-skip")?.addEventListener("click",()=>{page=3;render();});
        root.querySelector("#ko-back")?.addEventListener("click",()=>{page=Math.max(0,page-1);render();});
        root.querySelector("#ko-task")?.addEventListener("change",e=>{const s=root.querySelector("#ko-success");if(s)s.style.display=e.target.checked?"block":"none";});
        root.querySelector("#ko-start")?.addEventListener("click",save);
    }

    async function save() {
        const button=root.querySelector("#ko-start");
        button.disabled=true;button.textContent="Saving…";
        const get=id=>root.querySelector(id)?.value||"";
        const birthday=get("#ko-birthday");
        try {
            await setDoc(doc(db,"users",auth.currentUser.uid),{
                "settings.profile.displayName":get("#ko-name").trim(),
                "settings.profile.birthday":birthday?birthday.split("-").reverse().join("/"):"",
                "settings.profile.country":get("#ko-country"),
                "settings.profile.timezone":get("#ko-timezone"),
                "settings.accessibility.language":get("#ko-language")||"en",
                onboardingCompleted:true
            },{merge:true});
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