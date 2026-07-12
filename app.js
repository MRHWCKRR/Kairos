console.log("APP.js is loaded and running")
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth } from './firebase.js';
import { singInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

    // AI Stuff

    const aiInput = document.getElementById("ai-input");
    const aiGenerateBtn = document.getElementById("ai-generate-btn");

    if (aiInput && aiGenerateBtn) {
        aiGenerateBtn.addEventListener("click", async () => {
            const assignmentText = aiInput.value.trim();
            const apiKey = localStorage.getItem("kairos_api_key");

            // checking if the keys there cuz like some people are...forgetful (cant relate mhmhm)
            if (!apiKey) {
                alert("Please go to Settings and save your Gemini API Key first!");
                return;
            }
            if (!assignmentText) {
                alert("Empty input, please put your assignment details or a syllabus in first!");
                return;
            }


            const originalBtnText = aiGenerateBtn.innerText;
            aiGenerateBtn.innerText = "Generating Plan...";
            aiGenerateBtn.disabled = true;
            aiGenerateBtn.style.opacity = "0.7";

            // Prompt:
            const systemPrompt = `
            You are an expert AI Study Coach. The user will provide a syllabus, assignment, or goal. 
You are an expert AI Study Coach. The user will provide a syllabus, assignment, or goal. 
Break it down into logical, actionable study sections and tasks.

CRITICAL INSTRUCTION: You MUST respond with ONLY a valid, raw JSON array. 
Do NOT include markdown formatting, backticks, or the word 'json'. 
Just the raw array.

Use this exact structure:
[
  {
    "id": "gen-sec-1",
    "title": "Phase 1: Research",
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
                // 4. Connect to Gemini's API (updated to 2.5 flash to test)
                const cleanApiKey = apiKey.trim(); 
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${cleanApiKey}`;
                
                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt }] }]
                    })
                });

                // Debug stuff cuz i cant seem to figure it out
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
                        task.completed = false; // ensure they start unchecked
                    });
                });

                routinesData = newSections;

                renderApp();

                aiInput.value = "";
                document.querySelector('[data-target="tasks-page"]').click();

            } catch (error) {
                console.error(error);
                alert("Whoops! Something went terribly wrong generating the plan. Make sure your API key is correct. Check console for more details.");
            } finally {
                aiGenerateBtn.innerText = originalBtnText;
                aiGenerateBtn.disabled = false;
                aiGenerateBtn.style.opacity = "1";
            }
        });
    }

    // --- 8. MODAL LOGIC (Robust Delegation) ---
    document.body.addEventListener("click", (e) => {
        // Find the closest element that matches our IDs
        const openBtn = e.target.closest("#open-api-modal");
        const closeBtn = e.target.closest("#close-api-modal");
        const modal = document.getElementById("api-guide-modal");

        // 1. Open
        if (openBtn) {
            e.preventDefault();
            console.log("Open button clicked/found via closest()");
            if (modal) modal.classList.add("active");
        }

        // 2. Close
        if (closeBtn) {
            if (modal) modal.classList.remove("active");
        }

        // 3. Close on background click
        if (e.target.classList.contains("modal-overlay")) {
            if (modal) modal.classList.remove("active");
        }
    });

    // Login Stuff

    document.getElementById('login-btn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
            document.getElementById('auth-modal').classList.remove('active');
            console.log("Logged In");
        } catch (error) {
            alert("Login failed: " + error.message);
        }
    })

    // Signup Stuff

    document.getElementById('signup-btn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            document.getElementById('auth-modal').classList.remove('active');
            console.log("Account created!");
        } catch (error) {
            alert("Sign up failed: " + error.message);
        }
    });   
});






// First startup stuff login
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('auth-modal').classList.add('active');
});