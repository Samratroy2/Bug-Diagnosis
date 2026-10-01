/* =========================================================
   BUGAI - DEFECT PATTERN ANALYTICS
   Milestone 4
   ========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";

let analyticsLoading = false;
let growthLoading = false;
let e2eLoading = false;

let submittedBugRecords = [];
let selectedSubmittedBug = null;


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
    if (value === null || value === undefined) {
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

    if (!element) {
        return;
    }

    element.textContent =
        value === null ||
        value === undefined ||
        value === ""
            ? "—"
            : value;
}


function showLoading(element, message = "Loading...") {
    if (!element) {
        return;
    }

    element.innerHTML = `
        <div class="loading-state">
            ${escapeHTML(message)}
        </div>
    `;
}


function showError(element, message = "Something went wrong.") {
    if (!element) {
        return;
    }

    element.innerHTML = `
        <div class="error-state">
            ${escapeHTML(message)}
        </div>
    `;
}


/* =========================================================
   DISTRIBUTION NORMALIZER

   Backend example:

   [
       {
           "count": 100,
           "value": "High"
       }
   ]

   Normalized:

   [
       {
           label: "High",
           value: 100
       }
   ]

   IMPORTANT:
   Already-normalized {label,value} objects are preserved.
   ========================================================= */

function normalizeDistribution(data) {
    if (!data) {
        return [];
    }

    if (Array.isArray(data)) {
        return data
            .map(item => {
                if (item === null || item === undefined) {
                    return null;
                }

                if (typeof item !== "object") {
                    return {
                        label: String(item),
                        value: 1
                    };
                }

                /*
                 * Already normalized.
                 */
                if (
                    Object.prototype.hasOwnProperty.call(item, "label") &&
                    Object.prototype.hasOwnProperty.call(item, "value") &&
                    !Object.prototype.hasOwnProperty.call(item, "count") &&
                    !Object.prototype.hasOwnProperty.call(item, "total") &&
                    !Object.prototype.hasOwnProperty.call(item, "frequency") &&
                    !Object.prototype.hasOwnProperty.call(item, "occurrences") &&
                    !Object.prototype.hasOwnProperty.call(item, "value_count")
                ) {
                    return {
                        label: String(item.label),
                        value: Number(item.value) || 0
                    };
                }

                const label =
                    item.value ??
                    item.label ??
                    item.name ??
                    item.project ??
                    item.component ??
                    item.affected_component ??
                    item.severity ??
                    item.priority ??
                    item.exception ??
                    item.exception_type ??
                    item.source ??
                    item.root_cause ??
                    item.error ??
                    item.error_type ??
                    item.error_message ??
                    "Unknown";

                const count =
                    item.count ??
                    item.total ??
                    item.frequency ??
                    item.occurrences ??
                    item.value_count ??
                    0;

                return {
                    label: String(label),
                    value: Number(count) || 0
                };
            })
            .filter(item =>
                item &&
                item.label !== "" &&
                item.value > 0
            );
    }

    if (typeof data === "object") {
        return Object.entries(data)
            .map(([label, value]) => ({
                label: String(label),
                value: Number(value) || 0
            }))
            .filter(item => item.value > 0);
    }

    return [];
}


/* =========================================================
   TOP DISTRIBUTION
   ========================================================= */

function getTopDistributionValue(data) {
    const entries = normalizeDistribution(data)
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

    if (!entries.length) {
        return "—";
    }

    return entries[0].label;
}


function getTopMeaningfulValue(data) {
    const entries = normalizeDistribution(data)
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

    if (!entries.length) {
        return "—";
    }

    const ignored = new Set([
        "unknown",
        "unknown / not detected",
        "not detected",
        "n/a",
        "na",
        "none",
        "null",
        "undefined",
        "unknown component",
        "unknown exception",
        "unknown severity",
        "unknown / not available",
        "not available",
        "unclassified",
        "uncategorized",
        "imported defect"
    ]);

    const meaningful = entries.find(item =>
        !ignored.has(
            String(item.label).trim().toLowerCase()
        )
    );

    return meaningful
        ? meaningful.label
        : entries[0].label;
}


