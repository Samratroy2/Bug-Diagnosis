/* =========================================================
   BUGAI SETTINGS
   ========================================================= */

import {
    auth,
    signOut
} from "../firebase.js";


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeSettings();

        initializeSidebar();

        initializeLogout();

    }
);


/* =========================================================
   LOGOUT
   ========================================================= */

function initializeLogout() {

    const logoutButton =
        document.getElementById("logoutButton");

    if (!logoutButton) {
        return;
    }


    logoutButton.addEventListener(
        "click",
        async () => {

            const confirmed =
                window.confirm(
                    "Are you sure you want to logout?"
                );


            if (!confirmed) {
                return;
            }


            logoutButton.disabled = true;

            logoutButton.classList.add(
                "logging-out"
            );


            try {

                /*
                 * Firebase authentication is handled
                 * through the shared firebase.js file.
                 */
                await signOut(auth);


                /*
                 * Redirect to the separate login page.
                 */
                window.location.href =
                    "../Login/login.html";


            } catch (error) {

                console.error(
                    "Logout failed:",
                    error
                );


                logoutButton.disabled = false;

                logoutButton.classList.remove(
                    "logging-out"
                );


                showStatus(
                    "Logout failed. Please try again."
                );

            }

        }
    );

}


/* =========================================================
   SIDEBAR
   ========================================================= */

function initializeSidebar() {

    const sidebar =
        document.getElementById(
            "bugaiSidebar"
        );


    const button =
        document.getElementById(
            "sidebarMenuButton"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if (
        !sidebar ||
        !button ||
        !overlay
    ) {
        return;
    }


    const closeSidebar = () => {

        sidebar.classList.remove(
            "open"
        );


        overlay.classList.remove(
            "show"
        );


        button.setAttribute(
            "aria-expanded",
            "false"
        );


        document.body.classList.remove(
            "sidebar-open"
        );

    };


    button.addEventListener(
        "click",
        () => {

            const isOpen =
                sidebar.classList.toggle(
                    "open"
                );


            overlay.classList.toggle(
                "show",
                isOpen
            );


            button.setAttribute(
                "aria-expanded",
                String(isOpen)
            );


            document.body.classList.toggle(
                "sidebar-open",
                isOpen
            );

        }
    );


    overlay.addEventListener(
        "click",
        closeSidebar
    );


    document.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key === "Escape"
            ) {

                closeSidebar();

            }

        }
    );


    window.addEventListener(
        "resize",
        () => {

            if (
                window.innerWidth > 900
            ) {

                closeSidebar();

            }

        }
    );

}


/* =========================================================
   DEFAULT SETTINGS
   ========================================================= */

const DEFAULT_SETTINGS = {

    theme: "light",

    notifications: true,

    sound: true,

    autoResults: true,

    analysisMode: "standard",

    history: true,

    confirmReset: true

};


/* =========================================================
   GET SETTINGS
   ========================================================= */

function getSettings() {

    const saved =
        localStorage.getItem(
            "bugai-settings"
        );


    if (!saved) {

        return {
            ...DEFAULT_SETTINGS
        };

    }


    try {

        return {

            ...DEFAULT_SETTINGS,

            ...JSON.parse(saved)

        };

    } catch (error) {

        console.error(
            "Unable to load BugAI settings:",
            error
        );


        return {
            ...DEFAULT_SETTINGS
        };

    }

}


/* =========================================================
   SAVE SETTINGS
   ========================================================= */

function saveSettings(settings) {

    localStorage.setItem(
        "bugai-settings",
        JSON.stringify(settings)
    );


    /*
     * Keep individual storage keys for compatibility
     * with other BugAI pages.
     */

    localStorage.setItem(
        "bugai-theme",
        settings.theme
    );


    localStorage.setItem(
        "bugai-notifications",
        settings.notifications
    );


    localStorage.setItem(
        "bugai-sound",
        settings.sound
    );


    localStorage.setItem(
        "bugai-auto-results",
        settings.autoResults
    );

}


/* =========================================================
   INITIALIZE SETTINGS
   ========================================================= */

