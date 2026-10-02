/* =========================================================
   BUGAI — DASHBOARD
   ========================================================= */

"use strict";


/* =========================================================
   FIREBASE
   Uses the existing shared Firebase configuration.
   ========================================================= */

import {
    auth,
    db,
    collection,
    getDocs,
    onAuthStateChanged
} from "../firebase.js";


/* =========================================================
   API CONFIGURATION
   ========================================================= */

const API_BASE_URL =
    "http://127.0.0.1:5000";


/* =========================================================
   CACHE CONFIGURATION
   ========================================================= */

const KB_STATS_CACHE_KEY =
    "bugaiKnowledgeBaseStats";


/* =========================================================
   WAIT FOR FIREBASE AUTHENTICATION
   ========================================================= */

function waitForFirebaseAuth() {

    return new Promise(
        (resolve, reject) => {

            let completed = false;

            const unsubscribe =
                onAuthStateChanged(
                    auth,

                    (user) => {

                        if (completed) {
                            return;
                        }

                        completed = true;

                        unsubscribe();

                        if (!user) {

                            reject(
                                new Error(
                                    "No authenticated Firebase user found."
                                )
                            );

                            return;
                        }

                        console.log(
                            "✅ Firebase authentication ready:",
                            user.uid
                        );

                        resolve(user);
                    },

                    (error) => {

                        if (completed) {
                            return;
                        }

                        completed = true;

                        unsubscribe();

                        reject(error);
                    }
                );
        }
    );
}


/* =========================================================
   LOAD DASHBOARD
   ========================================================= */

async function loadDashboard() {

    console.log(
        "🚀 BugAI Dashboard loading..."
    );


    /* =====================================================
       WAIT FOR FIREBASE LOGIN
       ===================================================== */

    try {

        await waitForFirebaseAuth();

    } catch (error) {

        console.error(
            "❌ Firebase authentication failed:",
            error
        );


        const totalElement =
            document.getElementById(
                "totalAnalyses"
            );


        const recentContainer =
            document.getElementById(
                "recentAnalyses"
            );


        if (totalElement) {

            totalElement.textContent =
                "0";
        }


        if (recentContainer) {

            recentContainer.innerHTML = `
                <p class="muted">
                    Please sign in to view Firebase analyses.
                </p>
            `;
        }


        /*
         * Knowledge Base does not depend
         * on Firebase authentication.
         */

        await loadKnowledgeBaseStats();

        return;
    }


    /* =====================================================
       FIREBASE AUTHENTICATED
       ===================================================== */

    await Promise.allSettled([

        loadKnowledgeBaseStats(),

        loadTotalAnalyses(),

        loadRecentAnalyses()

    ]);


    console.log(
        "✅ BugAI Dashboard loaded"
    );
}


/* =========================================================
   KNOWLEDGE BASE STATISTICS
   ========================================================= */

/*
 * Important:
 *
 * The Knowledge Base contains 1.31M+ records.
 *
 * We do NOT request /api/knowledge-base/stats
 * on every Dashboard refresh.
 *
 * Once the value is successfully obtained,
 * it is stored in sessionStorage and reused
 * during page refreshes.
 *
 * This prevents the backend from repeatedly
 * loading defects.csv just because the Dashboard
 * was refreshed.
 */

async function loadKnowledgeBaseStats() {

    const historical =
        document.getElementById(
            "historicalDefects"
        );


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

            cachedStats =
                JSON.parse(
                    cached
                );


            if (
                cachedStats &&
                cachedStats.total_records !== undefined
            ) {

                const totalRecords =
                    Number(
                        cachedStats.total_records
                    );


                historical.textContent =
                    Number.isFinite(
                        totalRecords
                    )
                        ? totalRecords.toLocaleString(
                            "en-IN"
                        )
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
                 * This prevents the Dashboard refresh
                 * from triggering another large KB
                 * statistics load.
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

    historical.textContent =
        "Loading...";


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
                JSON.parse(
                    responseText
                );

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


        if (
            !Number.isFinite(
                totalRecords
            )
        ) {

            throw new Error(
                "Invalid total_records value."
            );
        }


        /* -------------------------------------------------
           UPDATE UI
           ------------------------------------------------- */

        historical.textContent =
            totalRecords.toLocaleString(
                "en-IN"
            );


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

            historical.textContent =
                "—";
        }
    }
}