/* =========================================================
   LIMIT DISTRIBUTION
   ========================================================= */

function limitDistribution(data, limit = 10) {
    return normalizeDistribution(data)
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}


/* =========================================================
   FILTER OPTIONS
   ========================================================= */

function addOptions(selectId, values, placeholder) {
    const select = document.getElementById(selectId);

    if (!select) {
        return;
    }

    const currentValue = select.value;

    select.innerHTML = "";

    const firstOption = document.createElement("option");
    firstOption.value = "";
    firstOption.textContent = placeholder;
    select.appendChild(firstOption);

    const uniqueValues = [
        ...new Set(
            (Array.isArray(values) ? values : [])
                .map(value => String(value || "").trim())
                .filter(Boolean)
        )
    ];

    uniqueValues.forEach(value => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = value;

        select.appendChild(option);
    });

    if (
        uniqueValues.includes(currentValue)
    ) {
        select.value = currentValue;
    }
}


/* =========================================================
   LOAD FILTERS
   ========================================================= */

async function loadFilters() {
    try {
        const data = await apiRequest(
            "/api/analytics/filters"
        );

        if (!data || data.ok === false) {
            return;
        }

        addOptions(
            "project",
            data.projects,
            "All projects"
        );

        addOptions(
            "severity",
            data.severities,
            "All severities"
        );

        addOptions(
            "priority",
            data.priorities,
            "All priorities"
        );

        addOptions(
            "source",
            data.sources,
            "All sources"
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
    const params = new URLSearchParams();

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
        const element = document.getElementById(id);

        if (!element) {
            return;
        }

        const value = element.value.trim();

        if (value) {
            params.set(id, value);
        }
    });

    return params.toString();
}


/* =========================================================
   RENDER BAR CHART
   ========================================================= */

function renderBars(elementId, data, limit = 10) {
    const container =
        document.getElementById(elementId);

    if (!container) {
        return;
    }

    const normalized =
        normalizeDistribution(data)
            .filter(item => item.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);

    if (!normalized.length) {
        container.innerHTML = `
            <div class="empty-state">
                No data available.
            </div>
        `;
        return;
    }

    const maxValue =
        Math.max(
            ...normalized.map(item => item.value)
        );

    container.innerHTML = normalized
        .map(item => {
            const percentage =
                maxValue > 0
                    ? Math.max(
                        4,
                        (item.value / maxValue) * 100
                    )
                    : 0;

            return `
                <div class="bar-row">

                    <div class="bar-label"
                         title="${escapeHTML(item.label)}">

                        ${escapeHTML(item.label)}

                    </div>

                    <div class="bar-track">

                        <div
                            class="bar-fill"
                            style="width:${percentage}%"
                        ></div>

                    </div>

                    <div class="bar-value">
                        ${formatNumber(item.value)}
                    </div>

                </div>
            `;
        })
        .join("");
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

    if (!Array.isArray(rows) || !rows.length) {
        container.innerHTML = `
            <div class="empty-state">
                No time-based data available.
            </div>
        `;
        return;
    }

    const normalized = rows
        .map(row => ({
            label:
                row.date ??
                row.day ??
                row.label ??
                "Unknown",

            value:
                Number(
                    row.count ??
                    row.value ??
                    0
                ) || 0
        }))
        .filter(row => row.value > 0)
        .slice(-30);

    if (!normalized.length) {
        container.innerHTML = `
            <div class="empty-state">
                No time-based data available.
            </div>
        `;
        return;
    }

    const maxValue =
        Math.max(
            ...normalized.map(item => item.value)
        );

    container.innerHTML = normalized
        .map(item => {
            const percentage =
                maxValue > 0
                    ? Math.max(
                        4,
                        (item.value / maxValue) * 100
                    )
                    : 0;

            return `
                <div class="bar-row">

                    <div class="bar-label">
                        ${escapeHTML(item.label)}
                    </div>

                    <div class="bar-track">

                        <div
                            class="bar-fill"
                            style="width:${percentage}%"
                        ></div>

                    </div>

                    <div class="bar-value">
                        ${formatNumber(item.value)}
                    </div>

                </div>
            `;
        })
        .join("");
}


