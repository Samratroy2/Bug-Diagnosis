/* =========================================================
   BUGAI — SEMANTIC SIMILARITY
   Backend: http://127.0.0.1:5000
   ========================================================= */

const API_BASE_URL =
    "http://127.0.0.1:5000";


const searchButton =
    document.getElementById(
        "searchButton"
    );


if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchSimilarDefects
    );

}


/* =========================================================
   SEARCH SIMILAR DEFECTS
   ========================================================= */

async function searchSimilarDefects() {

    const query =
        document.getElementById(
            "query"
        ).value.trim();


    const project =
        document.getElementById(
            "project"
        ).value;


    const topK =
        document.getElementById(
            "topK"
        )?.value || 5;


    const results =
        document.getElementById(
            "results"
        );


    if (!query) {

        alert(
            "Please enter a bug description or error."
        );

        return;

    }


    searchButton.disabled = true;

    searchButton.textContent =
        "Searching...";


    results.innerHTML = `

        <div class="card">

            <h3>
                Searching Historical Defects...
            </h3>

            <p>
                Generating the query embedding and
                searching the FAISS vector index.
            </p>

        </div>

    `;


    try {

        const params =
            new URLSearchParams();


        params.set(
            "q",
            query
        );


        params.set(
            "top_k",
            topK
        );


        if (project) {

            params.set(
                "project",
                project
            );

        }


        const response =
            await fetch(
                `${API_BASE_URL}/api/search?${params.toString()}`
            );


        const text =
            await response.text();


        if (!text) {

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


        if (!response.ok) {

            throw new Error(
                data.error ||
                `Search failed (HTTP ${response.status}).`
            );

        }


        renderResults(
            data.results || []
        );


    } catch (error) {

        console.error(
            "Semantic Search Error:",
            error
        );


        results.innerHTML = `

            <div class="card">

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
                    Make sure the backend is running:
                </p>

                <strong>
                    python backend/app.py
                </strong>

            </div>

        `;

    } finally {

        searchButton.disabled = false;

        searchButton.textContent =
            "Find Similar Defects";

    }

}


/* =========================================================
   RENDER SEARCH RESULTS
   ========================================================= */

function renderResults(
    matches
) {

    const results =
        document.getElementById(
            "results"
        );


    if (!matches.length) {

        results.innerHTML = `

            <div class="card">

                <h3>
                    No Similar Defects Found
                </h3>

                <p>
                    No historical defect matched the
                    submitted query strongly enough.
                </p>

            </div>

        `;

        return;

    }


    results.innerHTML = `

        <div class="results-header">

            <h2>
                Similar Historical Defects
            </h2>

            <p>
                ${matches.length}
                result(s) retrieved from the
                vector index.
            </p>

        </div>


        ${matches
            .map(
                function (match, index) {

                    const score =
                        Number(
                            match.score || 0
                        );


                    const percentage =
                        Math.max(
                            0,
                            Math.min(
                                100,
                                score * 100
                            )
                        );


                    return `

                        <article
                            class="result-card"
                        >

                            <div
                                style="
                                    display:flex;
                                    justify-content:space-between;
                                    align-items:flex-start;
                                    gap:15px;
                                "
                            >

                                <div>

                                    <h3>
                                        #${index + 1}
                                        —
                                        ${escapeHTML(
                                            match.title
                                        )}
                                    </h3>

                                    <div class="meta">

                                        ${escapeHTML(
                                            match.project
                                        )}

                                        ·

                                        ${escapeHTML(
                                            match.bug_id
                                        )}

                                    </div>

                                </div>


                                <div class="score">

                                    ${percentage.toFixed(1)}%

                                </div>

                            </div>


                            <p>

                                ${escapeHTML(
                                    match.description
                                )}

                            </p>


                            <p>

                                <strong>
                                    Historical Resolution:
                                </strong>

                                ${escapeHTML(
                                    match.resolution ||
                                    "Not recorded"
                                )}

                            </p>

                        </article>

                    `;

                }
            )
            .join("")}

    `;

}


/* =========================================================
   ENTER KEY SUPPORT
   ========================================================= */

const queryInput =
    document.getElementById(
        "query"
    );


if (queryInput) {

    queryInput.addEventListener(
        "keydown",
        function (event) {

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
        error.message ||
        "An unexpected error occurred."
    );

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