/* =========================================================
   CLEAR KNOWLEDGE BASE CACHE
   ========================================================= */

/*
 * This function is intentionally available
 * if the KB is rebuilt or its size changes.
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
   TOTAL ANALYSES — FIREBASE
   ========================================================= */

/*
 * Source:
 *
 *     Firestore
 *     └── bugSubmissions
 *
 * No:
 *     localStorage
 *     backend analytics API
 *     local history
 *
 * is used here.
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


    element.textContent =
        "Loading...";


    try {

        console.log(
            "🔥 Reading bugSubmissions from Firebase..."
        );


        const submissionsReference =
            collection(
                db,
                "bugSubmissions"
            );


        const snapshot =
            await getDocs(
                submissionsReference
            );


        const total =
            snapshot.size;


        console.log(
            "🔥 Firebase bugSubmissions:",
            snapshot
        );


        console.log(
            "🔥 Firebase document count:",
            total
        );


        element.textContent =
            total.toLocaleString(
                "en-IN"
            );


        console.log(
            "✅ Total Analyses from Firebase:",
            total
        );

    } catch (error) {

        console.error(
            "❌ Failed to load Total Analyses from Firebase.",
            error
        );


        console.error(
            "Firebase error code:",
            error?.code || "unknown"
        );


        console.error(
            "Firebase error message:",
            error?.message || "unknown"
        );


        /*
         * Do NOT use localStorage here.
         */

        element.textContent =
            "0";
    }
}


/* =========================================================
   RECENT ANALYSES — FIREBASE
   ========================================================= */

/*
 * Source:
 *
 *     Firestore
 *     └── bugSubmissions
 *
 * Latest 5 documents are displayed.
 *
 * No localStorage is used.
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

        console.log(
            "🔥 Loading recent analyses from Firebase..."
        );


        const submissionsReference =
            collection(
                db,
                "bugSubmissions"
            );


        const snapshot =
            await getDocs(
                submissionsReference
            );


        const analyses =
            snapshot.docs.map(
                (documentSnapshot) => {

                    const data =
                        documentSnapshot.data() || {};


                    return {

                        id:
                            documentSnapshot.id,

                        ...data

                    };
                }
            );


        console.log(
            "🔥 Firebase analyses loaded:",
            analyses.length
        );


        /*
         * Sort newest first.
         *
         * Firestore serverTimestamp()
         * becomes a Timestamp object.
         */

        analyses.sort(
            (a, b) => {

                const aTime =
                    getFirebaseTimestamp(
                        a.createdAt ||
                        a.updatedAt
                    );


                const bTime =
                    getFirebaseTimestamp(
                        b.createdAt ||
                        b.updatedAt
                    );


                return bTime - aTime;
            }
        );


        /*
         * Only display the newest 5.
         */

        const recentAnalyses =
            analyses.slice(
                0,
                5
            );


        renderRecentAnalyses(
            recentAnalyses
        );


    } catch (error) {

        console.error(
            "❌ Failed to load Recent Analyses from Firebase.",
            error
        );


        console.error(
            "Firebase error code:",
            error?.code || "unknown"
        );


        console.error(
            "Firebase error message:",
            error?.message || "unknown"
        );


        container.innerHTML = `
            <p class="muted">
                Unable to load recent analyses from Firebase.
            </p>
        `;
    }
}


/* =========================================================
   FIREBASE TIMESTAMP HELPER
   ========================================================= */

