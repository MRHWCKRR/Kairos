document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. UI Navigation & Clock (Kept Intact) ---
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
        });
    });

    function updateClock() {
        const timeElement = document.getElementById("live-time");
        const dateElement = document.getElementById("live-date");
        if (timeElement && dateElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            dateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
    }
    updateClock();
    setInterval(updateClock, 60000);

    // --- 2. THE DATA ENGINE (The "Brain") ---
    // NEW: Instead of hardcoded HTML, we store your routines here. 
    // Later, the AI will just push new sections into this array!
    let routinesData = [
        {
            id: 'sec-1',
            title: 'Morning Setup',
            tasks: [
                { id: 't-1', title: 'Review AI flashcards', completed: false },
                { id: 't-2', title: 'Draft English essay outline', completed: false }
            ]
        },
        {
            id: 'sec-2',
            title: 'Afternoon Deep Work',
            tasks: [
                { id: 't-3', title: 'Read Chapter 4', completed: false },
                { id: 't-4', title: 'Complete Math worksheet', completed: false },
                { id: 't-5', title: 'Upload assignment', completed: false }
            ]
        }
    ];

    // --- 3. RENDERING ENGINE ---
    const focusContainer = document.getElementById("dashboard-focus-container");
    const managerContainer = document.getElementById("tasks-manager-container");

    // NEW: Generates the HTML for a single task
    function createTaskHTML(task, sectionId) {
        return `
            <li class="task-item ${task.completed ? 'completed' : ''}">
                <label class="custom-checkbox">
                    <input type="checkbox" data-section="${sectionId}" data-task="${task.id}" ${task.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
                <input type="text" class="task-text" value="${task.title}" readonly>
            </li>
        `;
    }

    // NEW: Paints the entire app based on the Data Engine
    function renderApp() {
        renderFocusMode();
        renderManagerMode();
        updateRoutineStats();
    }

    // NEW: Dashboard sync - Finds the FIRST section that isn't 100% complete
    function renderFocusMode() {
        if (!focusContainer) return;

        const activeSection = routinesData.find(section => section.tasks.some(task => !task.completed));

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
            // All Done State!
            focusContainer.innerHTML = `
                <div class="fade-in-section all-done-state">
                    <span class="all-done-icon">🎉</span>
                    <h3>You're all caught up!</h3>
                    <p class="text-muted">Take a break or plan your next routine.</p>
                </div>
            `;
        }
    }

    // NEW: Manager sync - Renders EVERYTHING for the Tasks tab
    function renderManagerMode() {
        if (!managerContainer) return;

        let managerHTML = routinesData.map(section => {
            let tasksHTML = section.tasks.map(task => createTaskHTML(task, section.id)).join('');
            return `
                <div class="manager-section fade-in-section">
                    <div class="checklist-header">
                        <h3 class="editable-title" spellcheck="false">${section.title}</h3>
                    </div>
                    <ul class="task-list">
                        ${tasksHTML}
                    </ul>
                </div>
            `;
        }).join('');

        managerContainer.innerHTML = managerHTML || `<p class="text-muted">No routines created yet.</p>`;
    }

    // --- 4. INTERACTION & STATS ---

    // --- 4. INTERACTION & STATS ---

    // Uses Event Delegation to listen for clicks on any checkbox
    document.body.addEventListener('change', (e) => {
        if (e.target.matches("input[type='checkbox'][data-task]")) {
            const sectionId = e.target.getAttribute('data-section');
            const taskId = e.target.getAttribute('data-task');
            const isChecked = e.target.checked;

            // 1. Update the Data Engine
            const section = routinesData.find(s => s.id === sectionId);
            const task = section.tasks.find(t => t.id === taskId);
            task.completed = isChecked;

            // 2. BUG FIX: Find ALL instances of this task on the screen (Dashboard & Manager) 
            // and sync them instantly so the smooth CSS animations still play.
            const identicalCheckboxes = document.querySelectorAll(`input[data-task='${taskId}']`);
            identicalCheckboxes.forEach(cb => {
                cb.checked = isChecked;
                const taskItem = cb.closest('.task-item');
                if (isChecked) {
                    taskItem.classList.add('completed');
                } else {
                    taskItem.classList.remove('completed');
                }
            });

            // 3. Update global stats
            updateRoutineStats();

            // 4. Handle section completion and Dashboard sliding
            const isSectionFinished = section.tasks.every(t => t.completed);
            
            if (isSectionFinished && isChecked) {
                // Trigger Dopamine Hit (Confetti)
                if (window.confetti) {
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#a855f7', '#ffffff'] });
                }
                
                // Wait for the animation, then advance the Dashboard
                setTimeout(() => {
                    renderApp(); 
                }, 600);
            } else {
                // BUG FIX: If you uncheck a past task, the Dashboard needs to evaluate if it 
                // should slide backwards to show the now-incomplete section!
                // We add a tiny delay so you can see your click animate before the UI calculates.
                setTimeout(() => {
                    renderFocusMode();
                }, 400);
            }
        }
    });

    function updateRoutineStats() {
        let totalTasks = 0;
        let completedTasks = 0;

        routinesData.forEach(section => {
            totalTasks += section.tasks.length;
            completedTasks += section.tasks.filter(t => t.completed).length;
        });

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

    // --- 5. INITIALIZE ---
    renderApp();

    // --- 6. Local Storage (API Key) ---
    const apiKeyInput = document.getElementById("api-key-input");
    const saveSettingsBtn = document.getElementById("save-settings-btn");

    if (apiKeyInput && saveSettingsBtn) {
        const savedKey = localStorage.getItem("kairos_api_key");
        if (savedKey) { apiKeyInput.value = savedKey; }

        saveSettingsBtn.addEventListener("click", () => {
            const key = apiKeyInput.value.trim();
            if (key !== "") {
                localStorage.setItem("kairos_api_key", key);
                saveSettingsBtn.innerText = "Key Saved! ✓";
                saveSettingsBtn.style.backgroundColor = "#22c55e";
                setTimeout(() => {
                    saveSettingsBtn.innerText = "Save Keys";
                    saveSettingsBtn.style.backgroundColor = "var(--accent-glow)";
                }, 2000);
            }
        });
    }
});