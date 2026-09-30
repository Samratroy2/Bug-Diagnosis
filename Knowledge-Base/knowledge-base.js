/*
=========================================================
   BUGAI — KNOWLEDGE BASE
   Milestone 3 / Milestone 4
=========================================================
*/

const API_BASE_URL = "http://127.0.0.1:5000";

const RECORDS_PER_PAGE = 20;

let allRecords = [];
let currentPage = 1;
let totalRecords = 0;
let totalPages = 1;

let currentSearch = "";
let currentProject = "";

let searchTimer = null;
let searchController = null;
let recordsController = null;


/* =========================================================
   DOM
========================================================= */

function getElement(id) {
    return document.getElementById(id);
}


/* =========================================================
   API REQUEST
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


        /* -------------------------------------------------
           PROJECT COUNTS
        ------------------------------------------------- */

        const mozillaCount =
            getElement("mozillaCount");

        const apacheCount =
            getElement("apacheCount");

        const eclipseCount =
            getElement("eclipseCount");


        if (mozillaCount) {

            mozillaCount.textContent =
                formatNumber(
                    byProject.Mozilla || 0
                );

        }


        if (apacheCount) {

            apacheCount.textContent =
                formatNumber(
                    byProject.Apache || 0
                );

        }


        if (eclipseCount) {

            eclipseCount.textContent =
                formatNumber(
                    byProject.Eclipse || 0
                );

        }


        /* -------------------------------------------------
           DATASET TOTAL
        ------------------------------------------------- */

        const datasetTotal =
            Number(
                stats.total_records ??
                stats.records ??
                stats.knowledge_base_records ??
                0
            ) || 0;


        /*
         * Only update pagination total when there
         * is no active search/filter.
         */

        if (
            !currentSearch &&
            !currentProject
        ) {

            totalRecords = datasetTotal;

        }


        const totalCount =
            getElement("totalCount");

        if (totalCount) {

            totalCount.textContent =
                formatNumber(datasetTotal);

        }


        const datasetRecords =
            getElement("datasetRecords");

        if (datasetRecords) {

            datasetRecords.textContent =
                formatNumber(datasetTotal);

        }


        /* -------------------------------------------------
           FAISS COUNT
        ------------------------------------------------- */

        const faissVectorCount =
            Number(
                stats.index_vectors ??
                stats.faiss_vectors ??
                stats.indexed_vectors ??
                stats.indexed_records ??
                0
            ) || 0;


        const indexedCount =
            getElement("indexedCount");

        if (indexedCount) {

            indexedCount.textContent =
                formatNumber(faissVectorCount);

        }


        const faissVectors =
            getElement("faissVectors");

        if (faissVectors) {

            faissVectors.textContent =
                formatNumber(faissVectorCount);

        }


        /* -------------------------------------------------
           EMBEDDING MODEL
        ------------------------------------------------- */

        const embeddingModel =
            getElement("embeddingModel");

        if (embeddingModel) {

            embeddingModel.textContent =
                stats.embedding_model ||
                stats.model ||
                "all-MiniLM-L6-v2";

        }


        /* -------------------------------------------------
           VECTOR DIMENSION
        ------------------------------------------------- */

        const vectorDimension =
            getElement("vectorDimension");

        if (vectorDimension) {

            vectorDimension.textContent =
                stats.embedding_dimension ??
                stats.dimension ??
                384;

        }


        /* -------------------------------------------------
           INDEX STATUS
        ------------------------------------------------- */

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

        }

        else if (
            faissVectorCount > 0
        ) {

            setIndexStatus(
                "Partial",
                "partial"
            );

            markPipelinePartial();

        }

        else {

            setIndexStatus(
                "Not Built",
                "not-ready"
            );

            markPipelineNotReady();

        }

    }

    catch (error) {

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

function setIndexStatus(
    text,
    statusClass
) {

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
   LOAD NORMAL RECORDS
========================================================= */

async function loadRecords({
    keepExisting = false
} = {}) {

    const recordsContainer =
        getElement("records");

    if (!recordsContainer) {
        return;
    }


    /*
     * Cancel previous normal-record request.
     */

    if (recordsController) {
        recordsController.abort();
    }

    recordsController =
        new AbortController();


    setPaginationLoading(true);


    if (
        !keepExisting ||
        !allRecords.length
    ) {

        recordsContainer.innerHTML = `

            <div class="card loading-card">

                <div
                    class="loading-spinner"
                    aria-hidden="true"
                ></div>

                <h3>
                    Loading historical defects...
                </h3>

                <p>
                    Fetching ${RECORDS_PER_PAGE} records.
                </p>

            </div>

        `;

    }


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


        /*
         * Project-only filter uses the normal
         * backend records endpoint.
         *
         * Text searches are NOT handled here.
         * They use FAISS through searchKnowledgeBase().
         */

        if (currentProject) {

            params.set(
                "project",
                currentProject
            );

        }


        const url =
            `${API_BASE_URL}/api/knowledge-base/records?${params.toString()}`;


        console.log(
            "Loading Knowledge Base records:",
            url
        );


        const timeout =
            setTimeout(
                () => recordsController.abort(),
                30000
            );


        try {

            const data =
                await apiRequest(
                    url,
                    {
                        signal:
                            recordsController.signal
                    }
                );


            allRecords =
                Array.isArray(data.records)
                    ? data.records
                    : [];


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

        }

        finally {

            clearTimeout(timeout);

        }

    }

    catch (error) {

        if (
            error.name === "AbortError"
        ) {

            /*
             * Do not show timeout error when
             * another request cancelled this one.
             */

            if (
                recordsController &&
                recordsController.signal.aborted
            ) {

                console.log(
                    "Previous records request cancelled."
                );

            }

        }

        else {

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

        }

        updatePagination();

    }

    finally {

        setPaginationLoading(false);

    }

}


/* =========================================================
   FAST SEMANTIC SEARCH
========================================================= */

/*
 * IMPORTANT:
 *
 * Text search now goes through:
 *
 * /api/search
 *
 * instead of:
 *
 * /api/knowledge-base/records?search=...
 *
 * This means the backend uses the existing
 * 1,311,079-vector FAISS index rather than
 * scanning the entire defects.csv file.
 */

async function searchKnowledgeBase() {

    const recordsContainer =
        getElement("records");

    if (!recordsContainer) {
        return;
    }


    /*
     * Cancel previous semantic-search request.
     */

    if (searchController) {

        searchController.abort();

    }


    searchController =
        new AbortController();


    setPaginationLoading(true);


    recordsContainer.innerHTML = `

        <div class="card loading-card">

            <div
                class="loading-spinner"
                aria-hidden="true"
            ></div>

            <h3>
                Searching knowledge base...
            </h3>

            <p>
                Searching the FAISS semantic index.
            </p>

        </div>

    `;


    try {

        const params =
            new URLSearchParams();


        params.set(
            "q",
            currentSearch
        );


        params.set(
            "top_k",
            "20"
        );


        /*
         * Backend supports project filtering
         * during semantic search.
         */

        if (currentProject) {

            params.set(
                "project",
                currentProject
            );

        }


        const url =
            `${API_BASE_URL}/api/search?${params.toString()}`;


        console.log(
            "FAISS semantic search:",
            url
        );


        const timeout =
            setTimeout(
                () => searchController.abort(),
                30000
            );


        let data;


        try {

            data =
                await apiRequest(
                    url,
                    {
                        signal:
                            searchController.signal
                    }
                );

        }

        finally {

            clearTimeout(timeout);

        }


        /*
         * /api/search returns:
         *
         * {
         *   ok: true,
         *   query: "...",
         *   results: [...]
         * }
         */

        allRecords =
            Array.isArray(data.results)
                ? data.results
                : [];


        /*
         * Semantic search returns the top
         * matching results rather than a
         * traditional 1.31M-row pagination.
         */

        totalRecords =
            allRecords.length;


        currentPage = 1;

        totalPages =
            allRecords.length > 0
                ? 1
                : 1;


        renderRecords();

        updateRecordsSummary();

        updatePagination(
            false,
            false
        );

    }

    catch (error) {

        /*
         * Abort can happen because the user
         * typed another search.
         */

        if (
            error.name === "AbortError"
        ) {

            console.log(
                "Previous semantic search cancelled."
            );

            return;

        }


        console.error(
            "FAISS Search Error:",
            error
        );


        recordsContainer.innerHTML = `

            <div class="card error-card">

                <h3>
                    Semantic search failed
                </h3>

                <p>
                    ${escapeHTML(
                        getFriendlyErrorMessage(error)
                    )}
                </p>

                <button
                    type="button"
                    onclick="searchKnowledgeBase()"
                >
                    Try Again
                </button>

            </div>

        `;


        allRecords = [];

        totalRecords = 0;

        totalPages = 1;

        updateRecordsSummary();

        updatePagination(
            false,
            false
        );

    }

    finally {

        setPaginationLoading(false);

    }

}


/* =========================================================
   LOAD CURRENT VIEW
========================================================= */

async function loadCurrentView({
    keepExisting = false
} = {}) {

    /*
     * SEARCH MODE
     *
     * If a text search exists, use FAISS.
     */

    if (currentSearch) {

        await searchKnowledgeBase();

        return;

    }


    /*
     * NORMAL MODE
     *
     * No text search means regular
     * paginated records.
     */

    await loadRecords({
        keepExisting
    });

}


/* =========================================================
   RENDER RECORDS
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
        allRecords
            .map(record => {

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
                    record.severity ||
                    "";


                const priority =
                    record.priority ||
                    "";


                const component =
                    record.affected_component ||
                    "";


                const stackTrace =
                    record.stack_trace ||
                    "";


                const score =
                    record.score;


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
                                                <span
                                                    class="tag severity-tag"
                                                >
                                                    ${escapeHTML(
                                                        severity
                                                    )}
                                                </span>
                                            `
                                            : ""
                                    }


                                    ${
                                        priority
                                            ? `
                                                <span
                                                    class="tag priority-tag"
                                                >
                                                    ${escapeHTML(
                                                        priority
                                                    )}
                                                </span>
                                            `
                                            : ""
                                    }


                                    ${
                                        component
                                            ? `
                                                <span
                                                    class="tag component-tag"
                                                >
                                                    ${escapeHTML(
                                                        component
                                                    )}
                                                </span>
                                            `
                                            : ""
                                    }


                                    ${
                                        Number.isFinite(
                                            Number(score)
                                        )
                                            ? `
                                                <span
                                                    class="tag"
                                                >
                                                    Similarity:
                                                    ${formatScore(score)}
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

                                    <details
                                        class="stack-details"
                                    >

                                        <summary>
                                            Stack Trace / Error Log
                                        </summary>

                                        <pre>${escapeHTML(
                                            stackTrace
                                        )}</pre>

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
                                        ${escapeHTML(
                                            record.source_file
                                        )}

                                    </small>

                                `
                                : ""
                        }

                    </article>

                `;

            })
            .join("");

}


/* =========================================================
   SCORE FORMAT
========================================================= */

function formatScore(value) {

    const score =
        Number(value);

    if (!Number.isFinite(score)) {
        return "—";
    }


    /*
     * FAISS score is generally cosine-like
     * because embeddings are normalized.
     */

    return score.toFixed(4);
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
            currentSearch
                ? "No matching records found."
                : "No records displayed.";

        return;

    }


    /*
     * Semantic search mode
     */

    if (currentSearch) {

        element.textContent =
            `Showing ${formatNumber(
                allRecords.length
            )} semantic matches for "${currentSearch}"`;

        return;

    }


    /*
     * Normal pagination mode
     */

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


    /*
     * Semantic search has no multi-page
     * result navigation.
     */

    if (currentSearch) {

        if (previous) {
            previous.disabled = true;
        }

        if (next) {
            next.disabled = true;
        }

        if (pageNumber) {

            pageNumber.textContent =
                "Search Results";

        }

        return;

    }


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
            `Page ${formatNumber(
                currentPage
            )} of ${formatNumber(
                totalPages
            )}`;

    }

}


