/* =========================================================
   BUGAI — KNOWLEDGE BASE
   Backend: http://127.0.0.1:5000
   ========================================================= */

const API_BASE_URL =
    "http://127.0.0.1:5000";


let allRecords = [];


/* =========================================================
   LOAD KNOWLEDGE BASE STATISTICS
   ========================================================= */

async function loadStats() {

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/knowledge-base/stats`
        );


        const text =
            await response.text();


        if (!text) {

            throw new Error(
                "Backend returned an empty response."
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


        document.getElementById(
            "mozillaCount"
        ).textContent =
            stats.by_project?.Mozilla ?? 0;


        document.getElementById(
            "apacheCount"
        ).textContent =
            stats.by_project?.Apache ?? 0;


        document.getElementById(
            "eclipseCount"
        ).textContent =
            stats.by_project?.Eclipse ?? 0;


        document.getElementById(
            "indexedCount"
        ).textContent =
            stats.indexed_records ?? 0;


    } catch (error) {

        console.error(
            "Knowledge Base Stats Error:",
            error
        );


        document.getElementById(
            "mozillaCount"
        ).textContent = "—";


        document.getElementById(
            "apacheCount"
        ).textContent = "—";


        document.getElementById(
            "eclipseCount"
        ).textContent = "—";


        document.getElementById(
            "indexedCount"
        ).textContent = "—";

    }

}


/* =========================================================
   LOAD HISTORICAL DEFECT RECORDS
   ========================================================= */

async function loadRecords() {

    const recordsContainer =
        document.getElementById(
            "records"
        );


    try {

        const response = await fetch(
            `${API_BASE_URL}/api/knowledge-base/records`
        );


        const text =
            await response.text();


        if (!text) {

            throw new Error(
                "Backend returned an empty response."
            );

        }


        const data =
            JSON.parse(text);


        if (!response.ok) {

            throw new Error(
                data.error ||
                `HTTP ${response.status}`
            );

        }


        allRecords =
            Array.isArray(data.records)
                ? data.records
                : [];


        renderRecords();


    } catch (error) {

        console.error(
            "Knowledge Base Records Error:",
            error
        );


        recordsContainer.innerHTML = `

            <div class="card">

                <h3>
                    Unable to load knowledge base
                </h3>

                <p>
                    Make sure the Python backend is running
                    on port 5000.
                </p>

            </div>

        `;

    }

}


/* =========================================================
   RENDER RECORDS
   ========================================================= */

function renderRecords() {

    const recordsContainer =
        document.getElementById(
            "records"
        );


    const searchInput =
        document.getElementById(
            "search"
        );


    const projectFilter =
        document.getElementById(
            "projectFilter"
        );


    const query =
        (
            searchInput?.value || ""
        )
            .toLowerCase()
            .trim();


    const selectedProject =
        projectFilter?.value || "";


    const filteredRecords =
        allRecords.filter(
            function (record) {

                const searchableText =
                    `
                    ${record.bug_id || ""}
                    ${record.project || ""}
                    ${record.title || ""}
                    ${record.description || ""}
                    ${record.stack_trace || ""}
                    ${record.resolution || ""}
                    `
                        .toLowerCase();


                const matchesSearch =
                    !query ||
                    searchableText.includes(
                        query
                    );


                const matchesProject =
                    !selectedProject ||
                    record.project ===
                        selectedProject;


                return (
                    matchesSearch &&
                    matchesProject
                );

            }
        );


    if (!filteredRecords.length) {

        recordsContainer.innerHTML = `

            <div class="card">

                <p>
                    No matching historical defects found.
                </p>

            </div>

        `;

        return;

    }


    recordsContainer.innerHTML =
        filteredRecords
            .map(
                function (record) {

                    return `

                        <article class="record">

                            <div class="record-head">

                                <div>

                                    <h3>
                                        ${escapeHTML(
                                            record.title
                                        )}
                                    </h3>

                                    <span class="tag">
                                        ${escapeHTML(
                                            record.project
                                        )}
                                    </span>

                                </div>

                                <strong>
                                    ${escapeHTML(
                                        record.bug_id
                                    )}
                                </strong>

                            </div>


                            <p>
                                ${escapeHTML(
                                    record.description
                                )}
                            </p>


                            ${
                                record.stack_trace
                                    ? `
                                        <p>
                                            <strong>
                                                Stack Trace:
                                            </strong>

                                            ${escapeHTML(
                                                record.stack_trace
                                            )}
                                        </p>
                                      `
                                    : ""
                            }


                            <p>

                                <strong>
                                    Resolution:
                                </strong>

                                ${escapeHTML(
                                    record.resolution ||
                                    "Not recorded"
                                )}

                            </p>

                        </article>

                    `;

                }
            )
            .join("");

}


/* =========================================================
   BUILD / REBUILD VECTOR INDEX
   ========================================================= */

async function buildIndex() {

    const button =
        document.getElementById(
            "buildIndex"
        );


    button.disabled = true;

    button.textContent =
        "Building Vector Index...";


    try {

        const response =
            await fetch(
                `${API_BASE_URL}/api/knowledge-base/index`,
                {
                    method: "POST"
                }
            );


        const text =
            await response.text();


        if (!text) {

            throw new Error(
                "Backend returned an empty response."
            );

        }


        const data =
            JSON.parse(text);


        if (!response.ok) {

            throw new Error(
                data.error ||
                `HTTP ${response.status}`
            );

        }


        alert(

            "Vector index built successfully!\n\n" +

            `Indexed Records: ${
                data.indexed_records
            }\n` +

            `Total Chunks: ${
                data.total_chunks
            }\n` +

            `Embedding Model: ${
                data.embedding_model
            }`

        );


        await loadStats();


    } catch (error) {

        console.error(
            "Vector Index Error:",
            error
        );


        alert(

            "Vector index build failed.\n\n" +

            getFriendlyErrorMessage(
                error
            )

        );

    } finally {

        button.disabled = false;

        button.textContent =
            "Build / Rebuild Vector Index";

    }

}


/* =========================================================
   SEARCH EVENT
   ========================================================= */

const searchInput =
    document.getElementById(
        "search"
    );


if (searchInput) {

    searchInput.addEventListener(
        "input",
        renderRecords
    );

}


/* =========================================================
   PROJECT FILTER
   ========================================================= */

const projectFilter =
    document.getElementById(
        "projectFilter"
    );


if (projectFilter) {

    projectFilter.addEventListener(
        "change",
        renderRecords
    );

}


/* =========================================================
   BUILD INDEX BUTTON
   ========================================================= */

const buildIndexButton =
    document.getElementById(
        "buildIndex"
    );


if (buildIndexButton) {

    buildIndexButton.addEventListener(
        "click",
        buildIndex
    );

}


/* =========================================================
   FRIENDLY ERROR
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
            "Unable to connect to the Python backend. " +
            "Run: python backend/app.py"
        );

    }


    return (
        error.message ||
        "Unknown error."
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


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadStats();

        loadRecords();

    }
);