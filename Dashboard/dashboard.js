/* =========================================================
   BUGAI — DASHBOARD
   ========================================================= */

const API_BASE_URL =
    "http://127.0.0.1:5000";


async function loadDashboard() {

    /* =====================================================
       LOAD KNOWLEDGE BASE STATISTICS
       ===================================================== */

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/api/knowledge-base/stats`
            );


        const text =
            await response.text();


        if (!text) {
            throw new Error(
                "Empty backend response."
            );
        }


        const stats =
            JSON.parse(text);


        if (!response.ok) {

            throw new Error(
                stats.error ||
                `HTTP ${response.status}`
            );

        }


        const historical =
            document.getElementById(
                "historicalDefects"
            );


        if (historical) {

            historical.textContent =
                stats.total_records ?? 0;

        }


    } catch (error) {

        console.error(
            "Dashboard Stats Error:",
            error
        );


        const historical =
            document.getElementById(
                "historicalDefects"
            );


        if (historical) {

            historical.textContent =
                "—";

        }

    }


    /* =====================================================
       LOAD LOCAL ANALYSIS HISTORY
       ===================================================== */

    const analyses =
        JSON.parse(
            localStorage.getItem(
                "bugaiAnalyses"
            ) || "[]"
        );


    const total =
        document.getElementById(
            "totalAnalyses"
        );


    if (total) {

        total.textContent =
            analyses.length;

    }


    /* =====================================================
       RECENT ANALYSES
       ===================================================== */

    const container =
        document.getElementById(
            "recentAnalyses"
        );


    if (!container) {
        return;
    }


    if (!analyses.length) {

        container.innerHTML = `

            <p class="muted">

                No analyses submitted yet.

                Use
                <strong>
                    New Analysis
                </strong>
                to begin.

            </p>

        `;

        return;

    }


    container.innerHTML =
        analyses
            .slice(0, 5)
            .map(
                function (analysis) {

                    return `

                        <div class="analysis-row">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        analysis.title
                                    )}
                                </strong>

                                <div class="muted">

                                    ${escapeHTML(
                                        analysis.project
                                    )}

                                    ·

                                    ${escapeHTML(
                                        analysis.severity
                                    )}

                                </div>

                            </div>


                            <div class="muted">

                                ${escapeHTML(
                                    analysis.created_at ||
                                    ""
                                )}

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

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

                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"

            };

            return entities[
                character
            ];

        }
    );

}


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    loadDashboard
);