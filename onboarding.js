/* Kairos Web onboarding — mirrors the Android onboarding flow. */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CONFIG = {
    apiKey: "AIzaSyChY9m5augQ2Z2Klmq1YGD2jLoMnCNA7fM",
    authDomain: "kairos-1a.firebaseapp.com",
    projectId: "kairos-1a",
    storageBucket: "kairos-1a.firebasestorage.app",
    messagingSenderId: "63554361",
    appId: "1:63554361:web:59b6e3a71ab30274411ee8",
    measurementId: "G-1W5P8BQ9ZM"
};

const onboardingApp = getApps().find(app => app.name === "kairos-onboarding") || initializeApp(CONFIG, "kairos-onboarding");
const onboardingAuth = getAuth(onboardingApp);
const onboardingDb = getFirestore(onboardingApp);

const COUNTRIES = [
    ["Afghanistan","AF"],["Albania","AL"],["Algeria","DZ"],["Andorra","AD"],["Angola","AO"],["Antigua and Barbuda","AG"],["Argentina","AR"],["Armenia","AM"],["Australia","AU"],["Austria","AT"],["Azerbaijan","AZ"],["Bahamas","BS"],["Bahrain","BH"],["Bangladesh","BD"],["Barbados","BB"],["Belarus","BY"],["Belgium","BE"],["Belize","BZ"],["Benin","BJ"],["Bhutan","BT"],["Bolivia","BO"],["Bosnia and Herzegovina","BA"],["Botswana","BW"],["Brazil","BR"],["Brunei","BN"],["Bulgaria","BG"],["Burkina Faso","BF"],["Burundi","BI"],["Cambodia","KH"],["Cameroon","CM"],["Canada","CA"],["Cape Verde","CV"],["Central African Republic","CF"],["Chad","TD"],["Chile","CL"],["China","CN"],["Colombia","CO"],["Comoros","KM"],["Costa Rica","CR"],["Croatia","HR"],["Cuba","CU"],["Cyprus","CY"],["Czechia","CZ"],["Denmark","DK"],["Djibouti","DJ"],["Dominica","DM"],["Dominican Republic","DO"],["Ecuador","EC"],["Egypt","EG"],["El Salvador","SV"],["Estonia","EE"],["Eswatini","SZ"],["Ethiopia","ET"],["Fiji","FJ"],["Finland","FI"],["France","FR"],["Gabon","GA"],["Gambia","GM"],["Georgia","GE"],["Germany","DE"],["Ghana","GH"],["Greece","GR"],["Grenada","GD"],["Guatemala","GT"],["Guinea","GN"],["Guyana","GY"],["Haiti","HT"],["Honduras","HN"],["Hungary","HU"],["Iceland","IS"],["India","IN"],["Indonesia","ID"],["Iran","IR"],["Iraq","IQ"],["Ireland","IE"],["Israel","IL"],["Italy","IT"],["Jamaica","JM"],["Japan","JP"],["Jordan","JO"],["Kazakhstan","KZ"],["Kenya","KE"],["Kiribati","KI"],["Kuwait","KW"],["Kyrgyzstan","KG"],["Laos","LA"],["Latvia","LV"],["Lebanon","LB"],["Lesotho","LS"],["Liberia","LR"],["Libya","LY"],["Liechtenstein","LI"],["Lithuania","LT"],["Luxembourg","LU"],["Madagascar","MG"],["Malawi","MW"],["Malaysia","MY"],["Maldives","MV"],["Malta","MT"],["Marshall Islands","MH"],["Mauritania","MR"],["Mauritius","MU"],["Mexico","MX"],["Micronesia","FM"],["Moldova","MD"],["Monaco","MC"],["Mongolia","MN"],["Montenegro","ME"],["Morocco","MA"],["Mozambique","MZ"],["Myanmar","MM"],["Namibia","NA"],["Nauru","NR"],["Nepal","NP"],["Netherlands","NL"],["New Zealand","NZ"],["Nicaragua","NI"],["Niger","NE"],["Nigeria","NG"],["North Korea","KP"],["North Macedonia","MK"],["Norway","NO"],["Oman","OM"],["Pakistan","PK"],["Palau","PW"],["Panama","PA"],["Papua New Guinea","PG"],["Paraguay","PY"],["Peru","PE"],["Philippines","PH"],["Poland","PL"],["Portugal","PT"],["Qatar","QA"],["Romania","RO"],["Russia","RU"],["Rwanda","RW"],["Saint Kitts and Nevis","KN"],["Saint Lucia","LC"],["Saint Vincent and the Grenadines","VC"],["Samoa","WS"],["San Marino","SM"],["Saudi Arabia","SA"],["Senegal","SN"],["Serbia","RS"],["Seychelles","SC"],["Sierra Leone","SL"],["Singapore","SG"],["Slovakia","SK"],["Slovenia","SI"],["Solomon Islands","SB"],["Somalia","SO"],["South Africa","ZA"],["South Korea","KR"],["South Sudan","SS"],["Spain","ES"],["Sri Lanka","LK"],["Sudan","SD"],["Suriname","SR"],["Sweden","SE"],["Switzerland","CH"],["Syria","SY"],["Taiwan","TW"],["Tajikistan","TJ"],["Tanzania","TZ"],["Thailand","TH"],["Timor-Leste","TL"],["Togo","TG"],["Tonga","TO"],["Trinidad and Tobago","TT"],["Tunisia","TN"],["Turkey","TR"],["Turkmenistan","TM"],["Tuvalu","TV"],["Uganda","UG"],["Ukraine","UA"],["United Arab Emirates","AE"],["United Kingdom","GB"],["United States","US"],["Uruguay","UY"],["Uzbekistan","UZ"],["Vanuatu","VU"],["Vatican City","VA"],["Venezuela","VE"],["Vietnam","VN"],["Yemen","YE"],["Zambia","ZM"],["Zimbabwe","ZW"]
].map(([name, isoCode]) => ({ name, isoCode })).sort((a,b) => a.name.localeCompare(b.name));