/* =========================================================
   RENDER ANALYTICS
   ========================================================= */

function renderAnalytics(data) {
    if (!data) {
        return;
    }

    if (data.ready === false) {
        const chartIds = [
            "severityChart",
            "componentChart",
            "exceptionChart",
            "errorChart",
            "timeChart"
        ];

        chartIds.forEach(id => {
            const element =
                document.getElementById(id);

            if (element) {
                element.innerHTML = `
                    <div class="loading-state">
                        Analytics database is being prepared...
                    </div>
                `;
            }
        });

        return;
    }

    const statistics =
        data.statistics || {};

    const severityData =
        statistics.by_severity ||
        data.severity_distribution ||
        {};

    const componentData =
        statistics.by_component ||
        data.component_distribution ||
        {};

    const exceptionData =
        statistics.by_exception ||
        statistics.by_exception_type ||
        data.exception_distribution ||
        {};

    const priorityData =
        statistics.by_priority ||
        data.priority_distribution ||
        {};

    const projectData =
        statistics.by_project ||
        data.project_distribution ||
        {};

    const sourceData =
        statistics.by_source ||
        data.source_distribution ||
        {};

    const rootCauseData =
        statistics.by_root_cause ||
        data.root_cause_distribution ||
        {};

    const errorData =
        data.top_recurring_errors ||
        statistics.by_error ||
        statistics.by_error_message ||
        data.error_distribution ||
        {};

    const timeSeries =
        data.time_series ||
        data.timeSeries ||
        [];

    /* ---------------------------------------------------------
       SUMMARY
       --------------------------------------------------------- */

    setText(
        "total",
        formatNumber(
            data.total_records ??
            data.total ??
            0
        )
    );

    setText(
        "topComponent",
        getTopMeaningfulValue(componentData)
    );

    setText(
        "topException",
        getTopMeaningfulValue(exceptionData)
    );

    setText(
        "topSeverity",
        getTopMeaningfulValue(severityData)
    );


    /* ---------------------------------------------------------
       CHARTS
       --------------------------------------------------------- */

    renderBars(
        "severityChart",
        severityData,
        10
    );

    renderBars(
        "componentChart",
        limitDistribution(
            componentData,
            10
        ),
        10
    );

    renderBars(
        "exceptionChart",
        limitDistribution(
            exceptionData,
            10
        ),
        10
    );

    renderBars(
        "errorChart",
        limitDistribution(
            errorData,
            10
        ),
        10
    );

    renderTimeSeries(
        timeSeries
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
        const element =
            document.getElementById(id);

        if (element) {
            showLoading(
                element,
                "Loading analytics..."
            );
        }
    });

    try {
        const query = buildQuery();

        const endpoint =
            query
                ? `/api/analytics?${query}`
                : "/api/analytics";

        const data =
            await apiRequest(endpoint);

        if (data && data.ok === false) {
            throw new Error(
                data.error ||
                "Analytics request failed."
            );
        }

        renderAnalytics(data);

    } catch (error) {
        console.error(
            "Analytics loading error:",
            error
        );

        chartIds.forEach(id => {
            const element =
                document.getElementById(id);

            if (element) {
                showError(
                    element,
                    error.message
                );
            }
        });

        setText("total", "—");
        setText("topComponent", "—");
        setText("topException", "—");
        setText("topSeverity", "—");

    } finally {
        analyticsLoading = false;
    }
}


/* =========================================================
   RESET FILTERS
   ========================================================= */

