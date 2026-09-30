/* =========================================================
   BUGAI — SEMANTIC SIMILARITY SEARCH
   Backend: http://127.0.0.1:5000

   Responsibilities:
   - Query validation
   - FAISS semantic search
   - Similarity classification
   - Result rendering
   - Error handling
   - Mobile-friendly result display
========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";


/* =========================================================
   SIMILARITY THRESHOLDS
========================================================= */

const SIMILARITY_THRESHOLDS = {
    DUPLICATE: 0.82,
    RELATED: 0.65
};


/* =========================================================
   DOM ELEMENTS
========================================================= */

const searchButton =
    document.getElementById("searchButton");

const queryInput =
    document.getElementById("query");

const projectInput =
    document.getElementById("project");

const topKInput =
    document.getElementById("topK");

const resultsContainer =
    document.getElementById("results");


/* =========================================================
   EVENT LISTENERS
========================================================= */

if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchSimilarDefects
    );

}


if (queryInput) {

    queryInput.addEventListener(
        "keydown",
        function (event) {

            /*
             * Ctrl + Enter
             */
            if (
                event.key === "Enter" &&
                event.ctrlKey
            ) {

                event.preventDefault();

                searchSimilarDefects();

            }

        }
    );

}


/* =========================================================
   SEARCH SIMILAR DEFECTS
========================================================= */

async function searchSimilarDefects() {

    if (
        !queryInput ||
        !resultsContainer ||
        !searchButton
    ) {

        return;

    }


    const query =
        queryInput.value.trim();


    const project =
        projectInput?.value || "";


    const topK =
        parseInt(
            topKInput?.value || "5",
            10
        );


    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!query) {

        showMessage(
            "warning",
            "Please enter a bug description or error."
        );

        queryInput.focus();

        return;

    }


    if (
        !Number.isInteger(topK) ||
        topK < 1
    ) {

        showMessage(
            "warning",
            "Please select a valid number of results."
        );

        return;

    }


    /* -----------------------------------------------------
       LOADING STATE
    ----------------------------------------------------- */

    setLoadingState(true);


    resultsContainer.innerHTML = `

        <div class="card loading-card">

            <div class="loading-spinner"></div>

            <h3>
                Searching Historical Defects...
            </h3>

            <p>
                Generating the query embedding and
                searching the FAISS vector index.
            </p>

            <div class="search-stage">

                <span class="stage-active">
                    Query
                </span>

                <span>→</span>

                <span class="stage-active">
                    Embedding
                </span>

                <span>→</span>

                <span class="stage-active">
                    FAISS Search
                </span>

                <span>→</span>

                <span>
                    Ranking
                </span>

            </div>

        </div>

    `;


    try {

        /* -------------------------------------------------
           BUILD REQUEST
        ------------------------------------------------- */

        const params =
            new URLSearchParams();


        params.set(
            "q",
            query
        );


        params.set(
            "top_k",
            String(topK)
        );


        if (project) {

            params.set(
                "project",
                project
            );

        }


        const response =
            await fetch(
                `${API_BASE_URL}/api/search?${params.toString()}`,
                {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );


        /* -------------------------------------------------
           READ RESPONSE
        ------------------------------------------------- */

        const text =
            await response.text();


        if (!text.trim()) {

            throw new Error(
                "Backend returned an empty response."
            );

        }


        let data;


        try {

            data =
                JSON.parse(text);

        } catch (jsonError) {

            console.error(
                "Invalid backend response:",
                text
            );

            throw new Error(
                `Invalid JSON response from backend (HTTP ${response.status}).`
            );

        }


        /* -------------------------------------------------
           HTTP ERROR
        ------------------------------------------------- */

        if (!response.ok) {

            throw new Error(
                data.error ||
                `Search failed (HTTP ${response.status}).`
            );

        }


        /* -------------------------------------------------
           RESULTS
        ------------------------------------------------- */

        const matches =
            Array.isArray(data.results)
                ? data.results
                : [];


        renderResults(
            matches,
            {
                query,
                project,
                topK
            }
        );


    } catch (error) {

        console.error(
            "Semantic Search Error:",
            error
        );


        renderError(
            error
        );


    } finally {

        setLoadingState(false);

    }

}


/* =========================================================
   RENDER RESULTS
========================================================= */