const LANGUAGE_OPTIONS = ["Arabic","Chinese","English","French","German","Hindi","Japanese","Korean","Portuguese","Russian","Spanish"];

const TIMEZONE_BY_COUNTRY = {
    US:["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","America/Anchorage","Pacific/Honolulu"],
    CA:["America/St_Johns","America/Halifax","America/Toronto","America/Winnipeg","America/Edmonton","America/Vancouver"],
    GB:["Europe/London"], AU:["Australia/Sydney","Australia/Melbourne","Australia/Brisbane","Australia/Adelaide","Australia/Darwin","Australia/Perth"],
    NZ:["Pacific/Auckland","Pacific/Chatham"], IN:["Asia/Kolkata"], CN:["Asia/Shanghai"], JP:["Asia/Tokyo"], KR:["Asia/Seoul"],
    SG:["Asia/Singapore"], MY:["Asia/Kuala_Lumpur"], TH:["Asia/Bangkok"], ID:["Asia/Jakarta","Asia/Makassar","Asia/Jayapura"], PH:["Asia/Manila"],
    DE:["Europe/Berlin"], FR:["Europe/Paris"], ES:["Europe/Madrid","Atlantic/Canary"], IT:["Europe/Rome"], PT:["Europe/Lisbon","Atlantic/Madeira","Atlantic/Azores"],
    NL:["Europe/Amsterdam"], BE:["Europe/Brussels"], CH:["Europe/Zurich"], AT:["Europe/Vienna"], IE:["Europe/Dublin"], NO:["Europe/Oslo"],
    SE:["Europe/Stockholm"], DK:["Europe/Copenhagen"], FI:["Europe/Helsinki"], PL:["Europe/Warsaw"], CZ:["Europe/Prague"], GR:["Europe/Athens"],
    TR:["Europe/Istanbul"], UA:["Europe/Kyiv"], RO:["Europe/Bucharest"], RU:["Europe/Moscow","Asia/Yekaterinburg","Asia/Novosibirsk","Asia/Vladivostok"],
    BR:["America/Sao_Paulo","America/Manaus","America/Fortaleza","America/Recife","America/Rio_Branco"], AR:["America/Argentina/Buenos_Aires"], CL:["America/Santiago"],
    MX:["America/Mexico_City","America/Monterrey","America/Tijuana"], CO:["America/Bogota"], PE:["America/Lima"], VE:["America/Caracas"],
    ZA:["Africa/Johannesburg"], EG:["Africa/Cairo"], NG:["Africa/Lagos"], KE:["Africa/Nairobi"], MA:["Africa/Casablanca"], GH:["Africa/Accra"],
    AE:["Asia/Dubai"], SA:["Asia/Riyadh"], QA:["Asia/Qatar"], IL:["Asia/Jerusalem"], IR:["Asia/Tehran"], PK:["Asia/Karachi"], BD:["Asia/Dhaka"], NP:["Asia/Kathmandu"],
    LK:["Asia/Colombo"], KZ:["Asia/Almaty","Asia/Aqtobe"], UZ:["Asia/Tashkent"], MN:["Asia/Ulaanbaatar"], VN:["Asia/Ho_Chi_Minh"]
};