/* =========================================================
   PAGINATION LOADING
========================================================= */

function setPaginationLoading(
    loading
) {

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

    else {

        updatePagination();

    }

}


/* =========================================================
   NEXT PAGE
========================================================= */

async function nextPage() {

    /*
     * Semantic search has no normal pages.
     */

    if (currentSearch) {
        return;
    }


    if (
        currentPage >= totalPages
    ) {

        return;

    }


    currentPage += 1;


    await loadCurrentView();


    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });

}


/* =========================================================
   PREVIOUS PAGE
========================================================= */

async function previousPage() {

    /*
     * Semantic search has no normal pages.
     */

    if (currentSearch) {
        return;
    }


    if (
        currentPage <= 1
    ) {

        return;

    }


    currentPage -= 1;


    await loadCurrentView();


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


                /*
                 * If search is empty, return
                 * to normal paginated records.
                 */

                if (!currentSearch) {

                    await loadCurrentView({
                        keepExisting: true
                    });

                    return;

                }


                /*
                 * Search through FAISS.
                 */

                await searchKnowledgeBase();

            },
            700
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


    /*
     * If there is an active search,
     * repeat semantic search with project.
     */

    if (currentSearch) {

        await searchKnowledgeBase();

        return;

    }


    /*
     * Otherwise load normal records
     * with project filtering.
     */

    await loadRecords({
        keepExisting: true
    });

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
            `Searching "${currentSearch}" in ${currentProject}`;

    }

    else if (currentSearch) {

        element.textContent =
            `Searching "${currentSearch}"`;

    }

    else if (currentProject) {

        element.textContent =
            `${currentProject} records`;

    }

    else {

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

        /*
         * Refresh statistics.
         */

        await loadStats();


        /*
         * Refresh current view.
         */

        await loadCurrentView();

    }

    finally {

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
            "Run: python backend\\app.py"
        );

    }


    if (
        error?.name === "AbortError"
    ) {

        return (
            "The request was cancelled or took too long."
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
    function () {

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


        /* -----------------------------------------------
           Previous page
        ------------------------------------------------ */

        if (previous) {

            previous.addEventListener(
                "click",
                previousPage
            );

        }


        /* -----------------------------------------------
           Next page
        ------------------------------------------------ */

        if (next) {

            next.addEventListener(
                "click",
                nextPage
            );

        }


        /* -----------------------------------------------
           Search
        ------------------------------------------------ */

        if (search) {

            search.addEventListener(
                "input",
                handleSearch
            );

        }


        /* -----------------------------------------------
           Project filter
        ------------------------------------------------ */

        if (projectFilter) {

            projectFilter.addEventListener(
                "change",
                handleProjectFilter
            );

        }


        /* -----------------------------------------------
           Refresh
        ------------------------------------------------ */

        if (refresh) {

            refresh.addEventListener(
                "click",
                refreshStatus
            );

        }


        /*
         * Load statistics and records independently.
         */

        loadStats();

        loadRecords();

    }
);