/* =========================================================
   BUGAI — DASHBOARD
   ========================================================= */

"use strict";


/* =========================================================
   API CONFIGURATION
   ========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";


/* =========================================================
   CACHE CONFIGURATION
   ========================================================= */

const KB_STATS_CACHE_KEY = "bugaiKnowledgeBaseStats";


/* =========================================================
   LOAD DASHBOARD
   ========================================================= */

async function loadDashboard() {

    console.log("🚀 BugAI Dashboard loading...");

    /*
     * Load independent Dashboard sections in parallel.
     *
     * Historical Defects uses sessionStorage cache.
     * Total Analyses and Recent Analyses come from backend.
     */
    await Promise.allSettled([
        loadKnowledgeBaseStats(),
        loadTotalAnalyses(),
        loadRecentAnalyses()
    ]);

    console.log("✅ BugAI Dashboard loaded");
}


/* =========================================================
   KNOWLEDGE BASE STATISTICS
   ========================================================= */

/*
 * Important:
 *
 * The Knowledge Base contains 1.31M+ records.
 *
 * We do NOT request /api/knowledge-base/stats on every
 * Dashboard refresh.
 *
 * Once the value is successfully obtained, it is stored
 * in sessionStorage and reused during page refreshes.
 *
 * This prevents the backend from repeatedly loading
 * defects.csv just because the Dashboard was refreshed.
 */

async function loadKnowledgeBaseStats() {

    const historical =
        document.getElementById("historicalDefects");

    if (!historical) {

        console.error(
            "❌ #historicalDefects not found"
        );

        return;
    }


    /* -----------------------------------------------------
       TRY SESSION CACHE
       ----------------------------------------------------- */

    let cachedStats = null;

    try {

        const cached =
            sessionStorage.getItem(
                KB_STATS_CACHE_KEY
            );

        if (cached) {

            cachedStats = JSON.parse(cached);

            if (
                cachedStats &&
                cachedStats.total_records !== undefined
            ) {

                const totalRecords =
                    Number(
                        cachedStats.total_records
                    );

                historical.textContent =
                    Number.isFinite(totalRecords)
                        ? totalRecords.toLocaleString("en-IN")
                        : "—";

                console.log(
                    "⚡ Historical Defects loaded from session cache:",
                    totalRecords
                );

                /*
                 * VERY IMPORTANT:
                 *
                 * Stop here.
                 *
                 * Do NOT call the backend again.
                 *
                 * This prevents the Dashboard refresh from
                 * triggering another large KB statistics load.
                 */
                return;
            }
        }

    } catch (cacheError) {

        console.warn(
            "⚠️ Knowledge Base cache could not be read:",
            cacheError
        );
    }


    /* -----------------------------------------------------
       NO CACHE AVAILABLE
       ----------------------------------------------------- */

    historical.textContent = "Loading...";


    try {

        console.log(
            "📊 Loading Knowledge Base statistics from backend..."
        );


        const response =
            await fetch(
                `${API_BASE_URL}/api/knowledge-base/stats`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );


        const responseText =
            await response.text();


        if (!responseText) {

            throw new Error(
                "Empty response from Knowledge Base statistics API."
            );
        }


        let stats;

        try {

            stats =
                JSON.parse(responseText);

        } catch (jsonError) {

            throw new Error(
                "Invalid JSON returned by Knowledge Base statistics API."
            );
        }


        if (!response.ok) {

            throw new Error(
                stats.error ||
                `HTTP ${response.status}`
            );
        }


        if (
            stats.ok !== true ||
            stats.total_records === undefined
        ) {

            throw new Error(
                stats.error ||
                "Invalid Knowledge Base statistics response."
            );
        }


        const totalRecords =
            Number(
                stats.total_records
            );


        if (!Number.isFinite(totalRecords)) {

            throw new Error(
                "Invalid total_records value."
            );
        }


        /* -------------------------------------------------
           UPDATE UI
           ------------------------------------------------- */

        historical.textContent =
            totalRecords.toLocaleString("en-IN");


        /* -------------------------------------------------
           SAVE CACHE
           ------------------------------------------------- */

        try {

            sessionStorage.setItem(
                KB_STATS_CACHE_KEY,
                JSON.stringify({

                    total_records:
                        totalRecords,

                    by_project:
                        stats.by_project || {},

                    indexed_records:
                        Number(
                            stats.indexed_records || 0
                        ),

                    index_status:
                        stats.index_status || ""

                })
            );

            console.log(
                "💾 Knowledge Base statistics cached."
            );

        } catch (cacheError) {

            console.warn(
                "⚠️ Unable to cache Knowledge Base statistics:",
                cacheError
            );
        }


        console.log(
            "✅ Knowledge Base Statistics:",
            stats
        );


    } catch (error) {

        console.error(
            "❌ Knowledge Base Statistics Error:",
            error
        );


        /*
         * Keep an existing value if one is available.
         */
        if (
            !historical.textContent ||
            historical.textContent === "Loading..."
        ) {

            historical.textContent = "—";
        }
    }
}


