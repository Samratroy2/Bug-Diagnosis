/* =========================================================
   BUGAI — KNOWLEDGE BASE
   Milestone 3
========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";

const RECORDS_PER_PAGE = 20;

let allRecords = [];
let currentPage = 1;
let totalRecords = 0;
let totalPages = 1;

let currentSearch = "";
let currentProject = "";

let searchTimer = null;


/* =========================================================
   DOM
========================================================= */

function getElement(id) {
    return document.getElementById(id);
}


/* =========================================================
   API
========================================================= */

async function apiRequest(url, options = {}) {

    const response = await fetch(url, options);

    const text = await response.text();

    if (!text) {
        throw new Error(
            "Backend returned an empty response."
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Invalid JSON response from backend (${response.status}).`
        );
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            data.message ||
            `HTTP ${response.status}`
        );
    }

    return data;
}


/* =========================================================
   NUMBER FORMAT
========================================================= */

function formatNumber(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return number.toLocaleString("en-IN");
}


/* =========================================================
   STATS
========================================================= */

async function loadStats() {

    try {

        setIndexStatus(
            "Checking...",
            "checking"
        );

        const stats = await apiRequest(
            `${API_BASE_URL}/api/knowledge-base/stats`
        );

        const byProject =
            stats.by_project || {};

        getElement("mozillaCount").textContent =
            formatNumber(
                byProject.Mozilla || 0
            );

        getElement("apacheCount").textContent =
            formatNumber(
                byProject.Apache || 0
            );

        getElement("eclipseCount").textContent =
            formatNumber(
                byProject.Eclipse || 0
            );


        const datasetTotal =
            Number(
                stats.total_records ??
                stats.records ??
                stats.knowledge_base_records ??
                0
            ) || 0;

        /*
         * Do not overwrite filtered pagination totals here
         * after a search/filter has been applied.
         */
        if (!currentSearch && !currentProject) {
            totalRecords = datasetTotal;
        }

        getElement("totalCount").textContent =
            formatNumber(datasetTotal);

        getElement("datasetRecords").textContent =
            formatNumber(datasetTotal);


        /*
         * Prefer the actual FAISS vector count.
         */
        const faissVectorCount =
            Number(
                stats.index_vectors ??
                stats.faiss_vectors ??
                stats.indexed_vectors ??
                stats.indexed_records ??
                0
            ) || 0;


        getElement("indexedCount").textContent =
            formatNumber(faissVectorCount);

        getElement("faissVectors").textContent =
            formatNumber(faissVectorCount);


        getElement("embeddingModel").textContent =
            stats.embedding_model ||
            stats.model ||
            "all-MiniLM-L6-v2";


        getElement("vectorDimension").textContent =
            stats.embedding_dimension ??
            stats.dimension ??
            384;


        const indexExists =
            stats.index_exists !== false;

        const metadataExists =
            stats.metadata_exists !== false;


        if (
            indexExists &&
            metadataExists &&
            faissVectorCount >= datasetTotal &&
            datasetTotal > 0
        ) {

            setIndexStatus(
                "Ready",
                "ready"
            );

            markPipelineReady();

        } else if (
            faissVectorCount > 0
        ) {

            setIndexStatus(
                "Partial",
                "partial"
            );

            markPipelinePartial();

        } else {

            setIndexStatus(
                "Not Built",
                "not-ready"
            );

            markPipelineNotReady();
        }

    } catch (error) {

        console.error(
            "Knowledge Base Stats Error:",
            error
        );

        setIndexStatus(
            "Backend Offline",
            "error"
        );
    }
}


/* =========================================================
   STATUS
========================================================= */

function setIndexStatus(text, statusClass) {

    const element =
        getElement("indexStatus");

    if (!element) {
        return;
    }

    element.textContent = text;

    element.className =
        `status ${statusClass}`;
}


/* =========================================================
   PIPELINE
========================================================= */

function markPipelineReady() {

    const step =
        getElement("faissPipelineStep");

    if (!step) {
        return;
    }

    step.classList.add("active");

    step.classList.remove("partial");
}


function markPipelinePartial() {

    const step =
        getElement("faissPipelineStep");

    if (!step) {
        return;
    }

    step.classList.add(
        "active",
        "partial"
    );
}


function markPipelineNotReady() {

    const step =
        getElement("faissPipelineStep");

    if (!step) {
        return;
    }

    step.classList.remove(
        "active",
        "partial"
    );
}


/* =========================================================
   LOAD RECORDS
========================================================= */

async function loadRecords() {

    const recordsContainer =
        getElement("records");

    if (!recordsContainer) {
        return;
    }

    setPaginationLoading(true);

    recordsContainer.innerHTML = `
        <div class="card loading-card">
            <div class="loading-spinner"></div>
            <h3>Loading knowledge base...</h3>
            <p>Fetching historical defect records.</p>
        </div>
    `;

    try {

        const params =
            new URLSearchParams();

        params.set(
            "page",
            String(currentPage)
        );

        params.set(
            "limit",
            String(RECORDS_PER_PAGE)
        );

        if (currentSearch) {

            params.set(
                "search",
                currentSearch
            );
        }

        if (currentProject) {

            params.set(
                "project",
                currentProject
            );
        }


        const url =
            `${API_BASE_URL}/api/knowledge-base/records?${params.toString()}`;

        console.log(
            "Loading KB page:",
            currentPage,
            url
        );


        const data =
            await apiRequest(url);


        allRecords =
            Array.isArray(data.records)
                ? data.records
                : [];


        /*
         * Use the page returned by backend.
         */
        currentPage =
            Number(data.page) ||
            currentPage;


        totalRecords =
            Number(
                data.total_records ??
                data.total ??
                0
            ) || 0;


        totalPages =
            Number(data.total_pages) ||
            Math.max(
                1,
                Math.ceil(
                    totalRecords /
                    RECORDS_PER_PAGE
                )
            );


        renderRecords();

        updateRecordsSummary();

        updatePagination(
            data.has_previous,
            data.has_next
        );

    } catch (error) {

        console.error(
            "Knowledge Base Records Error:",
            error
        );

        recordsContainer.innerHTML = `
            <div class="card error-card">

                <h3>
                    Unable to load knowledge base
                </h3>

                <p>
                    ${escapeHTML(
                        getFriendlyErrorMessage(error)
                    )}
                </p>

                <button
                    type="button"
                    onclick="loadRecords()"
                >
                    Try Again
                </button>

            </div>
        `;

        updatePagination();

    } finally {

        setPaginationLoading(false);
    }
}


/* =========================================================
   RENDER
========================================================= */

function renderRecords() {

    const recordsContainer =
        getElement("records");

    if (!recordsContainer) {
        return;
    }


    if (!allRecords.length) {

        recordsContainer.innerHTML = `
            <div class="card">

                <h3>
                    No matching historical defects
                </h3>

                <p>
                    Try another search term or
                    project filter.
                </p>

            </div>
        `;

        return;
    }


    recordsContainer.innerHTML =
        allRecords.map(record => {

            const title =
                record.title ||
                "Untitled defect";

            const project =
                record.project ||
                "Unknown";

            const bugId =
                record.bug_id ||
                "Unknown ID";

            const description =
                record.description ||
                "No description available.";

            const resolution =
                record.resolution ||
                "Not recorded";

            const severity =
                record.severity || "";

            const priority =
                record.priority || "";

            const component =
                record.affected_component || "";

            const stackTrace =
                record.stack_trace || "";


            return `
                <article class="record">

                    <div class="record-head">

                        <div>

                            <h3>
                                ${escapeHTML(title)}
                            </h3>

                            <div class="record-tags">

                                <span class="tag">
                                    ${escapeHTML(project)}
                                </span>

                                ${
                                    severity
                                    ? `
                                        <span class="tag severity-tag">
                                            ${escapeHTML(severity)}
                                        </span>
                                      `
                                    : ""
                                }

                                ${
                                    priority
                                    ? `
                                        <span class="tag priority-tag">
                                            ${escapeHTML(priority)}
                                        </span>
                                      `
                                    : ""
                                }

                                ${
                                    component
                                    ? `
                                        <span class="tag component-tag">
                                            ${escapeHTML(component)}
                                        </span>
                                      `
                                    : ""
                                }

                            </div>

                        </div>


                        <strong class="bug-id">
                            ${escapeHTML(bugId)}
                        </strong>

                    </div>


                    <p>
                        ${escapeHTML(description)}
                    </p>


                    ${
                        stackTrace
                        ? `
                            <details class="stack-details">

                                <summary>
                                    Stack Trace / Error Log
                                </summary>

                                <pre>${escapeHTML(stackTrace)}</pre>

                            </details>
                          `
                        : ""
                    }


                    <p class="resolution">

                        <strong>
                            Resolution:
                        </strong>

                        ${escapeHTML(resolution)}

                    </p>


                    ${
                        record.source_file
                        ? `
                            <small class="source">
                                Source:
                                ${escapeHTML(record.source_file)}
                            </small>
                          `
                        : ""
                    }

                </article>
            `;

        }).join("");
}


/* =========================================================
   RECORD SUMMARY
========================================================= */

function updateRecordsSummary() {

    const element =
        getElement("recordsSummary");

    if (!element) {
        return;
    }


    if (
        totalRecords === 0 ||
        allRecords.length === 0
    ) {

        element.textContent =
            "No records displayed.";

        return;
    }


    const start =
        (
            (currentPage - 1) *
            RECORDS_PER_PAGE
        ) + 1;


    const end =
        Math.min(
            start +
            allRecords.length -
            1,
            totalRecords
        );


    element.textContent =
        `Showing ${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(totalRecords)} records`;
}


/* =========================================================
   PAGINATION
========================================================= */

function updatePagination(
    backendHasPrevious = null,
    backendHasNext = null
) {

    const previous =
        getElement("previousPage");

    const next =
        getElement("nextPage");

    const pageNumber =
        getElement("pageNumber");


    totalPages =
        Math.max(
            1,
            totalPages ||
            Math.ceil(
                totalRecords /
                RECORDS_PER_PAGE
            )
        );


    if (previous) {

        previous.disabled =
            backendHasPrevious !== null
                ? !backendHasPrevious
                : currentPage <= 1;
    }


    if (next) {

        next.disabled =
            backendHasNext !== null
                ? !backendHasNext
                : currentPage >= totalPages;
    }


    if (pageNumber) {

        pageNumber.textContent =
            `Page ${formatNumber(currentPage)} of ${formatNumber(totalPages)}`;
    }
}


function setPaginationLoading(loading) {

    const previous =
        getElement("previousPage");

    const next =
        getElement("nextPage");


    if (loading) {

        if (previous) {
            previous.disabled = true;
        }

        if (next) {
            next.disabled = true;
        }
    }
}


/* =========================================================
   NEXT PAGE
========================================================= */

async function nextPage() {

    if (currentPage >= totalPages) {
        return;
    }

    currentPage += 1;

    await loadRecords();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================================
   PREVIOUS PAGE
========================================================= */

async function previousPage() {

    if (currentPage <= 1) {
        return;
    }

    currentPage -= 1;

    await loadRecords();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================================
   SEARCH
========================================================= */

function handleSearch() {

    clearTimeout(searchTimer);

    searchTimer =
        setTimeout(
            async () => {

                const input =
                    getElement("search");

                currentSearch =
                    (
                        input?.value ||
                        ""
                    ).trim();

                currentPage = 1;

                updateSearchInfo();

                await loadRecords();

            },
            350
        );
}


/* =========================================================
   PROJECT FILTER
========================================================= */

async function handleProjectFilter() {

    const select =
        getElement("projectFilter");

    currentProject =
        select?.value || "";

    currentPage = 1;

    updateSearchInfo();

    await loadRecords();
}


/* =========================================================
   SEARCH INFO
========================================================= */

function updateSearchInfo() {

    const element =
        getElement("searchInfo");

    if (!element) {
        return;
    }


    if (
        currentSearch &&
        currentProject
    ) {

        element.textContent =
            `"${currentSearch}" in ${currentProject}`;

    } else if (currentSearch) {

        element.textContent =
            `Searching "${currentSearch}"`;

    } else if (currentProject) {

        element.textContent =
            `${currentProject} records`;

    } else {

        element.textContent =
            "Search records";
    }
}


/* =========================================================
   REFRESH
========================================================= */

async function refreshStatus() {

    const button =
        getElement("refreshStats");

    if (button) {

        button.disabled = true;

        button.textContent =
            "Refreshing...";
    }


    try {

        await loadStats();

        await loadRecords();

    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                "Refresh Status";
        }
    }
}


/* =========================================================
   FRIENDLY ERROR
========================================================= */

function getFriendlyErrorMessage(error) {

    if (
        error instanceof TypeError &&
        error.message.includes(
            "Failed to fetch"
        )
    ) {

        return (
            "Unable to connect to the Python backend. " +
            "Run: python backend\\app.py"
        );
    }

    return (
        error?.message ||
        "Unknown error."
    );
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {

    return String(
        value ?? ""
    ).replace(
        /[&<>"']/g,
        character => {

            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[character];
        }
    );
}


/* =========================================================
   EVENTS
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        const previous =
            getElement("previousPage");

        const next =
            getElement("nextPage");

        const search =
            getElement("search");

        const projectFilter =
            getElement("projectFilter");

        const refresh =
            getElement("refreshStats");


        if (previous) {
            previous.addEventListener(
                "click",
                previousPage
            );
        }


        if (next) {
            next.addEventListener(
                "click",
                nextPage
            );
        }


        if (search) {
            search.addEventListener(
                "input",
                handleSearch
            );
        }


        if (projectFilter) {
            projectFilter.addEventListener(
                "change",
                handleProjectFilter
            );
        }


        if (refresh) {
            refresh.addEventListener(
                "click",
                refreshStatus
            );
        }


        /*
         * Load both initial datasets.
         */
        await Promise.all([
            loadStats(),
            loadRecords()
        ]);
    }
);