function resetFilters() {
    const ids = [
        "project",
        "severity",
        "priority",
        "component",
        "exception_type",
        "source",
        "start_date",
        "end_date"
    ];

    ids.forEach(id => {
        const element =
            document.getElementById(id);

        if (element) {
            element.value = "";
        }
    });

    loadAnalytics();
}


/* =========================================================
   SUBMITTED BUGS
   =========================================================

   IMPORTANT BACKEND RESPONSE:

   {
       "ok": true,
       "total_records": 3,
       "results": [
           {...},
           {...},
           {...}
       ]
   }

   The previous JS incorrectly looked only for:
       data.records

   This version correctly uses:
       data.results
   ========================================================= */

async function loadSubmittedBugs() {
    const bugIdElement =
        document.getElementById("gBugId");

    if (!bugIdElement) {
        return;
    }

    try {
        const data =
            await apiRequest(
                "/api/analytics/submitted-records"
            );

        if (!data || data.ok === false) {
            throw new Error(
                data?.error ||
                "Unable to load submitted bugs."
            );
        }

        /*
         * FIX:
         * Backend returns `results`.
         *
         * Keep `records` as fallback in case
         * the backend is changed later.
         */
        submittedBugRecords =
            Array.isArray(data.results)
                ? data.results
                : Array.isArray(data.records)
                    ? data.records
                    : Array.isArray(data)
                        ? data
                        : [];

        console.log(
            "BugAI submitted bugs:",
            submittedBugRecords
        );

        prepareBugIdSelector();
        populateBugIdSelector();

    } catch (error) {
        console.error(
            "Failed to load submitted bugs:",
            error
        );

        const select =
            document.getElementById("gBugId");

        if (select) {
            select.innerHTML = `
                <option value="">
                    Unable to load submitted bugs
                </option>
            `;

            select.disabled = true;
        }
    }
}


/* =========================================================
   PREPARE BUG ID SELECT
   ========================================================= */

function prepareBugIdSelector() {
    let element =
        document.getElementById("gBugId");

    if (!element) {
        return;
    }

    /*
     * If HTML already contains a SELECT,
     * keep it.
     */
    if (element.tagName !== "SELECT") {
        const select =
            document.createElement("select");

        select.id = "gBugId";
        select.name = "bug_id";
        select.required = true;

        element.replaceWith(select);

        element = select;
    }

    /*
     * Avoid duplicate event listeners.
     */
    if (
        element.dataset.listenerAttached !== "true"
    ) {
        element.addEventListener(
            "change",
            handleSubmittedBugSelection
        );

        element.dataset.listenerAttached = "true";
    }
}


/* =========================================================
   POPULATE BUG ID SELECT
   ========================================================= */

function populateBugIdSelector() {
    const select =
        document.getElementById("gBugId");

    if (!select) {
        return;
    }

    select.innerHTML = "";

    const placeholder =
        document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
        submittedBugRecords.length
            ? "Select a submitted bug"
            : "No submitted bugs available";

    placeholder.disabled =
        submittedBugRecords.length > 0;

    placeholder.selected = true;

    select.appendChild(placeholder);

    const usedIds = new Set();

    submittedBugRecords.forEach(
        (bug, index) => {
            const bugId =
                String(
                    bug?.bug_id ??
                    bug?.id ??
                    ""
                ).trim();

            if (!bugId || usedIds.has(bugId)) {
                return;
            }

            usedIds.add(bugId);

            const option =
                document.createElement("option");

            option.value = bugId;

            const title =
                String(
                    bug?.title ||
                    "Submitted Bug"
                ).trim();

            const project =
                String(
                    bug?.project ||
                    ""
                ).trim();

            option.textContent =
                project
                    ? `${bugId} — ${title} (${project})`
                    : `${bugId} — ${title}`;

            option.dataset.index =
                String(index);

            select.appendChild(option);
        }
    );

    select.disabled =
        submittedBugRecords.length === 0;

    /*
     * Make sure no stale bug remains selected.
     */
    selectedSubmittedBug = null;
    clearGrowthFields();
}


