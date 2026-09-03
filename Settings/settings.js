/* =========================================================
   BUGAI SETTINGS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    initializeSettings();

});


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
   LOAD SETTINGS
========================================================= */

function getSettings() {

    const saved =
        localStorage.getItem("bugai-settings");

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
       Keep these individual keys too,
       because other BugAI pages can use them.
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
   INITIALIZE
========================================================= */

function initializeSettings() {

    const settings = getSettings();


    /* Theme */

    applyTheme(settings.theme);


    /* Toggles */

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


    /* Analysis Mode */

    const analysisMode =
        document.getElementById(
            "analysisMode"
        );

    if (analysisMode) {

        analysisMode.value =
            settings.analysisMode;

    }


    /* Theme buttons */

    updateThemeButtons(settings.theme);


    setupEventListeners();

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEventListeners() {

    const themeButtons =
        document.querySelectorAll(
            ".appearance-option"
        );


    themeButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const theme =
                    button.dataset.theme;

                const settings =
                    getSettings();

                settings.theme =
                    theme;

                saveSettings(settings);

                applyTheme(theme);

                updateThemeButtons(theme);

                showStatus(
                    "Appearance updated"
                );

            }
        );

    });


    /* Notifications */

    document
        .getElementById("notificationToggle")
        ?.addEventListener(
            "change",
            event => {

                const settings =
                    getSettings();

                settings.notifications =
                    event.target.checked;

                saveSettings(settings);

                showStatus(
                    event.target.checked
                        ? "Notifications enabled"
                        : "Notifications disabled"
                );

            }
        );


    /* Sound */

    document
        .getElementById("soundToggle")
        ?.addEventListener(
            "change",
            event => {

                const settings =
                    getSettings();

                settings.sound =
                    event.target.checked;

                saveSettings(settings);

                showStatus(
                    event.target.checked
                        ? "Sound enabled"
                        : "Sound disabled"
                );

            }
        );


    /* Auto Results */

    document
        .getElementById("autoResultToggle")
        ?.addEventListener(
            "change",
            event => {

                const settings =
                    getSettings();

                settings.autoResults =
                    event.target.checked;

                saveSettings(settings);

                showStatus(
                    event.target.checked
                        ? "Automatic results enabled"
                        : "Automatic results disabled"
                );

            }
        );


    /* Analysis Mode */

    document
        .getElementById("analysisMode")
        ?.addEventListener(
            "change",
            event => {

                const settings =
                    getSettings();

                settings.analysisMode =
                    event.target.value;

                saveSettings(settings);

                showStatus(
                    "Analysis mode updated"
                );

            }
        );


    /* History */

    document
        .getElementById("historyToggle")
        ?.addEventListener(
            "change",
            event => {

                const settings =
                    getSettings();

                settings.history =
                    event.target.checked;

                saveSettings(settings);

                showStatus(
                    event.target.checked
                        ? "Analysis history enabled"
                        : "Analysis history disabled"
                );

            }
        );


    /* Confirm Reset */

    document
        .getElementById("confirmResetToggle")
        ?.addEventListener(
            "change",
            event => {

                const settings =
                    getSettings();

                settings.confirmReset =
                    event.target.checked;

                saveSettings(settings);

                showStatus(
                    "Reset preference updated"
                );

            }
        );


    /* Reset */

    document
        .getElementById("resetSettings")
        ?.addEventListener(
            "click",
            resetAllSettings
        );

}


/* =========================================================
   THEME
========================================================= */

function applyTheme(theme) {

    if (theme === "dark") {

        document.body.classList.add(
            "dark-mode"
        );

        return;

    }


    if (theme === "light") {

        document.body.classList.remove(
            "dark-mode"
        );

        return;

    }


    /* System */

    const prefersDark =
        window.matchMedia &&
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;


    document.body.classList.toggle(
        "dark-mode",
        prefersDark
    );

}


/* =========================================================
   THEME BUTTON STATE
========================================================= */

function updateThemeButtons(theme) {

    document
        .querySelectorAll(
            ".appearance-option"
        )
        .forEach(button => {

            button.classList.toggle(
                "selected",
                button.dataset.theme === theme
            );

        });

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


    saveSettings(defaults);


    applyTheme(
        defaults.theme
    );


    updateThemeButtons(
        defaults.theme
    );


    document.getElementById(
        "notificationToggle"
    ).checked =
        defaults.notifications;


    document.getElementById(
        "soundToggle"
    ).checked =
        defaults.sound;


    document.getElementById(
        "autoResultToggle"
    ).checked =
        defaults.autoResults;


    document.getElementById(
        "historyToggle"
    ).checked =
        defaults.history;


    document.getElementById(
        "confirmResetToggle"
    ).checked =
        defaults.confirmReset;


    document.getElementById(
        "analysisMode"
    ).value =
        defaults.analysisMode;


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


    status.style.opacity = "1";


    clearTimeout(
        window.bugAIStatusTimer
    );


    window.bugAIStatusTimer =
        setTimeout(() => {

            status.textContent =
                "✓ Settings are automatically saved";

        }, 2200);

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

        return getSettings()
            .theme === "dark";

    }

};