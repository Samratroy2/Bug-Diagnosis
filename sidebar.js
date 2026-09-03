/* =========================================================
   BUGAI — SHARED SIDEBAR
   Handles:
   - Sidebar loading
   - Active navigation
   - Mobile sidebar
   - Keyboard controls
   - Settings compatibility
========================================================= */


/* =========================================================
   START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadSidebar();

    }
);


/* =========================================================
   LOAD SIDEBAR
========================================================= */

async function loadSidebar() {

    const container =
        document.getElementById(
            "sidebar-container"
        );


    if (!container) {

        console.warn(
            "BugAI sidebar container was not found."
        );

        return;

    }


    try {

        /*
         * The project is normally opened using
         * Live Server from the BugAI root folder.
         *
         * Therefore /sidebar.html points to:
         *
         * http://127.0.0.1:5500/sidebar.html
         *
         * It also works when the project is served
         * from the Flask backend.
         */

        const response =
            await fetch("/sidebar.html");


        if (!response.ok) {

            throw new Error(
                `Sidebar request failed: ${response.status}`
            );

        }


        const html =
            await response.text();


        container.innerHTML = html;


        initializeSidebar();


    } catch (error) {

        console.error(
            "BugAI sidebar loading error:",
            error
        );


        /*
         * Small fallback message so the page
         * does not remain completely empty.
         */

        container.innerHTML = `
            <div
                style="
                    padding:20px;
                    font-family:Arial,sans-serif;
                    color:#64748b;
                "
            >
                Unable to load navigation.
            </div>
        `;

    }

}


/* =========================================================
   INITIALIZE SIDEBAR
========================================================= */

function initializeSidebar() {

    setActiveSidebarPage();

    initializeMobileSidebar();

    initializeNavigationLinks();

    updateSystemStatus();

}


/* =========================================================
   ACTIVE PAGE
========================================================= */

function setActiveSidebarPage() {

    const pathname =
        window.location.pathname
            .toLowerCase();


    let currentPage = "";


    /*
     * Dashboard
     */

    if (
        pathname.includes(
            "/dashboard/"
        )
    ) {

        currentPage = "dashboard";

    }


    /*
     * Bug Submission
     */

    else if (
        pathname.includes(
            "/bug-submission/"
        )
    ) {

        currentPage = "bug-submission";

    }


    /*
     * Workflow
     */

    else if (
        pathname.includes(
            "/workflow/"
        )
    ) {

        currentPage = "workflow";

    }


    /*
     * Architecture
     */

    else if (
        pathname.includes(
            "/architecture/"
        )
    ) {

        currentPage = "architecture";

    }


    /*
     * Knowledge Base
     */

    else if (
        pathname.includes(
            "/knowledge-base/"
        )
    ) {

        currentPage = "knowledge-base";

    }


    /*
     * Semantic Similarity
     */

    else if (
        pathname.includes(
            "/semantic-similarity/"
        )
    ) {

        currentPage = "similarity";

    }


    /*
     * Settings
     */

    else if (
        pathname.includes(
            "/settings/"
        )
    ) {

        currentPage = "settings";

    }


    /*
     * Apply active class
     */

    const links =
        document.querySelectorAll(
            ".sidebar-link[data-page]"
        );


    links.forEach(link => {

        link.classList.remove(
            "active"
        );


        if (
            link.dataset.page ===
            currentPage
        ) {

            link.classList.add(
                "active"
            );

        }

    });

}


/* =========================================================
   NAVIGATION LINKS
========================================================= */

function initializeNavigationLinks() {

    const links =
        document.querySelectorAll(
            ".sidebar-link"
        );


    links.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                /*
                 * Close mobile sidebar
                 * after selecting a page.
                 */

                closeMobileSidebar();

            }
        );

    });

}


/* =========================================================
   MOBILE SIDEBAR
========================================================= */

function initializeMobileSidebar() {

    const menuButton =
        document.getElementById(
            "sidebarMenuButton"
        );


    const sidebar =
        document.getElementById(
            "bugaiSidebar"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if (
        !menuButton ||
        !sidebar
    ) {

        return;

    }


    /*
     * Open / close button
     */

    menuButton.addEventListener(
        "click",
        () => {

            const isOpen =
                sidebar.classList.contains(
                    "open"
                );


            if (isOpen) {

                closeMobileSidebar();

            } else {

                openMobileSidebar();

            }

        }
    );


    /*
     * Overlay click
     */

    overlay?.addEventListener(
        "click",
        () => {

            closeMobileSidebar();

        }
    );


    /*
     * Escape key
     */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {

                closeMobileSidebar();

            }

        }
    );


    /*
     * Close when screen becomes desktop
     */

    window.addEventListener(
        "resize",
        () => {

            if (
                window.innerWidth > 900
            ) {

                closeMobileSidebar();

            }

        }
    );

}


/* =========================================================
   OPEN MOBILE SIDEBAR
========================================================= */

function openMobileSidebar() {

    const sidebar =
        document.getElementById(
            "bugaiSidebar"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    const menuButton =
        document.getElementById(
            "sidebarMenuButton"
        );


    sidebar?.classList.add(
        "open"
    );


    overlay?.classList.add(
        "active"
    );


    menuButton?.setAttribute(
        "aria-expanded",
        "true"
    );


    document.body.classList.add(
        "sidebar-open"
    );

}


/* =========================================================
   CLOSE MOBILE SIDEBAR
========================================================= */

function closeMobileSidebar() {

    const sidebar =
        document.getElementById(
            "bugaiSidebar"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    const menuButton =
        document.getElementById(
            "sidebarMenuButton"
        );


    sidebar?.classList.remove(
        "open"
    );


    overlay?.classList.remove(
        "active"
    );


    menuButton?.setAttribute(
        "aria-expanded",
        "false"
    );


    document.body.classList.remove(
        "sidebar-open"
    );

}


/* =========================================================
   SYSTEM STATUS
========================================================= */

function updateSystemStatus() {

    const statusDot =
        document.querySelector(
            ".status-dot"
        );


    const statusTitle =
        document.querySelector(
            ".status-text strong"
        );


    if (!statusDot) {

        return;

    }


    /*
     * Frontend status is online when
     * the page is successfully loaded.
     */

    statusDot.classList.add(
        "online"
    );


    if (statusTitle) {

        statusTitle.textContent =
            "System Online";

    }

}


/* =========================================================
   PUBLIC SIDEBAR API
========================================================= */

window.BugAISidebar = {

    open: openMobileSidebar,

    close: closeMobileSidebar,

    refresh: () => {

        setActiveSidebarPage();

        updateSystemStatus();

    }

};