/* =========================================================
   BUG SELECTION
   ========================================================= */

function handleSubmittedBugSelection(event) {
    const bugId =
        String(
            event.target.value || ""
        ).trim();

    if (!bugId) {
        selectedSubmittedBug = null;
        clearGrowthFields();
        return;
    }

    selectedSubmittedBug =
        submittedBugRecords.find(
            bug => {
                const currentId =
                    String(
                        bug?.bug_id ??
                        bug?.id ??
                        ""
                    ).trim();

                return currentId === bugId;
            }
        ) || null;

    if (!selectedSubmittedBug) {
        throw new Error(
            "Selected submitted bug could not be found."
        );
    }

    fillGrowthFields(
        selectedSubmittedBug
    );
}


/* =========================================================
   SET GROWTH FIELD
   ========================================================= */

function setGrowthField(id, value) {
    const element =
        document.getElementById(id);

    if (!element) {
        return;
    }

    element.value =
        value === null ||
        value === undefined
            ? ""
            : String(value);
}


/* =========================================================
   FILL GROWTH FORM
   ========================================================= */

function fillGrowthFields(bug) {
    if (!bug) {
        return;
    }

    setGrowthField(
        "gBugId",
        bug.bug_id ?? bug.id
    );

    setGrowthField(
        "gProject",
        bug.project
    );

    setGrowthField(
        "gTitle",
        bug.title
    );

    setGrowthField(
        "gDescription",
        bug.description
    );

    setGrowthField(
        "gComponent",
        bug.affected_component ??
        bug.component
    );

    setGrowthField(
        "gStack",
        bug.stack_trace ??
        bug.error_information ??
        bug.error_message
    );

    setGrowthField(
        "gRoot",
        bug.root_cause ??
        bug.hypothesis
    );

    setGrowthField(
        "gResolution",
        bug.resolution ??
        bug.recommended_fix
    );

    setGrowthField(
        "gSeverity",
        bug.severity
    );

    setGrowthField(
        "gPriority",
        bug.priority
    );

    /*
     * These must be manually confirmed.
     */
    const confirmed =
        document.getElementById(
            "confirmedFix"
        );

    const approved =
        document.getElementById(
            "approved"
        );

    if (confirmed) {
        confirmed.checked = false;
    }

    if (approved) {
        approved.checked = false;
    }

    const result =
        document.getElementById(
            "growthResult"
        );

    if (result) {
        result.className = "";
        result.textContent =
            `Selected submitted bug: ${
                bug.bug_id ?? bug.id ?? ""
            }\n\n` +
            "Review the populated information, " +
            "confirm the fix, approve it for the KB, " +
            "then click Validate & Add to Knowledge Base.";
    }
}


/* =========================================================
   CLEAR GROWTH FIELDS
   ========================================================= */

function clearGrowthFields() {
    const ids = [
        "gProject",
        "gTitle",
        "gDescription",
        "gComponent",
        "gStack",
        "gRoot",
        "gResolution",
        "gSeverity",
        "gPriority"
    ];

    ids.forEach(id => {
        const element =
            document.getElementById(id);

        if (element) {
            element.value = "";
        }
    });

    const confirmed =
        document.getElementById(
            "confirmedFix"
        );

    const approved =
        document.getElementById(
            "approved"
        );

    if (confirmed) {
        confirmed.checked = false;
    }

    if (approved) {
        approved.checked = false;
    }
}


/* =========================================================
   VERIFY SELECTED BUG
   ========================================================= */