const ALL_TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

function css() {
    if (document.getElementById("kairos-onboarding-styles")) return;
    const style = document.createElement("style");
    style.id = "kairos-onboarding-styles";
    style.textContent = `
#kairos-onboarding{position:fixed;inset:0;z-index:99999;display:none;overflow:auto;background:var(--bg-primary,#0b0b10);color:var(--text-primary,#f8f7fb);font-family:Inter,system-ui,sans-serif}
#kairos-onboarding.visible{display:block;animation:koFade .28s ease-out}
#kairos-onboarding .ko-bg{position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 0 0,rgba(168,85,247,.16),transparent 38%)}
#kairos-onboarding .ko-shell{min-height:100%;display:flex;flex-direction:column;position:relative}
#kairos-onboarding .ko-pages{flex:1;display:flex;align-items:center;justify-content:center;padding:42px 24px 12px}
#kairos-onboarding .ko-page{width:min(680px,100%);display:none;text-align:center;animation:koPage .52s cubic-bezier(.22,1,.36,1)}
#kairos-onboarding .ko-page.active{display:block}
#kairos-onboarding .ko-icon{width:80px;height:80px;margin:0 auto 32px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--accent-color,#a855f7) 12%,transparent);font-size:38px;box-shadow:0 18px 60px rgba(0,0,0,.12)}
#kairos-onboarding h1{margin:0;font-size:clamp(32px,5vw,48px);line-height:1.08;font-weight:900;letter-spacing:-.035em}
#kairos-onboarding .ko-description{margin:16px auto 48px;max-width:570px;color:color-mix(in srgb,currentColor 68%,transparent);font-size:17px;line-height:1.6}
#kairos-onboarding .ko-content{animation:koContent .58s .12s both}
#kairos-onboarding input,#kairos-onboarding select{width:100%;height:56px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 5%,transparent);color:inherit;padding:0 16px;font:inherit;outline:none}
#kairos-onboarding input:focus,#kairos-onboarding select:focus{border-color:var(--accent-color,#a855f7);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent-color,#a855f7) 15%,transparent)}
#kairos-onboarding .ko-field{position:relative;text-align:left}
#kairos-onboarding .ko-label{position:absolute;top:-9px;left:12px;padding:0 5px;background:var(--bg-primary,#0b0b10);font-size:12px;color:color-mix(in srgb,currentColor 65%,transparent)}
#kairos-onboarding .ko-stack{display:grid;gap:16px}
#kairos-onboarding .ko-card{padding:22px;border-radius:16px;background:color-mix(in srgb,currentColor 5%,transparent);border:1px solid color-mix(in srgb,currentColor 8%,transparent);text-align:left;box-shadow:0 20px 70px rgba(0,0,0,.10)}
#kairos-onboarding .ko-board-title{font-weight:800;color:var(--accent-color,#a855f7);font-size:17px;margin-bottom:16px}
#kairos-onboarding .ko-task{display:flex;align-items:center;gap:12px;font-size:16px;padding:6px 0;cursor:pointer}
#kairos-onboarding .ko-task input{width:20px;height:20px;accent-color:var(--accent-color,#a855f7)}
#kairos-onboarding .ko-success{margin-top:8px;color:var(--accent-color,#a855f7);font-size:14px;font-weight:600;animation:koFade .25s ease-out}
#kairos-onboarding .ko-tutorial-item{display:flex;gap:12px;align-items:flex-start;padding:8px 0}
#kairos-onboarding .ko-tutorial-icon{width:24px;flex:0 0 24px;color:var(--accent-color,#a855f7);font-size:20px}
#kairos-onboarding .ko-tutorial-title{font-weight:800;font-size:14px}.ko-tutorial-desc{font-size:13px;color:color-mix(in srgb,currentColor 58%,transparent);margin-top:3px}
#kairos-onboarding .ko-footer{width:100%;padding:24px 32px 32px;display:flex;align-items:center;justify-content:space-between;gap:20px}
#kairos-onboarding .ko-left,#kairos-onboarding .ko-right{display:flex;align-items:center;gap:14px}
#kairos-onboarding .ko-dots{display:flex;align-items:center;gap:8px}.ko-dot{width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,currentColor 20%,transparent);transition:.2s}.ko-dot.active{width:10px;height:10px;background:var(--accent-color,#a855f7)}
#kairos-onboarding button{border:0;font:inherit;cursor:pointer}.ko-back{width:42px;height:42px;border-radius:50%;background:color-mix(in srgb,currentColor 5%,transparent);color:inherit;font-size:20px}.ko-skip{background:none;color:color-mix(in srgb,currentColor 40%,transparent);font-weight:600}.ko-next{width:52px;height:52px;border-radius:50%;background:var(--accent-color,#a855f7);color:#fff;font-size:22px;box-shadow:0 10px 30px color-mix(in srgb,var(--accent-color,#a855f7) 28%,transparent)}.ko-start{min-width:160px;height:48px;border-radius:12px;background:var(--accent-color,#a855f7);color:#fff;font-weight:800;padding:0 22px}
#kairos-onboarding .ko-search{position:relative}.ko-search-results{position:absolute;z-index:3;top:64px;left:0;right:0;max-height:260px;overflow:auto;border-radius:12px;background:var(--bg-secondary,#15151d);border:1px solid color-mix(in srgb,currentColor 10%,transparent);box-shadow:0 18px 50px rgba(0,0,0,.3);text-align:left}.ko-option{padding:12px 16px;cursor:pointer}.ko-option:hover{background:color-mix(in srgb,var(--accent-color,#a855f7) 10%,transparent)}
@keyframes koFade{from{opacity:0}to{opacity:1}}@keyframes koPage{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}@keyframes koContent{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media(max-width:700px){#kairos-onboarding .ko-pages{padding:28px 18px 8px}#kairos-onboarding .ko-footer{padding:18px 18px 24px}.ko-skip{display:none}}
`;
    document.head.appendChild(style);
}

