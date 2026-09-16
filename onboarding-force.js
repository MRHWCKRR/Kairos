/* Kairos Web boot + onboarding. This file is intentionally self-contained so a
   Firebase/app.js race cannot leave the workspace blank. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const config = {
    apiKey: "AIzaSyChY9m5augQ2Z2Klmq1YGD2jLoMnCNA7fM",
    authDomain: "kairos-1a.firebaseapp.com",
    projectId: "kairos-1a",
    storageBucket: "kairos-1a.firebasestorage.app",
    messagingSenderId: "63554361",
    appId: "1:63554361:web:59b6e3a71ab30274411ee8",
    measurementId: "G-1W5P8BQ9ZM"
};

const isAppPage = () => {
    const path = window.location.pathname || "";
    return path.endsWith("/app.html") || path.endsWith("/app") || !!document.getElementById("app-loading-screen");
};

if (isAppPage()) {
    const app = getApps().find(a => a.name === "kairos-onboarding-force") || initializeApp(config, "kairos-onboarding-force");
    const auth = getAuth(app);
    const db = getFirestore(app);

    const style = document.createElement("style");
    style.id = "kairos-force-onboarding-style";
    style.textContent = `
      #kairos-force-onboarding{position:fixed;inset:0;z-index:2147483647;background:var(--bg-main,#0f0f0f);color:var(--text-primary,#f5f5f5);font-family:Inter,system-ui,sans-serif;overflow:auto}
      #kfo-shell{min-height:100vh;display:flex;flex-direction:column}
      #kfo-main{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 22px}
      #kfo-page{width:min(680px,100%);text-align:center}
      #kfo-icon{width:82px;height:82px;margin:0 auto 28px;border-radius:50%;display:grid;place-items:center;font-size:38px;background:rgba(168,85,247,.14)}
      #kfo-page h1{margin:0;font-size:clamp(32px,5vw,50px);line-height:1.08;letter-spacing:-.04em}
      #kfo-page p{max-width:580px;margin:16px auto 36px;font-size:17px;line-height:1.6;opacity:.72}
      .kfo-card{padding:22px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);text-align:left}
      .kfo-field{margin:14px 0}.kfo-field label{display:block;font-size:13px;font-weight:700;margin:0 0 7px;opacity:.72}
      .kfo-field input,.kfo-field select{box-sizing:border-box;width:100%;height:52px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#121212;color:inherit;padding:0 14px;font:inherit}
      .kfo-task{display:flex;gap:12px;align-items:center;padding:10px 0}.kfo-task input{width:20px;height:20px}
      .kfo-item{display:flex;gap:12px;padding:10px 0}.kfo-item b{display:block}.kfo-item span{display:block;font-size:13px;opacity:.6;margin-top:3px}
      #kfo-footer{display:flex;justify-content:space-between;align-items:center;padding:22px 30px 30px;gap:14px}.kfo-left,.kfo-right{display:flex;align-items:center;gap:14px}
      .kfo-dots{display:flex;gap:8px}.kfo-dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.2}.kfo-dot.active{width:10px;height:10px;opacity:1;background:#a855f7}
      .kfo-btn{border:0;border-radius:12px;padding:13px 22px;font:inherit;font-weight:800;cursor:pointer}.kfo-next,.kfo-start{background:#a855f7;color:#fff}.kfo-back,.kfo-skip{background:transparent;color:inherit;opacity:.65}.kfo-back{font-size:22px;padding:10px}.kfo-hidden{display:none!important}
      #kfo-boot{font-size:14px;opacity:.65;margin-top:20px}
      @media(max-width:600px){#kfo-footer{padding:18px}.kfo-next{padding:12px 18px}#kfo-main{padding-top:25px}}
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "kairos-force-onboarding";
    root.innerHTML = `
      <div id="kfo-shell">
        <main id="kfo-main"><div id="kfo-page">
          <div id="kfo-icon">⌛</div>
          <h1>Loading Kairos…</h1>
          <p>Preparing your workspace and first-time setup.</p>
          <div id="kfo-boot">Checking your account…</div>
        </div></main>
      </div>`;
    document.body.appendChild(root);

    function showWalkthrough(user) {
        if (!user || !root.isConnected) return;
        root.innerHTML = `<div id="kfo-shell"><main id="kfo-main"><div id="kfo-page"></div></main><footer id="kfo-footer"><div class="kfo-left"><button class="kfo-btn kfo-back" id="kfo-back">←</button><div class="kfo-dots">${[0,1,2,3].map((_,i)=>`<i class="kfo-dot ${i===0?'active':''}"></i>`).join("")}</div></div><div class="kfo-right"><button class="kfo-btn kfo-skip" id="kfo-skip">Skip</button><button class="kfo-btn kfo-next" id="kfo-next">→</button><button class="kfo-btn kfo-start kfo-hidden" id="kfo-start">Get Started</button></div></footer></div>`;

        const pageEl=root.querySelector("#kfo-page"), dots=[...root.querySelectorAll(".kfo-dot")], back=root.querySelector("#kfo-back"), skip=root.querySelector("#kfo-skip"), next=root.querySelector("#kfo-next"), start=root.querySelector("#kfo-start");
        let page=0;
        const pages=[
          {icon:"👋",title:"What should we call you?",desc:"This helps us personalize your greetings and notifications.",html:`<div class="kfo-card"><div class="kfo-field"><label>Display Name (optional)</label><input id="kfo-name" autocomplete="name" placeholder="What should we call you?"></div></div>`},
          {icon:"🎂",title:"When is your birthday?",desc:"We use your birth date to calculate age-based productivity benchmarks and milestone celebrations!",html:`<div class="kfo-card"><div class="kfo-field"><label>Birthday</label><input id="kfo-birthday" type="date"></div></div>`},
          {icon:"🌎",title:"Localization",desc:"Tell us where you are to localize your experience.",html:`<div class="kfo-card"><div class="kfo-field"><label>Country</label><select id="kfo-country"><option value="">Select Country</option><option>United States</option><option>Canada</option><option>Australia</option><option>United Kingdom</option><option>New Zealand</option><option>India</option><option>Germany</option><option>France</option><option>Japan</option><option>South Korea</option><option>Singapore</option><option>Brazil</option></select></div><div class="kfo-field"><label>Language</label><select id="kfo-language"><option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Chinese</option><option>Japanese</option><option>Korean</option><option>Portuguese</option><option>Hindi</option><option>Arabic</option><option>Russian</option></select></div><div class="kfo-field"><label>Timezone</label><select id="kfo-timezone"><option value="">Select Timezone</option><option>UTC</option><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>America/Phoenix</option><option>Europe/London</option><option>Europe/Paris</option><option>Asia/Tokyo</option><option>Australia/Sydney</option><option>Pacific/Auckland</option></select></div></div>`},
          {icon:"✨",title:"Master Your Time",desc:"Here's a quick tour of your new workspace.",html:`<div class="kfo-card"><strong style="color:#a855f7">Tutorial Board</strong><label class="kfo-task"><input id="kfo-task" type="checkbox"><span>Complete your first task!</span></label><div id="kfo-success" style="display:none;color:#a855f7;font-weight:700;font-size:14px">✨ Great job! Notice how your stats update in real-time.</div><div style="height:12px"></div><div class="kfo-item">◷<div><b>Focus Timer</b><span>Log sessions to earn deep work rewards.</span></div></div><div class="kfo-item">◉<div><b>Discovery</b><span>Adopt routines from the global community.</span></div></div><div class="kfo-item">🏆<div><b>Achievements</b><span>Unlock badges as you level up your life.</span></div></div></div>`}
        ];

        function render(){
            const p=pages[page];
            pageEl.innerHTML=`<div id="kfo-icon">${p.icon}</div><h1>${p.title}</h1><p>${p.desc}</p>${p.html}`;
            dots.forEach((d,i)=>d.classList.toggle("active",i===page));
            back.classList.toggle("kfo-hidden",page===0);skip.classList.toggle("kfo-hidden",page===3);next.classList.toggle("kfo-hidden",page===3);start.classList.toggle("kfo-hidden",page!==3);
            const task=root.querySelector("#kfo-task");
            if(task) task.onchange=()=>{const success=root.querySelector("#kfo-success");if(success)success.style.display=task.checked?"block":"none";};
        }
        next.onclick=()=>{if(page<3){page++;render();}};
        skip.onclick=()=>{page=3;render();};
        back.onclick=()=>{if(page>0){page--;render();}};
        start.onclick=async()=>{
            start.disabled=true;start.textContent="Saving…";
            const q=id=>root.querySelector(id);
            const birthday=q("#kfo-birthday")?.value||"";
            try {
                await setDoc(doc(db,"users",user.uid),{
                    "settings.profile.displayName":q("#kfo-name")?.value.trim()||"",
                    "settings.profile.birthday":birthday?birthday.split("-").reverse().join("/"):"",
                    "settings.profile.country":q("#kfo-country")?.value||"",
                    "settings.profile.timezone":q("#kfo-timezone")?.value||"",
                    "settings.accessibility.language":q("#kfo-language")?.value||"English",
                    onboardingCompleted:true
                },{merge:true});
                root.remove();
                window.dispatchEvent(new CustomEvent("kairos:onboarding-complete"));
            } catch(e) {
                console.error("Kairos onboarding save failed",e);
                start.disabled=false;start.textContent="Get Started";
                alert("We couldn't save your onboarding details. Please try again.");
            }
        };
        render();
    }

    // Wait for Firebase auth without making onboarding dependent on app.js.
    onAuthStateChanged(auth, user => {
        if (user) showWalkthrough(user);
        else {
            const boot = root.querySelector("#kfo-boot");
            if (boot) boot.textContent = "Waiting for sign-in…";
        }
    });
}