function initializeSettings() {

    const settings =
        getSettings();


    applyTheme(
        settings.theme
    );


    const notificationToggle =
        document.getElementById(
            "notificationToggle"
        );


    const soundToggle =
        document.getElementById(
            "soundToggle"
        );


    const autoResultToggle =
        document.getElementById(
            "autoResultToggle"
        );


    const historyToggle =
        document.getElementById(
            "historyToggle"
        );


    const confirmResetToggle =
        document.getElementById(
            "confirmResetToggle"
        );


    const analysisMode =
        document.getElementById(
            "analysisMode"
        );


    if (notificationToggle) {

        notificationToggle.checked =
            settings.notifications;

    }


    if (soundToggle) {

        soundToggle.checked =
            settings.sound;

    }


    if (autoResultToggle) {

        autoResultToggle.checked =
            settings.autoResults;

    }


    if (historyToggle) {

        historyToggle.checked =
            settings.history;

    }


    if (confirmResetToggle) {

        confirmResetToggle.checked =
            settings.confirmReset;

    }


    if (analysisMode) {

        analysisMode.value =
            settings.analysisMode;

    }


    updateThemeButtons(
        settings.theme
    );


    setupEventListeners();

}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {

    /*
     * Theme
     */

    const themeButtons =
        document.querySelectorAll(
            ".appearance-option"
        );


    themeButtons.forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    const theme =
                        button.dataset.theme;


                    if (!theme) {
                        return;
                    }


                    const settings =
                        getSettings();


                    settings.theme =
                        theme;


                    saveSettings(
                        settings
                    );


                    applyTheme(
                        theme
                    );


                    updateThemeButtons(
                        theme
                    );


                    showStatus(
                        "Appearance updated"
                    );

                }
            );

        }
    );


    /*
     * Notifications
     */

    document
        .getElementById(
            "notificationToggle"
        )
        ?.addEventListener(
            "change",
            (event) => {

                const settings =
                    getSettings();


                settings.notifications =
                    event.target.checked;


                saveSettings(
                    settings
                );


                showStatus(
                    event.target.checked
                        ? "Notifications enabled"
                        : "Notifications disabled"
                );

            }
        );


    /*
     * Sound
     */

    document
        .getElementById(
            "soundToggle"
        )
        ?.addEventListener(
            "change",
            (event) => {

                const settings =
                    getSettings();


                settings.sound =
                    event.target.checked;


                saveSettings(
                    settings
                );


                showStatus(
                    event.target.checked
                        ? "Sound enabled"
                        : "Sound disabled"
                );

            }
        );


    /*
     * Automatic Results
     */

    document
        .getElementById(
            "autoResultToggle"
        )
        ?.addEventListener(
            "change",
            (event) => {

                const settings =
                    getSettings();


                settings.autoResults =
                    event.target.checked;


                saveSettings(
                    settings
                );


                showStatus(
                    event.target.checked
                        ? "Automatic results enabled"
                        : "Automatic results disabled"
                );

            }
        );


    /*
     * Analysis Mode
     */

    document
        .getElementById(
            "analysisMode"
        )
        ?.addEventListener(
            "change",
            (event) => {

                const settings =
                    getSettings();


                settings.analysisMode =
                    event.target.value;


                saveSettings(
                    settings
                );


                showStatus(
                    "Analysis mode updated"
                );

            }
        );


    /*
     * History
     */

    document
        .getElementById(
            "historyToggle"
        )
        ?.addEventListener(
            "change",
            (event) => {

                const settings =
                    getSettings();


                settings.history =
                    event.target.checked;


                saveSettings(
                    settings
                );


                showStatus(
                    event.target.checked
                        ? "Analysis history enabled"
                        : "Analysis history disabled"
                );

            }
        );


    /*
     * Confirm Reset
     */

    document
        .getElementById(
            "confirmResetToggle"
        )
        ?.addEventListener(
            "change",
            (event) => {

                const settings =
                    getSettings();


                settings.confirmReset =
                    event.target.checked;


                saveSettings(
                    settings
                );


                showStatus(
                    "Reset preference updated"
                );

            }
        );


    /*
     * Reset
     */

    document
        .getElementById(
            "resetSettings"
        )
        ?.addEventListener(
            "click",
            resetAllSettings
        );

}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme) {

    const prefersDark =
        window.matchMedia &&
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;


    const isDark =
        theme === "dark" ||
        (
            theme === "system" &&
            prefersDark
        );


    document.documentElement.classList.toggle(
        "dark-mode",
        isDark
    );


    document.documentElement.classList.toggle(
        "dark",
        isDark
    );


    if (document.body) {

        document.body.classList.toggle(
            "dark-mode",
            isDark
        );


        document.body.classList.toggle(
            "dark",
            isDark
        );

    }

}