function countryZones(iso) { return TIMEZONE_BY_COUNTRY[iso] || ALL_TIMEZONES.filter(z => z.startsWith("Europe/") || z.startsWith("Asia/") || z.startsWith("America/")).slice(0, 40); }

function buildUI() {
    css();
    const root = document.createElement("div");
    root.id = "kairos-onboarding";
    root.innerHTML = `
      <div class="ko-bg"></div><div class="ko-shell">
        <div class="ko-pages">
          <section class="ko-page active" data-page="0"><div class="ko-icon">👤</div><h1>What should we call you?</h1><p class="ko-description">This helps us personalize your greetings and notifications.</p><div class="ko-content"><div class="ko-field"><span class="ko-label">Display Name (Optional)</span><input id="ko-name" type="text" autocomplete="name"></div></div></section>
          <section class="ko-page" data-page="1"><div class="ko-icon">🎂</div><h1>When is your birthday?</h1><p class="ko-description">We use your birth date to calculate age-based productivity benchmarks and milestone celebrations!</p><div class="ko-content"><div class="ko-field"><span class="ko-label">Birthday</span><input id="ko-birthday" type="date"></div></div></section>
          <section class="ko-page" data-page="2"><div class="ko-icon">🌐</div><h1>Localization</h1><p class="ko-description">Tell us where you are to localize your experience.</p><div class="ko-content ko-stack">
            <div class="ko-field ko-search"><span class="ko-label">Country</span><input id="ko-country" type="text" autocomplete="country-name" placeholder="Search country..."><div id="ko-country-results" class="ko-search-results" hidden></div></div>
            <div class="ko-field"><span class="ko-label">Language</span><select id="ko-language"></select></div>
            <div class="ko-field"><span class="ko-label">Timezone</span><select id="ko-timezone"><option value="">Select Country First</option></select></div>
          </div></section>
          <section class="ko-page" data-page="3"><div class="ko-icon">✨</div><h1>Master Your Time</h1><p class="ko-description">Here's a quick tour of your new workspace.</p><div class="ko-content"><div class="ko-card">
            <div class="ko-board-title">Tutorial Board</div><label class="ko-task"><input id="ko-task" type="checkbox"><span>Complete your first task!</span></label><div id="ko-success" class="ko-success" hidden>✨ Great job! Notice how your stats update in real-time.</div>
            <div style="height:18px"></div><div class="ko-tutorial-item"><div class="ko-tutorial-icon">◷</div><div><div class="ko-tutorial-title">Focus Timer</div><div class="ko-tutorial-desc">Log sessions to earn deep work rewards.</div></div></div>
            <div class="ko-tutorial-item"><div class="ko-tutorial-icon">◉</div><div><div class="ko-tutorial-title">Discovery</div><div class="ko-tutorial-desc">Adopt routines from the global community.</div></div></div>
            <div class="ko-tutorial-item"><div class="ko-tutorial-icon">🏆</div><div><div class="ko-tutorial-title">Achievements</div><div class="ko-tutorial-desc">Unlock badges as you level up your life.</div></div></div>
          </div></div></section>
        </div>
        <div class="ko-footer"><div class="ko-left"><button class="ko-back" id="ko-back" aria-label="Back">←</button><div class="ko-dots">${[0,1,2,3].map(i=>`<span class="ko-dot ${i===0?'active':''}"></span>`).join('')}</div></div><div class="ko-right"><button class="ko-skip" id="ko-skip">Skip</button><button class="ko-next" id="ko-next" aria-label="Next">→</button><button class="ko-start" id="ko-start" hidden>Get Started</button></div></div>
      </div>`;
    document.body.appendChild(root);
    return root;
}

