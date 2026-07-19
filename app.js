import { auth, db } from './firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc, setDoc, getDoc, collection, addDoc, serverTimestamp,
    query, where, orderBy, limit, getDocs, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { LANGUAGES, applyTranslations, getLocale, getGeminiLanguageName, t } from './i18n.js';

console.log("APP.js is loaded and running");

const THEMES = [
    { id: 'default', name: 'Default Purple', swatch: '#a855f7' },
    { id: 'fairyfloss', name: 'Fairy Floss', swatch: '#ff8fc9' },
    { id: 'poseidon', name: 'Poseidon', swatch: '#38bdf8' },
    { id: 'peacefulplains', name: 'Peaceful Plains', swatch: '#4ade80' }
];

// Text color presets. "default" means "don't override" — leave whichever
// color the current Mode (dark/light) already provides for --text-primary.
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

const CURSORS = [
    { id: 'default', name: 'Default' },
    { id: 'bunny', name: '🐰 Bunny' },
    { id: 'spaceship', name: '🚀 Spaceship' }
];

const BACKGROUNDS = [
    { id: 'none', name: 'None', type: 'none' },
    { id: 'bg1', name: 'Nebula', type: 'image', file: 'backgrounds/bg1.jpg' },
    { id: 'bg2', name: 'Forest', type: 'image', file: 'backgrounds/bg2.jpg' },
    { id: 'bg3', name: 'Waves', type: 'image', file: 'backgrounds/bg3.jpg' },
    { id: 'anim1', name: 'Particles', type: 'video', file: 'backgrounds/anim1.mp4' },
    { id: 'anim2', name: 'Rain', type: 'video', file: 'backgrounds/anim2.mp4' },
    { id: 'custom', name: 'Custom', type: 'custom' }
];

const AMBIENT_SOUNDS = [
    { id: 'none', name: 'None' },
    { id: 'rain', name: '🌧️ Rain', file: 'ambient/rain.mp3' },
    { id: 'lofi', name: '🎧 Lo-fi', file: 'ambient/lofi.mp3' },
    { id: 'cafe', name: '☕ Cafe', file: 'ambient/cafe.mp3' },
    { id: 'custom', name: '🔗 Custom YouTube', file: null }
];

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
        accessibility: { density: 'default', timeFormat: '12', reduceMotion: false, language: 'en' },
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
        }
    };
}