/* =========================================================
   THEME BUTTON STATE
   ========================================================= */

function updateThemeButtons(theme) {

    document
        .querySelectorAll(
            ".appearance-option"
        )
        .forEach(
            (button) => {

                button.classList.toggle(
                    "selected",
                    button.dataset.theme === theme
                );

            }
        );

}


/* =========================================================
   RESET SETTINGS
   ========================================================= */

function resetAllSettings() {

    const settings =
        getSettings();


    if (settings.confirmReset) {

        const confirmed =
            window.confirm(
                "Are you sure you want to reset all BugAI settings to their default values?"
            );


        if (!confirmed) {
            return;
        }

    }


    const defaults = {
        ...DEFAULT_SETTINGS
    };


    saveSettings(
        defaults
    );


    applyTheme(
        defaults.theme
    );


    updateThemeButtons(
        defaults.theme
    );


    const notificationToggle =
        document.getElementById(
            "notificationToggle"
        );


    const soundToggle =
        document.getElementById(
            "soundToggle"
        );


    const autoResultToggle =
        document.getElementById(
            "autoResultToggle"
        );


    const historyToggle =
        document.getElementById(
            "historyToggle"
        );


    const confirmResetToggle =
        document.getElementById(
            "confirmResetToggle"
        );


    const analysisMode =
        document.getElementById(
            "analysisMode"
        );


    if (notificationToggle) {

        notificationToggle.checked =
            defaults.notifications;

    }


    if (soundToggle) {

        soundToggle.checked =
            defaults.sound;

    }


    if (autoResultToggle) {

        autoResultToggle.checked =
            defaults.autoResults;

    }


    if (historyToggle) {

        historyToggle.checked =
            defaults.history;

    }


    if (confirmResetToggle) {

        confirmResetToggle.checked =
            defaults.confirmReset;

    }


    if (analysisMode) {

        analysisMode.value =
            defaults.analysisMode;

    }


    showStatus(
        "Settings restored to default"
    );

}


/* =========================================================
   STATUS MESSAGE
   ========================================================= */

function showStatus(message) {

    const status =
        document.getElementById(
            "saveStatus"
        );


    if (!status) {
        return;
    }


    status.textContent =
        "✓ " + message;


    status.style.opacity =
        "1";


    clearTimeout(
        window.bugAIStatusTimer
    );


    window.bugAIStatusTimer =
        setTimeout(
            () => {

                status.textContent =
                    "✓ Settings are automatically saved";

            },
            2200
        );

}


/* =========================================================
   CROSS-PAGE THEME SYNC
   ========================================================= */

window.addEventListener(
    "storage",
    (event) => {

        if (
            event.key === "bugai-settings" ||
            event.key === "bugai-theme"
        ) {

            const settings =
                getSettings();


            applyTheme(
                settings.theme
            );


            updateThemeButtons(
                settings.theme
            );

        }

    }
);


/* =========================================================
   SYSTEM THEME CHANGE
   ========================================================= */

if (window.matchMedia) {

    const mediaQuery =
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        );


    const handleSystemThemeChange = () => {

        const settings =
            getSettings();


        if (
            settings.theme === "system"
        ) {

            applyTheme(
                "system"
            );

        }

    };


    /*
     * Modern browsers
     */

    if (
        typeof mediaQuery.addEventListener ===
        "function"
    ) {

        mediaQuery.addEventListener(
            "change",
            handleSystemThemeChange
        );

    }


    /*
     * Older browser fallback
     */

    else if (
        typeof mediaQuery.addListener ===
        "function"
    ) {

        mediaQuery.addListener(
            handleSystemThemeChange
        );

    }

}


/* =========================================================
   GLOBAL BUGAI SETTINGS API
   ========================================================= */

window.BugAISettings = {

    get() {

        return getSettings();

    },


    notificationsEnabled() {

        return getSettings()
            .notifications;

    },


    soundEnabled() {

        return getSettings()
            .sound;

    },


    autoResultsEnabled() {

        return getSettings()
            .autoResults;

    },


    analysisMode() {

        return getSettings()
            .analysisMode;

    },


    isDarkMode() {

        const settings =
            getSettings();


        if (
            settings.theme === "dark"
        ) {

            return true;

        }


        if (
            settings.theme === "light"
        ) {

            return false;

        }


        return (
            window.matchMedia &&
            window.matchMedia(
                "(prefers-color-scheme: dark)"
            ).matches
        );

    }

};