/* =========================================================
   CLEAR KNOWLEDGE BASE CACHE
   ========================================================= */

/*
 * This function is intentionally available if the KB is
 * rebuilt or its size changes.
 *
 * You can call:
 *
 *     clearKnowledgeBaseStatsCache();
 *
 * from the browser console.
 */

function clearKnowledgeBaseStatsCache() {

    try {

        sessionStorage.removeItem(
            KB_STATS_CACHE_KEY
        );

        console.log(
            "🗑️ Knowledge Base statistics cache cleared."
        );

    } catch (error) {

        console.warn(
            "⚠️ Unable to clear Knowledge Base cache:",
            error
        );
    }
}


/* =========================================================
   TOTAL ANALYSES
   ========================================================= */

/*
 * Backend endpoint:
 *
 * /api/analytics/submitted-count
 *
 * Example:
 *
 * {
 *     "ok": true,
 *     "total_analyses": 2
 * }
 */

async function loadTotalAnalyses() {

    const element =
        document.getElementById(
            "totalAnalyses"
        );


    if (!element) {

        console.error(
            "❌ #totalAnalyses element not found"
        );

        return;
    }


    try {

        element.textContent =
            "Loading...";


        const response =
            await fetch(
                `${API_BASE_URL}/api/analytics/submitted-count?t=${Date.now()}`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        console.log(
            "✅ Submitted analyses:",
            data
        );


        if (
            data.ok !== true &&
            data.total_analyses === undefined
        ) {

            throw new Error(
                data.error ||
                "Invalid submitted-count response."
            );
        }


        const count =
            Number(
                data.total_analyses ?? 0
            );


        element.textContent =
            Number.isFinite(count)
                ? count.toLocaleString("en-IN")
                : "0";


    } catch (error) {

        console.error(
            "❌ Failed to load Total Analyses:",
            error
        );


        /*
         * Do not break the Dashboard if the backend
         * is temporarily unavailable.
         */
        element.textContent = "0";
    }
}


/* =========================================================
   RECENT ANALYSES
   ========================================================= */

/*
 * Backend endpoint:
 *
 * /api/analytics/submitted-records
 */

async function loadRecentAnalyses() {

    const container =
        document.getElementById(
            "recentAnalyses"
        );


    if (!container) {

        console.error(
            "❌ #recentAnalyses element not found"
        );

        return;
    }


    container.innerHTML = `
        <p class="muted">
            Loading recent analyses...
        </p>
    `;


    try {

        const response =
            await fetch(
                `${API_BASE_URL}/api/analytics/submitted-records?t=${Date.now()}`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        console.log(
            "✅ Recent analyses:",
            data
        );


        if (
            data.ok !== true ||
            !Array.isArray(data.results)
        ) {

            throw new Error(
                "Invalid recent analyses response."
            );
        }


        renderRecentAnalyses(
            data.results
        );


    } catch (error) {

        console.error(
            "❌ Failed to load Recent Analyses:",
            error
        );


        container.innerHTML = `
            <p class="muted">
                Unable to load recent analyses.
            </p>
        `;
    }
}


/* =========================================================
   RENDER RECENT ANALYSES
   ========================================================= */

function renderRecentAnalyses(
    analyses
) {

    const container =
        document.getElementById(
            "recentAnalyses"
        );


    if (!container) {

        return;
    }


    /* -----------------------------------------------------
       NO ANALYSES
       ----------------------------------------------------- */

    if (
        !Array.isArray(analyses) ||
        analyses.length === 0
    ) {

        container.innerHTML = `
            <p class="muted">
                No analyses submitted yet.
            </p>
        `;

        return;
    }


    /* -----------------------------------------------------
       SORT NEWEST FIRST
       ----------------------------------------------------- */

    const sorted =
        [...analyses].sort(
            function (a, b) {

                const dateA =
                    new Date(
                        a.timestamp ||
                        a.created_at ||
                        0
                    ).getTime();


                const dateB =
                    new Date(
                        b.timestamp ||
                        b.created_at ||
                        0
                    ).getTime();


                return dateB - dateA;
            }
        );


    /* -----------------------------------------------------
       DISPLAY LATEST 5
       ----------------------------------------------------- */

    const recent =
        sorted.slice(0, 5);


    /* -----------------------------------------------------
       BUILD HTML
       ----------------------------------------------------- */

    container.innerHTML =
        recent
            .map(
                function (analysis) {

                    const title =
                        escapeHTML(
                            analysis.title ||
                            "Untitled Analysis"
                        );


                    const project =
                        escapeHTML(
                            analysis.project ||
                            "Custom Project"
                        );


                    const severity =
                        escapeHTML(
                            analysis.severity ||
                            "Unknown"
                        );


                    const priority =
                        escapeHTML(
                            analysis.priority ||
                            "Unknown"
                        );


                    const component =
                        escapeHTML(
                            analysis.affected_component ||
                            analysis.component ||
                            "Unknown"
                        );


                    const timestamp =
                        analysis.timestamp ||
                        analysis.created_at ||
                        "";


                    let formattedDate = "";


                    if (timestamp) {

                        try {

                            const date =
                                new Date(
                                    timestamp
                                );


                            if (
                                !Number.isNaN(
                                    date.getTime()
                                )
                            ) {

                                formattedDate =
                                    date.toLocaleString(
                                        "en-IN",
                                        {
                                            dateStyle: "medium",
                                            timeStyle: "short"
                                        }
                                    );

                            } else {

                                formattedDate =
                                    String(timestamp);
                            }

                        } catch (error) {

                            formattedDate =
                                String(timestamp);
                        }
                    }


                    const bugId =
                        escapeHTML(
                            analysis.bug_id ||
                            ""
                        );


                    return `
                        <div class="analysis-row">

                            <div class="analysis-main">

                                <strong>
                                    ${title}
                                </strong>

                                <div class="muted">

                                    ${project}

                                    ·

                                    ${severity}

                                    ·

                                    ${priority}

                                    ·

                                    ${component}

                                </div>

                                ${
                                    bugId
                                        ? `
                                            <div class="muted">
                                                ${bugId}
                                            </div>
                                        `
                                        : ""
                                }

                            </div>


                            <div class="muted analysis-date">

                                ${escapeHTML(
                                    formattedDate
                                )}

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* =========================================================
   GET LOCAL ANALYSIS HISTORY
   ========================================================= */

/*
 * Kept for compatibility with older BugAI frontend code.
 */

function getLocalAnalyses() {

    try {

        const raw =
            localStorage.getItem(
                "bugaiAnalyses"
            );


        if (!raw) {

            return [];
        }


        const data =
            JSON.parse(raw);


        return Array.isArray(data)
            ? data
            : [];


    } catch (error) {

        console.error(
            "❌ Unable to read local analyses:",
            error
        );


        return [];
    }
}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHTML(value) {

    return String(
        value ?? ""
    ).replace(
        /[&<>"']/g,
        function (character) {

            const entities = {

                "&":
                    "&amp;",

                "<":
                    "&lt;",

                ">":
                    "&gt;",

                '"':
                    "&quot;",

                "'":
                    "&#039;"
            };


            return (
                entities[character] ||
                character
            );
        }
    );
}


/* =========================================================
   REFRESH DASHBOARD AFTER NEW ANALYSIS
   ========================================================= */

/*
 * Bug Submission page writes:
 *
 *     localStorage.setItem(
 *         "bugai-analysis-updated",
 *         timestamp
 *     );
 *
 * The storage event works when Dashboard and
 * Bug Submission are opened in different documents/tabs.
 */

window.addEventListener(
    "storage",
    function (event) {

        /* -----------------------------------------------
           NEW BUG ANALYSIS
           ----------------------------------------------- */

        if (
            event.key ===
            "bugai-analysis-updated"
        ) {

            console.log(
                "🔄 New BugAI analysis detected."
            );


            /*
             * Only refresh analysis-related data.
             *
             * Historical Defects is NOT touched.
             */
            loadTotalAnalyses();

            loadRecentAnalyses();

            return;
        }


        /* -----------------------------------------------
           OLD LOCAL HISTORY EVENT
           ----------------------------------------------- */

        if (
            event.key ===
            "bugaiAnalyses"
        ) {

            console.log(
                "🔄 Local analysis history changed."
            );


            loadRecentAnalyses();

            loadTotalAnalyses();
        }
    }
);


/* =========================================================
   CUSTOM EVENT
   ========================================================= */

/*
 * This supports same-document event handling.
 *
 * Bug Submission can dispatch:
 *
 * window.dispatchEvent(
 *     new CustomEvent(
 *         "bugai-analysis-updated",
 *         {
 *             detail: {
 *                 timestamp: Date.now()
 *             }
 *         }
 *     )
 * );
 *
 * It does NOT reload Historical Defects.
 */

window.addEventListener(
    "bugai-analysis-updated",
    function (event) {

        console.log(
            "🔄 BugAI analysis completed. Refreshing Dashboard...",
            event?.detail || ""
        );


        loadTotalAnalyses();

        loadRecentAnalyses();
    }
);


/* =========================================================
   OPTIONAL MANUAL REFRESH EVENT
   ========================================================= */

/*
 * Other BugAI pages can manually request an
 * analysis refresh using:
 *
 * window.dispatchEvent(
 *     new Event("bugai-dashboard-refresh")
 * );
 */

window.addEventListener(
    "bugai-dashboard-refresh",
    function () {

        console.log(
            "🔄 Manual Dashboard analysis refresh requested."
        );


        loadTotalAnalyses();

        loadRecentAnalyses();
    }
);


/* =========================================================
   INITIALIZE DASHBOARD
   ========================================================= */

function initializeDashboard() {

    console.log(
        "🚀 Initializing BugAI Dashboard..."
    );


    loadDashboard();
}


/*
 * Initialize exactly once.
 */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard,
        {
            once: true
        }
    );

} else {

    initializeDashboard();
}