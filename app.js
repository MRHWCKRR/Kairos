import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
console.log("APP.js is loaded and running");

document.addEventListener("DOMContentLoaded", () => {

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.log("No user detected. Redirecting to login...");
            window.location.replace("login.html");
            return; 
        }

        console.log("User is logged in:", user.email);

        loadLatestPlanFromFirestore(user);
        
        const authContainer = document.getElementById('user-auth-container');
        if (authContainer) {
            const userName = user.displayName || "User";
            const userPhoto = user.photoURL || `https://ui-avatars.com/api/?name=${userName}&background=a855f7&color=fff`;
            
            authContainer.innerHTML = `
                <div class="user-profile-wrapper" id="profile-dropdown-toggle">
                    <div class="user-profile" style="display: flex; align-items: center; gap: 8px;">
                        <img src="${userPhoto}" style="width:32px; height: 32px; border-radius:50%;">
                        <span>${userName}</span>
                        <span style="font-size: 0.7em; opacity: 0.7;">▼</span>
                    </div>
                    
                    <div id="profile-dropdown-menu" class="profile-dropdown-menu">
                        <button id="dropdown-logout-btn">Sign Out</button>
                    </div>
                </div>
            `;
            
            const toggleWrapper = document.getElementById("profile-dropdown-toggle");
            const dropdownMenu = document.getElementById("profile-dropdown-menu");
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

            logoutBtn.addEventListener("click", async () => {
                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Logout Failed", error);
                }
            });
        }
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

    // --- 2 Data Engine ---
    let currentPlanDocId = null;
    let routinesData = [
        {
            id: 'sec-1',
            title: 'Morning Setup',
            tasks: [
                { id: 't-1', title: 'Review Study flashcards', completed: false },
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

    // --- 3 Rendering engine ---
    const focusContainer = document.getElementById("dashboard-focus-container");
    const managerContainer = document.getElementById("tasks-manager-container");

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

    function renderApp() {
        renderFocusMode();
        renderManagerMode();
        updateRoutineStats();
        updateWhatsNextWidget();
    }

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
            focusContainer.innerHTML = `
                <div class="fade-in-section all-done-state">
                    <span class="all-done-icon">🎉</span>
                    <h3>You're all caught up!</h3>
                    <p class="text-muted">Take a break or plan your next routine.</p>
                </div>
            `;
        }
    }

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

    // --- 4 stats and stuff ---
    document.body.addEventListener('change', (e) => {
        if (e.target.matches("input[type='checkbox'][data-task]")) {
            const sectionId = e.target.getAttribute('data-section');
            const taskId = e.target.getAttribute('data-task');
            const isChecked = e.target.checked;

            const section = routinesData.find(s => s.id === sectionId);
            const task = section.tasks.find(t => t.id === taskId);
            task.completed = isChecked;

            const identicalCheckboxes = document.querySelectorAll(`input[data-task='${taskId}']`);
            identicalCheckboxes.forEach(cb => {
                cb.checked = isChecked;
                const taskItem = cb.closest('.task-item');
                if (taskItem) {
                    if (isChecked) {
                        taskItem.classList.add('completed');
                    } else {
                        taskItem.classList.remove('completed');
                    }
                }
            });

            updateRoutineStats();
            updatePlanInFirestore();
            renderApp();

            const isSectionFinished = section.tasks.every(t => t.completed);
            if (isSectionFinished && isChecked) {
                if (window.confetti) {
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#a855f7', '#ffffff'] });
                }
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

    renderApp();

    // Whats Next Widget
    function updateWhatsNextWidget() {
        const container = document.getElementById('whats-next-content');
        if (!container) return;

        let nextTask = null;
        let activeSectionTitle = "";

        for (const section of routinesData) { 
            const incompleteTask = section.tasks.find(t => !t.completed);
            if (incompleteTask) {
                nextTask = incompleteTask;
                activeSectionTitle = section.title;
                break;
            }
        }

        if (nextTask) {
            container.innerHTML = `
                <div class="whats-next-card" style="
                    background: #1e1e2d;
                    border: 1px solid #313145;
                    padding: 16px; 
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                    width: 100%; 
                    box-sizing: border-box;
                    overflow: hidden;
                ">
                    <h4 style="
                        margin: 0 0 16px 0; 
                        font-size: 1.05rem; 
                        color: #ffffff; 
                        line-height: 1.4;
                        font-weight: 500;
                        white-space: normal;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    ">${nextTask.title}</h4>
                    <button class="complete-next-btn" data-task-id="${nextTask.id}" data-section-id="${routinesData.find(s => s.title === activeSectionTitle).id}"
                        style="
                            background: #a855f7; 
                            border: none; 
                            color: white; 
                            padding: 10px 0; 
                            width: 100%;
                            border-radius: 6px; 
                            font-weight: 600; 
                            cursor: pointer; 
                            font-size: 0.85rem; 
                            transition: background 0.2s ease;
                        "
                        onmouseover="this.style.background='#9333ea'"
                        onmouseout="this.style.background='#a855f7'">
                        Mark as Done
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
                <div class="whats-next-empty" style="
                    text-align: center; 
                    padding: 24px 16px; 
                    background: #1e1e2d;
                    border: 1px dashed #313145;
                    border-radius: 12px;
                    color: #71717a;
                    word-wrap: break-word;
                ">
                    <div style="font-size: 1.5rem; margin-bottom: 8px;">✨</div>
                    <p style="margin: 0; font-size: 0.9rem; color: #4ade80; font-weight: 600;">All caught up!</p>
                </div>
            `;
        }
    }

    function triggerTaskCompletion(sectionId, taskId) {
        const section = routinesData.find(s => s.id === sectionId);
        if (section) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) {
                task.completed = true;

                renderApp();
                updateRoutineStats();
                updatePlanInFirestore();
                updateWhatsNextWidget();
            }
        }
    }

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

    async function savePlanToFirestore(planData) {
        const user = auth.currentUser;
        if (!user) {
            console.error("Cannot save plan: no user signed in.");
            return;
        }

        try {
            const plansColRef = collection(db, "study_plans");
            const docRef = await addDoc(plansColRef, {
                sections: planData,
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
        if(!currentPlanDocId) {
            console.warn("No active plan doc ID found. Cannot sync progress.");
            return;
        }
        try {
            const planDocRef = doc(db, "study_plans", currentPlanDocId);
            await updateDoc(planDocRef, {
                sections: routinesData
            });
            console.log("Task progress successfully synced to Firestore.");
        } catch (error) {
            console.error("Error syncing task progress:", error);
        }
    }


    async function loadLatestPlanFromFirestore(user) {
        try {
            const plansColRef = collection(db, "study_plans");
            const q = query(
                plansColRef,
                where("userID", "==", user.uid)
            );
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
                routinesData = latestPlan.sections;

                console.log("Successfully loaded latest study plan from Firestore!");
                
                renderApp();
            } else {
                console.log("No saved study plans found in Firestore. Using default placeholder routines.");
            }
        } catch (error) {
            console.error("Error loading plans from Firestore:", error);
        }
    }


    // AI Stuff
    const aiInput = document.getElementById("ai-input");
    const aiGenerateBtn = document.getElementById("ai-generate-btn");

    if (aiInput && aiGenerateBtn) {
        aiGenerateBtn.addEventListener("click", async () => {
            const assignmentText = aiInput.value.trim();
            const apiKey = localStorage.getItem("kairos_api_key");

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

            const systemPrompt = `
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
                    });
                });

                routinesData = newSections;

                savePlanToFirestore(newSections);

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

    // --- 8. modal for help ---
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

    function createTaskHTML(task, sectionId) {
        return `
            <li class="task-item ${task.completed ? 'completed' : ''}">
                <label class="custom-checkbox">
                    <input type="checkbox" data-section="${sectionId}" data-task="${task.id}" ${task.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
                <input type="text" class="task-text" data-section="${sectionId}" data-task="${task.id}" value="${task.title}">
            </li>
        `;
    }

    document.body.addEventListener('blur', (e) => {
    if (e.target.classList.contains('task-text')) {
        const sectionId = e.target.getAttribute('data-section');
        const taskId = e.target.getAttribute('data-task');
        const newTitle = e.target.value.trim();

        const section = routinesData.find(s => s.id === sectionId);
        const task = section ? section.tasks.find(t => t.id === taskId) : null;

        if (task && task.title !== newTitle) {
            task.title = newTitle;

            updatePlanInFirestore();
            
            updateWhatsNextWidget();
        }
    }
}, true);

});