function renderResults(
    matches,
    searchInfo = {}
) {

    if (!resultsContainer) {
        return;
    }


    /* -----------------------------------------------------
       NO RESULTS
    ----------------------------------------------------- */

    if (!matches.length) {

        resultsContainer.innerHTML = `

            <div class="card no-results">

                <div class="status-icon">
                    ?
                </div>

                <h2>
                    No Similar Defects Found
                </h2>

                <p>
                    The vector index did not return any
                    historical defect for this query.
                </p>

                <div class="suggestion">

                    <strong>Try:</strong>

                    <ul>

                        <li>
                            Add the exception or error message.
                        </li>

                        <li>
                            Include the affected component.
                        </li>

                        <li>
                            Include the failure behaviour.
                        </li>

                    </ul>

                </div>

            </div>

        `;

        return;

    }


    /* -----------------------------------------------------
       NORMALIZE RESULTS
    ----------------------------------------------------- */

    const normalizedMatches =
        matches.map(
            function (match) {

                const score =
                    normalizeScore(
                        match.score
                    );


                return {
                    ...match,
                    normalizedScore: score,
                    percentage: score * 100,
                    classification:
                        classifySimilarity(score)
                };

            }
        );


    /* -----------------------------------------------------
       SORT BY SIMILARITY
    ----------------------------------------------------- */

    normalizedMatches.sort(
        function (a, b) {

            return (
                b.normalizedScore -
                a.normalizedScore
            );

        }
    );


    const highestScore =
        normalizedMatches[0].normalizedScore;


    const summary =
        getSearchSummary(
            highestScore
        );


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    resultsContainer.innerHTML = `

        <div class="results-header">

            <div>

                <span class="section-label">
                    RAG RETRIEVAL RESULTS
                </span>

                <h2>
                    Similar Historical Defects
                </h2>

                <p>
                    ${normalizedMatches.length}
                    result(s) retrieved from the
                    vector index.
                </p>

            </div>

        </div>


        <!-- =============================================
             SEARCH SUMMARY
        ============================================== -->

        <div class="similarity-summary">

            <div class="summary-main">

                <div class="summary-label">
                    Highest Similarity
                </div>

                <div class="summary-score">
                    ${highestScore * 100}%
                </div>

                <div class="summary-description">
                    ${escapeHTML(summary.description)}
                </div>

            </div>


            <div class="summary-status ${summary.className}">

                <span class="status-dot"></span>

                ${escapeHTML(summary.label)}

            </div>

        </div>


        <!-- =============================================
             THRESHOLD LEGEND
        ============================================== -->

        <div class="threshold-legend">

            <div class="legend-title">
                Similarity Classification
            </div>

            <div class="legend-items">

                <span class="legend-item duplicate">
                    <b>≥ 82%</b>
                    Duplicate
                </span>

                <span class="legend-item related">
                    <b>65–81.9%</b>
                    Related
                </span>

                <span class="legend-item unmatched">
                    <b>&lt; 65%</b>
                    Weak / Unmatched
                </span>

            </div>

        </div>


        <!-- =============================================
             RESULT CARDS
        ============================================== -->

        <div class="results-list">

            ${normalizedMatches
                .map(
                    function (match, index) {

                        return renderResultCard(
                            match,
                            index
                        );

                    }
                )
                .join("")}

        </div>

    `;

}


/* =========================================================
   RESULT CARD
========================================================= */

function renderResultCard(
    match,
    index
) {

    const title =
        match.title ||
        "Untitled Historical Defect";


    const project =
        match.project ||
        "Unknown Project";


    const bugId =
        match.bug_id ||
        "Unknown ID";


    const description =
        match.description ||
        "No defect description available.";


    const resolution =
        match.resolution ||
        "Not recorded";


    const score =
        match.normalizedScore;


    const percentage =
        match.percentage;


    const classification =
        match.classification;


    return `

        <article class="result-card">

            <!-- =========================================
                 CARD HEADER
            ========================================== -->

            <div class="result-top">

                <div class="result-title-area">

                    <div class="result-rank">
                        #${index + 1}
                    </div>

                    <div>

                        <h3>
                            ${escapeHTML(title)}
                        </h3>

                        <div class="meta">

                            <span>
                                ${escapeHTML(project)}
                            </span>

                            <span class="meta-separator">
                                ·
                            </span>

                            <span>
                                ${escapeHTML(bugId)}
                            </span>

                        </div>

                    </div>

                </div>


                <!-- SCORE -->

                <div class="score-area">

                    <div
                        class="score ${classification.className}"
                    >

                        ${percentage.toFixed(1)}%

                    </div>

                    <span
                        class="classification-badge ${classification.className}"
                    >

                        ${escapeHTML(
                            classification.label
                        )}

                    </span>

                </div>

            </div>


            <!-- =========================================
                 SCORE BAR
            ========================================== -->

            <div class="score-bar-container">

                <div class="score-bar-background">

                    <div
                        class="score-bar ${classification.className}"
                        style="width:${percentage}%"
                    ></div>

                </div>

            </div>


            <!-- =========================================
                 DESCRIPTION
            ========================================== -->

            <div class="result-section">

                <h4>
                    Historical Defect
                </h4>

                <p>
                    ${escapeHTML(description)}
                </p>

            </div>


            <!-- =========================================
                 RESOLUTION
            ========================================== -->

            <div class="resolution-box">

                <strong>
                    Historical Resolution
                </strong>

                <span>
                    ${escapeHTML(resolution)}
                </span>

            </div>


            <!-- =========================================
                 INTERPRETATION
            ========================================== -->

            <div class="match-interpretation">

                <span class="interpretation-label">
                    Retrieval Interpretation:
                </span>

                <span>
                    ${escapeHTML(
                        getResultInterpretation(
                            score
                        )
                    )}
                </span>

            </div>

        </article>

    `;

}


