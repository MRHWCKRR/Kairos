document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Sidebar Collapse Logic ---
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
        });
    }

    // --- 2. Tab Switching Logic ---
    const navItems = document.querySelectorAll(".nav-item");
    const pageViews = document.querySelectorAll(".page-view");

    navItems.forEach(button => {
        button.addEventListener("click", () => {
            navItems.forEach(item => item.classList.remove("active"));
            pageViews.forEach(page => page.classList.remove("active"));
            
            button.classList.add("active");

            const targetPageId = button.getAttribute("data-target");
            const targetPage = document.getElementById(targetPageId);
            
            if (targetPage) {
                targetPage.classList.add("active");
            }
        });
    });

    // --- 3. Live Dashboard Clock ---
    function updateClock() {
        const timeElement = document.getElementById("live-time");
        const dateElement = document.getElementById("live-date");
        
        if (timeElement && dateElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString('en-US', { 
                hour: 'numeric', minute: '2-digit', hour12: true 
            });
            dateElement.textContent = now.toLocaleDateString('en-US', { 
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
            });
        }
    }
    updateClock();
    setInterval(updateClock, 60000);


    // --- 4. Checklist & Progress Bar Logic ---
    const taskCheckboxes = document.querySelectorAll(".task-item input[type='checkbox']");
    
    // NEW: Function to calculate and update the visual progress bar
    function updateRoutineStats() {
        // 1. Get total number of checkboxes
        const totalTasks = taskCheckboxes.length;
        
        // 2. Filter down to only the ones that are currently checked
        const completedTasks = Array.from(taskCheckboxes).filter(cb => cb.checked).length;
        
        // 3. Do the math to get the percentage (Handle 0 tasks to avoid dividing by zero)
        const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        // 4. Find the HTML elements we need to update
        const percentageText = document.getElementById("stats-percentage");
        const fractionText = document.getElementById("stats-fraction");
        const fillBar = document.getElementById("progress-bar-fill");

        // 5. Inject the new values into the HTML
        if (percentageText && fractionText && fillBar) {
            percentageText.textContent = `${percentage}%`;
            fractionText.textContent = `${completedTasks} / ${totalTasks} tasks completed`;
            fillBar.style.width = `${percentage}%`; // Changes the CSS width dynamically
        }
    }

    // Run it once immediately when the page loads to set the initial 0% state
    updateRoutineStats();

    taskCheckboxes.forEach(checkbox => {
        checkbox.addEventListener("change", (e) => {
            const taskItem = e.target.closest(".task-item");
            if (e.target.checked) {
                taskItem.classList.add("completed");
            } else {
                taskItem.classList.remove("completed");
            }
            
            // NEW: Every time a checkbox is clicked, recalculate the stats
            updateRoutineStats();
        });
    });

    // --- 5. Local Storage (API Key) ---
    const apiKeyInput = document.getElementById("api-key-input");
    const saveSettingsBtn = document.getElementById("save-settings-btn");

    if (apiKeyInput && saveSettingsBtn) {
        const savedKey = localStorage.getItem("kairos_api_key");
        if (savedKey) { apiKeyInput.value = savedKey; }

        saveSettingsBtn.addEventListener("click", () => {
            const key = apiKeyInput.value.trim();
            if (key !== "") {
                localStorage.setItem("kairos_api_key", key);
                const originalText = saveSettingsBtn.innerText;
                saveSettingsBtn.innerText = "Key Saved! ✓";
                saveSettingsBtn.style.backgroundColor = "#22c55e";

                setTimeout(() => {
                    saveSettingsBtn.innerText = originalText;
                    saveSettingsBtn.style.backgroundColor = "var(--accent-glow)";
                }, 2000);
            }
        });
    }
});