function getFirebaseTimestamp(
    timestamp
) {

    if (!timestamp) {

        return 0;
    }


    /*
     * Firestore Timestamp
     */

    if (
        typeof timestamp.toMillis ===
        "function"
    ) {

        return timestamp.toMillis();
    }


    /*
     * Firestore Timestamp-like object
     */

    if (
        typeof timestamp === "object" &&
        typeof timestamp.seconds ===
        "number"
    ) {

        return (
            timestamp.seconds * 1000
        ) + (
            Number(
                timestamp.nanoseconds || 0
            ) / 1000000
        );
    }


    /*
     * JavaScript Date
     */

    if (
        timestamp instanceof Date
    ) {

        return timestamp.getTime();
    }


    /*
     * ISO/string date
     */

    const parsed =
        new Date(
            timestamp
        ).getTime();


    return Number.isFinite(parsed)
        ? parsed
        : 0;
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


    container.innerHTML =
        analyses
            .map(
                (analysis) => {

                    const title =
                        analysis.title ||
                        analysis.bug?.title ||
                        "Untitled Bug";


                    const project =
                        analysis.project ||
                        analysis.bug?.project ||
                        "Unknown Project";


                    const status =
                        analysis.status ||
                        "Submitted";


                    const severity =
                        analysis.severity ||
                        analysis.analysis
                            ?.triage
                            ?.severity ||
                        analysis.analysis
                            ?.triage_analysis
                            ?.severity ||
                        "Unknown";


                    const priority =
                        analysis.priority ||
                        analysis.analysis
                            ?.triage
                            ?.priority ||
                        analysis.analysis
                            ?.triage_analysis
                            ?.priority ||
                        "Unknown";


                    const createdAt =
                        formatFirebaseDate(
                            analysis.createdAt ||
                            analysis.updatedAt
                        );


                    return `
                        <div class="analysis-item">

                            <div class="analysis-main">

                                <strong>
                                    ${escapeHTML(title)}
                                </strong>

                                <span class="muted">
                                    ${escapeHTML(project)}
                                </span>

                            </div>


                            <div class="analysis-meta">

                                <span>
                                    ${escapeHTML(severity)}
                                </span>

                                <span>
                                    ${escapeHTML(priority)}
                                </span>

                                <span>
                                    ${escapeHTML(status)}
                                </span>

                            </div>


                            <div class="analysis-date">
                                ${escapeHTML(createdAt)}
                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* =========================================================
   FIREBASE DATE FORMATTER
   ========================================================= */

function formatFirebaseDate(
    timestamp
) {

    const milliseconds =
        getFirebaseTimestamp(
            timestamp
        );


    if (!milliseconds) {

        return "Date unavailable";
    }


    const date =
        new Date(
            milliseconds
        );


    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/* =========================================================
   LOCAL ANALYSIS HISTORY
   ========================================================= */

/*
 * Deprecated.
 *
 * Dashboard Total Analyses and Recent Analyses
 * now come exclusively from Firebase.
 *
 * This function is retained only so older code
 * that may call it does not break.
 */

function getLocalAnalyses() {

    console.warn(
        "⚠️ getLocalAnalyses() is deprecated. Dashboard data comes from Firebase."
    );

    return [];
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
 * Bug Submission page can write:
 *
 *     localStorage.setItem(
 *         "bugai-analysis-updated",
 *         timestamp
 *     );
 *
 * The storage event works when Dashboard
 * and Bug Submission are opened in different
 * documents/tabs.
 *
 * IMPORTANT:
 *
 * localStorage is used ONLY as a refresh signal.
 *
 * The actual Total Analyses and Recent Analyses
 * data always comes from Firebase.
 */

window.addEventListener(
    "storage",
    function (
        event
    ) {

        /* -----------------------------------------------
           NEW BUG ANALYSIS
           ----------------------------------------------- */

        if (
            event.key ===
            "bugai-analysis-updated"
        ) {

            console.log(
                "🔄 New BugAI analysis detected. Refreshing Firebase data..."
            );


            /*
             * Refresh only Firebase-backed
             * analysis data.
             *
             * Historical Defects is NOT touched.
             */

            loadTotalAnalyses();

            loadRecentAnalyses();

            return;
        }


        /*
         * Legacy local history event.
         *
         * Even if this event occurs,
         * Dashboard data is still fetched
         * from Firebase.
         */

        if (
            event.key ===
            "bugaiAnalyses"
        ) {

            console.log(
                "🔄 Legacy analysis event detected. Refreshing Firebase data..."
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
    function (
        event
    ) {

        console.log(
            "🔄 BugAI analysis completed. Refreshing Firebase Dashboard data...",
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
 * Other BugAI pages can manually request
 * an analysis refresh using:
 *
 * window.dispatchEvent(
 *     new Event(
 *         "bugai-dashboard-refresh"
 *     )
 * );
 */

window.addEventListener(
    "bugai-dashboard-refresh",
    function () {

        console.log(
            "🔄 Manual Dashboard Firebase refresh requested."
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