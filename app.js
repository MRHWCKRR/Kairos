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
            // Wipe active classes from everything first
            navItems.forEach(item => item.classList.remove("active"));
            pageViews.forEach(page => page.classList.remove("active"));
            
            // Add active class to clicked button
            button.classList.add("active");

            // Find and activate the matching page
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

    // --- 4. Checklist Interaction Logic ---
    const taskCheckboxes = document.querySelectorAll(".task-item input[type='checkbox']");
    taskCheckboxes.forEach(checkbox => {
        checkbox.addEventListener("change", (e) => {
            const taskItem = e.target.closest(".task-item");
            if (e.target.checked) {
                taskItem.classList.add("completed");
            } else {
                taskItem.classList.remove("completed");
            }
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