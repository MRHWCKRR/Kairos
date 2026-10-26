import {createCalendarFeedRequester} from './calendar-feed-client.js?v=1';
import {eventSegmentsForDate} from './schedule-events.js?v=1';
import {createDashboardController} from './dashboard-controller.js?v=2';
import {createNotificationCenter} from './notification-center.js?v=2';
import {createSettingsSync} from './settings-sync.js?v=2';
import {createMutationSession} from './mutation-session.js?v=4';
import {archiveMarkup,buildRestoreCommand} from './planner-archive.js?v=2';
import {createPlannerBackup,downloadPlannerBackup} from './planner-backup.js?v=2';
import {loadActionUndoPreview} from './plan-store.js?v=21';
import {calendarDate,shiftCalendarMonth,monthTaskEntries,monthEventEntries,calendarEventMarkup,calendarMonthMarkup,calendarTaskMarkup} from './schedule-month.js?v=3';
import {taskWorkCheckin} from './remaining-work.js?v=3';
import {promptFocusCheckin} from './focus-checkin.js?v=1';
import {mountFocusTimer} from './focus-timer.js?v=7';
import {persistFocusLog,persistFocusCorrection,loadFocusHistory} from './focus-store.js?v=6';
import {mountFocusHistory} from './focus-history.js?v=4';
import {taskFocusTarget} from './task-focus.js?v=4';
import {mountPlanningPreferencesEditor} from './planning-preferences-editor.js?v=4';
import {mountWeeklyAvailabilityEditor} from './weekly-availability-editor.js?v=1';
import { showNotice, confirmDialog, promptDialog } from './ui-dialogs.js?v=1';
import { aiFetch, aiErrorMessage } from './ai-client.js?v=3';
import { requestBilling } from './billing-client.js?v=3';
import { mountPlanUsage } from './plan-usage.js?v=6';
import {assignmentProgressIndex,assignmentProgressMarkup} from './assignment-progress.js?v=5';
import {planningClock} from './planning-model.js?v=1';
import { createPageLoader } from './page-loader.js?v=72';
import { mountPageRouter } from './page-router.js?v=3';
import { createPageRenderCache } from './page-render-cache.js?v=1';
import './boards-recurrence.js?v=11';
import { auth, db, appCheckReady } from './firebase.js?v=1';
import {getToken as getAppCheckToken} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js';
import {createPlannerBootstrap} from './planner-bootstrap.js?v=1';
const initializePlanner=createPlannerBootstrap({getUser:()=>auth.currentUser,projectId:auth.app.options.projectId,getAppToken:async()=>{const check=await appCheckReady;if(!check)throw Error('Security verification is unavailable. Refresh Kairos and try again.');return (await getAppCheckToken(check,false)).token;}});
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    EmailAuthProvider,
    GoogleAuthProvider,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc, setDoc, getDoc, onSnapshot, collection, addDoc, serverTimestamp,
    query, where, orderBy, limit, getDocs, updateDoc, deleteDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { LANGUAGES, applyTranslations, getLocale, getLanguageName, t, ACHIEVEMENT_I18N } from './i18n.js';
import { invalidateKairosContext } from './ai-context.js?v=17';
import { dueTaskReminders, dueBedtimeReminders, reminderDeliveryStatus } from './task-reminders.js?v=3';
import { deliverTaskReminder, deliverBedtimeReminder, saveNotificationEdits, escapeNotificationText } from './reminder-notifications.js?v=4';
import { savePlannerEdits, persistTaskListCommand,loadPlanningUndoPreview } from './plan-store.js?v=21';
import { resolveTaskDetail, taskListSection } from './task-list-model.js?v=21';
import { mergePlanEdits, planState } from './plan-merge.js?v=1';
import {mountGettingStarted,openGettingStartedDestination} from './getting-started.js?v=3';
import {createGettingStartedStore} from './getting-started-store.js?v=1';
import {mountFocusBreakdown} from './focus-breakdown.js?v=2';
import {mountGlobalSearch} from './global-search.js?v=5';
import {mountTaskCapture} from './task-capture.js?v=7';
import {normaliseShortcuts,describeShortcut} from './shortcut-model.js?v=1';
import {mountShortcutSettings} from './shortcut-settings.js?v=1';
import {mountSidebarIcons} from './sidebar-icons.js?v=2';
console.log("APP.js is loaded and running");

// ===========================================================
// CONFIG (modular — add more entries to these arrays, no other
// code changes needed for most additions)
// ===========================================================

const TEXT_COLORS = [
    { id: 'default', nameKey: 'color_default', hex: null },
    { id: 'white', nameKey: 'color_white', hex: '#ffffff' },
    { id: 'skyblue', nameKey: 'color_skyblue', hex: '#38bdf8' },
    { id: 'navy', nameKey: 'color_navy', hex: '#1e3a8a' },
    { id: 'turquoise', nameKey: 'color_turquoise', hex: '#2dd4bf' },
    { id: 'mint', nameKey: 'color_mint', hex: '#6ee7b7' },
    { id: 'rose', nameKey: 'color_rose', hex: '#fda4af' },
    { id: 'amber', nameKey: 'color_amber', hex: '#fbbf24' },
    { id: 'lavender', nameKey: 'color_lavender', hex: '#c4b5fd' }
];

const FONT_PACKS = [
    { id: 'sans', name: 'Inter' },
    { id: 'round', name: 'Quicksand' },
    { id: 'mono', name: 'JetBrains Mono' }
];

const THEMES = [
    { id: 'default', nameKey: 'theme_default', swatch: '#a855f7' },
    { id: 'fairyfloss', nameKey: 'theme_fairyfloss', swatch: '#ff8fc9' },
    { id: 'poseidon', nameKey: 'theme_poseidon', swatch: '#38bdf8' },
    { id: 'peacefulplains', nameKey: 'theme_peacefulplains', swatch: '#4ade80' }
];

const CURSORS = [
    { id: 'default', nameKey: 'cursor_default' },
    { id: 'bunny', nameKey: 'cursor_bunny' },
    { id: 'spaceship', nameKey: 'cursor_spaceship' }
];

const BACKGROUNDS = [
    { id: 'none', nameKey: 'bg_none', type: 'none' },
    { id: 'bg1', nameKey: 'bg_nebula', type: 'image', file: 'backgrounds/bg1.jpg' },
    { id: 'bg2', nameKey: 'bg_forest', type: 'image', file: 'backgrounds/bg2.jpg' },
    { id: 'bg3', nameKey: 'bg_waves', type: 'image', file: 'backgrounds/bg3.jpg' },
    { id: 'anim1', nameKey: 'bg_particles', type: 'video', file: 'backgrounds/anim1.mp4' },
    { id: 'anim2', nameKey: 'bg_rain', type: 'video', file: 'backgrounds/anim2.mp4' },
    { id: 'custom', nameKey: 'bg_custom', type: 'custom' }
];

const AMBIENT_SOUNDS = [
    { id: 'none', nameKey: 'ambient_none' },
    { id: 'rain', nameKey: 'ambient_rain', file: 'ambient/rain.mp3' },
    { id: 'lofi', nameKey: 'ambient_lofi', file: 'ambient/lofi.mp3' },
    { id: 'cafe', nameKey: 'ambient_cafe', file: 'ambient/cafe.mp3' },
    { id: 'custom', nameKey: 'ambient_custom', file: null }
];

const OG_ACHIEVEMENT_AVAILABLE = true; // flip to false to stop granting the OG badge to new signups

const ACHIEVEMENTS = [
    // --- Locked In / Focused Time (cumulative seconds) ---
    { id: 'focus_25m',  category: 'focus', name: 'Novice',              desc: 'Log 25 minutes of focus time', icon: '🔥', type: 'focus_seconds', threshold: 25 * 60 },
    { id: 'focus_1h',   category: 'focus', name: 'Apprentice',          desc: 'Log 1 hour of focus time',     icon: '⚡', type: 'focus_seconds', threshold: 60 * 60 },
    { id: 'focus_2h',   category: 'focus', name: 'Adept',               desc: 'Log 2 hours of focus time',    icon: '🌀', type: 'focus_seconds', threshold: 2 * 3600 },
    { id: 'focus_5h',   category: 'focus', name: 'Specialist',          desc: 'Log 5 hours of focus time',    icon: '🎯', type: 'focus_seconds', threshold: 5 * 3600 },
    { id: 'focus_10h',  category: 'focus', name: 'Expert',              desc: 'Log 10 hours of focus time',   icon: '🛡️', type: 'focus_seconds', threshold: 10 * 3600 },
    { id: 'focus_20h',  category: 'focus', name: 'Veteran',             desc: 'Log 20 hours of focus time',   icon: '🏅', type: 'focus_seconds', threshold: 20 * 3600 },
    { id: 'focus_50h',  category: 'focus', name: 'Master',              desc: 'Log 50 hours of focus time',   icon: '👑', type: 'focus_seconds', threshold: 50 * 3600 },
    { id: 'focus_100h', category: 'focus', name: 'Grandmaster',         desc: 'Log 100 hours of focus time',  icon: '💎', type: 'focus_seconds', threshold: 100 * 3600 },
    { id: 'focus_300h', category: 'focus', name: 'Legend',              desc: 'Log 300 hours of focus time',  icon: '⭐', type: 'focus_seconds', threshold: 300 * 3600 },
    { id: 'focus_500h', category: 'focus', name: 'Mythic',              desc: 'Log 500 hours of focus time',  icon: '🌟', type: 'focus_seconds', threshold: 500 * 3600 },
    { id: 'focus_1000h',category: 'focus', name: 'DEVELOPER???',        desc: 'Log 1000 hours of focus time', icon: '🧠', type: 'focus_seconds', threshold: 1000 * 3600 },

    // --- Tasks Completed (lifetime, anti-farmed) ---
    { id: 'tasks_5',     category: 'tasks', name: 'Getting Started',       desc: 'Complete 5 tasks',      icon: '📝', type: 'tasks_completed', threshold: 5 },
    { id: 'tasks_15',    category: 'tasks', name: 'Warming Up',            desc: 'Complete 15 tasks',     icon: '📋', type: 'tasks_completed', threshold: 15 },
    { id: 'tasks_30',    category: 'tasks', name: 'Task Tackler',          desc: 'Complete 30 tasks',     icon: '✅', type: 'tasks_completed', threshold: 30 },
    { id: 'tasks_50',    category: 'tasks', name: 'On A Roll',             desc: 'Complete 50 tasks',     icon: '🎲', type: 'tasks_completed', threshold: 50 },
    { id: 'tasks_100',   category: 'tasks', name: 'Centurion of Checkboxes', desc: 'Complete 100 tasks', icon: '🏆', type: 'tasks_completed', threshold: 100 },
    { id: 'tasks_200',   category: 'tasks', name: 'Double Century',        desc: 'Complete 200 tasks',    icon: '🎖️', type: 'tasks_completed', threshold: 200 },
    { id: 'tasks_500',   category: 'tasks', name: 'Half-K Hero',           desc: 'Complete 500 tasks',    icon: '🚀', type: 'tasks_completed', threshold: 500 },
    { id: 'tasks_800',   category: 'tasks', name: 'Almost There...',       desc: 'Complete 800 tasks',    icon: '🔟', type: 'tasks_completed', threshold: 800 },
    { id: 'tasks_1000',  category: 'tasks', name: 'Kilo-Tasker',           desc: 'Complete 1,000 tasks',  icon: '🗻', type: 'tasks_completed', threshold: 1000 },
    { id: 'tasks_20000', category: 'tasks', name: 'Task Titan',            desc: 'Complete 20,000 tasks', icon: '🗿', type: 'tasks_completed', threshold: 20000 },
    { id: 'tasks_50000', category: 'tasks', name: 'CHECKLIST MASTER',      desc: 'Complete 50,000 tasks', icon: '👑', type: 'tasks_completed', threshold: 50000 },

    // --- Milestone / random ---
    { id: 'misc_welcome', category: 'misc', name: 'Welcome to Kairos', desc: 'Join Kairos',                                icon: '👋', type: 'event', event: 'signup' },
    { id: 'misc_og',      category: 'misc', name: 'OG',                desc: 'One of the original Kairos users',           icon: '🥇', type: 'event', event: 'og', limitedAvailability: true },
    { id: 'misc_lofi',    category: 'misc', name: 'LOFIIII',           desc: 'Turn on the Lo-fi ambient sound',            icon: '🎧', type: 'event', event: 'lofi' },
    { id: 'misc_light',   category: 'misc', name: 'Come To the Light', desc: 'Switch to Light mode',                       icon: '☀️', type: 'event', event: 'light_mode' },
    { id: 'misc_busy',    category: 'misc', name: 'Real Busy',         desc: 'Schedule more than 10 tasks on a single day', icon: '📅', type: 'event', event: 'busy_day' }
];

const ACHIEVEMENT_CATEGORY_LABELS = { focus: 'Locked In Time', tasks: 'Tasks Completed', misc: 'Milestones' };

function cloneDeep(obj) {
    return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

function deepMerge(base, override) {
    if (typeof base !== 'object' || base === null) return override !== undefined ? override : base;
    const result = Array.isArray(base) ? [...base] : { ...base };
    if (override && typeof override === 'object') {
        for (const key of Object.keys(override)) {
            if (typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key])) {
                result[key] = deepMerge(base[key], override[key]);
            } else {
                result[key] = override[key];
            }
        }
    }
    return result;
}

function defaultSettings() {
    let tz = 'UTC';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
    return {
        profile: { displayName: '', avatarURL: '', birthday: '', timezone: tz },
        accessibility: { density: 'default', timeFormat: '12', reduceMotion: false, language: 'en', shortcuts: normaliseShortcuts() },
        appearance: {
            mode: 'dark',
            theme: 'default',
            textColor: 'default',
            font: 'sans',
            background: 'none',
            customBackground: null,
            cursor: 'default',
            ambientSound: 'none',
            ambientVolume: 35,
            customAmbientYoutubeUrl: '',
            confetti: true
        },
        planning: {weeklyAvailability:null,dailyLimitMinutes:0,gapMinutes:0,rescheduleCompleted:false},
        notifications: { enabled: true, boardCompletion: true, bedtimeReminders: true, browserPush: false }
    };
}

function defaultAchievementsData() {
    return { unlocked: {}, countedTaskIds: [], lifetimeTasksCompleted: 0, goals: [] };
}
function defaultFocusData() {
    return { totalSeconds: 0, longestSessionSeconds: 0, dailyFocusLog: {}, dailyTasksLog: {} };
}

