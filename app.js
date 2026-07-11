document.addEventListener("DOMContentLoaded", () => {
    

    // sidebar collapse stuff
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
        });
    }


    // tab logic
    // Bug was here. Fixed it by fixing a typo lol
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

    // localstorage stuff

    const apiKeyInput = document.getElementById("api-key-input");
    const saveSettingsBtn = document.getElementById("save-settings-btn");

    if (apiKeyInput && saveSettingsBtn) {
        //check if key was already saved
        const savedKey = localStorage.getItem("kairos_api_key");
        if (savedKey) {
            apiKeyInput.value = savedKey;
        }

        // Save the key button
        saveSettingsBtn.addEventListener("click", () => {
            const key = apiKeyInput.value.trim();
            if (key !== "") {
                localStorage.setItem("kairos_api_key", key);

                // visual shenanigans
                const originalText = saveSettingsBtn.innerText;
                saveSettingsBtn.innerText = "Key Saved! ✓";
                saveSettingsBtn.style.backgroundColor = "#22c55e";

                setTimeout(() => {
                    saveSettingsBtn.innerText = originalText;
                    saveSettingsBtn.style.backgroundColor = "var(--accent-glow)";
                }, 2000);
            }
        })
    }
});