document.addEventListener("DOMContentLoaded", () => {

    let checklistRenderTimeout;
    let currentPlanDocId = null;

    // --- Data Engine ---
    // Structure: boardsData = [ { id, title, sections: [ { id, title, tasks: [...] } ] } ]
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

    // Migrates data saved before boards existed: a plain array of
    // sections (no nesting) gets wrapped into a single default board.
    // Anything already in the new { boards: [...] } shape passes through.
    function migrateToBoards(loadedDoc) {
        if (Array.isArray(loadedDoc.boards) && loadedDoc.boards.length) return loadedDoc.boards;
        if (Array.isArray(loadedDoc.sections)) {
            return [{ id: 'board-' + Date.now(), title: 'My Routine', sections: loadedDoc.sections }];
        }
        return null;
    }

    // --- Calendar Data ---
    let dayInsights = {};
    let calendarViewDate = new Date();
    calendarViewDate.setDate(1);
    let selectedCalendarDate = null;

    // --- Settings State ---
    let userSettings = defaultSettings();
    try {
        const cached = JSON.parse(localStorage.getItem('kairos_settings_cache') || 'null');
        if (cached) userSettings = deepMerge(defaultSettings(), cached);
    } catch (e) { /* ignore malformed cache */ }
    let pendingSettings = cloneDeep(userSettings);
    let confettiEnabled = userSettings.appearance.confetti;
    let appReady = false; // guards against calling render functions before they're defined below
    let ytPlayer = null; // YouTube ambient player state — declared early since applyAllSettings() (called just below) can reach it via applyAmbientSound()
    let ytApiReadyPromise = null;

    // Shorthand: translate a key using whichever language is currently active.
    function tr(key) {
        return t(key, userSettings.accessibility.language || 'en');
    }

    applyAllSettings();

    // --- Auth Management ---
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.log("No user detected. Redirecting to login...");
            window.location.replace("login.html");
            return; 
        }

        console.log("User is logged in:", user.email);
        loadLatestPlanFromFirestore(user);
        loadUserSettingsFromFirestore(user);
    });
    
    // --- 1 UI Nav & Clock ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle && sidebar) sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("collapsed"));

    const navItems = document.querySelectorAll(".nav-item");
    const pageViews = document.querySelectorAll(".page-view");

    navItems.forEach(button => {
        button.addEventListener("click", () => {
            navItems.forEach(item => item.classList.remove("active"));
            pageViews.forEach(page => page.classList.remove("active"));
            button.classList.add("active");
            const targetPage = document.getElementById(button.getAttribute("data-target"));
            if (targetPage) targetPage.classList.add("active");

            if (button.getAttribute("data-target") === "settings-page") {
                enterSettingsPage();
            }
        });
    });

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

    // --- 2 Rendering Engine ---
    const focusContainer = document.getElementById("dashboard-focus-container");
    const managerContainer = document.getElementById("tasks-manager-container");

    function createTaskHTML(task, sectionId, showDatePicker = false) {
        return `
            <li class="task-item ${task.completed ? 'completed' : ''}">
                <label class="custom-checkbox">
                    <input type="checkbox" data-section="${sectionId}" data-task="${task.id}" ${task.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
                <input type="text" class="task-text" data-section="${sectionId}" data-task="${task.id}" value="${task.title}" style="text-decoration: ${task.completed ? 'line-through' : 'none'};">
                ${showDatePicker ? `<input type="date" class="task-date-input" data-section="${sectionId}" data-task="${task.id}" value="${task.date || ''}" title="Schedule this task on the calendar">` : ''}
                ${showDatePicker ? `<button type="button" class="task-delete-btn" data-section="${sectionId}" data-task="${task.id}" title="${tr('delete_task')}">✕</button>` : ''}
            </li>
        `;
    }

    function renderApp() {
        renderFocusMode();
        renderBoardsGrid();
        updateRoutineStats();
        updateWhatsNextWidget();
        renderCalendar();
    }

    function findFirstIncompleteSection() {
        for (const board of boardsData) {
            const section = board.sections.find(s => s.tasks.some(task => !task.completed));
            if (section) return section;
        }
        return null;
    }

    function renderFocusMode() {
        if (!focusContainer) return;
        const activeSection = findFirstIncompleteSection();
        if (activeSection) {
            let tasksHTML = activeSection.tasks.map(task => createTaskHTML(task, activeSection.id)).join('');
            focusContainer.innerHTML = `
                <div class="fade-in-section">
                    <div class="checklist-header">
                        <h3 class="editable-title" spellcheck="false">${activeSection.title}</h3>
                    </div>
                    <ul class="task-list">
                        ${tasksHTML}
                    </ul>
                </div>
            `;
        } else {
            focusContainer.innerHTML = `
                <div class="fade-in-section all-done-state">
                    <span class="all-done-icon">🎉</span>
                    <h3>${tr('all_caught_up_title')}</h3>
                    <p class="text-muted">${tr('all_caught_up_desc')}</p>
                </div>
            `;
        }
    }

    function renderSectionBlockHTML(board, section) {
        let tasksHTML = section.tasks.map(task => createTaskHTML(task, section.id, true)).join('');
        return `
            <div class="board-section-block fade-in-section" data-board-id="${board.id}" data-section-id="${section.id}">
                <div class="section-title-row">
                    <h4 class="editable-title" spellcheck="false">${section.title}</h4>
                    <div class="dots-menu-wrapper">
                        <button type="button" class="dots-menu-btn section-dots-btn" title="${tr('section_options')}">⋮</button>
                        <div class="dots-menu section-dots-menu">
                            <button type="button" class="section-rename-btn">${tr('rename')}</button>
                            <button type="button" class="section-delete-btn danger-option">${tr('delete')}</button>
                        </div>
                    </div>
                </div>
                <ul class="task-list">${tasksHTML}</ul>
                <button type="button" class="add-task-btn" data-board-id="${board.id}" data-section-id="${section.id}">${tr('add_task')}</button>
            </div>
        `;
    }

    function renderBoardCardHTML(board) {
        const sectionsHTML = board.sections.map(section => renderSectionBlockHTML(board, section)).join('');
        return `
            <div class="board-card fade-in-section" data-board-id="${board.id}">
                <div class="board-card-header">
                    <h3 class="editable-title" spellcheck="false">${board.title}</h3>
                    <div class="dots-menu-wrapper">
                        <button type="button" class="dots-menu-btn board-dots-btn" title="${tr('board_options')}">⋮</button>
                        <div class="dots-menu board-dots-menu">
                            <button type="button" class="board-rename-btn">${tr('rename')}</button>
                            <button type="button" class="board-delete-btn danger-option">${tr('delete')}</button>
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
        if (!boardsData.length) {
            managerContainer.innerHTML = `<p class="boards-empty-state text-muted">${tr('no_boards_yet')}</p>`;
            return;
        }
        managerContainer.innerHTML = boardsData.map(renderBoardCardHTML).join('');
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
            }
        }
    });

    // Boards page: delete task, delete/rename section, delete/rename board,
    // add task/section/board, and the hover dots-menus that trigger them.
    document.body.addEventListener('click', (e) => {

        // Close any open dots-menu when clicking elsewhere
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

        const taskDeleteBtn = e.target.closest('.task-delete-btn');
        if (taskDeleteBtn) {
            const sectionId = taskDeleteBtn.getAttribute('data-section');
            const taskId = taskDeleteBtn.getAttribute('data-task');
            const found = findSection(sectionId);
            if (found) {
                found.section.tasks = found.section.tasks.filter(t => t.id !== taskId);
                updatePlanInFirestore();
                renderApp();
            }
            return;
        }

        const addTaskBtn = e.target.closest('.add-task-btn');
        if (addTaskBtn) {
            const sectionId = addTaskBtn.getAttribute('data-section-id');
            const found = findSection(sectionId);
            if (found) {
                const title = prompt(tr('new_task_prompt'));
                if (title && title.trim()) {
                    found.section.tasks.push({ id: 'task-' + Date.now(), title: title.trim(), completed: false, date: null });
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const addSectionBtn = e.target.closest('.add-section-btn');
        if (addSectionBtn) {
            const boardId = addSectionBtn.getAttribute('data-board-id');
            const board = findBoard(boardId);
            if (board) {
                const title = prompt(tr('new_section_prompt'));
                if (title && title.trim()) {
                    board.sections.push({ id: 'sec-' + Date.now(), title: title.trim(), tasks: [] });
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const sectionRenameBtn = e.target.closest('.section-rename-btn');
        if (sectionRenameBtn) {
            const block = sectionRenameBtn.closest('.board-section-block');
            const found = findSection(block.getAttribute('data-section-id'));
            if (found) {
                const title = prompt(tr('rename_section_prompt'), found.section.title);
                if (title && title.trim()) {
                    found.section.title = title.trim();
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const sectionDeleteBtn = e.target.closest('.section-delete-btn');
        if (sectionDeleteBtn) {
            const block = sectionDeleteBtn.closest('.board-section-block');
            const boardId = block.getAttribute('data-board-id');
            const sectionId = block.getAttribute('data-section-id');
            if (confirm(tr('confirm_delete_section'))) {
                const board = findBoard(boardId);
                if (board) {
                    board.sections = board.sections.filter(s => s.id !== sectionId);
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return;
        }

        const boardRenameBtn = e.target.closest('.board-rename-btn');
        if (boardRenameBtn) {
            const card = boardRenameBtn.closest('.board-card');
            const board = findBoard(card.getAttribute('data-board-id'));
            if (board) {
                const title = prompt(tr('rename_board_prompt'), board.title);
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
            if (confirm(tr('confirm_delete_board'))) {
                boardsData = boardsData.filter(b => b.id !== boardId);
                updatePlanInFirestore();
                renderApp();
            }
            return;
        }

        const addBoardBtn = e.target.closest('#add-board-btn');
        if (addBoardBtn) {
            const title = prompt(tr('new_board_prompt'));
            if (title && title.trim()) {
                boardsData.push({ id: 'board-' + Date.now(), title: title.trim(), sections: [] });
                if (!currentPlanDocId) { savePlanToFirestore(boardsData); } else { updatePlanInFirestore(); }
                renderApp();
            }
            return;
        }
    });


    function updateRoutineStats() {
        let totalTasks = 0;
        let completedTasks = 0;
        boardsData.forEach(board => board.sections.forEach(section => {
            totalTasks += section.tasks.length;
            completedTasks += section.tasks.filter(t => t.completed).length;
        }));
        const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
        const percentageText = document.getElementById("stats-percentage");
        const fractionText = document.getElementById("stats-fraction");
        const fillBar = document.getElementById("progress-bar-fill");
        if (percentageText && fractionText && fillBar) {
            percentageText.textContent = `${percentage}%`;
            fractionText.textContent = `${completedTasks} / ${totalTasks} tasks completed`;
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
            for (const section of board.sections) {
                const incompleteTask = section.tasks.find(t => !t.completed);
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
                if (selectedCalendarDate) renderDayPanel();

                const isSectionFinished = section.tasks.every(t => t.completed);
                if (isSectionFinished) {
                    setTimeout(() => {
                        renderFocusMode();
                        if (window.confetti && confettiEnabled) {
                            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [getAccentColor(), '#ffffff'] });
                        }
                    }, 300);
                }
            }
        }
    }

    // --- 5 Local Storage Settings (Gemini key) ---
    const apiKeyInput = document.getElementById("api-key-input");
    const saveSettingsBtn = document.getElementById("save-settings-btn");

    if (apiKeyInput && saveSettingsBtn) {
        const savedKey = localStorage.getItem("kairos_api_key");
        if (savedKey) { apiKeyInput.value = savedKey; }
        saveSettingsBtn.addEventListener("click", () => {
            const key = apiKeyInput.value.trim();
            if (key !== "") {
                localStorage.setItem("kairos_api_key", key);
                saveSettingsBtn.innerText = tr("key_saved");
                saveSettingsBtn.style.backgroundColor = "#22c55e";
                setTimeout(() => {
                    saveSettingsBtn.innerText = tr("save_key");
                    saveSettingsBtn.style.backgroundColor = "var(--accent-glow)";
                }, 2000);
            }
        });
    }

    // --- 6 Cloud Sync Data Actions ---
    async function savePlanToFirestore(planData) {
        const user = auth.currentUser;
        if (!user) {
            console.error("Cannot save plan: no user signed in.");
            return;
        }
        try {
            const plansColRef = collection(db, "study_plans");
            const docRef = await addDoc(plansColRef, {
                boards: planData,
                dayInsights: dayInsights,
                userID: user.uid,
                createdAt: serverTimestamp()
            });
            currentPlanDocId = docRef.id;
            console.log("Study plan successfully saved. ID:", docRef.id);
        } catch (error) {
            console.error("Error saving plan to Firestore:", error);
        }
    }

    async function updatePlanInFirestore() {
        if (!currentPlanDocId) {
            console.warn("No active plan doc ID found. Cannot sync progress.");
            return;
        }
        try {
            const planDocRef = doc(db, "study_plans", currentPlanDocId);
            await updateDoc(planDocRef, {
                boards: boardsData,
                dayInsights: dayInsights
            });
            console.log("Task progress successfully synced to Firestore.");
        } catch (error) {
            console.error("Error syncing task progress:", error);
        }
    }

    async function loadLatestPlanFromFirestore(user) {
        try {
            const plansColRef = collection(db, "study_plans");
            const q = query(plansColRef, where("userID", "==", user.uid));
            const querySnapshot = await getDocs(q);
            
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
                currentPlanDocId = latestPlan.docId;
                const migrated = migrateToBoards(latestPlan);
                boardsData = migrated || boardsData;
                dayInsights = latestPlan.dayInsights || {};

                console.log("Successfully loaded latest study plan from Firestore!");
                renderApp();
            } else {
                console.log("No saved study plans found in Firestore. Using default placeholder routines.");
                renderApp();
            }
        } catch (error) {
            console.error("Error loading plans from Firestore:", error);
            renderApp();
        }
    }

    // --- 7 AI Plan Generator ---
    const aiInput = document.getElementById("ai-input");
    const aiGenerateBtn = document.getElementById("ai-generate-btn");
    let pendingAiSections = null;

    if (aiInput && aiGenerateBtn) {
        aiGenerateBtn.addEventListener("click", async () => {
            const assignmentText = aiInput.value.trim();
            const apiKey = localStorage.getItem("kairos_api_key");

            if (!apiKey) {
                alert(tr('alert_no_api_key'));
                return;
            }
            if (!assignmentText) {
                alert(tr('alert_empty_input'));
                return;
            }

            const originalBtnText = aiGenerateBtn.innerText;
            aiGenerateBtn.innerText = tr('generating_plan_ellipsis');
            aiGenerateBtn.disabled = true;
            aiGenerateBtn.style.opacity = "0.7";

            const languageName = getGeminiLanguageName(userSettings.accessibility.language || 'en');
            const systemPrompt = `
            You are an expert AI Study Coach. The user will provide a syllabus, assignment, or goal. 
            Break it down into logical, actionable study sections and tasks.
            IMPORTANT: Write all section titles and task titles in ${languageName}, since that is the user's chosen app language.
            CRITICAL INSTRUCTION: You MUST respond with ONLY a valid, raw JSON array. 
            Do NOT include markdown formatting, backticks, or the word 'json'. 
            Just the raw array.
            Use this exact structure:
            [
              {
                "id": "gen-sec-1",
                "title": "Section 1: Research",
                "tasks": [
                  { "id": "gen-task-1", "title": "Find 3 academic sources", "completed": false },
                  { "id": "gen-task-2", "title": "Read and highlight sources", "completed": false }
                ]
              }
            ]
            User's Request:
            ${assignmentText}
            `;

            try {
                const cleanApiKey = apiKey.trim(); 
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${cleanApiKey}`;
                
                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt }] }]
                    })
                });

                if (!response.ok) {
                    const errorDetails = await response.text(); 
                    console.error("Google API Rejected the Request:", errorDetails);
                    throw new Error(`API Error ${response.status}. See console for details.`);
                }

                const data = await response.json();
                let aiResponseText = data.candidates[0].content.parts[0].text;
                aiResponseText = aiResponseText.replace(/```json/gi, "").replace(/```/gi, "").trim();
                const newSections = JSON.parse(aiResponseText);

                const uniqueId = Date.now();
                newSections.forEach((sec, sIndex) => {
                    sec.id = `ai-sec-${uniqueId}-${sIndex}`;
                    sec.tasks.forEach((task, tIndex) => {
                        task.id = `ai-task-${uniqueId}-${sIndex}-${tIndex}`;
                        task.completed = false;
                        task.date = task.date || null;
                    });
                });

                // Never overwrite existing boards — ask where these new
                // sections should go (a new board, or appended to one
                // that already exists).
                pendingAiSections = newSections;
                openAiDestinationModal();
                aiInput.value = "";

            } catch (error) {
                console.error(error);
                alert(tr('alert_ai_generation_error'));
            } finally {
                aiGenerateBtn.innerText = originalBtnText;
                aiGenerateBtn.disabled = false;
                aiGenerateBtn.style.opacity = "1";
            }
        });
    }

    // --- AI destination modal ---
    const aiDestinationModal = document.getElementById('ai-destination-modal');
    const aiDestinationNewName = document.getElementById('ai-destination-new-name');
    const aiDestinationExistingSelect = document.getElementById('ai-destination-existing-select');
    const aiDestinationConfirmBtn = document.getElementById('ai-destination-confirm-btn');
    const closeAiDestinationModalBtn = document.getElementById('close-ai-destination-modal');

    function openAiDestinationModal() {
        if (!aiDestinationModal) return;
        if (aiDestinationExistingSelect) {
            aiDestinationExistingSelect.innerHTML = boardsData.map(b => `<option value="${b.id}">${b.title}</option>`).join('');
        }
        const hasExisting = boardsData.length > 0;
        const newRadio = aiDestinationModal.querySelector('input[name="ai-destination"][value="new"]');
        const existingRadio = aiDestinationModal.querySelector('input[name="ai-destination"][value="existing"]');
        if (newRadio) newRadio.checked = true;
        if (existingRadio) existingRadio.disabled = !hasExisting;
        if (aiDestinationNewName) aiDestinationNewName.value = '';
        updateAiDestinationFieldStates();
        aiDestinationModal.classList.add('active');
    }

    function closeAiDestinationModal() {
        if (aiDestinationModal) aiDestinationModal.classList.remove('active');
        pendingAiSections = null;
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
        });
    }

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
        const results = [];
        boardsData.forEach(board => board.sections.forEach(section => {
            section.tasks.forEach(task => {
                if (task.date === dateKey) {
                    results.push({ ...task, sectionId: section.id });
                }
            });
        }));
        return results;
    }

    function renderCalendar() {
        if (!calendarGrid || !calendarMonthYear) return;

        const year = calendarViewDate.getFullYear();
        const month = calendarViewDate.getMonth();
        const locale = getLocale(userSettings.accessibility.language || 'en');

        const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(year, month, 1));
        calendarMonthYear.textContent = `${monthLabel} ${year}`;

        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        const todayKey = toDateKey(new Date());

        // Sun (index 0) as the base reference date, then walk one weekday
        // at a time so labels come from the browser's own locale data.
        const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        const weekdayLabels = [0, 1, 2, 3, 4, 5, 6].map(i => weekdayFormatter.format(new Date(2023, 0, 1 + i)));
        let html = weekdayLabels.map(label => `<div class="calendar-weekday">${label}</div>`).join('');

        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            html += `<div class="calendar-day outside-month"><span class="day-number">${dayNum}</span></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const taskCount = getTasksForDate(dateKey).length;
            const isToday = dateKey === todayKey;

            html += `
                <div class="calendar-day${isToday ? ' is-today' : ''}" data-date="${dateKey}">
                    <span class="day-number">${day}</span>
                    ${taskCount > 0 ? `<span class="day-task-badge">${taskCount}</span>` : ''}
                </div>
            `;
        }

        const filledCells = firstDayIndex + daysInMonth;
        const trailingCells = (7 - (filledCells % 7)) % 7;
        for (let day = 1; day <= trailingCells; day++) {
            html += `<div class="calendar-day outside-month"><span class="day-number">${day}</span></div>`;
        }

        calendarGrid.innerHTML = html;
    }

    if (calendarPrevBtn) {
        calendarPrevBtn.addEventListener('click', () => {
            calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
            renderCalendar();
        });
    }
    if (calendarNextBtn) {
        calendarNextBtn.addEventListener('click', () => {
            calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
            renderCalendar();
        });
    }
    if (calendarGrid) {
        calendarGrid.addEventListener('click', (e) => {
            const dayCell = e.target.closest('.calendar-day:not(.outside-month)');
            if (!dayCell) return;
            openDayPanel(dayCell.getAttribute('data-date'));
        });
    }

    function openDayPanel(dateKey) {
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
        const completedCount = tasksForDay.filter(t => t.completed).length;

        if (dayDetailTotal) dayDetailTotal.textContent = `${tasksForDay.length} task${tasksForDay.length === 1 ? '' : 's'}`;
        if (dayDetailCompleted) dayDetailCompleted.textContent = `${completedCount} finished`;

        if (dayDetailTaskList) {
            dayDetailTaskList.innerHTML = tasksForDay.length
                ? tasksForDay.map(task => createTaskHTML(task, task.sectionId)).join('')
                : `<p class="text-muted">${tr('no_tasks_for_day')}</p>`;
        }

        const cachedInsight = dayInsights[selectedCalendarDate];
        if (dayDetailAiContent) {
            if (cachedInsight) {
                dayDetailAiContent.innerHTML = `<p>${cachedInsight}</p>`;
            } else {
                dayDetailAiContent.innerHTML = `<p class="text-muted">${tr('no_insight_yet')}</p>`;
                generateDayInsight(selectedCalendarDate);
            }
        }
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
        const apiKey = localStorage.getItem('kairos_api_key');
        if (!apiKey) {
            if (selectedCalendarDate === dateKey && dayDetailAiContent) {
                dayDetailAiContent.innerHTML = `<p class="text-muted">${tr('add_api_key_hint')}</p>`;
            }
            return;
        }

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

        const languageName = getGeminiLanguageName(userSettings.accessibility.language || 'en');
        const taskSummary = tasksForDay.map(t => `- ${t.title} [${t.completed ? 'done' : 'pending'}]`).join('\n');
        const prompt = `You are a supportive productivity coach. Here is a user's task list for ${dateKey}:\n${taskSummary}\n\nWrite a short, encouraging 1-2 sentence comment about their day in ${languageName}, since that is the user's chosen app language. Be specific about what they've completed or still need to do. Do not use markdown formatting.`;

        try {
            const cleanApiKey = apiKey.trim();
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${cleanApiKey}`;
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("Gemini insight error:", errText);
                throw new Error(`API Error ${response.status}`);
            }

            const data = await response.json();
            const commentText = data.candidates[0].content.parts[0].text.trim();

            dayInsights[dateKey] = commentText;
            if (selectedCalendarDate === dateKey && dayDetailAiContent) {
                dayDetailAiContent.innerHTML = `<p>${commentText}</p>`;
            }
            await updatePlanInFirestore();

        } catch (error) {
            console.error(error);
            if (selectedCalendarDate === dateKey && dayDetailAiContent) {
                dayDetailAiContent.innerHTML = `<p class="text-muted">${tr('insight_error')}</p>`;
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

        // Re-render anything with dynamically-generated (non data-i18n) text
        // so a language switch is reflected immediately, not just on reload.
        if (appReady) renderApp();
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
    // (ytPlayer / ytApiReadyPromise are declared near the top of this scope,
    // before applyAllSettings() runs — see comment there.)

    function extractYouTubeVideoId(input) {
        if (!input) return null;
        const trimmed = input.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed; // bare video ID
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
            // Browsers block audio autoplay without a prior user gesture —
            // if playback doesn't stick, retry on the next click.
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

    async function loadUserSettingsFromFirestore(user) {
        try {
            const ref = doc(db, 'users', user.uid);
            const snap = await getDoc(ref);
            if (snap.exists() && snap.data().settings) {
                userSettings = deepMerge(defaultSettings(), snap.data().settings);
            }
        } catch (error) {
            console.error('Error loading user settings:', error);
        }
        pendingSettings = cloneDeep(userSettings);
        localStorage.setItem('kairos_settings_cache', JSON.stringify(userSettings));
        applyAllSettings();
        populateSettingsForm();
        renderUserProfileMenu(user);
    }

    async function saveUserSettingsToFirestore() {
        const user = auth.currentUser;
        if (!user) return true;
        try {
            const ref = doc(db, 'users', user.uid);
            await setDoc(ref, { settings: userSettings }, { merge: true });
            return true;
        } catch (error) {
            console.error('Error saving user settings:', error);

            // Give a more specific hint depending on the actual Firebase error code,
            // instead of a generic message every time — makes this much faster to debug.
            const code = error?.code || '';
            let hint = 'Could not sync your settings to the cloud, but they are saved locally on this device.';
            if (code.includes('permission-denied')) {
                hint = 'Could not sync to the cloud: permission denied. Your Firestore security rules likely don\'t allow writes to the "users" collection yet. Your settings are saved locally on this device for now.';
            } else if (code.includes('invalid-argument') || code.includes('resource-exhausted') || /longer than/i.test(error?.message || '')) {
                hint = 'Could not sync to the cloud: your profile picture or background image is too large for cloud storage. Try removing/re-uploading a smaller image. Your settings are saved locally on this device for now.';
            }
            alert(hint);
            return false;
        }
    }

    function renderUserProfileMenu(user) {
        const authContainer = document.getElementById('user-auth-container');
        if (!authContainer) return;

        const userName = userSettings.profile.displayName || user.displayName || 'User';
        const userPhoto = userSettings.profile.avatarURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=a855f7&color=fff`;

        authContainer.innerHTML = `
            <button class="icon-btn" title="Reminders">🔔</button>
            <div class="user-profile-wrapper" id="profile-dropdown-toggle">
                <div class="user-profile" style="display: flex; align-items: center; gap: 8px;">
                    <img src="${userPhoto}" style="width:32px; height: 32px; border-radius:50%; object-fit: cover;">
                    <span>${userName}</span>
                    <span style="font-size: 0.7em; opacity: 0.7;">▼</span>
                </div>
                <div id="profile-dropdown-menu" class="profile-dropdown-menu">
                    <button id="dropdown-settings-btn">⚙️ Settings</button>
                    <button id="dropdown-logout-btn">Sign Out</button>
                </div>
            </div>
        `;

        const toggleWrapper = document.getElementById("profile-dropdown-toggle");
        const dropdownMenu = document.getElementById("profile-dropdown-menu");
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
    }

    function enterSettingsPage() {
        pendingSettings = cloneDeep(userSettings);
        populateSettingsForm();
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

    function populateSettingsForm() {
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
        updateSaveBarVisibility();
    }

    function updateSaveBarVisibility(forceState) {
        const bar = document.getElementById('settings-save-bar');
        if (!bar) return;
        const dirty = forceState !== undefined ? forceState : (JSON.stringify(pendingSettings) !== JSON.stringify(userSettings));
        bar.classList.toggle('active', dirty);
    }

    function renderConfigOptions() {
        const themeContainer = document.getElementById('theme-options');
        if (themeContainer) {
            themeContainer.innerHTML = THEMES.map(t => `
                <button class="swatch" data-value="${t.id}" title="${t.name}">
                    <span class="swatch-color" style="background:${t.swatch}"></span>
                    <span class="swatch-label">${t.name}</span>
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
                // "default" has no fixed hex — show it as a swatch that
                // reflects whatever the current Mode already provides.
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
            cursorContainer.innerHTML = CURSORS.map(c => `<button class="swatch cursor-swatch" data-value="${c.id}"><span class="swatch-label">${c.name}</span></button>`).join('');
            cursorContainer.querySelectorAll('.swatch').forEach(btn => {
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
                    return `<button class="swatch bg-swatch bg-swatch-custom" data-value="custom"><span class="swatch-color" style="background:var(--bg-main);">📤</span><span class="swatch-label">${b.name}</span></button>`;
                }
                const preview = b.type === 'none' ? 'none' : `url(${b.file})`;
                return `<button class="swatch bg-swatch" data-value="${b.id}" title="${b.name}">
                    <span class="swatch-color" style="background-image:${preview}; background-color: var(--bg-main);">${b.type === 'video' ? '▶' : ''}</span>
                    <span class="swatch-label">${b.name}</span>
                </button>`;
            }).join('');
            bgContainer.querySelectorAll('.swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingSettings.appearance.background = btn.dataset.value;
                    setActiveSwatch('background-options', btn.dataset.value);
                    if (btn.dataset.value !== 'custom') {
                        // Switching to a preset (or "None") means we should stop
                        // carrying the old uploaded image along in every future save.
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
            ambientContainer.innerHTML = AMBIENT_SOUNDS.map(a => `<button class="option-tile" data-value="${a.id}">${a.name}</button>`).join('');
            ambientContainer.querySelectorAll('.option-tile').forEach(btn => {
                btn.addEventListener('click', () => {
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
                    applyTranslations(btn.dataset.value); // live preview, instant
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
        el.addEventListener('input', () => {
            if (id === 'settings-display-name') pendingSettings.profile.displayName = el.value;
            if (id === 'settings-birthday') pendingSettings.profile.birthday = el.value;
            if (id === 'settings-timezone') pendingSettings.profile.timezone = el.value;
            if (id === 'settings-avatar-url') {
                pendingSettings.profile.avatarURL = el.value.trim();
                const preview = document.getElementById('settings-avatar-preview');
                if (preview && el.value.trim()) preview.src = el.value.trim();
            }
            checkDirty();
        });
    });

    const avatarFileInput = document.getElementById('settings-avatar-file');
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 700 * 1024) {
                alert(tr("alert_avatar_too_large"));
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
                alert(tr("alert_bg_too_large"));
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
            reader.readAsDataURL(file);
        });
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
    if (settingsSaveBtn) {
        settingsSaveBtn.addEventListener('click', async () => {
            settingsSaveBtn.textContent = tr('saving_ellipsis');
            settingsSaveBtn.disabled = true;

            userSettings = cloneDeep(pendingSettings);
            localStorage.setItem('kairos_settings_cache', JSON.stringify(userSettings));
            applyAllSettings();
            await saveUserSettingsToFirestore();

            const user = auth.currentUser;
            if (user) renderUserProfileMenu(user);

            updateSaveBarVisibility(false);
            settingsSaveBtn.textContent = tr('save_changes');
            settingsSaveBtn.disabled = false;
        });
    }

    const settingsCancelBtn = document.getElementById('settings-cancel-btn');
    if (settingsCancelBtn) {
        settingsCancelBtn.addEventListener('click', () => {
            pendingSettings = cloneDeep(userSettings);
            applyAllSettings();
            populateSettingsForm();
            updateSaveBarVisibility(false);
        });
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
        });
    });

    // Settings sidebar logout
    const settingsLogoutBtn = document.getElementById('settings-logout-btn');
    if (settingsLogoutBtn) {
        settingsLogoutBtn.addEventListener('click', async () => {
            try { await signOut(auth); } catch (error) { console.error('Logout failed', error); }
        });
    }

    // Security: change email
    const changeEmailBtn = document.getElementById('security-change-email-btn');
    if (changeEmailBtn) {
        changeEmailBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            const isPasswordAccount = user.providerData.some(p => p.providerId === 'password');
            if (!isPasswordAccount) {
                alert("Email changes aren't available for accounts signed in via Google, GitHub, or Microsoft.");
                return;
            }
            const newEmail = document.getElementById('security-new-email').value.trim();
            const currentPw = document.getElementById('security-email-current-pw').value;
            if (!newEmail || !currentPw) { alert('Please fill in both fields.'); return; }

            try {
                const cred = EmailAuthProvider.credential(user.email, currentPw);
                await reauthenticateWithCredential(user, cred);
                await updateEmail(user, newEmail);
                document.getElementById('settings-current-email').textContent = newEmail;
                document.getElementById('security-new-email').value = '';
                document.getElementById('security-email-current-pw').value = '';
                alert('Email updated successfully!');
            } catch (error) {
                alert('Failed to update email: ' + error.message);
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
                alert("Password changes aren't available for accounts signed in via Google, GitHub, or Microsoft.");
                return;
            }
            const currentPw = document.getElementById('security-current-pw').value;
            const newPw = document.getElementById('security-new-pw').value;
            const confirmPw = document.getElementById('security-new-pw-confirm').value;

            if (!currentPw || !newPw || !confirmPw) { alert('Please fill in all password fields.'); return; }
            if (newPw !== confirmPw) { alert('New passwords do not match.'); return; }
            if (newPw.length < 6) { alert('New password must be at least 6 characters.'); return; }

            try {
                const cred = EmailAuthProvider.credential(user.email, currentPw);
                await reauthenticateWithCredential(user, cred);
                await updatePassword(user, newPw);
                document.getElementById('security-current-pw').value = '';
                document.getElementById('security-new-pw').value = '';
                document.getElementById('security-new-pw-confirm').value = '';
                alert('Password updated successfully!');
            } catch (error) {
                alert('Failed to update password: ' + error.message);
            }
        });
    }

    // Privacy: export data
    const exportBtn = document.getElementById('privacy-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const exportObj = {
                exportedAt: new Date().toISOString(),
                boards: boardsData,
                dayInsights: dayInsights,
                settings: userSettings
            };
            const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kairos-data-export-${toDateKey(new Date())}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    }

    // Privacy: delete account
    const deleteBtn = document.getElementById('privacy-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            if (!confirm(tr('confirm_delete_account'))) return;
            const typed = prompt(tr('prompt_type_delete'));
            if (typed !== 'DELETE') return;

            try {
                const plansColRef = collection(db, 'study_plans');
                const q = query(plansColRef, where('userID', '==', user.uid));
                const snap = await getDocs(q);
                await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'study_plans', d.id))));
                await deleteDoc(doc(db, 'users', user.uid)).catch(() => {});

                await deleteUser(user);

                localStorage.removeItem('kairos_settings_cache');
                localStorage.removeItem('kairos_api_key');
                alert(tr('alert_account_deleted'));
                window.location.href = 'login.html';
            } catch (error) {
                console.error(error);
                alert('Could not delete your account: ' + error.message + '\n\nFor security, Firebase may require a recent sign-in before allowing account deletion. Try logging out, logging back in, then retrying.');
            }
        });
    }

    renderConfigOptions();
    populateSettingsForm();

    appReady = true;
    renderApp();
});