/* =========================================================
   SIMILARITY CLASSIFICATION
========================================================= */

function classifySimilarity(
    score
) {

    if (
        score >=
        SIMILARITY_THRESHOLDS.DUPLICATE
    ) {

        return {

            label: "Duplicate",
            className: "duplicate"

        };

    }


    if (
        score >=
        SIMILARITY_THRESHOLDS.RELATED
    ) {

        return {

            label: "Related",
            className: "related"

        };

    }


    return {

        label: "Weak Match",
        className: "unmatched"

    };

}


/* =========================================================
   RESULT INTERPRETATION
========================================================= */

function getResultInterpretation(
    score
) {

    if (
        score >=
        SIMILARITY_THRESHOLDS.DUPLICATE
    ) {

        return (
            "Very strong semantic similarity. " +
            "The historical defect may represent the same issue."
        );

    }


    if (
        score >=
        SIMILARITY_THRESHOLDS.RELATED
    ) {

        return (
            "The historical defect is semantically related " +
            "and may provide useful diagnostic evidence."
        );

    }


    return (
        "The result was retrieved from the vector index, " +
        "but its similarity is below the Related threshold."
    );

}


/* =========================================================
   SEARCH SUMMARY
========================================================= */

function getSearchSummary(
    score
) {

    if (
        score >=
        SIMILARITY_THRESHOLDS.DUPLICATE
    ) {

        return {

            label: "Strong Duplicate Candidate",

            className: "duplicate",

            description:
                "The highest-ranked historical defect has " +
                "very strong semantic similarity."

        };

    }


    if (
        score >=
        SIMILARITY_THRESHOLDS.RELATED
    ) {

        return {

            label: "Related Historical Defect",

            className: "related",

            description:
                "The highest-ranked historical defect is " +
                "semantically related to the query."

        };

    }


    return {

        label: "Low Similarity Retrieval",

        className: "unmatched",

        description:
            "Historical defects were retrieved, but the " +
            "highest similarity is below the Related threshold."

    };

}


/* =========================================================
   NORMALIZE SCORE
========================================================= */

function normalizeScore(
    value
) {

    let score =
        Number(value);


    if (!Number.isFinite(score)) {

        return 0;

    }


    /*
     * Backend normally returns a value between 0 and 1.
     *
     * If a backend response ever sends 54.1 instead
     * of 0.541, convert it automatically.
     */

    if (score > 1) {

        score =
            score / 100;

    }


    return Math.max(
        0,
        Math.min(
            1,
            score
        )
    );

}


/* =========================================================
   LOADING STATE
========================================================= */

function setLoadingState(
    loading
) {

    if (!searchButton) {
        return;
    }


    searchButton.disabled =
        loading;


    searchButton.textContent =
        loading
            ? "Searching..."
            : "Find Similar Defects";

}


/* =========================================================
   ERROR DISPLAY
========================================================= */

function renderError(
    error
) {

    if (!resultsContainer) {
        return;
    }


    resultsContainer.innerHTML = `

        <div class="card error-card">

            <div class="error-icon">
                !
            </div>

            <h2>
                Search Error
            </h2>

            <p>
                ${escapeHTML(
                    getFriendlyErrorMessage(
                        error
                    )
                )}
            </p>

            <hr>

            <p>
                Make sure the BugAI backend is running:
            </p>

            <code>
                python backend/app.py
            </code>

            <button
                class="retry-button"
                onclick="searchSimilarDefects()"
            >
                Try Again
            </button>

        </div>

    `;

}


/* =========================================================
   SIMPLE MESSAGE
========================================================= */

function showMessage(
    type,
    message
) {

    if (!resultsContainer) {
        return;
    }


    resultsContainer.innerHTML = `

        <div class="card ${type}-card">

            <h3>
                ${type === "warning"
                    ? "Input Required"
                    : "Information"}
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;

}


/* =========================================================
   FRIENDLY ERROR MESSAGE
========================================================= */

function getFriendlyErrorMessage(
    error
) {

    if (
        error instanceof TypeError &&
        error.message.includes(
            "Failed to fetch"
        )
    ) {

        return (
            "Unable to connect to the BugAI backend. " +
            "Make sure Python is running on " +
            "http://127.0.0.1:5000."
        );

    }


    return (
        error?.message ||
        "An unexpected error occurred."
    );

}


/* =========================================================
   HTML ESCAPING
========================================================= */

function escapeHTML(
    value
) {

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