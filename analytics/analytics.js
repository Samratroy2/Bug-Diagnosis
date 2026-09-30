/* =========================================================
   BUGAI - DEFECT PATTERN ANALYTICS
   ========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";

let analyticsLoading = false;
let growthLoading = false;
let e2eLoading = false;


/* =========================================================
   API REQUEST
   ========================================================= */

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            cache: "no-store",
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        const text = await response.text();

        let data = {};

        if (text.trim()) {
            try {
                data = JSON.parse(text);
            } catch (error) {
                throw new Error(
                    `Invalid JSON response from ${endpoint}`
                );
            }
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Request failed with status ${response.status}`
            );
        }

        return data;

    } catch (error) {

        if (error instanceof TypeError) {
            throw new Error(
                "Cannot connect to BugAI backend. " +
                "Make sure Flask is running on port 5000."
            );
        }

        throw error;
    }
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function escapeHTML(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString("en-IN");
}


function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent =
            value === null ||
            value === undefined ||
            value === ""
                ? "—"
                : value;
    }
}


function showLoading(element, message) {
    if (!element) {
        return;
    }

    element.innerHTML = `
        <div class="loading-state">
            ${escapeHTML(message || "Loading...")}
        </div>
    `;
}


function showError(element, message) {
    if (!element) {
        return;
    }

    element.innerHTML = `
        <div class="error-state">
            ${escapeHTML(message || "Something went wrong.")}
        </div>
    `;
}


function addOptions(select, values) {
    if (
        !select ||
        !Array.isArray(values)
    ) {
        return;
    }

    const existing = new Set(
        Array.from(select.options).map(
            option => option.value
        )
    );

    values.forEach(value => {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return;
        }

        const stringValue = String(value);

        if (existing.has(stringValue)) {
            return;
        }

        const option =
            document.createElement("option");

        option.value = stringValue;
        option.textContent = stringValue;

        select.appendChild(option);
        existing.add(stringValue);
    });
}


/* =========================================================
   FILTERS
   ========================================================= */

async function loadFilters() {

    try {

        const data = await apiRequest(
            "/api/analytics/filters"
        );

        addOptions(
            document.getElementById("project"),
            data.projects || []
        );

        addOptions(
            document.getElementById("severity"),
            data.severities || []
        );

        addOptions(
            document.getElementById("priority"),
            data.priorities || []
        );

        /*
         * Component and exception_type are text inputs
         * in the current HTML, so they are not populated
         * from the filter endpoint.
         */

        addOptions(
            document.getElementById("source"),
            data.sources || []
        );

    } catch (error) {

        console.error(
            "Failed to load analytics filters:",
            error
        );
    }
}


/* =========================================================
   BUILD ANALYTICS QUERY
   ========================================================= */

function buildQuery() {

    const params =
        new URLSearchParams();

    const fields = [
        "project",
        "severity",
        "priority",
        "component",
        "exception_type",
        "source",
        "start_date",
        "end_date"
    ];

    fields.forEach(field => {

        const element =
            document.getElementById(field);

        if (!element) {
            return;
        }

        const value =
            element.value.trim();

        if (value) {
            params.set(field, value);
        }
    });

    return params.toString();
}


/* =========================================================
   BAR CHART
   ========================================================= */

function renderBars(elementId, data) {

    const container =
        document.getElementById(elementId);

    if (!container) {
        return;
    }

    if (
        !data ||
        typeof data !== "object"
    ) {
        container.innerHTML = `
            <div class="empty-state">
                No data available.
            </div>
        `;

        return;
    }

    const entries =
        Object.entries(data)
            .filter(
                ([, value]) =>
                    Number(value) > 0
            )
            .sort(
                (a, b) =>
                    Number(b[1]) -
                    Number(a[1])
            );

    if (!entries.length) {

        container.innerHTML = `
            <div class="empty-state">
                No data available.
            </div>
        `;

        return;
    }

    const maxValue =
        Math.max(
            ...entries.map(
                ([, value]) =>
                    Number(value)
            )
        );

    container.innerHTML = `
        <div class="bar-chart">

            ${entries.map(
                ([label, value]) => {

                    const numericValue =
                        Number(value);

                    const percentage =
                        maxValue > 0
                            ? (
                                numericValue /
                                maxValue
                            ) * 100
                            : 0;

                    return `
                        <div class="bar-row">

                            <div
                                class="bar-label"
                                title="${escapeHTML(label)}"
                            >
                                ${escapeHTML(label)}
                            </div>

                            <div class="bar-track">

                                <div
                                    class="bar-fill"
                                    style="width: ${percentage}%;"
                                ></div>

                            </div>

                            <div class="bar-value">
                                ${formatNumber(numericValue)}
                            </div>

                        </div>
                    `;
                }
            ).join("")}

        </div>
    `;
}


/* =========================================================
   TIME SERIES
   ========================================================= */

function renderTimeSeries(rows) {

    const container =
        document.getElementById("timeChart");

    if (!container) {
        return;
    }

    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        container.innerHTML = `
            <div class="empty-state">
                No time-based activity available.
            </div>
        `;

        return;
    }

    const normalized =
        rows.map(row => {

            return {
                date:
                    row.date ??
                    row.day ??
                    row.month ??
                    row.timestamp ??
                    "-",

                count:
                    row.count ??
                    row.total ??
                    row.value ??
                    0
            };
        });

    container.innerHTML = `
        <div class="time-series">

            <table class="time-table">

                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Defects</th>
                    </tr>
                </thead>

                <tbody>

                    ${normalized.map(
                        row => `
                            <tr>

                                <td>
                                    ${escapeHTML(row.date)}
                                </td>

                                <td>
                                    ${formatNumber(row.count)}
                                </td>

                            </tr>
                        `
                    ).join("")}

                </tbody>

            </table>

        </div>
    `;
}


/* =========================================================
   RENDER ANALYTICS
   ========================================================= */

function renderAnalytics(data) {

    if (!data) {
        return;
    }

    const summary =
        data.summary ||
        data.stats ||
        {};


    setText(
        "total",
        formatNumber(
            summary.total ??
            data.total ??
            data.total_analyzed ??
            0
        )
    );


    setText(
        "topComponent",
        summary.top_component ??
        summary.topComponent ??
        data.top_component ??
        "—"
    );


    setText(
        "topException",
        summary.top_exception ??
        summary.topException ??
        data.top_exception ??
        "—"
    );


    setText(
        "topSeverity",
        summary.top_severity ??
        summary.topSeverity ??
        data.top_severity ??
        "—"
    );


    const distributions =
        data.distributions ||
        data.breakdowns ||
        {};


    renderBars(
        "severityChart",
        distributions.severity ||
        data.severity_distribution ||
        {}
    );


    renderBars(
        "componentChart",
        distributions.component ||
        data.component_distribution ||
        {}
    );


    renderBars(
        "exceptionChart",
        distributions.exception_type ||
        distributions.exception ||
        data.exception_distribution ||
        {}
    );


    renderBars(
        "errorChart",
        distributions.error_type ||
        distributions.error ||
        distributions.root_cause ||
        data.error_distribution ||
        data.error_patterns ||
        {}
    );


    renderTimeSeries(
        data.time_series ||
        data.timeseries ||
        data.timeline ||
        []
    );
}


/* =========================================================
   LOAD ANALYTICS
   ========================================================= */

async function loadAnalytics() {

    if (analyticsLoading) {
        return;
    }

    analyticsLoading = true;


    const chartIds = [
        "severityChart",
        "componentChart",
        "exceptionChart",
        "errorChart",
        "timeChart"
    ];


    chartIds.forEach(id => {

        showLoading(
            document.getElementById(id),
            "Loading analytics..."
        );

    });


    try {

        const query =
            buildQuery();

        const endpoint =
            query
                ? `/api/analytics?${query}`
                : "/api/analytics";


        const data =
            await apiRequest(endpoint);


        renderAnalytics(data);

    } catch (error) {

        console.error(
            "Analytics loading error:",
            error
        );


        chartIds.forEach(id => {

            showError(
                document.getElementById(id),
                error.message
            );

        });


        setText("total", "Error");
        setText("topComponent", "—");
        setText("topException", "—");
        setText("topSeverity", "—");

    } finally {

        analyticsLoading = false;
    }
}


/* =========================================================
   WAIT FOR ANALYTICS SERVICE
   ========================================================= */

async function waitForAnalytics(
    attempts = 10,
    delay = 1000
) {

    for (
        let attempt = 0;
        attempt < attempts;
        attempt++
    ) {

        try {

            const status =
                await apiRequest(
                    "/api/analytics/status"
                );


            if (
                status.ready === true ||
                status.building === false
            ) {

                await loadAnalytics();

                return;
            }

        } catch (error) {

            console.warn(
                "Analytics service not ready:",
                error.message
            );
        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    delay
                )
        );
    }


    await loadAnalytics();
}


/* =========================================================
   RESET FILTERS
   ========================================================= */

function resetFilters() {

    const fields = [
        "project",
        "severity",
        "priority",
        "component",
        "exception_type",
        "source",
        "start_date",
        "end_date"
    ];


    fields.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {
            element.value = "";
        }

    });


    loadAnalytics();
}


/* =========================================================
   GROWTH FORM
   ========================================================= */

function collectGrowthPayload() {

    return {

        bug_id:
            document
                .getElementById("gBugId")
                ?.value
                .trim() || "",

        project:
            document
                .getElementById("gProject")
                ?.value
                .trim() || "",

        title:
            document
                .getElementById("gTitle")
                ?.value
                .trim() || "",

        description:
            document
                .getElementById("gDescription")
                ?.value
                .trim() || "",

        component:
            document
                .getElementById("gComponent")
                ?.value
                .trim() || "",

        stack_trace:
            document
                .getElementById("gStack")
                ?.value
                .trim() || "",

        root_cause:
            document
                .getElementById("gRoot")
                ?.value
                .trim() || "",

        resolution:
            document
                .getElementById("gResolution")
                ?.value
                .trim() || "",

        severity:
            document
                .getElementById("gSeverity")
                ?.value || "",

        priority:
            document
                .getElementById("gPriority")
                ?.value || "",

        confirmed_fix:
            document
                .getElementById("confirmedFix")
                ?.checked === true,

        approved:
            document
                .getElementById("approved")
                ?.checked === true
    };
}


/* =========================================================
   SUBMIT KNOWLEDGE BASE GROWTH
   ========================================================= */

async function submitGrowth() {

    if (growthLoading) {
        return;
    }

    const result =
        document.getElementById(
            "growthResult"
        );


    growthLoading = true;


    if (result) {

        result.className = "";

        result.textContent =
            "Validating and adding confirmed bug...";
    }


    try {

        const payload =
            collectGrowthPayload();


        /* -------------------------------------------------
           VALIDATION
           ------------------------------------------------- */

        if (!payload.bug_id) {
            throw new Error(
                "Bug ID is required."
            );
        }

        if (!payload.title) {
            throw new Error(
                "Title is required."
            );
        }

        if (!payload.component) {
            throw new Error(
                "Affected Component is required."
            );
        }

        if (!payload.description) {
            throw new Error(
                "Description is required."
            );
        }

        if (!payload.stack_trace) {
            throw new Error(
                "Error Information / Stack Trace is required."
            );
        }

        if (!payload.root_cause) {
            throw new Error(
                "Confirmed Root Cause is required."
            );
        }

        if (!payload.resolution) {
            throw new Error(
                "Confirmed Resolution / Fix is required."
            );
        }

        if (!payload.confirmed_fix) {
            throw new Error(
                "The 'Confirmed fix' checkbox must be selected."
            );
        }

        if (!payload.approved) {
            throw new Error(
                "The 'Approved for KB' checkbox must be selected."
            );
        }


        /* -------------------------------------------------
           API REQUEST
           ------------------------------------------------- */

        const response =
            await apiRequest(
                "/api/knowledge-base/growth",
                {
                    method: "POST",
                    body:
                        JSON.stringify(payload)
                }
            );


        if (result) {

            result.className =
                "result-success";

            result.textContent =
                JSON.stringify(
                    response,
                    null,
                    2
                );
        }


        await loadAnalytics();


    } catch (error) {

        console.error(
            "Knowledge base growth error:",
            error
        );


        if (result) {

            result.className =
                "result-error";

            result.textContent =
                error.message;
        }

    } finally {

        growthLoading = false;
    }
}


/* =========================================================
   MILESTONE 4 E2E TEST
   ========================================================= */

function renderE2EResult(data) {

    const container =
        document.getElementById(
            "e2eResult"
        );

    if (!container) {
        return;
    }


    if (!data) {

        container.textContent =
            "No E2E result returned.";

        return;
    }


    container.className = "";


    /*
     * Keep the complete backend result visible.
     * This is useful for the final Milestone 4
     * documentation/demo.
     */

    container.textContent =
        JSON.stringify(
            data,
            null,
            2
        );
}


async function runE2ETests() {

    if (e2eLoading) {
        return;
    }


    const result =
        document.getElementById(
            "e2eResult"
        );


    e2eLoading = true;


    if (result) {

        result.className = "";

        result.textContent =
            "Running Milestone 4 end-to-end tests...\n\n" +
            "This may take some time because each case " +
            "runs through the complete BugAI pipeline.";
    }


    try {

        const data =
            await apiRequest(
                "/api/validation/milestone4"
            );


        renderE2EResult(data);


    } catch (error) {

        console.error(
            "Milestone 4 E2E error:",
            error
        );


        if (result) {

            result.className =
                "result-error";

            result.textContent =
                error.message;
        }

    } finally {

        e2eLoading = false;
    }
}


/* =========================================================
   ENTER KEY SUPPORT FOR FILTER INPUTS
   ========================================================= */

function setupFilterKeyboardSupport() {

    const filterInputs = [
        "component",
        "exception_type"
    ];


    filterInputs.forEach(id => {

        const element =
            document.getElementById(id);

        if (!element) {
            return;
        }


        element.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter"
                ) {

                    event.preventDefault();

                    loadAnalytics();
                }
            }
        );
    });
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const applyButton =
            document.getElementById(
                "apply"
            );

        if (applyButton) {

            applyButton.addEventListener(
                "click",
                loadAnalytics
            );
        }


        const resetButton =
            document.getElementById(
                "reset"
            );

        if (resetButton) {

            resetButton.addEventListener(
                "click",
                resetFilters
            );
        }


        const growthButton =
            document.getElementById(
                "addGrowth"
            );

        if (growthButton) {

            growthButton.addEventListener(
                "click",
                submitGrowth
            );
        }


        const e2eButton =
            document.getElementById(
                "runE2E"
            );

        if (e2eButton) {

            e2eButton.addEventListener(
                "click",
                runE2ETests
            );
        }


        setupFilterKeyboardSupport();


        /* -------------------------------------------------
           INITIAL LOAD
           ------------------------------------------------- */

        loadFilters();

        waitForAnalytics();
    }
);