function bootApp() {
    mountSidebarIcons(document);
    async function confirmAction(message) {
        const owner = auth.currentUser?.uid, plan = currentPlanDocId;
        const accepted = await confirmDialog(message, { destructive: /delete/i.test(message), confirmText: /delete/i.test(message) ? 'Delete' : 'Archive' });
        return accepted && owner === auth.currentUser?.uid && plan === currentPlanDocId;
    }
    async function requestName(message, value = '') {
        const owner = auth.currentUser?.uid, plan = currentPlanDocId;
        const result = await promptDialog(message, value);
        return owner === auth.currentUser?.uid && plan === currentPlanDocId ? result : null;
    }

    // Block the web workspace on phones/tablets before the app can render.
    const mobileAccessScreen = document.getElementById('mobile-access-screen');
    const mobileAccessTitle = document.getElementById('mobile-access-title');
    const mobileAccessMessage = document.getElementById('mobile-access-message');
    const mobileAccessPlatform = document.getElementById('mobile-access-platform');
    const mobileAccessDownload = document.getElementById('mobile-access-download');
    const mobileAccessNote = document.getElementById('mobile-access-note');

    const mobileAccessInfo = (() => {
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
        const isIOS = /iPad|iPhone|iPod/i.test(ua) || touchMac;
        const isAndroid = /Android/i.test(ua);
        return {
            isMobile: isIOS || isAndroid || /Mobile|Tablet/i.test(ua),
            isIOS,
            isAndroid
        };
    })();

    if (mobileAccessInfo.isMobile) {
        document.documentElement.classList.add('kairos-mobile-blocked');
        document.body.classList.add('kairos-mobile-blocked');
        mobileAccessScreen?.classList.add('is-visible');
        mobileAccessScreen?.setAttribute('aria-hidden', 'false');

        if (mobileAccessInfo.isIOS) {
            mobileAccessTitle.textContent = 'Kairos is better on a computer.';
            mobileAccessMessage.textContent = 'The Kairos web app is designed for PC and laptop screens. For iPhone and iPad, use the upcoming native Kairos app instead.';
            mobileAccessPlatform.textContent = 'iPhone & iPad';
            mobileAccessDownload.textContent = 'Get the Kairos iOS app';
            mobileAccessDownload.href = 'waitlist.html';
            mobileAccessNote.textContent = 'The iOS app is coming soon. Join the waitlist to be notified.';
        } else if (mobileAccessInfo.isAndroid) {
            mobileAccessTitle.textContent = 'Kairos is better on a computer.';
            mobileAccessMessage.textContent = 'The Kairos web app is designed for PC and laptop screens. For Android, use the upcoming native Kairos app instead.';
            mobileAccessPlatform.textContent = 'Android';
            mobileAccessDownload.textContent = 'Get the Kairos Android app';
            mobileAccessDownload.href = 'waitlist.html';
            mobileAccessNote.textContent = 'The Android app is coming soon. Join the waitlist to be notified.';
        }

        // Stop here so Firebase/auth, workspace rendering and other app logic do not run on mobile.
        return;
    }


    let checklistRenderTimeout;
    let currentPlanDocId = null;
    let searchPlannerOwnerId = null;

    // --- Data Engine ---
    let boardsData = [
        {
            id: 'board-1',
            title: 'My Routine',
            sections: [
                {
                    id: 'sec-1',
                    title: 'Morning Setup',
                    tasks: [
                        { id: 't-1', title: 'Review Study flashcards', completed: false, date: null },
                        { id: 't-2', title: 'Draft English essay outline', completed: false, date: null }
                    ]
                },
                {
                    id: 'sec-2',
                    title: 'Afternoon Deep Work',
                    tasks: [
                        { id: 't-3', title: 'Read Chapter 4', completed: false, date: null },
                        { id: 't-4', title: 'Complete Math worksheet', completed: false, date: null },
                        { id: 't-5', title: 'Upload assignment', completed: false, date: null }
                    ]
                }
            ]
        }
    ];

    function migrateToBoards(loadedDoc) {
    if (Array.isArray(loadedDoc.boards) || Array.isArray(loadedDoc.sections)) return planState(loadedDoc).boards;
    return null;
}

    function normalizeArchiveFields(boards) {
        boards.forEach(board => {
            if (board.archived === undefined) board.archived = false;
            board.sections.forEach(section => {
                if (section.archived === undefined) section.archived = false;
                section.tasks.forEach(task => {
                    if (task.archived === undefined) task.archived = false;
                });
            });
        });
        return boards;
    }

    function renderArchivePanel() {
        const container=document.getElementById('archive-panel-container');if(!container)return;
        const view=archiveMarkup({boards:boardsData},{translate:tr});container.innerHTML=view.html;
        const count=document.getElementById('archive-count');if(count)count.textContent=view.count;
    }
    async function restoreArchived(target){
        try{const {command,expected}=buildRestoreCommand({boards:boardsData},target);await plannerMutations.run(command,expected);}
        catch(error){showNotice(error.message);}
    }

    const toggleArchiveBtn = document.getElementById('toggle-archive-btn');
    const archivePanelContainer = document.getElementById('archive-panel-container');
    if (toggleArchiveBtn && archivePanelContainer) {
        toggleArchiveBtn.addEventListener('click', () => {
            const isHidden = archivePanelContainer.style.display === 'none';
            archivePanelContainer.style.display = isHidden ? 'block' : 'none';
            if (isHidden) renderArchivePanel();
        });
    }

    // --- Calendar Data ---
    let dayInsights = {};
    let calendarViewDate = new Date();
    calendarViewDate.setDate(1);
    let selectedCalendarDate = null;
    let calendarFocusDate = toDateKey(new Date());

    // --- Settings State ---
    let userSettings = defaultSettings();
    try {
        const cached = JSON.parse(localStorage.getItem('kairos_settings_cache') || 'null');
        if (cached && auth.currentUser?.uid === localStorage.getItem('kairos_settings_cache_uid')) userSettings = deepMerge(defaultSettings(), cached);
    } catch (e) { /* ignore malformed cache */ }
    let pendingSettings = cloneDeep(userSettings);
    const settingsSync=createSettingsSync({storage:localStorage,
        getOwnerId:()=>auth.currentUser?.uid||null,getDraft:()=>pendingSettings,setDraft:value=>{pendingSettings=value;},getApplied:()=>userSettings,setApplied:value=>{userSettings=value;},defaults:defaultSettings,mergeDefaults:value=>deepMerge(defaultSettings(),value),
        readRemote:async owner=>{const snap=await getDoc(doc(db,'users',owner));return {settings:snap.exists()?snap.data().settings||{}:{},confirmed:!snap.metadata?.fromCache&&!snap.metadata?.hasPendingWrites};},
        writeRemote:(owner,merge)=>runTransaction(db,async transaction=>{const ref=doc(db,'users',owner),snapshot=await transaction.get(ref),next=merge(snapshot.exists()?snapshot.data().settings||{}:{});transaction.set(ref,{settings:next},{merge:true});return next;}),
        onApply:applyAllSettings,onSettled:()=>renderUserProfileMenu(auth.currentUser),onStatus:updateSaveBarVisibility,onLoadComplete:markInitialLoadComplete,
        onLoaded:()=>{invalidateKairosContext();populateSettingsForm();document.dispatchEvent(new Event('kairos-controls-refresh'));renderUserProfileMenu(auth.currentUser);setupNotificationBell();},
        onSaved:({hasDraft})=>{window.__kairosScheduleWorkspace?.invalidate();taskDetails?.sync();populateSettingsForm();if(hasDraft)previewLive();if(userSettings.appearance.mode==='light')triggerMiscAchievement('light_mode');invalidateKairosContext();void window.__kairosTaskReminders?.check();},
        onError:(phase,error,record)=>{if(phase==='validation')showNotice(error.message);else if(phase==='save')showNotice(record.persisted?'Could not sync your settings. Your changes are saved on this device; use Retry save when you are ready.':'Could not sync or store these settings locally. Keep this tab open and retry saving.');if(phase!=='validation')console.error('Error '+phase+' user settings:',error);}
    });
    let gettingStarted=null;
    let confettiEnabled = userSettings.appearance.confetti;

    // --- Notifications state ---
    let taskReminderChecking = false, taskReminderQueued = false;
    const notificationCenter=createNotificationCenter({document,getOwnerId:()=>auth.currentUser?.uid||null,
        subscribe:(owner,next,error)=>onSnapshot(doc(db,'users',owner),snap=>next(snap.exists()?snap.data():null),error),persist:saveNotificationEdits,escapeText:escapeNotificationText,translate:tr,showBrowserNotification,
        onUserData:data=>{gettingStarted?.hydrate(data);if(data?.achievements){achievementsData=deepMerge(defaultAchievementsData(),data.achievements);renderAchievementsPage();renderMiniAchievementsWidget();}if(data?.focusData){focusData=deepMerge(defaultFocusData(),data.focusData);renderFocusTimerWidget();renderStatisticsPage();}}
    });
    window.addEventListener('pagehide',event=>{if(!event.persisted){notificationCenter.dispose();settingsSync.dispose();}});

    let pendingInitialLoads = 0;

    function hideLoadingScreen() {
        const el = document.getElementById('app-loading-screen');
        if (el) el.classList.add('hidden');
    }

    function markInitialLoadComplete() {
        pendingInitialLoads = Math.max(0, pendingInitialLoads - 1);
        if (pendingInitialLoads === 0) hideLoadingScreen();
    }

    // --- Schedule state ---
    let scheduleData = [];
    let calendarSourcesData = [];
    let calendarImportController=null,calendarImportLoading=null;
    let editingScheduleEventId = null;

    // --- Achievements / Focus Timer / Statistics state ---
    let achievementsData = defaultAchievementsData();
    let focusData = defaultFocusData();
    let statsRange = 'week';
    let statisticsRenderedDate = null;
    let focusTimerController = null, focusHistoryController = null;

    let appReady = false; // guards against calling render functions before they're defined below
    const pageRenders = createPageRenderCache({
        isActive: page => document.getElementById(page)?.classList.contains('active'),
        scheduleIdle: callback => window.requestIdleCallback ? window.requestIdleCallback(callback, {timeout:4000}) : setTimeout(callback,250)
    });
    let ytPlayer = null; // YouTube ambient player state — declared early since applyAllSettings() (called just below) can reach it via applyAmbientSound()
    let ytApiReadyPromise = null;

    // Shorthand: translate a key using whichever language is currently active.
    function tr(key) {
        const result = t(key, userSettings.accessibility.language || 'en');
        return (result === undefined || result === null) ? key : result;
    }

    function trFmt(key, vars) {
        let str = tr(key);
        Object.keys(vars || {}).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
        return str;
    }

    function refreshDynamicUI() {
        if (!appReady) return;
        renderConfigOptions();
        populateSettingsForm();
        document.dispatchEvent(new Event('kairos-controls-refresh'));
        if (auth.currentUser) renderUserProfileMenu(auth.currentUser);
        renderNotifPanel();
        renderFocusTimerWidget();
        renderMiniAchievementsWidget();
        renderStatisticsPage();
        renderAchievementsPage();
        renderGoalSelects();
        renderArchivePanel();
        updateRoutineStats();
        if (selectedCalendarDate) renderDayPanel();
    }

    applyAllSettings();

    // --- Auth Management ---
    const accountDeletionPendingKey = 'kairos_account_deletion_pending';
    let plansReturnPage = 'home-page';
    const planPanel = document.getElementById('plans-page');
    const planUsage = mountPlanUsage({root:planPanel,auth,request:requestBilling,
    onOpenPlans:()=>{
        const active=document.querySelector('.page-view.active');
        if(active && active.id!=='plans-page')plansReturnPage=active.id;
        const page=new URL(location.href).searchParams.get('page')||'dashboard';
        location.assign('plans.html?return='+encodeURIComponent(page));
    },onClosePlans:()=>pageRouter.navigate(plansReturnPage),onStatus:status=>{
        const badge=document.querySelector('.ai-chat-plan-badge');
        if(badge)badge.textContent=status?.access?.tier==='plus'?'Plus':status?.access?.tier==='free'?'Free':'—';
    }});
    const refreshVisibleUsage = event => planUsage.usageChanged(event.detail);
    window.addEventListener('kairos-ai-usage',refreshVisibleUsage);
    window.addEventListener('pageshow',event=>{if(event.persisted)void planUsage.refresh({fresh:true});});
    window.addEventListener('pagehide',event=>{
        if(event.persisted)return;
        window.removeEventListener('kairos-ai-usage',refreshVisibleUsage);
        planUsage.destroy();
    },{once:true});

    onAuthStateChanged(auth, async (user) => {
        globalThis.window?.__kairosScheduleInteractions?.sync();
        searchPlannerOwnerId = null;
        globalSearchController?.sync();taskCaptureController?.sync();plannerMutations?.sync();dashboardController?.sync();
        settingsSync.reset();notificationCenter.reset();
        calendarSourcesData=[];globalThis.window?.__kairosCalendarImports?.sync();
        focusTimerController?.sync();
        focusHistoryController?.sync();
        gettingStarted?.sync();
        taskMenus?.sync();taskShortcuts?.sync();
        taskInteractions?.sync();
        taskWorkspace?.sync();
        taskSelection?.sync();
        planUsage.reset();
        if(!user)void planUsage.refresh();
        if (!user) {
            let deletionPending = false;
            try {
                deletionPending = sessionStorage.getItem(accountDeletionPendingKey) === '1';
            } catch (e) {}

            if (deletionPending) {
                console.log("Intentional account deletion detected. Showing goodbye screen.");
                showAccountDeletedScreen();
                return;
            }

            console.log("No user detected. Redirecting to login...");
            notificationCenter.reset();
            window.location.replace("login.html");
            return;
        }

        // Always arm the fallback before any Firestore work. If one of the
        // initial data requests hangs or throws, the workspace must not be
        // trapped behind the loading screen forever.
        const loadingFallback = setTimeout(hideLoadingScreen, 8000);

        // Firebase can restore a persisted session even when the email has
        // never been verified. Refresh the account state before allowing the
        // workspace to load so app.html is never an auth bypass.
        try {
            await user.reload();
        } catch (error) {
            console.warn("Unable to refresh authentication state:", error);
        }

        if (!auth.currentUser?.emailVerified) {
            console.log("User email is not verified. Redirecting to verification...");
            notificationCenter.reset();
            clearTimeout(loadingFallback);
            const emailParam = auth.currentUser?.email ? "?email=" + encodeURIComponent(auth.currentUser.email) : "";
            window.location.replace("verify-email.html" + emailParam);
            return;
        }

        console.log("User is logged in and verified:", user.email);
        pageRouter.warm();
        void planUsage.refresh();
        pendingInitialLoads = 0;
        hideLoadingScreen();

        // Load user data independently so a failure in one request does not
        // prevent the rest of the app from becoming usable.
        Promise.resolve().then(() => loadLatestPlanFromFirestore(user)).catch(err => console.error("Failed to load latest plan:", err));
        Promise.resolve().then(() => loadUserSettingsFromFirestore(user)).catch(err => console.error("Failed to load settings:", err));
        Promise.resolve().then(() => setupNotificationsSync(user)).catch(err => console.error("Failed to sync notifications:", err));
        Promise.resolve().then(() => loadUserProgressFromFirestore(user)).catch(err => console.error("Failed to load user progress:", err));
        // AI chat state is owned by ai-workspace.js; do not load the legacy single-chat history here.
    });
    
    // --- 1 UI Nav & Clock ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            const aiPage = document.getElementById('ai-page');
            if (aiPage && aiPage.classList.contains('active')) {
                sidebarManuallyToggledOnAI = true;
            }
        });
    }

    let aiPageAutoCollapsed = false;
    let sidebarManuallyToggledOnAI = false;
    let taskDetails=null,taskWorkspace=null,taskInteractions=null,taskMenus=null,taskSelection=null,taskShortcuts=null,focusBreakdownView=null,globalSearchController=null,taskCaptureController=null,dashboardController=null,plannerMutations=null;
    async function openCalendarImports(){
        const owner=auth.currentUser?.uid;if(!owner||!auth.currentUser.emailVerified)return false;
        if(currentPlanDocId&&searchPlannerOwnerId!==owner){showNotice('Your planner is loading. Try again in a moment.');return false;}
        if(!calendarImportLoading)calendarImportLoading=(async()=>{
            const [{mountCalendarImport},{loadPageStyle}]=await Promise.all([import('./calendar-import.js?v=1'),import('./page-loader.js?v=72')]);
            await loadPageStyle('calendar-import.css?v=1');
            const fetchFeed=createCalendarFeedRequester({getUser:()=>auth.currentUser,getAppToken:async()=>{const check=await appCheckReady;if(!check)throw Error('Security verification is unavailable. Refresh Kairos.');return (await getAppCheckToken(check,false)).token;}});
            calendarImportController=mountCalendarImport({getIdentity:globalSearchIdentity,getState:()=>({boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData}),getTimezone:()=>userSettings.profile.timezone||'UTC',getToday:()=>planningClock(Date.now(),userSettings.profile.timezone).date,ensurePlan:()=>window.__kairosScheduleBridge.ensureSchedulePlan(),commit:commitTaskDetails,session:plannerMutations,fetchFeed,confirmRemove:message=>confirmDialog(message,{confirmText:'Remove calendar'})});
            window.__kairosCalendarImports=calendarImportController;
            window.addEventListener('pagehide',event=>{if(!event.persisted)calendarImportController.dispose();});
        })().catch(error=>{calendarImportLoading=null;throw error;});
        try{await calendarImportLoading;if(auth.currentUser?.uid!==owner)return false;return calendarImportController.open();}catch(error){showNotice('Could not open calendar import. '+error.message);return false;}
    }
    async function commitTaskDetails(command,expected,identity){
        if(!plannerMutations)throw new Error('Planner saving is still loading. Your edits are retained.');
        return plannerMutations.submit(command,expected,identity);
    }
    commitTaskDetails.discard=identity=>identity&&plannerMutations?.discard(identity);
    async function persistTaskDetails(command,expected,identity){
        const user=auth.currentUser;
        if(!user||identity.ownerId!==user.uid||identity.planId!==currentPlanDocId)throw new Error('The signed-in account or planner changed.');
        planEditRevision++;planLoadRevision++;
        const work=planSaveQueue.catch(()=>{}).then(async()=>{
            if(auth.currentUser?.uid!==user.uid||currentPlanDocId!==identity.planId)throw new Error('The signed-in account or planner changed.');
            const before=planState({boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData});
            const result=await persistTaskListCommand(identity.planId,user.uid,command,expected,identity.operationId,identity.createdAt);
            const snapshot=await getDoc(doc(db,'study_plans',identity.planId));
            if(auth.currentUser?.uid!==user.uid||currentPlanDocId!==identity.planId)throw new Error('The signed-in account or planner changed.');
            if(!snapshot.exists()||snapshot.data().userID!==user.uid)throw new Error('The planner is no longer available.');
            const saved=planState(snapshot.data()),live=planState({boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData});
            const rebased=mergePlanEdits(before,live,saved);
            boardsData=rebased.boards;dayInsights=rebased.dayInsights;scheduleData=rebased.scheduleEvents;calendarSourcesData=rebased.calendarSources;
            invalidateKairosContext({ownerId:user.uid,planId:identity.planId,before:planSnapshot,after:saved});planSnapshot=saved;
            renderApp();void window.__kairosTaskReminders?.check();return result;
        });
        planSaveQueue=work;
        return work;
    }
    async function openTaskDetailsInSchedule(target){
        const actor=auth.currentUser?.uid,actorPlan=currentPlanDocId;if(!actor)return false;
        if(!await (taskDetails?.requestClose?.()??true)||auth.currentUser?.uid!==actor||currentPlanDocId!==actorPlan)return false;
        try{await pageRouter.navigate('schedule-page')}catch(error){if(auth.currentUser?.uid===actor&&currentPlanDocId===actorPlan)showNotice('Could not open Schedule. Your saved deadline is unchanged. Try again.');return false}
        if(auth.currentUser?.uid!==actor||currentPlanDocId!==actorPlan)return false;
        if(target.reviewDeadline)return window.__kairosPlanningHub?.openAssignmentReview(target.taskId,{ownerId:actor,planId:actorPlan})??false;
        if(target.occurrenceDate)window.__kairosScheduleWorkspace?.selectOccurrence?.({seriesId:target.taskId,occurrenceId:target.taskId+'::'+target.occurrenceDate,occurrenceDate:target.occurrenceDate});
        else window.__kairosScheduleWorkspace?.selectItem?.('task',target.taskId);
        return true;
    }
    function recordTaskListCompletion(command,result){
        const candidates=command.type==='task_batch'&&command.action==='complete'?(result.completedTaskIds||[]).filter(id=>command.taskIds.includes(id)):
            command.type==='complete_task'&&command.value===true&&result.task?.completed?[result.task.id]:[];
        const ids=[...new Set(candidates)].filter(id=>typeof id==='string'&&!achievementsData.countedTaskIds.includes(id));if(!ids.length)return;
        achievementsData.countedTaskIds.push(...ids);achievementsData.lifetimeTasksCompleted+=ids.length;logTaskCompletionForStats(ids.length);checkTaskAchievements();saveAchievementsToFirestore();renderMiniAchievementsWidget();
    }
    const pageLoader = createPageLoader({scheduleEnabled:!!document.getElementById('schedule-calendar'),taskDetailsEnabled:true,setupTaskDetails:module=>{
        taskDetails=module.mountTaskDetailPane({root:document.getElementById('tasks-page'),getShortcuts:()=>userSettings.accessibility.shortcuts,getOwnerId:()=>auth.currentUser?.uid||null,getPlanId:()=>currentPlanDocId,
            getState:()=>({boards:boardsData}),getAllowCompletedReschedule:()=>settingsSync.state().cloud.planning?.rescheduleCompleted===true,getToday:()=>planningClock(Date.now(),userSettings.profile.timezone).date,resolveTarget:target=>resolveTaskDetail({boards:boardsData},target),commit:commitTaskDetails,onStartFocus:startTaskFocus,openSchedule:openTaskDetailsInSchedule});
    },setupTaskWorkspace:module=>{
        taskWorkspace=module.mountTaskListWorkspace({root:document.getElementById('tasks-page'),overview:document.getElementById('tasks-manager-container'),
            getToday:()=>planningClock(Date.now(),userSettings.profile.timezone).date,getState:()=>taskInteractions?.getDisplayState()||({boards:boardsData}),getOwnerId:()=>auth.currentUser?.uid||null,getPlanId:()=>currentPlanDocId,commit:commitTaskDetails,
            ensurePlan:async()=>{const owner=auth.currentUser?.uid;if(!owner)return false;if(!currentPlanDocId&&!await updatePlanInFirestore())return false;return auth.currentUser?.uid===owner},
            isMutationBlocked:()=>{const state=taskInteractions?.getActionState({taskId:''});return !!(state?.busy||state?.pending)},requestCloseDetails:()=>taskDetails?.requestClose()??true,renderOverview:renderBoardsGrid,onRender:()=>{taskInteractions?.decorate();taskSelection?.sync();taskMenus?.sync();taskShortcuts?.sync()}});
        renderBoardsGrid();
    },setupTaskInteractions:module=>{
        taskInteractions=module.mountTaskListInteractions({getAllowCompletedReschedule:()=>settingsSync.state().cloud.planning?.rescheduleCompleted===true,root:document.getElementById('tasks-page'),getState:()=>({boards:boardsData}),getOwnerId:()=>auth.currentUser?.uid||null,getPlanId:()=>currentPlanDocId,
            getViewKey:()=>taskWorkspace?.getViewKey(),getSelectedTaskIds:()=>taskSelection?.ids()||[],commit:commitTaskDetails,refresh:renderBoardsGrid,onConfirmed:(command,result)=>{taskWorkspace?.sectionMoved(command);recordTaskListCompletion(command,result)},sectionBlocked:()=>taskWorkspace?.hasPendingCapture()||false,requestCloseDetails:()=>taskDetails?.requestClose()??true,
            ensurePlan:async()=>{const owner=auth.currentUser?.uid,expectedPlan=currentPlanDocId||'plan-'+owner;if(!owner)return false;if(!currentPlanDocId&&!await updatePlanInFirestore())return false;return auth.currentUser?.uid===owner&&currentPlanDocId===expectedPlan?expectedPlan:false}});
    },setupTaskSelection:module=>{
        taskSelection=module.mountTaskSelection({root:document.getElementById('tasks-page'),getIdentity:()=>({ownerId:auth.currentUser?.uid||null,planId:currentPlanDocId}),getViewKey:()=>taskWorkspace?.getViewKey(),
            resolveTarget:target=>resolveTaskDetail({boards:boardsData},target),translate:tr,onChange:()=>taskMenus?.close(),
            isBlocked:()=>taskMenus?.isOpen()||taskInteractions?.isDragging()||!!document.querySelector('dialog[open]')});
    },setupTaskMenus:({actions,menu})=>{
        const root=document.getElementById('tasks-page'),getIdentity=()=>({ownerId:auth.currentUser?.uid||null,planId:currentPlanDocId});
        const registry=actions.createTaskActions({resolveTarget:target=>resolveTaskDetail({boards:boardsData},target),getIdentity,selection:taskSelection,
            getInteractionState:target=>taskInteractions.getActionState(target),runTaskAction:(id,target,source)=>taskInteractions.runTaskAction(id,target,source),runTaskBatch:(id,target,source)=>taskInteractions.runTaskBatch(id,target,source),runTaskTool:(id,target,source)=>taskInteractions.runTaskTool(id,target,source),
            openDetails:(target,source)=>openTaskDetailsFromList(target.taskId,source),openSchedule:openTaskDetailsInSchedule,
            copyText:text=>navigator.clipboard?.writeText?navigator.clipboard.writeText(text):Promise.reject(Error('Clipboard unavailable')),
            reportError:text=>taskInteractions.reportError(text),translate:tr});
        const sectionActions=actions.createTaskSectionActions({getIdentity,resolveSection:target=>taskListSection({boards:boardsData},target),getInteractionState:()=>taskInteractions.getActionState({taskId:''}),addTask:(target,source)=>taskWorkspace.addTask(target,source),selectSection:target=>taskSelection.selectSection(target),collapseSection:target=>taskWorkspace.collapseSection(target),getSectionState:target=>taskInteractions.getSectionState(target),runSectionAction:(id,target,source)=>taskInteractions.runSectionAction(id,target,source),translate:tr});
        taskMenus=menu.mountTaskActionMenu({root,actions:registry,getIdentity,getViewKey:()=>taskWorkspace?.getViewKey(),label:tr('task_menu_heading'),sectionActions,sectionLabel:tr('task_section_heading'),
            resolveSection:element=>{const block=element?.closest?.('.board-section-block,[data-focused-section]');if(!block||!root.contains(block)||block.closest('[hidden]'))return null;const section={boardId:block.dataset.boardId,sectionId:block.dataset.sectionId};try{taskListSection({boards:boardsData},section);return {element:block,section}}catch{return null}},
            getContext:(found,options)=>taskSelection.contextFor(found.taskId,options),getLabel:context=>tr(context.taskIds.length===1?'task_selection_menu_one':'task_selection_menu').replace('{n}',context.taskIds.length),
            resolveRow:element=>{const row=element?.closest?.('[data-detail-row]');return row&&root.contains(row)?{taskId:row.dataset.detailRow,row}:null},onError:text=>taskInteractions.reportError(text)});
        taskSelection.setActions(registry,taskMenus.open);
    },setupTaskShortcuts:module=>{
        taskShortcuts=module.mountTaskKeyboardShortcuts({root:document.getElementById('tasks-page'),workspace:taskWorkspace,getShortcuts:()=>userSettings.accessibility.shortcuts,
            getIdentity:()=>({ownerId:auth.currentUser?.uid||null,planId:currentPlanDocId}),getViewKey:()=>taskWorkspace.getViewKey(),
            isBusy:()=>{const state=taskInteractions.getActionState({taskId:''});return !!(state.busy||state.pending)},
            isBlocked:()=>taskMenus?.isOpen()||taskInteractions?.isDragging()});
    }});
    window.__kairosPreparePage = pageLoader.prepare;
    async function openTaskDetailsFromList(taskId,source){
        const owner=auth.currentUser?.uid,plan=currentPlanDocId;if(!owner)return false;
        await pageLoader.prepare('tasks-page');
        if(auth.currentUser?.uid!==owner||currentPlanDocId!==plan)return false;
        if(!currentPlanDocId&&!await updatePlanInFirestore())return false;
        if(auth.currentUser?.uid!==owner||(plan&&currentPlanDocId!==plan))return false;
        return taskDetails?.open({taskId},source);
    }
    document.getElementById('tasks-page')?.addEventListener('click',async event=>{
        const button=event.target.closest?.('[data-task-detail],[data-assignment-open]');if(!button)return;
        event.preventDefault();await openTaskDetailsFromList(button.dataset.taskDetail||button.dataset.assignmentOpen,button);
    });
    document.getElementById('tasks-page')?.addEventListener('keydown',event=>{
        if(!['Enter','F2'].includes(event.key)||event.target.closest('input,textarea,select,button'))return;
        const row=event.target.closest('[data-detail-row]');if(!row)return;
        event.preventDefault();void openTaskDetailsFromList(row.dataset.detailRow,row);
    });
    const pageRouter = mountPageRouter({preparePage:pageLoader.prepare,onNavigate:targetName=>{
            taskMenus?.close();
            taskInteractions?.sync();
            taskSelection?.sync();
            pageRenders.activate(targetName);
            if (targetName === 'plans-page') location.replace('plans.html');
            if (targetName === 'statistics-page' && statisticsRenderedDate !== toDateKey(new Date())) renderStatisticsPage();
            if (targetName === "settings-page") {
                enterSettingsPage();
            }
            if (targetName === "schedule-page") {
                scrollScheduleToDefault();
            }

            if (targetName === "ai-page") {
                sidebarManuallyToggledOnAI = false;
                if (sidebar && !sidebar.classList.contains("collapsed")) {
                    sidebar.classList.add("collapsed");
                    aiPageAutoCollapsed = true;
                } else {
                    aiPageAutoCollapsed = false;
                }
            } else {
                if (aiPageAutoCollapsed && !sidebarManuallyToggledOnAI && sidebar) {
                    sidebar.classList.remove("collapsed");
                }
                aiPageAutoCollapsed = false;
                sidebarManuallyToggledOnAI = false;
            }
    }});

    function updateClock() {
        const timeElement = document.getElementById("live-time");
        const dateElement = document.getElementById("live-date");
        if (timeElement && dateElement) {
            const now = new Date();
            const locale = getLocale(userSettings.accessibility.language || 'en');
            const hour12 = userSettings.accessibility.timeFormat !== '24';
            timeElement.textContent = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12 });
            dateElement.textContent = now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
    }
    updateClock();
    setInterval(updateClock, 60000);

    const guideOwner=()=>auth.currentUser?.emailVerified?auth.currentUser.uid:null;
    const guideStore=createGettingStartedStore({db,doc,runTransaction,getOwner:guideOwner,includeOg:OG_ACHIEVEMENT_AVAILABLE});
    function acceptGuideCompletion(result,owner){
        if(!result||guideOwner()!==owner)return;
        achievementsData=deepMerge(defaultAchievementsData(),result.achievements||{});
        for(const id of result.awardedIds||[]){const definition=ACHIEVEMENTS.find(item=>item.id===id);if(definition)showAchievementToast(definition)}
        renderAchievementsPage();renderMiniAchievementsWidget();
    }
    gettingStarted=mountGettingStarted({getOwner:guideOwner,getShortcuts:()=>userSettings.accessibility.shortcuts,save:(owner,action)=>guideStore.update(owner,action),onComplete:acceptGuideCompletion,navigate:(request,owner)=>openGettingStartedDestination({request,owner,getOwner:guideOwner,navigate:page=>pageRouter.navigate(page)})});
    window.addEventListener('kairos:onboarding-complete',event=>{
        if(event.detail?.ownerId===guideOwner()){
            void loadUserSettingsFromFirestore(auth.currentUser);
            if(!event.detail.guide)void guideStore.update(guideOwner(),{type:'reconcile'}).then(result=>acceptGuideCompletion(result,event.detail.ownerId)).catch(error=>console.error('Welcome achievement could not sync:',error));
        }
    });

    // --- 2 Rendering Engine ---
    const focusContainer = document.getElementById("dashboard-focus-container");
    const managerContainer = document.getElementById("tasks-manager-container");

    let assignmentSummaries=new Map();
    function createTaskHTML(task, sectionId, showDatePicker = false) {
        if(showDatePicker&&taskWorkspace)return taskWorkspace.rowHTML(task,sectionId,assignmentSummaries.get(task.id));
        return `
            <li class="task-item ${task.completed ? 'completed' : ''}" ${showDatePicker?`tabindex="0" data-detail-row="${escapeNotificationText(task.id)}"`:''}>
                <label class="custom-checkbox">
                    <input type="checkbox" data-section="${sectionId}" data-task="${task.id}" ${task.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
                <input type="text" class="task-text" data-section="${sectionId}" data-task="${task.id}" value="${escapeNotificationText(task.title)}" style="text-decoration: ${task.completed ? 'line-through' : 'none'};">
                ${task.startTime ? `<span class="task-scheduled-time">${task.startTime}${task.endTime ? '–' + task.endTime : ''}</span>` : ''}
                ${task.checklist?.length?`<span class="task-checklist-count">${task.recurrence?.enabled?'0':task.checklist.filter(item=>item.completed).length}/${task.checklist.length}</span>`:''}
                ${showDatePicker ? `<input type="date" class="task-date-input" data-section="${sectionId}" data-task="${task.id}" value="${task.date || ''}" ${task.completed&&settingsSync.state().cloud.planning?.rescheduleCompleted!==true?'disabled':''} title="Schedule this task on the calendar">` : ''}
                ${showDatePicker ? `<button type="button" class="task-delete-btn" data-section="${sectionId}" data-task="${task.id}" title="${tr('delete_task')}">✕</button>` : ''}
                ${showDatePicker ? `<button type="button" class="task-detail-open" data-task-detail="${escapeNotificationText(task.id)}" aria-label="${escapeNotificationText(tr('task_detail_open'))}">${tr('task_detail_heading')}</button>` : ''}
            </li>
        `;
    }

    function renderApp() {
        window.__kairosCalendarImports?.sync();
        taskMenus?.sync();taskShortcuts?.sync();
        taskInteractions?.sync();
        taskWorkspace?.sync();
        taskSelection?.sync();
        taskDetails?.sync();
        window.__kairosScheduleWorkspace?.invalidate();
        renderFocusMode();
        renderBoardsGrid();
        updateRoutineStats();
        updateWhatsNextWidget();
        renderCalendar();
        renderScheduleWeek();
        renderFocusTimerWidget();
        renderMiniAchievementsWidget();
        renderArchivePanel();
        renderFocusBreakdown();
        globalSearchController?.sync();taskCaptureController?.sync();
    }

    function findFirstIncompleteSection() {
        for (const board of boardsData) {
            if (board.archived) continue;
            const section = board.sections.find(s => !s.archived && s.tasks.some(task => !task.archived && !task.completed));
            if (section) return section;
        }
        return null;
    }

    function renderFocusMode() { if(pageRenders.defer('home-page',renderFocusMode))return;dashboardController?.sync(); }

    function renderSectionBlockHTML(board, section) {
        const visibleTasks = section.tasks.filter(t => !t.archived);
        let tasksHTML = visibleTasks.map(task => createTaskHTML(task, section.id, true)).join('');
        return `
            <div class="board-section-block fade-in-section" data-board-id="${board.id}" data-section-id="${section.id}">
                <div class="section-title-row">
                    <h4 class="editable-title" spellcheck="false">${escapeNotificationText(section.title)}</h4>
                    <div class="dots-menu-wrapper">
                        <button type="button" class="dots-menu-btn section-dots-btn" title="${tr('section_options')}">⋮</button>
                        <div class="dots-menu section-dots-menu">
                            <button type="button" class="section-rename-btn">${tr('rename')}</button>
                            <button type="button" class="section-delete-btn danger-option">Archive</button>
                        </div>
                    </div>
                </div>
                <ul class="task-list">${tasksHTML}</ul>
                <button type="button" class="add-task-btn" data-board-id="${board.id}" data-section-id="${section.id}">${tr('add_task')}</button>
            </div>
        `;
    }

    function renderBoardCardHTML(board) {
        const visibleSections = board.sections.filter(s => !s.archived);
        const sectionsHTML = visibleSections.map(section => renderSectionBlockHTML(board, section)).join('');
        return `
            <div class="board-card fade-in-section" data-board-id="${board.id}">
                <div class="board-card-header">
                    <h3 class="editable-title" spellcheck="false">${escapeNotificationText(board.title)}</h3>
                    <div class="dots-menu-wrapper">
                        <button type="button" class="dots-menu-btn board-dots-btn" title="${tr('board_options')}">⋮</button>
                        <div class="dots-menu board-dots-menu">
                            <button type="button" class="board-rename-btn">${tr('rename')}</button>
                            <button type="button" class="board-delete-btn danger-option">Archive</button>
                        </div>
                    </div>
                </div>
                <div class="board-sections">${sectionsHTML}</div>
                <button type="button" class="add-section-btn" data-board-id="${board.id}" style="margin-top: 12px;">${tr('add_section')}</button>
            </div>
        `;
    }

    function renderBoardsGrid() {
        if (!managerContainer) return;
        if (pageRenders.defer('tasks-page',renderBoardsGrid)) return;
        if(taskWorkspace?.isFocused()){taskWorkspace.render();return}
        assignmentSummaries=assignmentProgressIndex({boards:taskInteractions?.getDisplayState()?.boards||boardsData},planningClock(Date.now(),userSettings.profile.timezone).date);
        const visibleBoards = (taskInteractions?.getDisplayState()?.boards||boardsData).filter(b => !b.archived);
        if (!visibleBoards.length) {
            managerContainer.innerHTML = `<p class="boards-empty-state text-muted">${tr('no_boards_yet')}</p>`;
            return;
        }
        const html=visibleBoards.map(renderBoardCardHTML).join('');
        if(taskWorkspace)taskWorkspace.replaceOverview(html);else managerContainer.innerHTML=html;
        taskWorkspace?.decorateOverview();
    }

    // --- 3 Interactive State Updates ---

    function findBoard(boardId) {
        return boardsData.find(b => b.id === boardId);
    }
    function findSection(sectionId) {
        for (const board of boardsData) {
            const section = board.sections.find(s => s.id === sectionId);
            if (section) return { board, section };
        }
        return null;
    }

    document.body.addEventListener('change', (e) => {
        if(e.target.matches('[data-task-list-complete]'))return;
        if (e.target.matches("input[type='checkbox'][data-task]")) {
            const sectionId = e.target.getAttribute('data-section');
            const taskId = e.target.getAttribute('data-task');
            const isNowChecked = e.target.checked;

            const found = findSection(sectionId);
            if (!found) return;
            const section = found.section;
            const task = section.tasks.find(t => t.id === taskId);
            if (!task) return;

            task.completed = isNowChecked;
            if (isNowChecked && !achievementsData.countedTaskIds.includes(taskId)) {
                achievementsData.countedTaskIds.push(taskId);
                achievementsData.lifetimeTasksCompleted++;
                logTaskCompletionForStats();
                checkTaskAchievements();
                saveAchievementsToFirestore();
            }

            const matchingCheckboxes = document.querySelectorAll(`input[type='checkbox'][data-task='${taskId}']`);
            matchingCheckboxes.forEach(checkbox => {
                checkbox.checked = isNowChecked;
                const item = checkbox.closest('.task-item');
                if (item) {
                    if (isNowChecked) {
                        item.classList.add('completed');
                    } else {
                        item.classList.remove('completed');
                    }
                    
                    const textInput = item.querySelector('.task-text');
                    if (textInput) {
                        textInput.style.textDecoration = isNowChecked ? 'line-through' : 'none';
                    }
                }
            });

            updateRoutineStats();
            updatePlanInFirestore();
            taskWorkspace?.render();
            updateWhatsNextWidget();
            if (selectedCalendarDate) renderDayPanel();

            const isSectionFinished = section.tasks.every(t => t.completed);

            clearTimeout(checklistRenderTimeout);
            checklistRenderTimeout = setTimeout(() => {
                const focusHasEmptyState = document.querySelector('.all-done-state') !== null;
                if (isSectionFinished || focusHasEmptyState || !isNowChecked) {
                    renderFocusMode();
                }
            }, 300);

            if (isSectionFinished && isNowChecked) {
                if (window.confetti && confettiEnabled) {
                    setTimeout(() => {
                        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [getAccentColor(), '#ffffff'] });
                    }, 300);
                }
                if (userSettings.notifications.enabled && userSettings.notifications.boardCompletion) {
                    pushNotification('Routine complete! 🎉', `You finished "${section.title}".`);
                }
            }
        } else if (e.target.matches('input.task-date-input')) {
            const sectionId = e.target.getAttribute('data-section');
            const taskId = e.target.getAttribute('data-task');
            const newDate = e.target.value;

            const found = findSection(sectionId);
            const task = found ? found.section.tasks.find(t => t.id === taskId) : null;
            if (task) {
                task.date = newDate || null;
                updatePlanInFirestore();
                renderCalendar();
                if (newDate) {
                    const countForDay = getTasksForDate(newDate).length;
                    if (countForDay > 10) triggerMiscAchievement('busy_day');
                }
            }
        }
    });

    document.body.addEventListener('click', async (e) => {
        if(e.target.closest('[data-task-list-archive]'))return;

        const openMenu = document.querySelector('.dots-menu.active');
        if (openMenu && !e.target.closest('.dots-menu-wrapper')) {
            openMenu.classList.remove('active');
            openMenu.closest('.dots-menu-wrapper')?.classList.remove('active');
        }

        const dotsBtn = e.target.closest('.dots-menu-btn');
        if (dotsBtn) {
            const wrapper = dotsBtn.closest('.dots-menu-wrapper');
            const menu = wrapper.querySelector('.dots-menu');
            const wasActive = menu.classList.contains('active');
            document.querySelectorAll('.dots-menu.active').forEach(m => { m.classList.remove('active'); m.closest('.dots-menu-wrapper')?.classList.remove('active'); });
            if (!wasActive) { menu.classList.add('active'); wrapper.classList.add('active'); }
            return;
        }

        const settingsLogoutBtn = e.target.closest('#settings-logout-btn');
        if (settingsLogoutBtn) {
            signOut(auth).catch(err => console.error('Logout failed', err));
            return;
        }

        const notifDeleteBtn = e.target.closest('.notif-delete-btn');
        if (notifDeleteBtn) {
            const notifId = notifDeleteBtn.getAttribute('data-notif-id');
            void notificationCenter.remove(notifId);
            return;
        }

        const restoreBoardBtn = e.target.closest('.archive-restore-board-btn');
        if (restoreBoardBtn) {
            const board = findBoard(restoreBoardBtn.getAttribute('data-board-id'));
            if (board) await restoreArchived({kind:'board',boardId:board.id});
            return;
        }

        const deleteBoardForeverBtn = e.target.closest('.archive-delete-board-btn');
        if (deleteBoardForeverBtn) {
            if (await confirmAction('Permanently delete this board and everything in it? This cannot be undone.')) {
                const boardId = deleteBoardForeverBtn.getAttribute('data-board-id');
                boardsData = boardsData.filter(b => b.id !== boardId);
                updatePlanInFirestore();
                renderApp();
            }
            return;
        }

        const restoreSectionBtn = e.target.closest('.archive-restore-section-btn');
        if (restoreSectionBtn) {
            const found = findSection(restoreSectionBtn.getAttribute('data-section-id'));
            if (found) await restoreArchived({kind:'section',boardId:found.board.id,sectionId:found.section.id});
            return;
        }

        const deleteSectionForeverBtn = e.target.closest('.archive-delete-section-btn');
        if (deleteSectionForeverBtn) {
            if (await confirmAction('Permanently delete this section and its tasks? This cannot be undone.')) {
                const boardId = deleteSectionForeverBtn.getAttribute('data-board-id');
                const sectionId = deleteSectionForeverBtn.getAttribute('data-section-id');
                const board = findBoard(boardId);
                if (board) {
                    board.sections = board.sections.filter(s => s.id !== sectionId);
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const restoreTaskBtn = e.target.closest('.archive-restore-task-btn');
        if (restoreTaskBtn) {
            const found = findSection(restoreTaskBtn.getAttribute('data-section-id'));
            const task = found ? found.section.tasks.find(t => t.id === restoreTaskBtn.getAttribute('data-task-id')) : null;
            if (task) await restoreArchived({kind:'task',taskId:task.id,sectionId:found.section.id});
            return;
        }

        const deleteTaskForeverBtn = e.target.closest('.archive-delete-task-btn');
        if (deleteTaskForeverBtn) {
            if (await confirmAction('Permanently delete this task? This cannot be undone.')) {
                const found = findSection(deleteTaskForeverBtn.getAttribute('data-section-id'));
                if (found) {
                    found.section.tasks = found.section.tasks.filter(t => t.id !== deleteTaskForeverBtn.getAttribute('data-task-id'));
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const scheduleEventBlock = e.target.closest('.schedule-event');
        if (scheduleEventBlock) {
            openScheduleModal(scheduleEventBlock.getAttribute('data-event-id'));
            return;
        }

        const taskDeleteBtn = e.target.closest('.task-delete-btn');
        if (taskDeleteBtn) {
            const sectionId = taskDeleteBtn.getAttribute('data-section');
            const taskId = taskDeleteBtn.getAttribute('data-task');
            const found = findSection(sectionId);
            if (found) {
                const task = found.section.tasks.find(t => t.id === taskId);
                if (task) task.archived = true;
                updatePlanInFirestore();
                renderApp();
            }
            return;
        }

        const sectionDeleteBtn = e.target.closest('.section-delete-btn');
        if (sectionDeleteBtn) {
            const block = sectionDeleteBtn.closest('.board-section-block');
            const boardId = block.getAttribute('data-board-id');
            const sectionId = block.getAttribute('data-section-id');
            if (await confirmAction('Archive this section? Its tasks will stay visible on the Calendar and can be restored from the Archive.')) {
                const board = findBoard(boardId);
                if (board) {
                    const section = board.sections.find(s => s.id === sectionId);
                    if (section) section.archived = true;
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const addSectionBtn = e.target.closest('.add-section-btn');
        if (addSectionBtn) {
            const boardId = addSectionBtn.getAttribute('data-board-id');
            let board = findBoard(boardId);
            if (board) {
                const title = await requestName(tr('new_section_prompt'));
                board = findBoard(boardId);
                if (!board) return;
                if (title && title.trim()) {
                    board.sections.push({ id: 'sec-' + Date.now(), title: title.trim(), tasks: [], archived: false });
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const sectionRenameBtn = e.target.closest('.section-rename-btn');
        if (sectionRenameBtn) {
            const block = sectionRenameBtn.closest('.board-section-block');
            let found = findSection(block.getAttribute('data-section-id'));
            if (found) {
                const title = await requestName(tr('rename_section_prompt'), found.section.title);
                found = findSection(block.getAttribute('data-section-id'));
                if (!found) return;
                if (title && title.trim()) {
                    found.section.title = title.trim();
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const boardRenameBtn = e.target.closest('.board-rename-btn');
        if (boardRenameBtn) {
            const card = boardRenameBtn.closest('.board-card');
            let board = findBoard(card.getAttribute('data-board-id'));
            if (board) {
                const title = await requestName(tr('rename_board_prompt'), board.title);
                board = findBoard(card.getAttribute('data-board-id'));
                if (!board) return;
                if (title && title.trim()) {
                    board.title = title.trim();
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const boardDeleteBtn = e.target.closest('.board-delete-btn');
        if (boardDeleteBtn) {
            const card = boardDeleteBtn.closest('.board-card');
            const boardId = card.getAttribute('data-board-id');
            if (await confirmAction('Archive this board? Its tasks will stay visible on the Calendar and can be restored from the Archive.')) {
                const board = findBoard(boardId);
                if (board) {
                    board.archived = true;
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const addBoardBtn = e.target.closest('#add-board-btn');
        if (addBoardBtn) {
            const title = await requestName(tr('new_board_prompt'));
            if (title && title.trim()) {
                boardsData.push({ id: 'board-' + Date.now(), title: title.trim(), sections: [], archived: false });
                if (!currentPlanDocId) { savePlanToFirestore(boardsData); } else { updatePlanInFirestore(); }
                renderApp();
            }
            return;
        }
    });


    function updateRoutineStats() {
        let totalTasks = 0;
        let completedTasks = 0;
        boardsData.forEach(board => {
            if (board.archived) return;
            board.sections.forEach(section => {
                if (section.archived) return;
                section.tasks.forEach(task => {
                    if (task.archived) return;
                    totalTasks++;
                    if (task.completed) completedTasks++;
                });
            });
        });
        const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
        const percentageText = document.getElementById("stats-percentage");
        const fractionText = document.getElementById("stats-fraction");
        const fillBar = document.getElementById("progress-bar-fill");
        if (percentageText && fractionText && fillBar) {
            percentageText.textContent = `${percentage}%`;
            fractionText.textContent = trFmt('tasks_completed_fraction', { completed: completedTasks, total: totalTasks });
            fillBar.style.width = `${percentage}%`;
        }
    }
    // --- 4 What's Next Widget Engine ---
    function updateWhatsNextWidget() {
        const container = document.getElementById('whats-next-content');
        if (!container) return;

        let nextTask = null;
        let activeSection = null;

        outer:
        for (const board of boardsData) {
            if (board.archived) continue;
            for (const section of board.sections) {
                if (section.archived) continue;
                const incompleteTask = section.tasks.find(t => !t.archived && !t.completed);
                if (incompleteTask) {
                    nextTask = incompleteTask;
                    activeSection = section;
                    break outer;
                }
            }
        }

        if (nextTask && activeSection) {
            container.innerHTML = `
                <div class="whats-next-card">
                    <h4 class="whats-next-title">${nextTask.title}</h4>
                    <button class="complete-next-btn" data-task-id="${nextTask.id}" data-section-id="${activeSection.id}">
                        ${tr('mark_as_done')}
                    </button>
                </div>
            `;

            container.querySelector('.complete-next-btn').addEventListener('click', (e) => {
                const taskId = e.target.getAttribute('data-task-id');
                const sectionId = e.target.getAttribute('data-section-id');
                triggerTaskCompletion(sectionId, taskId); 
            });
        } else {
            container.innerHTML = `
                <div class="whats-next-empty">
                    <div class="whats-next-empty-icon">✨</div>
                    <p class="whats-next-empty-text">${tr('caught_up_short')}</p>
                </div>
            `;
        }
    }

    function triggerTaskCompletion(sectionId, taskId) {
        const found = findSection(sectionId);
        if (found) {
            const section = found.section;
            const task = section.tasks.find(t => t.id === taskId);
            if (task) {
                task.completed = true;
                if (!achievementsData.countedTaskIds.includes(taskId)) {
                    achievementsData.countedTaskIds.push(taskId);
                    achievementsData.lifetimeTasksCompleted++;
                    logTaskCompletionForStats();
                    checkTaskAchievements();
                    saveAchievementsToFirestore();
                }
                
                const matchingCheckboxes = document.querySelectorAll(`input[type='checkbox'][data-task='${taskId}']`);
                matchingCheckboxes.forEach(checkbox => {
                    checkbox.checked = true;
                    const item = checkbox.closest('.task-item');
                    if (item) {
                        item.classList.add('completed');
                        const textInput = item.querySelector('.task-text');
                        if (textInput) textInput.style.textDecoration = 'line-through';
                    }
                });
                
                updateRoutineStats();
                updatePlanInFirestore();
                updateWhatsNextWidget();
                const isSectionFinished = section.tasks.every(t => t.completed);
                if (isSectionFinished) {
                    setTimeout(() => {
                        renderFocusMode();
                        if (window.confetti && confettiEnabled) {
                            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [getAccentColor(), '#ffffff'] });
                        }
                    }, 300);
                    if (userSettings.notifications.enabled && userSettings.notifications.boardCompletion) {
                        pushNotification('Routine complete! 🎉', `You finished "${section.title}".`);
                    }
                }
            }
        }
    }

    // --- 6 Cloud Sync Data Actions ---
    let planSnapshot = null, planSaveQueue = Promise.resolve(), planEditRevision = 0, planLoadRevision = 0;

    async function savePlanToFirestore(planData, options={}) {
        boardsData = planData;
        return updatePlanInFirestore(options);
    }

    async function updatePlanInFirestore(options={}) {
        const user = auth.currentUser;
        if (!user) return false;
        planEditRevision++;
        const work = planSaveQueue.catch(() => {}).then(async () => {
            if (auth.currentUser?.uid !== user.uid) throw new Error('The signed-in account changed.');
            const planId = currentPlanDocId || 'plan-' + user.uid;
            const local = planState({ boards: boardsData, dayInsights, scheduleEvents: scheduleData, calendarSources:calendarSourcesData });
            if(!currentPlanDocId)await initializePlanner(user.uid);
            const saved = await savePlannerEdits(planId, user.uid, planSnapshot || planState({}), local, options);
            if (auth.currentUser?.uid !== user.uid) throw new Error('The signed-in account changed.');
            const live = planState({ boards: boardsData, dayInsights, scheduleEvents: scheduleData, calendarSources:calendarSourcesData });
            const rebased = mergePlanEdits(local, live, saved);
            const remoteChanges = JSON.stringify(rebased) !== JSON.stringify(live);
            boardsData = rebased.boards;
            dayInsights = rebased.dayInsights;
            scheduleData = rebased.scheduleEvents;
            calendarSourcesData = rebased.calendarSources;
            invalidateKairosContext({ownerId:user.uid,planId,before:planSnapshot,after:saved});
            planSnapshot = saved;
            currentPlanDocId = planId;
            searchPlannerOwnerId = user.uid;
            globalSearchController?.sync();taskCaptureController?.sync();
            window.__kairosScheduleWorkspace?.invalidate();
            if (remoteChanges) renderApp();
            void window.__kairosTaskReminders?.check();
            return true;
        });
        planSaveQueue = work;
        try { return await work; }
        catch (error) {
            console.error('Error syncing task progress:', error);
            showNotice('Your changes could not be synced. ' + error.message);
            return false;
        }
    }

    async function loadLatestPlanFromFirestore(user) {
        const loadRevision = ++planLoadRevision;
        await planSaveQueue.catch(() => {});
        const editRevision = planEditRevision;
        try {
            const plansColRef = collection(db, "study_plans");
            const q = query(plansColRef, where("userID", "==", user.uid));
            const querySnapshot = await getDocs(q);
            if (auth.currentUser?.uid !== user.uid || loadRevision !== planLoadRevision || editRevision !== planEditRevision) return;
            
            if (!querySnapshot.empty) {
                const plans = querySnapshot.docs.map(doc => ({
                    docId: doc.id,
                    ...doc.data()
                }));

                plans.sort((a, b) => {
                    const timeA = a.createdAt?.seconds || 0;
                    const timeB = b.createdAt?.seconds || 0;
                    return timeB - timeA;
                });
                
                const latestPlan = plans[0];
                const previousSnapshot = currentPlanDocId === latestPlan.docId ? planSnapshot : null;
                currentPlanDocId = latestPlan.docId;
                const migrated = migrateToBoards(latestPlan);
                boardsData = normalizeArchiveFields(migrated || boardsData);
                searchPlannerOwnerId = Array.isArray(migrated) ? user.uid : null;
                dayInsights = latestPlan.dayInsights || {};
                scheduleData = Array.isArray(latestPlan.scheduleEvents) ? latestPlan.scheduleEvents : [];
                calendarSourcesData = Array.isArray(latestPlan.calendarSources) ? latestPlan.calendarSources : [];
                planSnapshot = planState({ boards: boardsData, dayInsights, scheduleEvents: scheduleData, calendarSources:calendarSourcesData });
                invalidateKairosContext({ownerId:user.uid,planId:currentPlanDocId,before:previousSnapshot,after:planSnapshot});
                void window.__kairosTaskReminders?.check();

                console.log("Successfully loaded latest study plan from Firestore!");
                renderApp();
            } else {
                console.log("No saved study plans found in Firestore. Using default placeholder routines.");
                currentPlanDocId = null;
                searchPlannerOwnerId = null;
                planSnapshot = null;
                renderApp();
            }
        } catch (error) {
            console.error("Error loading plans from Firestore:", error);
            renderApp();
        } finally {
            markInitialLoadComplete();
        }
    }

    window.addEventListener('kairos-data-changed', () => {
        if (auth.currentUser) loadLatestPlanFromFirestore(auth.currentUser);
    });

    // --- 7 AI Plan Generator ---
    let pendingAiSections = null;
    let pendingAiRecurringEvents = [];
    let isGeneratingPlan = false;

    async function generatePlanFromText(assignmentText, triggerBtn) {
        if (!assignmentText || !assignmentText.trim()) {
            showNotice(tr('alert_empty_input'));
            return;
        }
        if (isGeneratingPlan) return;
        isGeneratingPlan = true;

        const originalBtnText = triggerBtn ? triggerBtn.innerText : null;
        if (triggerBtn) {
            triggerBtn.innerText = tr('generating_plan_ellipsis');
            triggerBtn.disabled = true;
            triggerBtn.style.opacity = "0.7";
        }

        const languageName = getLanguageName(userSettings.accessibility.language || 'en');
        const scheduleSummary = buildScheduleSummaryForAI();
        const userContext = buildUserContextForAI();
        const systemPrompt = `
        You are an expert AI Study Coach. The user will provide a syllabus, assignment, or goal.
        Break it down into logical, actionable study sections and tasks.
        IMPORTANT: Write all section titles and task titles in ${languageName}, since that is the user's chosen app language.
        ADDITIONALLY: if the user's text mentions any RECURRING weekly commitment (e.g. "I have football training every Tuesday 4-6pm", "I sleep from 10pm to 6am", "math class on Mondays and Wednesdays 9-10am"), extract each one as a recurring event. Only extract things that repeat weekly on a fixed day/time — do NOT extract one-off deadlines or dates, those belong in tasks instead. CRITICAL: only extract commitments that are NEW — if a commitment is already listed under "recurring weekly commitments" below, do NOT include it again in recurringEvents, even if the user's text also mentions it. If nothing new is mentioned, return an empty array for recurringEvents. CRITICAL: "day" must ALWAYS be a single integer 0-6, never a string, range, or array. If a commitment repeats on multiple days (e.g. "every weekday", "Monday and Wednesday", "weekends"), you MUST output one separate event object per day, each with its own single "day" integer — e.g. "weekdays 9:30pm-7:30am" becomes 5 separate objects with day 1, 2, 3, 4, and 5, each identical except for "day".

        CRITICAL INSTRUCTION: You MUST respond with ONLY a valid, raw JSON object.
        Do NOT include markdown formatting, backticks, or the word 'json'.
        Just the raw object, using this exact structure:
        {
          "sections": [
            {
              "id": "gen-sec-1",
              "title": "Section 1: Research",
              "tasks": [
                { "id": "gen-task-1", "title": "Find 3 academic sources", "completed": false },
                { "id": "gen-task-2", "title": "Read and highlight sources", "completed": false }
              ]
            }
          ],
          "recurringEvents": [
            { "title": "Football Training", "category": "training", "day": 2, "start": "16:00", "end": "18:00" }
          ]
        }
        "day" is 0-6 where 0=Sunday, 1=Monday, ... 6=Saturday. "category" must be one of: sleep, class, tutoring, training, other. Times are 24-hour "HH:MM".${scheduleSummary}${userContext}
        User's Request:
        ${assignmentText}
        `;

        try {
            const response = await aiFetch( {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: systemPrompt }] })
            });

            if (!response.ok) {
                const errorDetails = await response.text();
                console.error("AI Relay Rejected the Request:", errorDetails);
                throw new Error(`AI Relay Error ${response.status}. See console for details.`);
            }

            const data = await response.json();
            let aiResponseText = data.choices?.[0]?.message?.content || "";
            aiResponseText = aiResponseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
            const parsed = JSON.parse(aiResponseText);

            const newSections = Array.isArray(parsed) ? parsed : (parsed.sections || []);
            const rawRecurringEvents = Array.isArray(parsed) ? [] : (parsed.recurringEvents || []);
            const recurringEvents = rawRecurringEvents.filter(ev => !isDuplicateScheduleEvent(ev));

            const uniqueId = Date.now();
            newSections.forEach((sec, sIndex) => {
                sec.id = `ai-sec-${uniqueId}-${sIndex}`;
                sec.tasks.forEach((task, tIndex) => {
                    task.id = `ai-task-${uniqueId}-${sIndex}-${tIndex}`;
                    task.completed = false;
                    task.date = task.date || null;
                });
            });

            pendingAiSections = newSections;
            pendingAiRecurringEvents = recurringEvents;
            openAiDestinationModal();

        } catch (error) {
            console.error(error);
            showNotice(error.code === 'ai-protection' ? aiErrorMessage(error) : tr('alert_ai_generation_error'));
        } finally {
            isGeneratingPlan = false;
            if (triggerBtn) {
                triggerBtn.innerText = originalBtnText;
                triggerBtn.disabled = false;
                triggerBtn.style.opacity = "1";
            }
        }
    }

    // --- AI workspace shell ---
    // ai-workspace.js owns chat state, rendering, persistence, messaging, and chat controls.
    // app.js only keeps the page-level sidebar controls and plan integration here.
    const aiChatSidebarEl = document.getElementById('ai-chat-sidebar');
    const aiChatSidebarToggleBtn = document.getElementById('ai-chat-sidebar-toggle');
    const aiChatSidebarCloseBtn = document.getElementById('ai-chat-sidebar-close');

    function setAiChatSidebarOpen(open) {
        if (!aiChatSidebarEl) return;
        aiChatSidebarEl.classList.toggle('hidden', !open);
        document.getElementById('ai-page')?.classList.toggle('sidebar-collapsed', !open);
    }

    aiChatSidebarToggleBtn?.addEventListener('click', () => {
        const isHidden = aiChatSidebarEl?.classList.contains('hidden');
        setAiChatSidebarOpen(!!isHidden);
    });
    aiChatSidebarCloseBtn?.addEventListener('click', () => setAiChatSidebarOpen(false));

    window.addEventListener('kairos-ai-create-plan', (event) => {
        const text = event.detail?.text;
        if (text) generatePlanFromText(text, null);
    });

    // --- AI destination modal ---
    const aiDestinationModal = document.getElementById('ai-destination-modal');
    const aiDestinationNewName = document.getElementById('ai-destination-new-name');
    const aiDestinationExistingSelect = document.getElementById('ai-destination-existing-select');
    const aiDestinationConfirmBtn = document.getElementById('ai-destination-confirm-btn');
    const closeAiDestinationModalBtn = document.getElementById('close-ai-destination-modal');

    function openAiDestinationModal() {
        if (!aiDestinationModal) return;
        if (aiDestinationExistingSelect) {
            aiDestinationExistingSelect.replaceChildren(...boardsData.map(b => {
                const option = document.createElement('option');
                option.value = b.id;
                option.textContent = b.title;
                return option;
            }));
        }
        const hasExisting = boardsData.length > 0;
        const newRadio = aiDestinationModal.querySelector('input[name="ai-destination"][value="new"]');
        const existingRadio = aiDestinationModal.querySelector('input[name="ai-destination"][value="existing"]');
        if (newRadio) newRadio.checked = true;
        if (existingRadio) existingRadio.disabled = !hasExisting;
        if (aiDestinationNewName) aiDestinationNewName.value = '';
        updateAiDestinationFieldStates();

        const recurringPreview = document.getElementById('ai-destination-recurring-preview');
        const recurringList = document.getElementById('ai-destination-recurring-list');
        if (recurringPreview && recurringList) {
            if (pendingAiRecurringEvents.length) {
                recurringList.replaceChildren(...pendingAiRecurringEvents.map(ev => {
                    const item = document.createElement('li');
                    item.textContent = `${ev.title} — ${getScheduleDayLabels()[ev.day]}, ${scheduleMinutesToLabel(scheduleTimeToMinutes(ev.start))}–${scheduleMinutesToLabel(scheduleTimeToMinutes(ev.end))} (${tr('cat_' + ev.category)})`;
                    return item;
                }));
                recurringPreview.style.display = 'block';
            } else {
                recurringPreview.style.display = 'none';
            }
        }

        aiDestinationModal.classList.add('active');
    }

    function closeAiDestinationModal() {
        if (aiDestinationModal) aiDestinationModal.classList.remove('active');
        pendingAiSections = null;
        pendingAiRecurringEvents = [];
    }

    function updateAiDestinationFieldStates() {
        const mode = aiDestinationModal.querySelector('input[name="ai-destination"]:checked')?.value;
        if (aiDestinationNewName) aiDestinationNewName.style.display = mode === 'new' ? 'block' : 'none';
        if (aiDestinationExistingSelect) aiDestinationExistingSelect.style.display = mode === 'existing' ? 'block' : 'none';
    }

    if (aiDestinationModal) {
        aiDestinationModal.querySelectorAll('input[name="ai-destination"]').forEach(radio => {
            radio.addEventListener('change', updateAiDestinationFieldStates);
        });
    }
    if (closeAiDestinationModalBtn) closeAiDestinationModalBtn.addEventListener('click', closeAiDestinationModal);
    if (aiDestinationModal) {
        aiDestinationModal.addEventListener('click', (e) => {
            if (e.target === aiDestinationModal) closeAiDestinationModal();
        });    }

    if (aiDestinationConfirmBtn) {
        aiDestinationConfirmBtn.addEventListener('click', () => {
            if (!pendingAiSections) { closeAiDestinationModal(); return; }
            const mode = aiDestinationModal.querySelector('input[name="ai-destination"]:checked')?.value;

            if (mode === 'existing') {
                const boardId = aiDestinationExistingSelect.value;
                const board = findBoard(boardId);
                if (board) {
                    board.sections.push(...pendingAiSections);
                }
            } else {
                const name = (aiDestinationNewName.value || '').trim() || 'AI Plan';
                boardsData.push({ id: 'board-' + Date.now(), title: name, sections: pendingAiSections });
            }

            const addRecurringCheckbox = document.getElementById('ai-destination-add-recurring');
            if (pendingAiRecurringEvents.length && (!addRecurringCheckbox || addRecurringCheckbox.checked)) {
                const skippedTitles = [];
                pendingAiRecurringEvents.forEach((ev, i) => {
                    const rawDays = Array.isArray(ev.day) ? ev.day : [ev.day];
                    rawDays.forEach((rawDay, j) => {
                        const parsedDay = parseInt(rawDay, 10);
                        if (Number.isNaN(parsedDay) || parsedDay < 0 || parsedDay > 6) {
                            skippedTitles.push(ev.title || 'Untitled event');
                            return;
                        }
                        scheduleData.push({
                            id: `ai-sched-${Date.now()}-${i}-${j}`,
                            title: ev.title,
                            category: SCHEDULE_CATEGORIES[ev.category] ? ev.category : 'other',
                            day: parsedDay,
                            start: ev.start,
                            end: ev.end
                        });
                    });
                });
                if (skippedTitles.length) {
                    showNotice(`Couldn't confidently determine the day for: ${skippedTitles.join(', ')}. Add ${skippedTitles.length === 1 ? 'it' : 'them'} manually from the Schedule tab.`);
                }
                renderScheduleWeek();
            }

            if (!currentPlanDocId) {
                savePlanToFirestore(boardsData);
            } else {
                updatePlanInFirestore();
            }
            renderApp();

            closeAiDestinationModal();
            const targetTab = document.querySelector('[data-target="tasks-page"]');
            if (targetTab) targetTab.click();
        });
    }

    // --- 8 Modal Help HUD ---
    document.body.addEventListener("click", (e) => {
        const openBtn = e.target.closest("#open-api-modal");
        const closeBtn = e.target.closest("#close-api-modal");
        const modal = document.getElementById("api-guide-modal");

        if (openBtn) {
            e.preventDefault();
            if (modal) modal.classList.add("active");
        }
        if (closeBtn) {
            if (modal) modal.classList.remove("active");
        }
        if (e.target.classList.contains("modal-overlay")) {
            if (modal) modal.classList.remove("active");
        }
    });

    // --- 9 Inline Modification Blurs ---
    document.body.addEventListener('blur', (e) => {
        if (e.target.classList.contains('task-text')) {
            const sectionId = e.target.getAttribute('data-section');
            const taskId = e.target.getAttribute('data-task');
            const newTitle = e.target.value.trim();

            const found = findSection(sectionId);
            const task = found ? found.section.tasks.find(t => t.id === taskId) : null;

            if (task && task.title !== newTitle) {
                task.title = newTitle;

                const matchingInputs = document.querySelectorAll(`input.task-text[data-task='${taskId}']`);
                matchingInputs.forEach(input => {
                    input.value = newTitle;
                });

                updatePlanInFirestore();
                updateWhatsNextWidget();
            }
        }
    }, true);

    // --- 10 Calendar Engine ---
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const calendarPrevBtn = document.getElementById('calendar-prev-btn');
    const calendarNextBtn = document.getElementById('calendar-next-btn');

    const dayDetailOverlay = document.getElementById('day-detail-overlay');
    document.getElementById('day-detail-open-schedule')?.addEventListener('click',async()=>{
        const date=selectedCalendarDate;if(!date)return;
        if(await window.__kairosScheduleWorkspace?.setView('day')){closeDayPanel();window.__kairosScheduleWorkspace.focusDateTime(date);}
    });
    const dayDetailCloseBtn = document.getElementById('day-detail-close-btn');
    const dayDetailDateTitle = document.getElementById('day-detail-date-title');
    const dayDetailTotal = document.getElementById('day-detail-total');
    const dayDetailCompleted = document.getElementById('day-detail-completed');
    const dayDetailTaskList = document.getElementById('day-detail-task-list');
    const dayDetailAiContent = document.getElementById('day-detail-ai-content');
    const dayDetailAiBtn = document.getElementById('day-detail-ai-btn');

    function toDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getTasksForDate(dateKey) {
        return monthTaskEntries(boardsData,dateKey,dateKey);
    }

    function syncCalendarDate(dateKey){
        const date=calendarDate(dateKey);if(!date)return;
        calendarFocusDate=dateKey;calendarViewDate=new Date(date.getFullYear(),date.getMonth(),1,12);
        if(selectedCalendarDate&&selectedCalendarDate!==dateKey)closeDayPanel();
    }

    function renderCalendar() {
        if (!calendarGrid || !calendarMonthYear) return;
        if (pageRenders.defer('schedule-page',renderCalendar)) return;
        const year=calendarViewDate.getFullYear(),month=calendarViewDate.getMonth(),locale=getLocale(userSettings.accessibility.language||'en');
        calendarMonthYear.textContent=new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(calendarViewDate);
        const start=toDateKey(new Date(year,month,1,12)),end=toDateKey(new Date(year,month+1,0,12)),focus=calendarFocusDate.slice(0,7)===start.slice(0,7)?calendarFocusDate:start;
        calendarGrid.innerHTML=calendarMonthMarkup(focus,[...monthTaskEntries(boardsData,start,end),...monthEventEntries(scheduleData,start,end)],{locale,today:toDateKey(new Date()),hour12:userSettings.accessibility.timeFormat!=='24'});
    }

    calendarPrevBtn?.addEventListener('click',()=>void window.__kairosScheduleWorkspace?.setDate(shiftCalendarMonth(calendarFocusDate,-1)));
    calendarNextBtn?.addEventListener('click',()=>void window.__kairosScheduleWorkspace?.setDate(shiftCalendarMonth(calendarFocusDate,1)));
    document.getElementById('calendar-today-btn')?.addEventListener('click',()=>void window.__kairosScheduleWorkspace?.goToday());
    async function openCalendarTask(button){
        const actor=auth.currentUser?.uid,plan=currentPlanDocId;
        const opened=await window.__kairosScheduleWorkspace?.openTaskAt({taskId:button.dataset.calendarTask,...(button.dataset.calendarOccurrence?{occurrenceDate:button.dataset.calendarOccurrence}:{})});
        if(opened&&auth.currentUser?.uid===actor&&currentPlanDocId===plan)closeDayPanel();
    }
    async function openCalendarEvent(button){
        const actor=auth.currentUser?.uid,plan=currentPlanDocId,workspace=window.__kairosScheduleWorkspace;
        if(!await workspace?.setView('day')||auth.currentUser?.uid!==actor||currentPlanDocId!==plan)return;
        if(!await workspace.setDate(button.dataset.calendarDate)||auth.currentUser?.uid!==actor||currentPlanDocId!==plan)return;
        await workspace.selectItem('event',button.dataset.calendarEvent);if(auth.currentUser?.uid===actor&&currentPlanDocId===plan)closeDayPanel();
    }
    calendarGrid?.addEventListener('click',async event=>{
        const fixed=event.target.closest('[data-calendar-event]');if(fixed){await openCalendarEvent(fixed);return;}
        const task=event.target.closest('[data-calendar-task]');if(task){await openCalendarTask(task);return;}
        const cell=event.target.closest('.calendar-day:not(.outside-month)');if(!cell)return;
        const date=cell.dataset.date,actor=auth.currentUser?.uid,plan=currentPlanDocId;
        if(await window.__kairosScheduleWorkspace?.setDate(date)&&auth.currentUser?.uid===actor&&currentPlanDocId===plan)openDayPanel(date);
    });
    dayDetailTaskList?.addEventListener('click',event=>{const fixed=event.target.closest('[data-calendar-event]');if(fixed){void openCalendarEvent(fixed);return;}const task=event.target.closest('[data-calendar-task]');if(task)void openCalendarTask(task)});

    function openDayPanel(dateKey) {
        syncCalendarDate(dateKey);
        selectedCalendarDate = dateKey;
        renderDayPanel();
        if (dayDetailOverlay) dayDetailOverlay.classList.add('active');
    }

    function closeDayPanel() {
        selectedCalendarDate = null;
        if (dayDetailOverlay) dayDetailOverlay.classList.remove('active');
    }

    function renderDayPanel() {
        if (!selectedCalendarDate || !dayDetailOverlay) return;

        const [y, m, d] = selectedCalendarDate.split('-').map(Number);
        const displayDate = new Date(y, m - 1, d);
        if (dayDetailDateTitle) {
            dayDetailDateTitle.textContent = displayDate.toLocaleDateString(getLocale(userSettings.accessibility.language || 'en'), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }

        const tasksForDay = getTasksForDate(selectedCalendarDate);
        const calendarEventsForDay=monthEventEntries(scheduleData,selectedCalendarDate,selectedCalendarDate);
        const completedCount = tasksForDay.filter(t => t.completed).length;
        if(dayDetailTotal)dayDetailTotal.textContent=trFmt('day_detail_tasks',{n:tasksForDay.length});
        if(dayDetailCompleted)dayDetailCompleted.textContent=trFmt('day_detail_finished',{n:completedCount});

        if (dayDetailTaskList) {
            dayDetailTaskList.innerHTML = tasksForDay.length
                ? tasksForDay.map(task => task.occurrenceDate?calendarTaskMarkup(task,{hour12:userSettings.accessibility.timeFormat!=='24',detail:true}):createTaskHTML(task, task.sectionId)).join('')
                : `<p class="text-muted">${tr('no_tasks_for_day')}</p>`;
            dayDetailTaskList.innerHTML+=calendarEventsForDay.map(event=>calendarEventMarkup(event,{hour12:userSettings.accessibility.timeFormat!=='24',detail:true})).join('');
        }

        const cachedInsight = dayInsights[selectedCalendarDate];
        if (dayDetailAiContent) {
            if (cachedInsight) {
                renderDayInsightText(cachedInsight);
            } else {
                dayDetailAiContent.innerHTML = `<p class="text-muted">${tr('no_insight_yet')}</p>`;
                generateDayInsight(selectedCalendarDate);
            }
        }
    }

    function renderDayInsightText(text) {
        // Model output and saved insights are untrusted plain text.
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        dayDetailAiContent.replaceChildren(paragraph);
    }

    if (dayDetailCloseBtn) dayDetailCloseBtn.addEventListener('click', closeDayPanel);
    if (dayDetailOverlay) {
        dayDetailOverlay.addEventListener('click', (e) => {
            if (e.target === dayDetailOverlay) closeDayPanel();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && selectedCalendarDate) closeDayPanel();
    });

    async function generateDayInsight(dateKey) {
        const tasksForDay = getTasksForDate(dateKey);
        if (tasksForDay.length === 0) {
            if (selectedCalendarDate === dateKey && dayDetailAiContent) {
                dayDetailAiContent.innerHTML = `<p class="text-muted">${tr('no_tasks_nothing_to_comment')}</p>`;
            }
            return;
        }

        if (selectedCalendarDate === dateKey && dayDetailAiContent) {
            dayDetailAiContent.innerHTML = `<p class="text-muted">${tr('generating_insight')}</p>`;
        }
        if (dayDetailAiBtn) dayDetailAiBtn.disabled = true;

        const languageName = getLanguageName(userSettings.accessibility.language || 'en');
        const taskSummary = tasksForDay.map(t => `- ${t.title} [${t.completed ? 'done' : 'pending'}]`).join('\n');
        const scheduleSummary = buildScheduleSummaryForAI();
        const userContext = buildUserContextForAI();
        const prompt = `You are a supportive productivity coach. Here is a user's task list for ${dateKey}:\n${taskSummary}${scheduleSummary}${userContext}\n\nWrite a short, encouraging 1-2 sentence comment about their day in ${languageName}, since that is the user's chosen app language. Be specific about what they've completed or still need to do, and gently flag if their workload looks like it's cutting into sleep or rest time. Do not use markdown formatting.`;

        try {
            const response = await aiFetch( {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: prompt }] })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("AI relay insight error:", errText);
                throw new Error(`AI Relay Error ${response.status}`);
            }

            const data = await response.json();
            const commentText = (data.choices?.[0]?.message?.content || "").trim();

            dayInsights[dateKey] = commentText;
            if (selectedCalendarDate === dateKey && dayDetailAiContent) {
                renderDayInsightText(commentText);
            }
            await updatePlanInFirestore();

        } catch (error) {
            console.error(error);
            if (selectedCalendarDate === dateKey && dayDetailAiContent) {
                dayDetailAiContent.textContent = error.code === 'ai-protection' ? aiErrorMessage(error) : tr('insight_error');
            }
        } finally {
            if (dayDetailAiBtn) dayDetailAiBtn.disabled = false;
        }
    }

    if (dayDetailAiBtn) {
        dayDetailAiBtn.addEventListener('click', () => {
            if (selectedCalendarDate) generateDayInsight(selectedCalendarDate);
        });
    }

    //  11 Settings  

    function getAccentColor() {
        return getComputedStyle(document.body).getPropertyValue('--accent-glow').trim() || '#a855f7';
    }


    function applyAllSettings() {
        const s = userSettings;
        s.accessibility.shortcuts=normaliseShortcuts(s.accessibility.shortcuts);
        const searchBinding=describeShortcut('search',s.accessibility.shortcuts);
        for(const trigger of document.querySelectorAll('[data-global-search-open]')){
            trigger.title='Search planner ('+searchBinding+')';
            trigger.setAttribute('aria-keyshortcuts',searchBinding.replace('Mod','Control')+' '+searchBinding.replace('Mod','Meta'));
            const hint=trigger.querySelector('kbd');if(hint)hint.textContent=searchBinding;
        }
        [...document.body.classList].forEach(cls => {
            if (cls.startsWith('theme-') || cls.startsWith('textcolor-') || cls.startsWith('font-') || cls.startsWith('density-') || cls.startsWith('cursor-')) {
                document.body.classList.remove(cls);
            }
        });
        document.body.classList.toggle('mode-light', s.appearance.mode === 'light');
        document.body.classList.add(`theme-${s.appearance.theme}`);
        document.body.classList.add(`textcolor-${s.appearance.textColor || 'default'}`);
        document.body.classList.add(`font-${s.appearance.font}`);
        document.body.classList.add(`density-${s.accessibility.density}`);
        document.body.classList.add(`cursor-${s.appearance.cursor}`);
        document.body.classList.toggle('reduce-motion', !!s.accessibility.reduceMotion);

        applyBackground(s.appearance.background, s.appearance.customBackground);
        applyAmbientSound(s.appearance.ambientSound, s.appearance.ambientVolume, s.appearance.customAmbientYoutubeUrl);
        applyTranslations(s.accessibility.language || 'en');

        confettiEnabled = s.appearance.confetti;
        updateClock();

        if (appReady) {
            taskShortcuts?.sync();
            renderApp();
            refreshDynamicUI();
        }
    }

    function applyBackground(bgId, customDataUrl) {
        const layer = document.getElementById('app-bg-layer');
        if (!layer) return;
        layer.innerHTML = '';
        layer.style.backgroundImage = '';
        document.body.classList.toggle('has-custom-bg', !!bgId && bgId !== 'none');

        if (!bgId || bgId === 'none') return;

        if (bgId === 'custom') {
            if (customDataUrl) layer.style.backgroundImage = `url(${customDataUrl})`;
            return;
        }

        const bg = BACKGROUNDS.find(b => b.id === bgId);
        if (!bg) return;

        if (bg.type === 'image') {
            layer.style.backgroundImage = `url(${bg.file})`;
        } else if (bg.type === 'video') {
            const vid = document.createElement('video');
            vid.src = bg.file;
            vid.autoplay = true;
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            vid.className = 'app-bg-video';
            layer.appendChild(vid);
        }
    }

    // --- YouTube ambient player (for custom lofi/study stream links) ---

    function extractYouTubeVideoId(input) {
        if (!input) return null;
        const trimmed = input.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
        const patterns = [
            /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
            /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
            /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
        ];
        for (const re of patterns) {
            const match = trimmed.match(re);
            if (match) return match[1];
        }
        return null;
    }

    function loadYouTubeIframeAPI() {
        if (ytApiReadyPromise) return ytApiReadyPromise;
        ytApiReadyPromise = new Promise((resolve) => {
            if (window.YT && window.YT.Player) { resolve(); return; }
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
            window.onYouTubeIframeAPIReady = () => resolve();
        });
        return ytApiReadyPromise;
    }

    async function ensureYouTubePlayer() {
        await loadYouTubeIframeAPI();
        if (ytPlayer) return ytPlayer;
        return new Promise((resolve) => {
            ytPlayer = new YT.Player('youtube-ambient-player', {
                height: '1', width: '1',
                playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
                events: { onReady: () => resolve(ytPlayer) }
            });
        });
    }

    async function playCustomYoutubeAmbient(videoId, volume) {
        if (!videoId) return;
        try {
            const player = await ensureYouTubePlayer();
            const start = () => {
                player.loadVideoById(videoId);
                player.setVolume(Math.min(100, Math.max(0, volume ?? 35)));
                player.playVideo();
            };
            start();
            
            setTimeout(() => {
                if (player.getPlayerState && player.getPlayerState() !== 1) {
                    const resume = () => { start(); document.removeEventListener('click', resume); };
                    document.addEventListener('click', resume, { once: true });
                }
            }, 800);
        } catch (e) {
            console.error('YouTube ambient player error:', e);
        }
    }

    function stopCustomYoutubeAmbient() {
        if (ytPlayer && ytPlayer.pauseVideo) {
            try { ytPlayer.pauseVideo(); } catch (e) {}
        }
    }

    function applyAmbientSound(soundId, volume, customYoutubeUrl) {
        const audio = document.getElementById('ambient-audio');
        if (!audio) return;
        audio.loop = true;

        if (soundId === 'custom') {
            audio.pause();
            audio.removeAttribute('src');
            audio.removeAttribute('data-current');
            const videoId = extractYouTubeVideoId(customYoutubeUrl);
            if (videoId) playCustomYoutubeAmbient(videoId, volume);
            return;
        }
        stopCustomYoutubeAmbient();

        if (!soundId || soundId === 'none') {
            audio.pause();
            audio.removeAttribute('src');
            audio.removeAttribute('data-current');
            return;
        }

        const sound = AMBIENT_SOUNDS.find(a => a.id === soundId);
        if (!sound || !sound.file) return;

        if (audio.getAttribute('data-current') !== soundId) {
            audio.src = sound.file;
            audio.setAttribute('data-current', soundId);
        }

        audio.volume = Math.min(1, Math.max(0, (volume ?? 35) / 100));
        audio.play().catch(() => {
            const resume = () => { audio.play().catch(() => {}); document.removeEventListener('click', resume); };
            document.addEventListener('click', resume, { once: true });
        });
    }

    function loadUserSettingsFromFirestore(user) { return settingsSync.load(user.uid); }

    function renderUserProfileMenu(user) {
        const authContainer = document.getElementById('user-auth-container');
        if (!authContainer) return;

        const userName = userSettings.profile.displayName || user.displayName || 'User';
        const userPhoto = userSettings.profile.avatarURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=a855f7&color=fff`;

        authContainer.innerHTML = `
            <div class="notif-wrapper" id="notif-wrapper">
                <button class="icon-btn notif-bell-btn" id="notif-bell-btn" title="Notifications" aria-label="Notifications">
                    <span data-shell-icon="bell"></span><span class="notif-badge" id="notif-badge" style="display:none;">0</span>
                </button>
                <div class="notif-panel" id="notif-panel">
                    <div class="notif-panel-header">${tr('notifications_group_title')}</div>
                    <div class="notif-panel-list" id="notif-panel-list"></div>
                </div>
            </div>
            <div class="user-profile-wrapper" id="profile-dropdown-toggle">
                <div class="user-profile" style="display: flex; align-items: center; gap: 8px;">
                    <img src="${userPhoto}" style="width:32px; height: 32px; border-radius:50%; object-fit: cover;">
                    <span>${userName}</span>
                    <span style="font-size: 0.7em; opacity: 0.7;">▼</span>
                </div>
                <div id="profile-dropdown-menu" class="profile-dropdown-menu">
                    <button id="dropdown-settings-btn"><span data-shell-icon="settings-page"></span> ${tr('nav_settings')}</button>
                    <button id="dropdown-logout-btn">${tr('log_out')}</button>
                </div>
            </div>
        `;

        const toggleWrapper = document.getElementById("profile-dropdown-toggle");
        const dropdownMenu = document.getElementById("profile-dropdown-menu");
        mountSidebarIcons(document);
        const settingsBtn = document.getElementById("dropdown-settings-btn");
        const logoutBtn = document.getElementById("dropdown-logout-btn");

        toggleWrapper.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle("active");
        });

        document.addEventListener("click", (e) => {
            if (!toggleWrapper.contains(e.target)) {
                dropdownMenu.classList.remove("active");
            }
        });

        settingsBtn.addEventListener("click", () => {
            dropdownMenu.classList.remove("active");
            const settingsNavItem = document.querySelector('.nav-item[data-target="settings-page"]');
            if (settingsNavItem) settingsNavItem.click();
        });

        logoutBtn.addEventListener("click", async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Logout Failed", error);
            }
        });

        setupNotificationBell();
    }

    function enterSettingsPage() {
        pendingSettings = cloneDeep(settingsSync.state().pending?.ownerId===auth.currentUser?.uid?settingsSync.state().pending.settings:userSettings);
        populateSettingsForm();
        document.dispatchEvent(new Event('kairos-controls-refresh'));
        updateSaveBarVisibility(false);
    }

    function setActiveTile(containerId, value) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.option-tile').forEach(el => {
            el.classList.toggle('active', el.dataset.value === String(value));
        });
    }

    function setActiveSwatch(containerId, value) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.swatch').forEach(el => {
            el.classList.toggle('active', el.dataset.value === String(value));
        });
    }

    function updateYoutubeRowVisibility() {
        const row = document.getElementById('youtube-ambient-row');
        if (row) row.style.display = pendingSettings.appearance.ambientSound === 'custom' ? 'block' : 'none';
    }

    function populateTimezoneSelect() {
        const select = document.getElementById('settings-timezone');
        if (!select) return;
        if (!select.dataset.populated) {
            let zones = [];
            try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) {
                zones = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Berlin','Europe/Paris','Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Australia/Sydney','Australia/Brisbane','Pacific/Auckland'];
            }
            select.innerHTML = zones.map(z => `<option value="${z}">${z.replace(/_/g, ' ')}</option>`).join('');
            select.dataset.populated = 'true';
        }
        select.value = pendingSettings.profile.timezone;
    }

    let weeklyAvailabilityEditor=null,planningPreferencesEditor=null,shortcutSettingsEditor=null;
    function populateSettingsForm() {
        shortcutSettingsEditor ||= mountShortcutSettings({root:document.getElementById('shortcut-settings-editor'),getValue:()=>pendingSettings.accessibility.shortcuts,onChange:value=>{pendingSettings.accessibility.shortcuts=value;checkDirty()}});
        shortcutSettingsEditor.refresh();
        planningPreferencesEditor ||= mountPlanningPreferencesEditor({root:document.getElementById('planning-preferences-editor'),getValue:()=>pendingSettings.planning||{},onChange:value=>{pendingSettings.planning={...(pendingSettings.planning||{}),...value};checkDirty()}});
        planningPreferencesEditor?.refresh();
        weeklyAvailabilityEditor ||= mountWeeklyAvailabilityEditor({root:document.getElementById('weekly-availability-editor'),getValue:()=>pendingSettings.planning?.weeklyAvailability??null,onChange:value=>{pendingSettings.planning={...(pendingSettings.planning||{}),weeklyAvailability:value};checkDirty()}});
        weeklyAvailabilityEditor?.refresh();
        const completedToggle=document.getElementById('settings-reschedule-completed');if(completedToggle)completedToggle.checked=pendingSettings.planning?.rescheduleCompleted===true;
        const user = auth.currentUser;

        const emailEl = document.getElementById('settings-current-email');
        if (emailEl) emailEl.textContent = user ? user.email : '—';

        const signinMethodEl = document.getElementById('settings-signin-method');
        if (signinMethodEl && user) {
            const providerId = user.providerData[0]?.providerId || 'password';
            const labels = { 'password': 'Email & Password', 'google.com': 'Google', 'github.com': 'GitHub', 'microsoft.com': 'Microsoft' };
            signinMethodEl.textContent = labels[providerId] || providerId;
        }

        const lastSigninEl = document.getElementById('security-last-signin');
        if (lastSigninEl && user?.metadata?.lastSignInTime) {
            const locale = getLocale(userSettings.accessibility.language || 'en');
            lastSigninEl.textContent = `${tr('last_signin')}: ${new Date(user.metadata.lastSignInTime).toLocaleString(locale)}`;
        }

        const displayNameEl = document.getElementById('settings-display-name');
        if (displayNameEl) displayNameEl.value = pendingSettings.profile.displayName || '';

        const birthdayEl = document.getElementById('settings-birthday');
        if (birthdayEl) birthdayEl.value = pendingSettings.profile.birthday || '';

        const avatarPreview = document.getElementById('settings-avatar-preview');
        if (avatarPreview) {
            avatarPreview.src = pendingSettings.profile.avatarURL || user?.photoURL || `https://ui-avatars.com/api/?name=User&background=a855f7&color=fff`;
        }
        const avatarUrlEl = document.getElementById('settings-avatar-url');
        if (avatarUrlEl) {
            avatarUrlEl.value = (pendingSettings.profile.avatarURL && !pendingSettings.profile.avatarURL.startsWith('data:')) ? pendingSettings.profile.avatarURL : '';
        }

        populateTimezoneSelect();

        setActiveTile('density-options', pendingSettings.accessibility.density);
        setActiveTile('time-format-options', pendingSettings.accessibility.timeFormat);
        setActiveTile('language-options', pendingSettings.accessibility.language || 'en');
        const reduceMotionEl = document.getElementById('settings-reduce-motion');
        if (reduceMotionEl) reduceMotionEl.checked = !!pendingSettings.accessibility.reduceMotion;

        setActiveTile('mode-options', pendingSettings.appearance.mode);
        setActiveSwatch('theme-options', pendingSettings.appearance.theme);
        setActiveSwatch('text-color-options', pendingSettings.appearance.textColor || 'default');
        setActiveTile('font-options', pendingSettings.appearance.font);
        setActiveSwatch('background-options', pendingSettings.appearance.background);
        setActiveSwatch('cursor-options', pendingSettings.appearance.cursor);
        setActiveTile('ambient-options', pendingSettings.appearance.ambientSound);

        const confettiEl = document.getElementById('settings-confetti-toggle');
        if (confettiEl) confettiEl.checked = !!pendingSettings.appearance.confetti;

        const notifEnabledEl = document.getElementById('settings-notif-enabled');
        if (notifEnabledEl) notifEnabledEl.checked = !!pendingSettings.notifications.enabled;

        const notifBoardCompletionEl = document.getElementById('settings-notif-board-completion');
        if (notifBoardCompletionEl) notifBoardCompletionEl.checked = !!pendingSettings.notifications.boardCompletion;

        const notifBedtimeEl = document.getElementById('settings-notif-bedtime');
        if (notifBedtimeEl) notifBedtimeEl.checked = !!pendingSettings.notifications.bedtimeReminders;

        const notifBrowserPushEl = document.getElementById('settings-notif-browser-push');
        if (notifBrowserPushEl) notifBrowserPushEl.checked = !!pendingSettings.notifications.browserPush;
        updateBrowserPushHint();

        const volumeEl = document.getElementById('ambient-volume');
        if (volumeEl) volumeEl.value = pendingSettings.appearance.ambientVolume ?? 35;

        const youtubeUrlEl = document.getElementById('settings-ambient-youtube-url');
        if (youtubeUrlEl) youtubeUrlEl.value = pendingSettings.appearance.customAmbientYoutubeUrl || '';
        updateYoutubeRowVisibility();
    }

    function previewLive() {
        [...document.body.classList].forEach(cls => {
            if (cls.startsWith('theme-') || cls.startsWith('textcolor-') || cls.startsWith('font-') || cls.startsWith('cursor-')) {
                document.body.classList.remove(cls);
            }
        });
        document.body.classList.add(`theme-${pendingSettings.appearance.theme}`);
        document.body.classList.add(`textcolor-${pendingSettings.appearance.textColor || 'default'}`);
        document.body.classList.add(`font-${pendingSettings.appearance.font}`);
        document.body.classList.add(`cursor-${pendingSettings.appearance.cursor}`);
        document.body.classList.toggle('mode-light', pendingSettings.appearance.mode === 'light');
    }

    function checkDirty() {
        settingsSync.dirty();
    }

    function updateSaveBarVisibility(forceState) {
        const bar=document.getElementById('settings-save-bar');if(!bar)return;
        const owner=auth.currentUser?.uid,pending=settingsSync.state().pending?.ownerId===owner?settingsSync.state().pending:null,saving=settingsSync.state().saving?.ownerId===owner;
        const dirty=!!pending||(forceState!==undefined?forceState:JSON.stringify(pendingSettings)!==JSON.stringify(userSettings));
        bar.classList.toggle('active',dirty||saving);
        const status=bar.querySelector('span');if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent=saving?'Saving changes…':pending?(pending.persisted?'Saved on this device. Cloud sync pending.':'Not synced or stored locally. Keep this tab open and retry.'):tr('unsaved_changes');if(pending||saving)status.removeAttribute('data-i18n');else status.dataset.i18n='unsaved_changes';}
        const save=document.getElementById('settings-save-btn'),cancel=document.getElementById('settings-cancel-btn');
        if(save){save.disabled=!!saving||!settingsSync.state().ready;save.textContent=saving?tr('saving_ellipsis'):pending?'Retry save':tr('save_changes');if(pending||saving)save.removeAttribute('data-i18n');else save.dataset.i18n='save_changes';}
        if(cancel){cancel.disabled=!!saving;cancel.textContent=pending?'Discard local changes':tr('cancel');if(pending)cancel.removeAttribute('data-i18n');else cancel.dataset.i18n='cancel';}
    }

    function renderConfigOptions() {
        const themeContainer = document.getElementById('theme-options');
        if (themeContainer) {
            themeContainer.innerHTML = THEMES.map(t => `
                <button class="swatch" data-value="${t.id}" title="${tr(t.nameKey)}">
                    <span class="swatch-color" style="background:${t.swatch}"></span>
                    <span class="swatch-label">${tr(t.nameKey)}</span>
                </button>
            `).join('');
            themeContainer.querySelectorAll('.swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.appearance.theme = btn.dataset.value;
                    setActiveSwatch('theme-options', btn.dataset.value);
                    previewLive();
                    checkDirty();
                });
            });
        }

        const textColorContainer = document.getElementById('text-color-options');
        if (textColorContainer) {
            textColorContainer.innerHTML = TEXT_COLORS.map(c => {
                const swatchBg = c.hex || 'var(--text-primary)';
                const label = tr(c.nameKey);
                return `
                    <button class="swatch" data-value="${c.id}" title="${label}">
                        <span class="swatch-color" style="background:${swatchBg}; border: 1px solid var(--border-subtle);"></span>
                        <span class="swatch-label">${label}</span>
                    </button>
                `;
            }).join('');
            textColorContainer.querySelectorAll('.swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.appearance.textColor = btn.dataset.value;
                    setActiveSwatch('text-color-options', btn.dataset.value);
                    previewLive();
                    checkDirty();
                });
            });
        }

        const fontContainer = document.getElementById('font-options');
        if (fontContainer) {
            fontContainer.innerHTML = FONT_PACKS.map(f => `<button class="option-tile font-preview-${f.id}" data-value="${f.id}">${f.name}</button>`).join('');
            fontContainer.querySelectorAll('.option-tile').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.appearance.font = btn.dataset.value;
                    setActiveTile('font-options', btn.dataset.value);
                    previewLive();
                    checkDirty();
                });
            });
        }

        const cursorContainer = document.getElementById('cursor-options');
        if (cursorContainer) {
            cursorContainer.innerHTML = CURSORS.map(c => `<button class="swatch cursor-swatch" data-value="${c.id}"><span class="swatch-label">${tr(c.nameKey)}</span></button>`).join('');            cursorContainer.querySelectorAll('.swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.appearance.cursor = btn.dataset.value;
                    setActiveSwatch('cursor-options', btn.dataset.value);
                    previewLive();
                    checkDirty();
                });
            });
        }

        const bgContainer = document.getElementById('background-options');
        if (bgContainer) {
            bgContainer.innerHTML = BACKGROUNDS.map(b => {
                if (b.type === 'custom') {
                    return `<button class="swatch bg-swatch bg-swatch-custom" data-value="custom"><span class="swatch-color" style="background:var(--bg-main);">📤</span><span class="swatch-label">${tr(b.nameKey)}</span></button>`;
                }
                const preview = b.type === 'none' ? 'none' : `url(${b.file})`;
                return `<button class="swatch bg-swatch" data-value="${b.id}" title="${tr(b.nameKey)}">
                    <span class="swatch-color" style="background-image:${preview}; background-color: var(--bg-main);">${b.type === 'video' ? '▶' : ''}</span>
                    <span class="swatch-label">${tr(b.nameKey)}</span>
                </button>`;
            }).join('');
            bgContainer.querySelectorAll('.swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.appearance.background = btn.dataset.value;
                    setActiveSwatch('background-options', btn.dataset.value);
                    if (btn.dataset.value !== 'custom') {
                        pendingSettings.appearance.customBackground = null;
                        applyBackground(btn.dataset.value, null);
                    } else if (pendingSettings.appearance.customBackground) {
                        applyBackground('custom', pendingSettings.appearance.customBackground);
                    }
                    checkDirty();
                });
            });
        }

        const ambientContainer = document.getElementById('ambient-options');
        if (ambientContainer) {
            ambientContainer.innerHTML = AMBIENT_SOUNDS.map(a => `<button class="option-tile" data-value="${a.id}">${tr(a.nameKey)}</button>`).join('');
            ambientContainer.querySelectorAll('.option-tile').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.dataset.value === 'lofi') triggerMiscAchievement('lofi');
                    pendingSettings.appearance.ambientSound = btn.dataset.value;
                    setActiveTile('ambient-options', btn.dataset.value);
                    updateYoutubeRowVisibility();
                    applyAmbientSound(btn.dataset.value, pendingSettings.appearance.ambientVolume, pendingSettings.appearance.customAmbientYoutubeUrl); // live preview
                    checkDirty();
                });
            });
        }

        const languageContainer = document.getElementById('language-options');
        if (languageContainer) {
            languageContainer.innerHTML = LANGUAGES.map(l => `<button class="option-tile" data-value="${l.id}">${l.flag} ${l.name}</button>`).join('');
            languageContainer.querySelectorAll('.option-tile').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.accessibility.language = btn.dataset.value;
                    setActiveTile('language-options', btn.dataset.value);
                    applyTranslations(btn.dataset.value);
                    checkDirty();
                });
            });
        }
    }

    // Static option-tile groups
    document.querySelectorAll('#density-options .option-tile').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingSettings.accessibility.density = btn.dataset.value;
            setActiveTile('density-options', btn.dataset.value);
            [...document.body.classList].forEach(cls => { if (cls.startsWith('density-')) document.body.classList.remove(cls); });
            document.body.classList.add(`density-${btn.dataset.value}`);
            checkDirty();
        });
    });

    document.querySelectorAll('#time-format-options .option-tile').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingSettings.accessibility.timeFormat = btn.dataset.value;
            setActiveTile('time-format-options', btn.dataset.value);
            checkDirty();
        });
    });

    document.querySelectorAll('#mode-options .option-tile').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingSettings.appearance.mode = btn.dataset.value;
            setActiveTile('mode-options', btn.dataset.value);
            previewLive();
            checkDirty();
        });
    });

    const reduceMotionInput = document.getElementById('settings-reduce-motion');
    if (reduceMotionInput) {
        reduceMotionInput.addEventListener('change', (e) => {
            pendingSettings.accessibility.reduceMotion = e.target.checked;
            checkDirty();
        });
    }

    const confettiToggleInput = document.getElementById('settings-confetti-toggle');
    if (confettiToggleInput) {
        confettiToggleInput.addEventListener('change', (e) => {
            pendingSettings.appearance.confetti = e.target.checked;
            checkDirty();
        });
    }

    const ambientVolumeInput = document.getElementById('ambient-volume');
    if (ambientVolumeInput) {
        ambientVolumeInput.addEventListener('input', (e) => {
            pendingSettings.appearance.ambientVolume = parseInt(e.target.value, 10);
            const audio = document.getElementById('ambient-audio');
            if (audio) audio.volume = pendingSettings.appearance.ambientVolume / 100;
            if (pendingSettings.appearance.ambientSound === 'custom' && ytPlayer && ytPlayer.setVolume) {
                try { ytPlayer.setVolume(pendingSettings.appearance.ambientVolume); } catch (err) {}
            }
            checkDirty();
        });
    }

    let youtubeUrlPreviewTimeout;
    const ambientYoutubeUrlInput = document.getElementById('settings-ambient-youtube-url');
    if (ambientYoutubeUrlInput) {
        ambientYoutubeUrlInput.addEventListener('input', (e) => {
            pendingSettings.appearance.customAmbientYoutubeUrl = e.target.value;
            const isValid = !e.target.value.trim() || extractYouTubeVideoId(e.target.value);
            ambientYoutubeUrlInput.style.borderColor = isValid ? '' : '#ef4444';
            checkDirty();

            clearTimeout(youtubeUrlPreviewTimeout);
            youtubeUrlPreviewTimeout = setTimeout(() => {
                if (pendingSettings.appearance.ambientSound === 'custom') {
                    applyAmbientSound('custom', pendingSettings.appearance.ambientVolume, e.target.value);
                }
            }, 700);
        });
    }

    // Profile text inputs
    ['settings-display-name', 'settings-birthday', 'settings-timezone', 'settings-avatar-url'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const syncProfileField = () => {
            if (id === 'settings-display-name') pendingSettings.profile.displayName = el.value;
            if (id === 'settings-birthday') pendingSettings.profile.birthday = el.value;
            if (id === 'settings-timezone') pendingSettings.profile.timezone = el.value;
            if (id === 'settings-avatar-url') {
                pendingSettings.profile.avatarURL = el.value.trim();
                const preview = document.getElementById('settings-avatar-preview');
                if (preview && el.value.trim()) preview.src = el.value.trim();
            }
            checkDirty();
        };
        el.addEventListener('input', syncProfileField);
        el.addEventListener('change', syncProfileField);
    });

    const avatarFileInput = document.getElementById('settings-avatar-file');
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 700 * 1024) {
                showNotice(tr("alert_avatar_too_large"));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                pendingSettings.profile.avatarURL = reader.result;
                document.getElementById('settings-avatar-preview').src = reader.result;
                document.getElementById('settings-avatar-url').value = '';
                checkDirty();
            };
            reader.readAsDataURL(file);
        });
    }

    // Remove avatar
    const avatarRemoveBtn = document.getElementById('settings-avatar-remove-btn');
    if (avatarRemoveBtn) {
        avatarRemoveBtn.addEventListener('click', () => {
            pendingSettings.profile.avatarURL = '';

            const user = auth.currentUser;
            const fallbackName = pendingSettings.profile.displayName || user?.displayName || 'User';
            const preview = document.getElementById('settings-avatar-preview');
            if (preview) preview.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=a855f7&color=fff`;

            const avatarUrlInput = document.getElementById('settings-avatar-url');
            if (avatarUrlInput) avatarUrlInput.value = '';

            if (avatarFileInput) avatarFileInput.value = '';

            checkDirty();
        });
    }

    const bgUploadInput = document.getElementById('settings-bg-upload');
    if (bgUploadInput) {
        bgUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 1.2 * 1024 * 1024) {
                showNotice(tr("alert_bg_too_large"));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                pendingSettings.appearance.customBackground = reader.result;
                pendingSettings.appearance.background = 'custom';
                setActiveSwatch('background-options', 'custom');
                applyBackground('custom', reader.result);
                checkDirty();
            };
            reader.readAsDataURL(file);        });
    }

    // Remove custom background
    const bgRemoveBtn = document.getElementById('settings-bg-remove-btn');
    if (bgRemoveBtn) {
        bgRemoveBtn.addEventListener('click', () => {
            pendingSettings.appearance.customBackground = null;
            pendingSettings.appearance.background = 'none';
            setActiveSwatch('background-options', 'none');
            applyBackground('none', null);
            if (bgUploadInput) bgUploadInput.value = '';
            checkDirty();
        });
    }

    // Save / Cancel bar
    const settingsSaveBtn = document.getElementById('settings-save-btn');
    if(settingsSaveBtn)settingsSaveBtn.addEventListener('click',()=>settingsSync.save());

    const settingsCancelBtn = document.getElementById('settings-cancel-btn');
    if(settingsCancelBtn)settingsCancelBtn.addEventListener('click',()=>{
        if(!settingsSync.cancel())return;
        populateSettingsForm();document.dispatchEvent(new Event('kairos-controls-refresh'));updateSaveBarVisibility(false);
    });

    document.getElementById('settings-reschedule-completed')?.addEventListener('change',event=>{pendingSettings.planning={...(pendingSettings.planning||{}),rescheduleCompleted:event.target.checked};checkDirty()});
    async function openPlanningSettings(){
        const actor=auth.currentUser?.uid,plan=currentPlanDocId;if(!actor)return false;
        if(!await (window.__kairosScheduleWorkspace?.inspectorSession?.requestLeave?.()??true))return false;
        if(auth.currentUser?.uid!==actor||currentPlanDocId!==plan)return false;
        await pageRouter.navigate('settings-page');
        if(auth.currentUser?.uid!==actor||currentPlanDocId!==plan)return false;
        document.querySelector('[data-settings-tab="planning"]')?.click();document.querySelector('#settings-planning h2')?.focus();return true;
    }
    // Settings tab switching
    const settingsTabs = document.querySelectorAll('.settings-tab');
    const settingsPanels = document.querySelectorAll('.settings-panel');
    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            settingsTabs.forEach(t => t.classList.remove('active'));
            settingsPanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById(`settings-${tab.dataset.settingsTab}`);
            if (panel) panel.classList.add('active');
            if(tab.dataset.settingsTab==='personal')void planUsage.refresh();
        });
    });

    // Security: change email
    const changeEmailBtn = document.getElementById('security-change-email-btn');
    if (changeEmailBtn) {
        changeEmailBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            const isPasswordAccount = user.providerData.some(p => p.providerId === 'password');
            if (!isPasswordAccount) {
                showNotice("Email changes aren't available for accounts signed in via Google, GitHub, or Microsoft.");
                return;
            }
            const newEmail = document.getElementById('security-new-email').value.trim();
            const currentPw = document.getElementById('security-email-current-pw').value;
            if (!newEmail || !currentPw) { showNotice('Please fill in both fields.'); return; }

            try {
                const cred = EmailAuthProvider.credential(user.email, currentPw);
                await reauthenticateWithCredential(user, cred);
                await updateEmail(user, newEmail);
                document.getElementById('settings-current-email').textContent = newEmail;
                document.getElementById('security-new-email').value = '';
                document.getElementById('security-email-current-pw').value = '';
                showNotice('Email updated successfully!');
            } catch (error) {
                showNotice('Failed to update email: ' + error.message);
            }
        });
    }

    // Security: change password
    const changePwBtn = document.getElementById('security-change-pw-btn');
    if (changePwBtn) {
        changePwBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            const isPasswordAccount = user.providerData.some(p => p.providerId === 'password');
            if (!isPasswordAccount) {
                showNotice("Password changes aren't available for accounts signed in via Google, GitHub, or Microsoft.");
                return;
            }
            const currentPw = document.getElementById('security-current-pw').value;
            const newPw = document.getElementById('security-new-pw').value;
            const confirmPw = document.getElementById('security-new-pw-confirm').value;

            if (!currentPw || !newPw || !confirmPw) { showNotice('Please fill in all password fields.'); return; }
            if (newPw !== confirmPw) { showNotice('New passwords do not match.'); return; }
            if (newPw.length < 6) { showNotice('New password must be at least 6 characters.'); return; }

            try {
                const cred = EmailAuthProvider.credential(user.email, currentPw);
                await reauthenticateWithCredential(user, cred);
                await updatePassword(user, newPw);
                document.getElementById('security-current-pw').value = '';
                document.getElementById('security-new-pw').value = '';
                document.getElementById('security-new-pw-confirm').value = '';
                showNotice('Password updated successfully!');
            } catch (error) {
                showNotice('Failed to update password: ' + error.message);
            }
        });
    }

    // Export the currently loaded planner, including recoverable archived items.
    document.getElementById('privacy-export-btn')?.addEventListener('click',()=>{
        const identity=globalSearchIdentity();
        try{
            downloadPlannerBackup(createPlannerBackup({...identity,plan:{boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData},settings:userSettings,achievements:achievementsData,focusData}));
            showNotice('Backup download started. Archived items are included; restore deleted work from Archive.');
        }catch(error){showNotice('Could not export your data. '+error.message);}
    });

    // Privacy: delete account
    const deleteBtn = document.getElementById('privacy-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) return;
            openDeleteAccountModal(user);
        });
    }

    function openDeleteAccountModal(user) {
        const overlay = document.getElementById('delete-account-modal');
        if (!overlay) return;

        const cancelBtn = document.getElementById('delete-account-cancel-btn');
        const closeBtn = document.getElementById('delete-account-modal-close');
        const confirmBtn = document.getElementById('delete-account-confirm-btn');
        const deleteInput = document.getElementById('delete-account-input');
        const reauthSection = document.getElementById('delete-account-reauth');
        const passwordInput = document.getElementById('delete-account-password');
        const googleNote = document.getElementById('delete-account-google-note');
        const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
        const hasGoogleProvider = user.providerData.some(p => p.providerId === 'google.com');

        overlay.classList.add('active');
        if (reauthSection) reauthSection.hidden = !hasPasswordProvider;
        if (googleNote) googleNote.hidden = !hasGoogleProvider || hasPasswordProvider;
        if (passwordInput) passwordInput.value = '';
        document.body.classList.add('modal-open');
        if (deleteInput) {
            deleteInput.value = '';
            deleteInput.focus();
        }
        if (confirmBtn) confirmBtn.disabled = true;

        const closeModal = () => {
            overlay.classList.remove('active');
            document.body.classList.remove('modal-open');
            if (deleteInput) deleteInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Delete my account';
            }
        };

        const handleOverlayClick = (event) => {
            if (event.target === overlay) closeModal();
        };

        const handleInput = () => {
            if (!confirmBtn || !deleteInput) return;
            const passwordReady = !hasPasswordProvider || Boolean(passwordInput?.value);
            confirmBtn.disabled = deleteInput.value !== 'DELETE' || !passwordReady;
        };

        const handlePasswordInput = () => handleInput();

        cancelBtn?.addEventListener('click', closeModal, { once: true });
        closeBtn?.addEventListener('click', closeModal, { once: true });
        overlay.addEventListener('click', handleOverlayClick);
        deleteInput?.addEventListener('input', handleInput);
        passwordInput?.addEventListener('input', handlePasswordInput);

        const handleConfirm = async () => {
            if (!confirmBtn || confirmBtn.disabled) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Deleting...';

            try {
                // Re-authenticate before touching any user data. Firebase requires
                // a recent sign-in for account deletion, and doing this first prevents
                // a stale session from leaving the account partially deleted.
                if (hasPasswordProvider) {
                    const currentPassword = passwordInput?.value || '';
                    if (!currentPassword) throw new Error('Please enter your current password.');
                    const credential = EmailAuthProvider.credential(user.email, currentPassword);
                    await reauthenticateWithCredential(user, credential);
                } else if (hasGoogleProvider) {
                    await reauthenticateWithPopup(user, new GoogleAuthProvider());
                } else {
                    throw new Error('Please sign out and sign back in with your account provider before deleting your account.');
                }

                const billingDeletion = await requestBilling('delete-account', {});
                if (billingDeletion.safeToDelete !== true) throw new Error('Subscription cancellation could not be confirmed. Please retry.');
                const plansColRef = collection(db, 'study_plans');
                const q = query(plansColRef, where('userID', '==', user.uid));
                const snap = await getDocs(q);
                await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'study_plans', d.id))));
                await deleteDoc(doc(db, 'users', user.uid));

                try { sessionStorage.setItem(accountDeletionPendingKey, '1'); } catch (e) {}
                await deleteUser(user);

                settingsSync.clear(user.uid);
                localStorage.removeItem('kairos_settings_cache');
                localStorage.removeItem('kairos_settings_cache_uid');
                localStorage.removeItem('kairos_bedtime_fired');
                overlay.classList.remove('active');
                document.body.classList.remove('modal-open');
                showAccountDeletedScreen();
            } catch (error) {
                console.error(error);
                try { sessionStorage.removeItem(accountDeletionPendingKey); } catch (e) {}
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Delete my account';
                showNotice('Could not delete your account: ' + error.message + '\n\nFor security, Firebase may require a recent sign-in before allowing account deletion. Try logging out, logging back in, then retrying.');
            }
        };

        confirmBtn?.addEventListener('click', handleConfirm);
    }

    function showAccountDeletedScreen() {
        const screen = document.getElementById('account-deleted-screen');
        if (!screen) {
            try { sessionStorage.removeItem(accountDeletionPendingKey); } catch (e) {}
            window.location.href = 'login.html';
            return;
        }

        screen.classList.add('active');
        screen.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        const loginBtn = document.getElementById('account-deleted-login-btn');
        loginBtn?.addEventListener('click', () => {
            try { sessionStorage.removeItem(accountDeletionPendingKey); } catch (e) {}
            window.location.href = 'login.html';
        }, { once: true });

        window.setTimeout(() => {
            try { sessionStorage.removeItem(accountDeletionPendingKey); } catch (e) {}
            window.location.href = 'login.html';
        }, 8000);
    }

    // --- 12 Notifications Engine (Firestore-synced) ---

    function setupNotificationsSync(user) { notificationCenter.setup(user.uid); }
    function pushNotification(title,message) { notificationCenter.push(title,message); }
    function renderNotifPanel() { notificationCenter.render(); }
    function setupNotificationBell() { notificationCenter.bindBell(); }

    // Notification settings toggles
    const notifEnabledInput = document.getElementById('settings-notif-enabled');
    if (notifEnabledInput) {
        notifEnabledInput.addEventListener('change', (e) => {
            pendingSettings.notifications.enabled = e.target.checked;
            checkDirty();
        });
    }
    const notifBoardCompletionInput = document.getElementById('settings-notif-board-completion');
    if (notifBoardCompletionInput) {
        notifBoardCompletionInput.addEventListener('change', (e) => {
            pendingSettings.notifications.boardCompletion = e.target.checked;
            checkDirty();
        });
    }
    const notifBedtimeInput = document.getElementById('settings-notif-bedtime');
    if (notifBedtimeInput) {
        notifBedtimeInput.addEventListener('change', (e) => {
            pendingSettings.notifications.bedtimeReminders = e.target.checked;
            checkDirty();
        });
    }
    const notifBrowserPushInput = document.getElementById('settings-notif-browser-push');
    if (notifBrowserPushInput) {
        notifBrowserPushInput.addEventListener('change', async (e) => {
            if (e.target.checked) {
                const granted = await requestBrowserPushPermission();
                if (!granted) {
                    e.target.checked = false;
                    pendingSettings.notifications.browserPush = false;
                    updateBrowserPushHint();
                    checkDirty();
                    return;
                }
            }
            pendingSettings.notifications.browserPush = e.target.checked;
            updateBrowserPushHint();
            checkDirty();
        });
    }

    // --- 13 Schedule Engine (recurring weekly events) ---

    const SCHEDULE_CATEGORIES = {
        sleep:     { label: 'Sleep',     color: '#6366f1' },
        class:     { label: 'Class',     color: '#a855f7' },
        tutoring:  { label: 'Tutoring',  color: '#14b8a6' },
        training:  { label: 'Training',  color: '#f97316' },
        other:     { label: 'Other',     color: '#64748b' }
    };
    const SCHEDULE_HOUR_HEIGHT = 48; // px per hour on the grid
    function getScheduleDayLabels() {
        const locale = getLocale(userSettings.accessibility.language || 'en');
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        return [0, 1, 2, 3, 4, 5, 6].map(i => formatter.format(new Date(2023, 0, 1 + i))); // Jan 1 2023 was a Sunday
    }

    function scheduleTimeToMinutes(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h * 60) + (m || 0);
    }

    function scheduleMinutesToLabel(mins) {
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12; if (h12 === 0) h12 = 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }

    function buildScheduleSummaryForAI() {
        if (!scheduleData.length) return '';

        const byDay = getScheduleDayLabels().map((label, dayIndex) => {
            const events = scheduleData
                .filter(ev => ev.day === dayIndex)
                .map(ev => {
                    const cat = SCHEDULE_CATEGORIES[ev.category] || SCHEDULE_CATEGORIES.other;
                    return `${ev.title} (${cat.label}, ${scheduleMinutesToLabel(scheduleTimeToMinutes(ev.start))}–${scheduleMinutesToLabel(scheduleTimeToMinutes(ev.end))})`;
                });
            return events.length ? `${label}: ${events.join('; ')}` : null;
        }).filter(Boolean);

        const dated=scheduleData.filter(event=>event.date&&!event.archived&&!event.transparent).map(event=>`${event.date}: ${event.title} (${event.allDay?'all day':event.start+'–'+event.end})`).slice(0,120);
        const imported=dated.length?'\n\nImported calendar commitments on these dates (read-only, busy):\n'+dated.join('\n'):'';
        if (!byDay.length) return imported;
        return `\n\nThe user has these recurring weekly commitments — do NOT schedule study tasks during these times, and take sleep hours into account when suggesting a healthy pace:\n${byDay.join('\n')}`+imported;
    }

    function isDuplicateScheduleEvent(ev) {
        return scheduleData.some(existing =>
            existing.day === ev.day &&
            existing.start === ev.start &&            existing.end === ev.end &&
            String(existing.title).trim().toLowerCase() === String(ev.title).trim().toLowerCase()
        );
    }

    function calculateAge(birthdateStr) {
        if (!birthdateStr) return null;
        const birthDate = new Date(birthdateStr);
        if (isNaN(birthDate.getTime())) return null;

        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const hasHadBirthdayThisYear =
            today.getMonth() > birthDate.getMonth() ||
            (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
        if (!hasHadBirthdayThisYear) age--;

        return age >= 0 && age < 130 ? age : null; // sanity guard against typo'd dates
    }

    function buildUserContextForAI() {
        const age = calculateAge(userSettings.profile.birthday);
        if (age === null) return '';
        return `\n\nThe user is ${age} years old — tailor pacing, workload, and any health/rest suggestions appropriately for their age group.`;
    }

    function renderScheduleEventBlock(ev, col = 0, colCount = 1) {
        const startMin = scheduleTimeToMinutes(ev.start);
        const endMinRaw = scheduleTimeToMinutes(ev.end);
        const wraps = endMinRaw <= startMin;
        const endMin = wraps ? 24 * 60 : endMinRaw;
        const top = (startMin / 60) * SCHEDULE_HOUR_HEIGHT;
        const height = Math.max(20, ((endMin - startMin) / 60) * SCHEDULE_HOUR_HEIGHT);
        const cat = SCHEDULE_CATEGORIES[ev.category] || SCHEDULE_CATEGORIES.other;
        const gapPct = 1.5;
        const widthPct = (100 / colCount) - gapPct;
        const leftPct = (100 / colCount) * col + (gapPct / 2);
        return `
            <div class="schedule-event" style="top:${top}px; height:${height}px; left:${leftPct}%; width:${widthPct}%; --event-color:${cat.color};" data-event-id="${ev.id}" title="${ev.title}">
                <span class="schedule-event-title">${ev.title}</span>
                <span class="schedule-event-time">${scheduleMinutesToLabel(startMin)} – ${scheduleMinutesToLabel(endMinRaw)}</span>
            </div>
        `;
    }

    function renderScheduleOverflowBlock(ev, col = 0, colCount = 1) {
        const endMin = scheduleTimeToMinutes(ev.end);
        if (endMin <= 0) return '';
        const height = Math.max(16, (endMin / 60) * SCHEDULE_HOUR_HEIGHT);
        const cat = SCHEDULE_CATEGORIES[ev.category] || SCHEDULE_CATEGORIES.other;
        const gapPct = 1.5;
        const widthPct = (100 / colCount) - gapPct;
        const leftPct = (100 / colCount) * col + (gapPct / 2);
        return `
            <div class="schedule-event schedule-event-overflow" style="top:0px; height:${height}px; left:${leftPct}%; width:${widthPct}%; --event-color:${cat.color};" data-event-id="${ev.id}" title="${ev.title} (continued from previous night)">
                <span class="schedule-event-title">${ev.title} ⤴</span>
            </div>
        `;
    }

    function layoutScheduleEventsForDay(primaryEvents, overflowEvents) {
        const items = [
            ...primaryEvents.map(ev => {
                const startMin = scheduleTimeToMinutes(ev.start);
                let endMin = scheduleTimeToMinutes(ev.end);
                if (endMin <= startMin) endMin = 24 * 60;
                return { ev, startMin, endMin, isOverflow: false };
            }),
            ...overflowEvents.map(ev => ({
                ev, startMin: 0, endMin: scheduleTimeToMinutes(ev.end), isOverflow: true
            }))
        ].sort((a, b) => a.startMin - b.startMin);

        const columnEnds = [];
        items.forEach(item => {
            let placed = false;
            for (let c = 0; c < columnEnds.length; c++) {
                if (columnEnds[c] <= item.startMin) {
                    columnEnds[c] = item.endMin;
                    item.col = c;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                item.col = columnEnds.length;
                columnEnds.push(item.endMin);
            }
        });

        const colCount = Math.max(1, columnEnds.length);
        return items.map(item => ({ ...item, colCount }));
    }

    // Schedule 2.0: one source of truth — existing boardsData and scheduleData.
    let scheduleViewMode = 'week';
    let scheduleAnchor = new Date();
    const scheduleEscape = value => { const node=document.createElement('span'); node.textContent=String(value??''); return node.innerHTML; };
    const scheduleDate = offset => {const d=new Date(scheduleAnchor.getFullYear(),scheduleAnchor.getMonth(),scheduleAnchor.getDate());d.setDate(d.getDate()-d.getDay()+offset);return d;};
    const scheduleTask = id => {for(const board of boardsData)for(const section of board.sections)for(const task of section.tasks)if(String(task.id)===String(id))return task;return null;};
    const scheduleEntries = date => {
        const key=toDateKey(date),day=date.getDay();
        const tasks=getTasksForDate(key).map(t=>({...t,kind:'task',start:t.startTime||'',end:t.endTime||''}));
        const clock=minutes=>String(Math.floor(minutes/60)%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
        const events=eventSegmentsForDate(scheduleData,key).map(({event,startMin,endMin,continued})=>({...event,kind:continued?'overflow':'event',start:clock(startMin),end:clock(endMin)}));
        return [...events,...tasks];
    };
    function scheduleMoveTask(id,date,start){
        const task=scheduleTask(id);if(!task)return;
        const previousStart=task.startTime,previousEnd=task.endTime;
        const oldDuration=previousStart&&previousEnd?Math.max(30,(scheduleTimeToMinutes(previousEnd)-scheduleTimeToMinutes(previousStart)+1440)%1440):60;
        task.date=toDateKey(date);task.startTime=start;
        const minutes=scheduleTimeToMinutes(start);
        task.endTime=String(Math.floor((minutes+oldDuration)/60)%24).padStart(2,'0')+':'+String((minutes+oldDuration)%60).padStart(2,'0');
        updatePlanInFirestore();renderScheduleWeek();renderCalendar();
    }
    function scheduleCard(item,date,compact=false){
        const start=item.start||'',end=item.end||'';
        const timed=/^\\d{2}:\\d{2}$/.test(start);
        const top=timed?Math.max(0,scheduleTimeToMinutes(start)/60*SCHEDULE_HOUR_HEIGHT):0;
        const duration=timed&&/^\\d{2}:\\d{2}$/.test(end)?(scheduleTimeToMinutes(end)-scheduleTimeToMinutes(start)+1440)%1440:60;
        const height=Math.max(26,Math.min(1440-scheduleTimeToMinutes(start||'00:00'),duration||60)/60*SCHEDULE_HOUR_HEIGHT);
        const isTask=item.kind==='task';
        const category=SCHEDULE_CATEGORIES[item.category]||SCHEDULE_CATEGORIES.other;
        const color=isTask?'var(--accent-glow,#7c84ff)':category.color;
        const attrs=isTask?'data-task-id="'+scheduleEscape(item.id)+'" draggable="true"':'data-event-id="'+scheduleEscape(item.id)+'"';
        return '<div class="schedule-v2-block '+(isTask?'schedule-v2-task':'')+'" '+attrs+' style="top:'+top+'px;height:'+height+'px;--event-color:'+color+'" title="'+scheduleEscape(item.title)+'"><strong>'+scheduleEscape(item.title)+'</strong><small>'+scheduleEscape(start)+(end?' – '+scheduleEscape(end):'')+'</small></div>';
    }
    function renderScheduleToday(){
        const panel=document.getElementById('schedule-today-container');if(!panel)return;
        const date=new Date(scheduleAnchor),key=toDateKey(date),entries=scheduleEntries(date);
        const tasks=getTasksForDate(key),completed=tasks.filter(t=>t.completed).length;
        const ordered=entries.sort((a,b)=>scheduleTimeToMinutes(a.start||'23:59')-scheduleTimeToMinutes(b.start||'23:59'));
        panel.innerHTML='<div class="schedule-v2-today-hero"><div><span class="schedule-eyebrow">YOUR DAY</span><h3>'+date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})+'</h3><p>Focus on what matters today.</p></div><div class="schedule-v2-progress"><strong>'+completed+' / '+tasks.length+'</strong><span>tasks completed</span></div></div>'+
          '<div class="schedule-v2-today-columns"><section class="schedule-v2-agenda"><h3>Timeline</h3>'+
          (ordered.length?ordered.map(item=>'<div class="schedule-v2-agenda-row"><time>'+scheduleEscape(item.start||'Anytime')+'</time><div class="schedule-v2-agenda-card '+(item.kind==='task'?'is-task':'')+'" '+(item.kind==='task'?'data-task-id="'+scheduleEscape(item.id)+'"':'data-event-id="'+scheduleEscape(item.id)+'"')+'><strong>'+scheduleEscape(item.title)+'</strong><span>'+(item.kind==='task'?(item.completed?'Completed':'Task'):'Repeats weekly')+(item.end?' · '+scheduleEscape(item.end):'')+'</span></div></div>').join(''):'<p class="schedule-empty-agenda">A clear day. Drag a task into the week view or add a recurring commitment.</p>')+
          '</section><aside class="schedule-v2-focus"><h3>Tasks for today</h3>'+(tasks.length?tasks.map(t=>'<div class="schedule-v2-focus-task"><span class="'+(t.completed?'done':'')+'">'+scheduleEscape(t.title)+'</span><small>'+scheduleEscape(t.startTime||'Unscheduled')+'</small></div>').join(''):'<p>No tasks dated today.</p>')+'</aside></div>';
        panel.querySelectorAll('[data-event-id]').forEach(el=>el.addEventListener('click',()=>openScheduleModal(el.dataset.eventId)));
    }
    function renderScheduleView(){
        const today=document.getElementById('schedule-today-container'),week=document.getElementById('schedule-week-container');
        if(!today||!week)return;
        today.hidden=scheduleViewMode!=='today';week.hidden=scheduleViewMode!=='week';
        document.querySelectorAll('[data-schedule-view]').forEach(b=>{const active=b.dataset.scheduleView===scheduleViewMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
        if(scheduleViewMode==='today')renderScheduleToday();
    }
    document.querySelectorAll('[data-schedule-view]').forEach(b=>b.addEventListener('click',()=>{scheduleViewMode=b.dataset.scheduleView;renderScheduleView()}));
    function renderScheduleWeek(){
        const container=document.getElementById('schedule-week-container');if(!container)return;
        const start=scheduleDate(0),end=scheduleDate(6),todayKey=toDateKey(new Date());
        const hours=Array.from({length:24},(_,h)=>'<div class="schedule-hour-row" style="height:'+SCHEDULE_HOUR_HEIGHT+'px"><span class="schedule-hour-label">'+scheduleMinutesToLabel(h*60)+'</span></div>').join('');
        const days=Array.from({length:7},(_,index)=>{
            const date=scheduleDate(index),key=toDateKey(date);
            const entries=scheduleEntries(date);
            const timed=entries.filter(item=>/^\\d{2}:\\d{2}$/.test(item.start||''));
            const untimed=entries.filter(item=>!/^\\d{2}:\\d{2}$/.test(item.start||''));
            return '<div class="schedule-day-col"><div class="schedule-day-header '+(key===todayKey?'is-today':'')+'"><span>'+date.toLocaleDateString(undefined,{weekday:'short'})+'</span><strong>'+date.getDate()+'</strong></div>'+
            '<div class="schedule-v2-all-day">'+untimed.map(item=>'<div class="schedule-v2-undated" draggable="'+(item.kind==='task')+'" '+(item.kind==='task'?'data-task-id="'+scheduleEscape(item.id)+'"':'data-event-id="'+scheduleEscape(item.id)+'"')+'>'+scheduleEscape(item.title)+'</div>').join('')+'</div>'+
            '<div class="schedule-day-body" data-schedule-date="'+key+'" style="height:'+(24*SCHEDULE_HOUR_HEIGHT)+'px">'+timed.map(item=>scheduleCard(item,date)).join('')+'</div></div>';
        }).join('');
        const backlog=[];
        boardsData.forEach(board=>board.sections.forEach(section=>section.tasks.forEach(t=>{if(!t.completed&&!t.archived&&!t.date)backlog.push(t)})));
        container.innerHTML='<div class="schedule-v2-toolbar"><div class="schedule-v2-date-nav"><button type="button" data-week-nav="-7" aria-label="Previous week">‹</button><button type="button" data-week-nav="0">Today</button><button type="button" data-week-nav="7" aria-label="Next week">›</button><strong>'+start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+end.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+'</strong></div><span class="schedule-v2-help">Drag tasks into the calendar · Click events to edit</span></div>'+
          '<div class="schedule-v2-layout"><div class="schedule-v2-main"><div class="schedule-week-grid"><div class="schedule-time-col"><div class="schedule-day-header"></div><div class="schedule-v2-all-day"></div><div class="schedule-time-rows">'+hours+'</div></div>'+days+'</div></div>'+
          '<aside class="schedule-v2-sidebar"><div class="schedule-v2-sidebar-heading"><h3>Unscheduled tasks</h3><span>'+backlog.length+'</span></div><p>Drag a task onto a time slot to plan it.</p>'+
          (backlog.length?backlog.slice(0,40).map(t=>'<div class="schedule-v2-backlog" draggable="true" data-task-id="'+scheduleEscape(t.id)+'"><span class="schedule-v2-drag-icon">⠿</span><span>'+scheduleEscape(t.title)+'</span></div>').join(''):'<div class="schedule-v2-sidebar-empty">All caught up. No unscheduled tasks.</div>')+'</aside></div>';
        container.querySelectorAll('.schedule-v2-block[data-event-id],.schedule-v2-undated[data-event-id]').forEach(el=>el.addEventListener('click',()=>openScheduleModal(el.dataset.eventId)));
        container.querySelectorAll('[data-week-nav]').forEach(b=>b.addEventListener('click',()=>{const n=Number(b.dataset.weekNav);scheduleAnchor=n===0?new Date():new Date(scheduleAnchor.getFullYear(),scheduleAnchor.getMonth(),scheduleAnchor.getDate()+n);renderScheduleWeek();renderScheduleToday()}));
        container.querySelectorAll('[draggable="true"][data-task-id]').forEach(el=>el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.taskId);e.dataTransfer.effectAllowed='move'}));
        container.querySelectorAll('[data-schedule-date]').forEach(col=>{
            col.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';col.classList.add('drag-over')});
            col.addEventListener('dragleave',()=>col.classList.remove('drag-over'));
            col.addEventListener('drop',e=>{e.preventDefault();col.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(!id)return;const rect=col.getBoundingClientRect();const minutes=Math.max(0,Math.min(23*60+30,Math.round(((e.clientY-rect.top)/SCHEDULE_HOUR_HEIGHT*60)/30)*30));const start=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');scheduleMoveTask(id,new Date(col.dataset.scheduleDate+'T12:00:00'),start)});
        });
        renderScheduleView();
    }

    function scrollScheduleToDefault() {
        const grid = document.querySelector('#schedule-week-container .schedule-week-grid');
        if (grid && !grid.dataset.scrolled) {
            grid.scrollTop = 6 * SCHEDULE_HOUR_HEIGHT;
            grid.dataset.scrolled = 'true';
        }
    }

    function saveScheduleToFirestore() {
        if (!currentPlanDocId) {
            savePlanToFirestore(boardsData);
        } else {
            updatePlanInFirestore();
        }
    }

    // --- Schedule event modal ---
    const scheduleModal = document.getElementById('schedule-event-modal');
    const scheduleModalTitle = document.getElementById('schedule-event-modal-title');
    const scheduleTitleInput = document.getElementById('schedule-event-title');
    const scheduleCategoryInput = document.getElementById('schedule-event-category');
    const scheduleDayInput = document.getElementById('schedule-event-day');
    const scheduleStartInput = document.getElementById('schedule-event-start');
    const scheduleEndInput = document.getElementById('schedule-event-end');
    const scheduleSaveBtn = document.getElementById('schedule-event-save-btn');
    const scheduleDeleteBtn = document.getElementById('schedule-event-delete-btn');
    const closeScheduleModalBtn = document.getElementById('close-schedule-event-modal');
    const addScheduleEventBtn = document.getElementById('add-schedule-event-btn');

    function openScheduleModal(eventId = null) {
        const imported=eventId&&scheduleData.find(event=>event.id===eventId);
        if(imported?.readOnly||imported?.calendarSourceId){showNotice('This event comes from an imported calendar. Refresh or remove its source in Calendars.');return;}
        editingScheduleEventId = eventId;
        if (eventId) {
            const ev = scheduleData.find(e => e.id === eventId);
            if (!ev) return;
            if (scheduleModalTitle) scheduleModalTitle.textContent = 'Edit Recurring Event';
            scheduleTitleInput.value = ev.title;
            scheduleCategoryInput.value = ev.category;
            scheduleDayInput.value = String(ev.day);
            scheduleStartInput.value = ev.start;
            scheduleEndInput.value = ev.end;
            if (scheduleDeleteBtn) scheduleDeleteBtn.style.display = 'block';
        } else {
            if (scheduleModalTitle) scheduleModalTitle.textContent = 'Add Recurring Event';
            scheduleTitleInput.value = '';
            scheduleCategoryInput.value = 'class';
            scheduleDayInput.value = '1';
            scheduleStartInput.value = '';
            scheduleEndInput.value = '';
            if (scheduleDeleteBtn) scheduleDeleteBtn.style.display = 'none';
        }
        if (scheduleModal) scheduleModal.classList.add('active');
    }

    function closeScheduleModal() {
        if (scheduleModal) scheduleModal.classList.remove('active');
        editingScheduleEventId = null;
    }

    if (addScheduleEventBtn) addScheduleEventBtn.addEventListener('click', () => openScheduleModal());
    if (closeScheduleModalBtn) closeScheduleModalBtn.addEventListener('click', closeScheduleModal);
    if (scheduleModal) {
        scheduleModal.addEventListener('click', (e) => {
            if (e.target === scheduleModal) closeScheduleModal();
        });
    }

    if (scheduleSaveBtn) {
        scheduleSaveBtn.addEventListener('click', () => {
            const title = scheduleTitleInput.value.trim();
            const category = scheduleCategoryInput.value;
            const day = parseInt(scheduleDayInput.value, 10);
            const start = scheduleStartInput.value;
            const end = scheduleEndInput.value;

            if (!title || !start || !end) {
                showNotice('Please fill in the title, start time, and end time.');
                return;
            }
            if (start === end) {
                showNotice("Start and end time can't be the same.");
                return;
            }

            if (editingScheduleEventId) {
                const ev = scheduleData.find(e => e.id === editingScheduleEventId);
                if(ev?.readOnly||ev?.calendarSourceId){showNotice('Imported calendar events are read-only.');return;}
                if (ev) { ev.title = title; ev.category = category; ev.day = day; ev.start = start; ev.end = end; }
            } else {
                scheduleData.push({ id: 'sched-' + Date.now(), title, category, day, start, end });
            }

            saveScheduleToFirestore();
            renderScheduleWeek();
            closeScheduleModal();
        });
    }

    if (scheduleDeleteBtn) {
        scheduleDeleteBtn.addEventListener('click', async () => {
            const eventId = editingScheduleEventId;
            if (!eventId) return;
            if (!await confirmAction('Delete this recurring event?')) return;
            const event=scheduleData.find(item=>item.id===eventId);if(event?.readOnly||event?.calendarSourceId){showNotice('Imported calendar events are read-only.');return;}
            scheduleData = scheduleData.filter(e => e.id !== eventId);
            saveScheduleToFirestore();
            renderScheduleWeek();
            closeScheduleModal();
        });
    }

    // --- 14 Bedtime Reminder Engine ---

    async function requestBrowserPushPermission() {
        if (typeof Notification === 'undefined') {
            showNotice("This browser doesn't support notifications.");
            return false;
        }
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') {
            updateBrowserPushHint();
            return false;
        }
        try {
            const result = await Notification.requestPermission();
            updateBrowserPushHint();
            return result === 'granted';
        } catch (e) {
            return false;
        }
    }

    function updateBrowserPushHint() {
        const hint = document.getElementById('browser-push-hint');
        if (!hint) return;
        const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
        hint.style.display = blocked ? 'block' : 'none';
    }

    function showBrowserNotification(title, message) {
        if (!userSettings.notifications.browserPush) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        try {
            new Notification(title, { body: message, icon: 'images/kairos-logo.png' });
        } catch (e) {
            console.error('Browser notification error:', e);
        }
    }

    async function checkTaskReminders() {
        const user = auth.currentUser, planId = currentPlanDocId;
        if (!user || !planId || !userSettings.notifications.enabled) return;
        if (taskReminderChecking) { taskReminderQueued = true; return; }
        taskReminderChecking = true;
        const current = () => auth.currentUser?.uid === user.uid && currentPlanDocId === planId && userSettings.notifications.enabled;
        const zone = userSettings.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        try {
            const now = Date.now();
            const candidates = dueTaskReminders(boardsData, now, zone).map(candidate => ({candidate, deliver:deliverTaskReminder}));
            if (userSettings.notifications.bedtimeReminders !== false) candidates.push(...dueBedtimeReminders(scheduleData, now, zone).map(candidate => ({candidate, deliver:deliverBedtimeReminder})));
            for (const {candidate,deliver} of candidates) {
                if (!current()) break;
                const enabled = () => deliver !== deliverBedtimeReminder || userSettings.notifications.bedtimeReminders !== false;
                if (!enabled()) continue;
                try {
                    const result = await deliver(planId, user.uid, candidate, {timeZone:zone});
                    if (result.delivered && current() && enabled()) showBrowserNotification(result.title, result.message);
                } catch (error) { console.warn('Reminder delivery will retry:', error); }
            }
        } catch (error) { console.warn('Reminder check will retry:', error); }
        finally {
            taskReminderChecking = false;
            if (taskReminderQueued) { taskReminderQueued = false; void checkTaskReminders(); }
        }
    }

    window.__kairosTaskReminders = {
        check: checkTaskReminders,
        status: () => reminderDeliveryStatus(userSettings.notifications, typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
    };

    function checkPlanReminders() { void checkTaskReminders(); }

    // --- 15 Achievements Engine ---

    async function loadUserProgressFromFirestore(user) {
        try {
            const ref = doc(db, 'users', user.uid);
            const snap = await getDoc(ref);
            if(auth.currentUser?.uid!==user.uid)return;
            const data = snap.exists() ? snap.data() : null;

            achievementsData = deepMerge(defaultAchievementsData(), data?.achievements || {});
            focusData = deepMerge(defaultFocusData(), data?.focusData || {});
            gettingStarted?.hydrate(data);
            if(data?.onboardingCompleted===true&&data?.gettingStarted?.status!=='active'){
                const result=await guideStore.update(user.uid,{type:'reconcile'});
                if(auth.currentUser?.uid!==user.uid)return;
                acceptGuideCompletion(result,user.uid);
            }
        } catch (error) {
            console.error('Error loading achievements/focus data:', error);
        }
        if(auth.currentUser?.uid!==user.uid)return;
        renderAchievementsPage();
        renderGoalSelects();
        renderMiniAchievementsWidget();
        renderFocusTimerWidget();
        renderStatisticsPage();
        markInitialLoadComplete();
    }

    async function saveAchievementsToFirestore() {
        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, 'users', user.uid), { achievements: achievementsData }, { merge: true });
        } catch (error) {
            console.error('Error saving achievements:', error);
        }
    }

    async function saveFocusDataToFirestore() {
        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, 'users', user.uid), { focusData: {dailyTasksLog:focusData.dailyTasksLog} }, { merge: true });
        } catch (error) {
            console.error('Error saving focus data:', error);
        }
    }

    function getAchievementProgress(def) {
        if (def.type === 'focus_seconds') return { current: focusData.totalSeconds, target: def.threshold };
        if (def.type === 'tasks_completed') return { current: achievementsData.lifetimeTasksCompleted, target: def.threshold };
        return null;
    }

    function formatProgressValue(def, val) {
        if (def.type === 'focus_seconds') {
            return val >= 3600 ? `${(val / 3600).toFixed(1)}h` : `${Math.round(val / 60)}m`;
        }
        return String(val);
    }

    function unlockAchievement(id) {
        if (achievementsData.unlocked[id]) return;
        const def = ACHIEVEMENTS.find(a => a.id === id);
        if (!def) return;

        achievementsData.unlocked[id] = Date.now();
        saveAchievementsToFirestore();
        showAchievementToast(def);
        renderAchievementsPage();
        renderMiniAchievementsWidget();
    }

    function checkFocusAchievements() {
        ACHIEVEMENTS.filter(a => a.category === 'focus').forEach(a => {
            if (!achievementsData.unlocked[a.id] && focusData.totalSeconds >= a.threshold) unlockAchievement(a.id);
        });
        renderAchievementsPage();
    }

    function checkTaskAchievements() {
        ACHIEVEMENTS.filter(a => a.category === 'tasks').forEach(a => {
            if (!achievementsData.unlocked[a.id] && achievementsData.lifetimeTasksCompleted >= a.threshold) unlockAchievement(a.id);
        });
        renderAchievementsPage();
    }

    function triggerMiscAchievement(eventName) {
        const def = ACHIEVEMENTS.find(a => a.category === 'misc' && a.event === eventName);
        if (def) unlockAchievement(def.id);
    }

    function showAchievementToast(def) {
        const container = document.getElementById('achievement-toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="achievement-toast-badge">${def.icon}</div>
            <div class="achievement-toast-text">
                <p class="achievement-toast-label">Achievement Unlocked</p>
                <p class="achievement-toast-name">${getAchievementDisplay(def).name}</p>
            </div>
        `;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('active'));

        if (window.confetti && confettiEnabled) {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.4 }, colors: [getAccentColor(), '#fbbf24', '#ffffff'] });
        }

        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 400);
        }, 4500);
    }

    function getAchievementDisplay(def) {
        const lang = userSettings.accessibility.language || 'en';
        const override = ACHIEVEMENT_I18N[def.id]?.[lang];
        return {
            name: override?.name || def.name,
            desc: override?.desc || def.desc
        };
    }

    function renderAchievementsPage() {
        const container = document.getElementById('achievements-grid-container');
        if (!container) return;
        if (pageRenders.defer('achievements-page',renderAchievementsPage)) return;

        const categories = ['focus', 'tasks', 'misc'];
        container.innerHTML = categories.map(cat => {
            const items = ACHIEVEMENTS.filter(a => a.category === cat);
            const cardsHTML = items.map(def => {
                const unlocked = !!achievementsData.unlocked[def.id];
                const progress = getAchievementProgress(def);
                let progressHTML = '';
                if (progress && !unlocked) {
                    const pct = Math.min(100, Math.round((progress.current / progress.target) * 100));
                    progressHTML = `
                        <div class="badge-progress-bar"><div class="badge-progress-fill" style="width:${pct}%"></div></div>
                        <p class="badge-progress-text">${formatProgressValue(def, progress.current)} / ${formatProgressValue(def, progress.target)}</p>
                    `;
                }
                const tagHTML = unlocked
                    ? `<span class="badge-unlocked-tag">${tr('unlocked_tag')}</span>`
                    : (def.limitedAvailability ? `<span class="badge-unlocked-tag" style="opacity:0.5;">${tr('limited_tag')}</span>` : '');

                const display = getAchievementDisplay(def);
                return `
                    <div class="badge-card ${unlocked ? 'unlocked' : 'locked'}" data-achievement-id="${def.id}">
                        <div class="badge-icon-circle">${def.icon}</div>
                        <p class="badge-name">${display.name}</p>
                        <p class="badge-desc">${display.desc}</p>
                        ${progressHTML}
                        ${tagHTML}
                    </div>
                `;
            }).join('');

            return `
                <div class="achievement-category-block">
                    <h3 class="achievement-category-title">${tr('achievement_category_' + cat)}</h3>                    <div class="badge-grid">${cardsHTML}</div>
                </div>
            `;
        }).join('');
    }
    

    function renderGoalSelects() {
        const container = document.getElementById('achievement-goal-selects');
        if (!container) return;
        if (pageRenders.defer('achievements-page',renderGoalSelects)) return;

        const trackable = ACHIEVEMENTS.filter(a => a.type === 'focus_seconds' || a.type === 'tasks_completed');
        const goals = achievementsData.goals || [];

        container.innerHTML = [0, 1, 2].map(i => `
            <select class="settings-input goal-select" data-goal-index="${i}">
                <option value="">— None —</option>
                ${trackable.map(a => `<option value="${a.id}" ${goals[i] === a.id ? 'selected' : ''}>${a.icon} ${getAchievementDisplay(a).name}</option>`).join('')}
            </select>
        `).join('');

        container.querySelectorAll('.goal-select').forEach(select => {
            select.addEventListener('change', () => {
                const idx = parseInt(select.dataset.goalIndex, 10);
                const newGoals = [...(achievementsData.goals || [])];
                newGoals[idx] = select.value || null;
                achievementsData.goals = newGoals;
                saveAchievementsToFirestore();
                renderMiniAchievementsWidget();
            });
        });
    }

    function renderMiniAchievementsWidget() {
        const container = document.getElementById('mini-achievements-container');
        if (!container) return;

        const goalIds = (achievementsData.goals || []).filter(Boolean).slice(0, 3);
        if (!goalIds.length) {
            container.innerHTML = `<h3>Goals</h3><p class="text-muted">Pick 3 goals in the Achievements tab to track them here.</p>`;
            return;
        }

        const itemsHTML = goalIds.map(id => {
            const def = ACHIEVEMENTS.find(a => a.id === id);
            if (!def) return '';
            const progress = getAchievementProgress(def);
            const unlocked = !!achievementsData.unlocked[id];
            const pct = unlocked ? 100 : (progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0);
            return `
                <div class="mini-goal-item">
                    <div class="mini-goal-header"><span>${def.icon} ${getAchievementDisplay(def).name}</span><span>${pct}%</span></div>
                    <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<h3>${tr('goals_title')}</h3>${itemsHTML}`;
    }

    // --- 16 Focus Timer Widget ---

    function formatHMS(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);
        return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }

    function renderFocusTimerWidget() {
        if(!focusTimerController){focusTimerController=mountFocusTimer({getIdentity:()=>({ownerId:auth.currentUser?.uid||null,planId:currentPlanDocId}),persist:commitFocusTime,chooseOutcome:({target,signal})=>{const work=taskWorkCheckin({boards:boardsData},target.taskId,target.occurrenceDate);return work?promptFocusCheckin(work,{signal}):Promise.resolve({mode:'log'})},getLongestSeconds:()=>focusData.longestSessionSeconds,confirmDiscard:()=>confirmAction('Discard this unlogged focus session?')});window.__kairosFocusTimer=focusTimerController}
        if(!focusHistoryController)focusHistoryController=mountFocusHistory({getIdentity:()=>({ownerId:auth.currentUser?.uid||null,planId:currentPlanDocId}),load:loadFocusHistory,getState:()=>({boards:boardsData}),getTimezone:()=>userSettings.profile?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',persistManual:entry=>commitFocusTime(entry),persist:entry=>commitFocusTime(entry,true),confirmClearPending:()=>confirmDialog('Clear this unconfirmed manual entry? Review focus history first; it may already have been saved.',{confirmText:'Clear request'}),confirmRemove:()=>confirmDialog('Remove this focus log? Its time will be subtracted; task completion stays unchanged.',{destructive:true,confirmText:'Remove'})});
        focusHistoryController.sync();focusTimerController.sync();
    }
    async function startTaskFocus(taskId,occurrenceDate=null){
        const target=taskFocusTarget({boards:boardsData},taskId,occurrenceDate);if(!target||!auth.currentUser)return false;
        renderFocusTimerWidget();const owner=auth.currentUser.uid,started=await focusTimerController.start(target);if(!started&&!focusTimerController.getState()&&auth.currentUser?.uid===owner)showNotice(focusTimerController.getMessage()||'Could not start the focus timer. Try again.');return started;
    }
    async function commitFocusTime(entry,correction=false){
        const uid=auth.currentUser?.uid;if(uid!==entry.ownerId||entry.planId&&entry.planId!==currentPlanDocId)throw Error('The signed-in account or planner changed.');
        const work=planSaveQueue.catch(()=>{}).then(async()=>{
            if(auth.currentUser?.uid!==uid||entry.planId&&entry.planId!==currentPlanDocId)throw Error('The signed-in account or planner changed.');
            const before=planState({boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData}),result=await (correction?persistFocusCorrection:persistFocusLog)(entry.planId,uid,entry);
            if(auth.currentUser?.uid!==uid||entry.planId&&entry.planId!==currentPlanDocId)throw Error('The signed-in account or planner changed.');
            if(entry.planId){const snapshot=await getDoc(doc(db,'study_plans',entry.planId));if(auth.currentUser?.uid!==uid||currentPlanDocId!==entry.planId)throw Error('The signed-in account or planner changed.');if(snapshot.exists()&&snapshot.data().userID===uid){const saved=planState(snapshot.data()),live=planState({boards:boardsData,dayInsights,scheduleEvents:scheduleData,calendarSources:calendarSourcesData}),rebased=mergePlanEdits(before,live,saved);boardsData=rebased.boards;dayInsights=rebased.dayInsights;scheduleData=rebased.scheduleEvents;calendarSourcesData=rebased.calendarSources;invalidateKairosContext({ownerId:uid,planId:entry.planId,before:planSnapshot,after:saved});planSnapshot=saved;}}
            focusData=deepMerge(defaultFocusData(),result.focusData||{});if(result.completedTaskIds?.length)recordTaskListCompletion({type:'complete_task',value:true},result);
            checkFocusAchievements();renderApp();renderStatisticsPage();void window.__kairosTaskReminders?.check();window.dispatchEvent(new CustomEvent('kairos-data-changed'));return result;
        });planSaveQueue=work;return work;
    }

    function logTaskCompletionForStats(count=1) {
        const todayKey = toDateKey(new Date());
        focusData.dailyTasksLog[todayKey] = (focusData.dailyTasksLog[todayKey] || 0) + count;
        saveFocusDataToFirestore();
        renderStatisticsPage();
    }

    // --- 17 Statistics Engine ---

    function aggregateDailyLog(log, range) {
        const now = new Date();

        if (range === 'week') {
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                days.push({ label: d.toLocaleDateString(getLocale(userSettings.accessibility.language || 'en'), { weekday: 'short' }), value: log[toDateKey(d)] || 0 });
            }
            return days;
        }

        if (range === 'month') {
            const weeks = [0, 0, 0, 0, 0];
            Object.keys(log).forEach(key => {
                const d = new Date(key);
                if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
                    const weekIndex = Math.min(4, Math.floor((d.getDate() - 1) / 7));
                    weeks[weekIndex] += log[key];
                }
            });
            return weeks.map((v, i) => ({ label: `${tr('week_abbrev')} ${i + 1}`, value: v }));
        }

        const months = Array(12).fill(0);
        const monthLocale = getLocale(userSettings.accessibility.language || 'en');
        const monthLabels = Array.from({ length: 12 }, (_, i) => new Date(2023, i, 1).toLocaleDateString(monthLocale, { month: 'short' }));
        Object.keys(log).forEach(key => {
            const d = new Date(key);
            if (d.getFullYear() === now.getFullYear()) months[d.getMonth()] += log[key];
        });
        return months.map((v, i) => ({ label: monthLabels[i], value: v }));
    }

    function renderBarChartSVG(data, valueFormatter) {
        const max = Math.max(1, ...data.map(d => d.value));
        return `
            <div class="bar-chart">
                ${data.map(d => `
                    <div class="bar-chart-col" style="width:${100 / data.length}%">
                        <div class="bar-chart-bar" style="height:${(d.value / max) * 100}%" title="${valueFormatter(d.value)}"></div>
                        <span class="bar-chart-label">${d.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async function openFocusBreakdownTask(target,options={}) {
        const isCurrent=typeof options?.isCurrent==='function'?options.isCurrent:()=>true;
        const owner=auth.currentUser?.uid,plan=currentPlanDocId;if(!owner||!plan||!isCurrent())return false;
        resolveTaskDetail({boards:boardsData},target);
        if(!await (taskDetails?.requestClose?.()??true)||auth.currentUser?.uid!==owner||currentPlanDocId!==plan||!isCurrent())return false;
        await pageLoader.prepare('tasks-page');
        if(auth.currentUser?.uid!==owner||currentPlanDocId!==plan||!isCurrent())return false;
        resolveTaskDetail({boards:boardsData},target);
        await pageRouter.navigate('tasks-page');
        if(auth.currentUser?.uid!==owner||currentPlanDocId!==plan||!isCurrent())return false;
        return taskDetails?.open(target,document.querySelector('.nav-item[data-target="tasks-page"]'))??false;
    }
    function renderFocusBreakdown() {
        if(pageRenders.defer('statistics-page',renderFocusBreakdown))return;
        const root=document.getElementById('focus-breakdown');if(!root)return;
        if(!focusBreakdownView)focusBreakdownView=mountFocusBreakdown({root,getIdentity:()=>({ownerId:auth.currentUser?.uid||null,planId:currentPlanDocId}),getState:()=>({boards:boardsData}),onOpen:openFocusBreakdownTask});
        else focusBreakdownView.refresh();
    }
    function globalSearchIdentity() {
        const user=auth.currentUser,ownerId=user?.emailVerified?user.uid:null;
        return {ownerId,planId:ownerId&&searchPlannerOwnerId===ownerId?currentPlanDocId:null};
    }
    async function openGlobalSearchResult(target,{isCurrent=()=>true}={}) {
        if(!isCurrent()||!globalSearchIdentity().planId)return false;
        if(target.kind==='task')return openFocusBreakdownTask({taskId:target.taskId,...(target.occurrenceDate?{occurrenceDate:target.occurrenceDate}:{})},{isCurrent});
        if(target.kind!=='board')return false;
        const owner=auth.currentUser?.uid,plan=currentPlanDocId;if(!owner||!plan)return false;
        const valid=()=>isCurrent()&&auth.currentUser?.uid===owner&&currentPlanDocId===plan;
        const resolve=()=>{const found=boardsData.filter(board=>board.id===target.boardId);return found.length===1&&!found[0].archived};
        if(!resolve()||!await (taskDetails?.requestClose?.()??true)||!valid())return false;
        await pageLoader.prepare('tasks-page');if(!valid()||!resolve())return false;
        if(!await (taskWorkspace?.back?.()??true)||!valid()||!resolve())return false;
        await pageRouter.navigate('tasks-page');if(!valid()||!resolve())return false;
        renderBoardsGrid();
        const card=[...document.querySelectorAll('#tasks-page .board-card')].find(element=>element.dataset.boardId===target.boardId);
        if(!card)return false;card.tabIndex=-1;card.scrollIntoView?.({block:'nearest',behavior:'instant'});card.focus?.({preventScroll:true});return true;
    }
    function renderStatisticsPage() {
        const chartsContainer = document.getElementById('stats-charts-container');
        const totalsContainer = document.getElementById('stats-totals-container');
        if (!chartsContainer) return;
        if (pageRenders.defer('statistics-page',renderStatisticsPage)) return;
        statisticsRenderedDate = toDateKey(new Date());
        renderFocusBreakdown();

        const focusChartData = aggregateDailyLog(focusData.dailyFocusLog || {}, statsRange);
        const taskChartData = aggregateDailyLog(focusData.dailyTasksLog || {}, statsRange);

        chartsContainer.innerHTML = `
            <div class="dash-card">
                <h3>${tr('focus_time_chart_label')}</h3>
                ${renderBarChartSVG(focusChartData, v => formatHMS(v))}
            </div>
            <div class="dash-card">
                <h3>${tr('achievement_category_tasks')}</h3>
                ${renderBarChartSVG(taskChartData, v => trFmt('day_detail_tasks', { n: v }))}
            </div>
        `;

        if (totalsContainer) {
            totalsContainer.innerHTML = `
                <div class="dash-card"><h3>${tr('total_focus_logged')}</h3><p class="stats-percentage">${formatHMS(focusData.totalSeconds)}</p></div>
                <div class="dash-card"><h3>${tr('longest_session')}</h3><p class="stats-percentage">${formatHMS(focusData.longestSessionSeconds)}</p></div>
                <div class="dash-card"><h3>${tr('total_tasks_completed_stat')}</h3><p class="stats-percentage">${achievementsData.lifetimeTasksCompleted}</p></div>
            `;
        }
    }

    document.querySelectorAll('#stats-range-toggle .option-tile').forEach(btn => {
        btn.addEventListener('click', () => {
            statsRange = btn.dataset.statsRange;
            document.querySelectorAll('#stats-range-toggle .option-tile').forEach(b => b.classList.toggle('active', b === btn));
            renderStatisticsPage();
        });
    });

    renderConfigOptions();
    populateSettingsForm();
        document.dispatchEvent(new Event('kairos-controls-refresh'));

    appReady = true;
    globalSearchController=mountGlobalSearch({getLocale:()=>getLocale(userSettings.accessibility.language||'en'),getShortcuts:()=>userSettings.accessibility.shortcuts,getIdentity:globalSearchIdentity,getState:()=>({boards:boardsData}),getToday:()=>planningClock(Date.now(),userSettings.profile.timezone).date,onNavigate:openGlobalSearchResult});
    plannerMutations=createMutationSession({getIdentity:globalSearchIdentity,commit:async(command,expected,identity)=>{const result=await persistTaskDetails(command,expected,identity);recordTaskListCompletion(command,result);return result;},onResolve:(identity,status)=>{
        taskDetails?.resolveRecovery?.(identity,status);taskWorkspace?.resolveRecovery?.(identity,status);taskInteractions?.resolveRecovery?.(identity,status);taskCaptureController?.resolveRecovery?.(identity,status);window.__kairosScheduleMutationResolved?.(identity,status);window.dispatchEvent(new CustomEvent('kairos-schedule-mutation-resolved',{detail:{identity,status}}));
    }});
    taskCaptureController=mountTaskCapture({getIdentity:globalSearchIdentity,getState:()=>({boards:boardsData}),getDefaults:()=>({...taskWorkspace?.getCurrentSection?.(),...(document.getElementById('home-page')?.classList.contains('active')?{date:planningClock(Date.now(),userSettings.profile.timezone).date}:document.getElementById('schedule-page')?.classList.contains('active')?{date:calendarFocusDate}:{})}),commit:commitTaskDetails,confirmClear:message=>confirmDialog(message,{confirmText:'Clear recovery'})});
    dashboardController=createDashboardController({document,window,getIdentity:globalSearchIdentity,getState:()=>({boards:boardsData,scheduleEvents:scheduleData,calendarSources:calendarSourcesData}),getToday:()=>planningClock(Date.now(),userSettings.profile.timezone).date,session:plannerMutations,onCapture:context=>taskCaptureController.open(context),confirmClear:message=>confirmDialog(message,{confirmText:'Clear recovery'}),loadUndoPreview:loadActionUndoPreview,
        openTask:openTaskDetailsFromList,requestClose:()=>taskDetails?.requestClose?.()??true,navigate:page=>pageRouter.navigate(page),setScheduleDate:date=>window.__kairosScheduleBridge?.setScheduleDate(date),selectOccurrence:target=>window.__kairosScheduleWorkspace?.selectOccurrence?.(target),selectItem:(kind,id)=>window.__kairosScheduleWorkspace?.selectItem?.(kind,id)
    });
    dashboardController.mount();
    renderApp();
    renderAchievementsPage();
    renderGoalSelects();
    renderStatisticsPage();
    void pageRouter.start();

    checkPlanReminders();
    setInterval(checkPlanReminders, 60000);
    window.addEventListener("focus", checkPlanReminders);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) checkPlanReminders(); });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootApp,{once:true});else bootApp();
