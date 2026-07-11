document.addEventListener('DOMContentLoaded', function() {

    const sidebar = document.getelementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");

    sidebarToggle.addEventListener("click", () => {

        sidebar.classList.toggle("collapsed");
    });


    const navItems = document.querySelectorAll(".nav-item");
    const pageViews = document.querySelectorAll(".page-view");

    navItems.forEach((button) => {
        button.addEventListener("click", () => {

            navItems.forEach(item => item.classList.remove("active"));
            button.classList.add("active");
            pageViews.forEach(page => page.classList.remove("active"));

            const targetPageId = button.getAttribute("data-target");

            const activePage = document.getElementById(targetPageId);
            if (activePage) {
                activePage.classList.add("active");
            }
        });
    });

    const apiKeysInput = document.getElementById("api-keys-input");
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    const savedKey = localStorage.getItem("kairos_api_key");
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }

    saveSettingsBtn.addEventListener("click", () => {
        const key = apiKeyInput.value.trim();
        if (key !=="") {
            localStorage.setItem("kairos_api_key");

            const originalText = saveSettingsBtn.innerText;
            saveSettingsBtn.innerText = "Key Saved! ✓";
            saveSettingsBtn.style.backgroundColor = "#22c55e";

            setTimeout(() => {
                saveSettingsBtn.innerText = originalText;
                saveSettingsBtn.style.backgroundColor = "var(--accent-glow";
            }, 2000);
        }
    });
});