function verifySelectedSubmittedBug() {
    if (!selectedSubmittedBug) {
        throw new Error(
            "Please select an existing submitted bug first."
        );
    }

    const id =
        String(
            selectedSubmittedBug.bug_id ??
            selectedSubmittedBug.id ??
            ""
        ).trim();

    if (!id) {
        throw new Error(
            "The selected submitted bug does not have a valid Bug ID."
        );
    }

    const exists =
        submittedBugRecords.some(
            bug =>
                String(
                    bug?.bug_id ??
                    bug?.id ??
                    ""
                ).trim() === id
        );

    if (!exists) {
        throw new Error(
            "The selected Bug ID is not present in BugAI submitted records."
        );
    }

    return id;
}


/* =========================================================
   COLLECT GROWTH PAYLOAD
   ========================================================= */

function collectGrowthPayload() {
    const verifiedBugId =
        verifySelectedSubmittedBug();

    return {
        bug_id: verifiedBugId,

        project:
            document.getElementById(
                "gProject"
            )?.value.trim() || "",

        title:
            document.getElementById(
                "gTitle"
            )?.value.trim() || "",

        description:
            document.getElementById(
                "gDescription"
            )?.value.trim() || "",

        component:
            document.getElementById(
                "gComponent"
            )?.value.trim() || "",

        stack_trace:
            document.getElementById(
                "gStack"
            )?.value.trim() || "",

        root_cause:
            document.getElementById(
                "gRoot"
            )?.value.trim() || "",

        resolution:
            document.getElementById(
                "gResolution"
            )?.value.trim() || "",

        severity:
            document.getElementById(
                "gSeverity"
            )?.value || "",

        priority:
            document.getElementById(
                "gPriority"
            )?.value || "",

        confirmed_fix:
            document.getElementById(
                "confirmedFix"
            )?.checked === true,

        approved:
            document.getElementById(
                "approved"
            )?.checked === true
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
            "Validating selected submitted bug...";
    }

    try {
        const payload =
            collectGrowthPayload();

        const required = [
            [
                "title",
                "Title is missing from the selected bug."
            ],
            [
                "component",
                "Affected Component is required."
            ],
            [
                "description",
                "Description is required."
            ],
            [
                "stack_trace",
                "Error Information / Stack Trace is required."
            ],
            [
                "root_cause",
                "Confirmed Root Cause is required."
            ],
            [
                "resolution",
                "Confirmed Resolution / Fix is required."
            ]
        ];

        for (const [field, message] of required) {
            if (!payload[field]) {
                throw new Error(message);
            }
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

        if (result) {
            result.className = "";
            result.textContent =
                `Adding confirmed fix for ${payload.bug_id}...`;
        }

        const response =
            await apiRequest(
                "/api/knowledge-base/growth",
                {
                    method: "POST",
                    body: JSON.stringify(payload)
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

        /*
         * Refresh analytics after KB growth.
         */
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
   FILTER KEYBOARD SUPPORT
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
                if (event.key === "Enter") {
                    event.preventDefault();
                    loadAnalytics();
                }
            }
        );
    });
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /* -------------------------------------------------
           APPLY FILTERS
           ------------------------------------------------- */

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


        /* -------------------------------------------------
           RESET
           ------------------------------------------------- */

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


        /* -------------------------------------------------
           KNOWLEDGE BASE GROWTH
           ------------------------------------------------- */

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


        /* -------------------------------------------------
           E2E TEST
           ------------------------------------------------- */

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


        /* -------------------------------------------------
           FILTER ENTER KEY
           ------------------------------------------------- */

        setupFilterKeyboardSupport();


        /* -------------------------------------------------
           LOAD FILTERS
           ------------------------------------------------- */

        loadFilters();


        /* -------------------------------------------------
           LOAD SUBMITTED BUGS

           IMPORTANT:
           This now reads:

               data.results

           because Flask returns:

               {
                   ok: true,
                   total_records: 3,
                   results: [...]
               }
           ------------------------------------------------- */

        loadSubmittedBugs();


        /* -------------------------------------------------
           LOAD ANALYTICS
           ------------------------------------------------- */

        loadAnalytics();
    }
);