function formatBirthday(value) {
    if (!value) return "";
    const [y,m,d] = value.split("-");
    return `${d}/${m}/${y}`;
}

async function startOnboarding(user) {
    const profileRef = doc(onboardingDb, "users", user.uid);
    let snap;
    try { snap = await getDoc(profileRef); } catch (e) { console.warn("Kairos onboarding profile check failed", e); return; }
    const data = snap.exists() ? snap.data() : null;

    // Account-level completion is authoritative, so the walkthrough follows the user across browsers/devices.
    if (data?.onboardingCompleted === true) return;
    // Legacy accounts that predate onboarding already have a profile document. Do not interrupt them.
    if (snap.exists() && data && data.onboardingCompleted === undefined && data.settings) {
        try { await updateDoc(profileRef, { onboardingCompleted: true }); } catch (_) {}
        return;
    }

    const root = buildUI();
    root.classList.add("visible");
    let page = 0;
    let country = null;
    let timezone = "";
    const pages = [...root.querySelectorAll(".ko-page")];
    const dots = [...root.querySelectorAll(".ko-dot")];
    const back = root.querySelector("#ko-back"), skip = root.querySelector("#ko-skip"), next = root.querySelector("#ko-next"), start = root.querySelector("#ko-start");
    const countryInput = root.querySelector("#ko-country"), countryResults = root.querySelector("#ko-country-results"), language = root.querySelector("#ko-language"), tz = root.querySelector("#ko-timezone");
    language.innerHTML = LANGUAGE_OPTIONS.map(x => `<option>${x}</option>`).join(""); language.value = "English";

    const render = () => { pages.forEach((p,i)=>p.classList.toggle("active",i===page)); dots.forEach((d,i)=>d.classList.toggle("active",i===page)); back.style.visibility = page ? "visible" : "hidden"; skip.hidden = page === 3; next.hidden = page === 3; start.hidden = page !== 3; };
    const nextPage = () => { if (page < 3) { page++; render(); } };
    next.onclick = nextPage; skip.onclick = nextPage; back.onclick = () => { if(page>0){page--;render();} };

    const renderCountries = (query="") => {
        const q = query.trim().toLowerCase();
        const matches = COUNTRIES.filter(c => !q || c.name.toLowerCase().includes(q)).slice(0,80);
        countryResults.innerHTML = matches.map(c=>`<div class="ko-option" data-iso="${c.isoCode}">${c.name}</div>`).join("") || `<div class="ko-option">No results found</div>`;
        countryResults.hidden = false;
        countryResults.querySelectorAll("[data-iso]").forEach(el=>el.onclick=()=>{ country=COUNTRIES.find(c=>c.isoCode===el.dataset.iso); countryInput.value=country.name; countryResults.hidden=true; timezone=""; const options=countryZones(country.isoCode); tz.innerHTML=`<option value="">Select Timezone</option>`+options.map(x=>`<option>${x}</option>`).join(""); });
    };
    countryInput.onfocus=()=>renderCountries(countryInput.value); countryInput.oninput=()=>renderCountries(countryInput.value); document.addEventListener("click", e=>{if(!root.contains(e.target))return;if(!e.target.closest(".ko-search"))countryResults.hidden=true;},{once:false});
    tz.onchange=()=>timezone=tz.value;

    root.querySelector("#ko-task").onchange=e=>{root.querySelector("#ko-success").hidden=!e.target.checked;};

    start.onclick = async () => {
        start.disabled = true; start.textContent = "Saving…";
        const name = root.querySelector("#ko-name").value.trim();
        const birthday = formatBirthday(root.querySelector("#ko-birthday").value);
        try {
            await updateDoc(profileRef, {
                "settings.profile.displayName": name,
                "settings.profile.birthday": birthday,
                "settings.profile.country": country?.name || "",
                "settings.profile.timezone": timezone,
                "settings.accessibility.language": language.value,
                onboardingCompleted: true
            });
            root.classList.remove("visible");
            setTimeout(()=>root.remove(),300);
            window.dispatchEvent(new CustomEvent("kairos:onboarding-complete"));
        } catch (e) {
            console.error("Kairos onboarding save failed", e);
            start.disabled=false; start.textContent="Get Started";
            alert("We couldn't save your onboarding details. Please try again.");
        }
    };
    render();
}

if (location.pathname.endsWith("/app.html") || location.pathname.endsWith("/app")) {
    onAuthStateChanged(onboardingAuth, user => { if (user) startOnboarding(user); });
}
