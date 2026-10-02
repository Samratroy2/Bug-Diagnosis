/* =========================================================
   BUGAI — DEFECT ANALYTICS
   FIREBASE ONLY VERSION

   DATA SOURCE
   ---------------------------------------------------------
   Firestore:
       bugSubmissions

   NO DATA IS READ FROM:
   - Flask analytics API
   - SQLite
   - JSON files
   - JSONL files
   - localStorage
   - backend analytics database

   EVERYTHING ON THIS PAGE IS CALCULATED FROM FIREBASE.
========================================================= */


/* =========================================================
   FIREBASE IMPORTS
========================================================= */

import {
    auth,
    db,
    collection,
    getDocs,
    updateDoc,
    doc,
    onAuthStateChanged,
    serverTimestamp
} from "../firebase.js";


/* =========================================================
   FIRESTORE CONFIGURATION
========================================================= */

const BUG_COLLECTION =
    "bugSubmissions";


/* =========================================================
   APPLICATION STATE
========================================================= */

let firebaseUser =
    null;

let firebaseBugRecords =
    [];

let filteredBugRecords =
    [];

let selectedSubmittedBug =
    null;

let analyticsLoading =
    false;

let growthLoading =
    false;

let e2eLoading =
    false;


/* =========================================================
   FIREBASE AUTHENTICATION
========================================================= */

function waitForFirebaseAuth() {

    if (firebaseUser) {

        return Promise.resolve(
            firebaseUser
        );

    }


    return new Promise(
        (resolve, reject) => {

            let finished =
                false;


            const unsubscribe =
                onAuthStateChanged(

                    auth,

                    user => {

                        if (finished) {
                            return;
                        }


                        finished =
                            true;


                        unsubscribe();


                        if (!user) {

                            reject(
                                new Error(
                                    "No authenticated Firebase user found."
                                )
                            );

                            return;

                        }


                        firebaseUser =
                            user;


                        console.log(
                            "✅ Firebase authentication ready:",
                            user.uid
                        );


                        resolve(
                            user
                        );

                    },


                    error => {

                        if (finished) {
                            return;
                        }


                        finished =
                            true;


                        unsubscribe();


                        reject(
                            error
                        );

                    }

                );

        }
    );

}


/* =========================================================
   FIREBASE STATUS
========================================================= */

function updateFirebaseStatus(
    message,
    type = "checking"
) {

    const possibleIds = [

        "analyticsStatus",

        "statusBadge",

        "firebaseStatus",

        "analyticsStatusBadge"

    ];


    let found =
        false;


    possibleIds.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (!element) {
                return;
            }


            found =
                true;


            element.textContent =
                message;


            element.classList.remove(
                "success",
                "error",
                "warning",
                "checking"
            );


            element.classList.add(
                type
            );

        }
    );


    /*
       Also support status elements using
       data attributes.
    */

    document
        .querySelectorAll(
            "[data-analytics-status]"
        )
        .forEach(
            element => {

                found =
                    true;


                element.textContent =
                    message;


                element.classList.remove(
                    "success",
                    "error",
                    "warning",
                    "checking"
                );


                element.classList.add(
                    type
                );

            }
        );


    return found;

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }


    return String(
        value
    )

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   TEXT HELPER
========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


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


/* =========================================================
   NUMBER FORMAT
========================================================= */

function formatNumber(
    value
) {

    const number =
        Number(
            value
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        return "0";

    }


    return number.toLocaleString(
        "en-IN"
    );

}


/* =========================================================
   LOADING
========================================================= */

function showLoading(
    element,
    message = "Loading..."
) {

    if (!element) {
        return;
    }


    element.innerHTML = `

        <div class="loading-state">

            ${escapeHTML(
                message
            )}

        </div>

    `;

}


/* =========================================================
   ERROR
========================================================= */

function showError(
    element,
    message
) {

    if (!element) {
        return;
    }


    element.innerHTML = `

        <div class="error-state">

            ${escapeHTML(
                message ||
                "Something went wrong."
            )}

        </div>

    `;

}


/* =========================================================
   EMPTY
========================================================= */

function showEmpty(
    element,
    message = "No data available."
) {

    if (!element) {
        return;
    }


    element.innerHTML = `

        <div class="empty-state">

            ${escapeHTML(
                message
            )}

        </div>

    `;

}


/* =========================================================
   GENERIC VALUE READER
========================================================= */

function firstValue(
    object,
    keys,
    fallback = ""
) {

    if (
        !object ||
        typeof object !== "object"
    ) {

        return fallback;

    }


    for (
        const key of keys
    ) {

        const value =
            object[key];


        if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        ) {

            return value;

        }

    }


    return fallback;

}


/* =========================================================
   ANALYSIS OBJECT
========================================================= */

function getAnalysis(
    bug
) {

    return (
        bug?.analysis ||
        {}
    );

}


/* =========================================================
   TRIAGE
========================================================= */

function getTriage(
    bug
) {

    return (
        getAnalysis(
            bug
        ).triage ||
        {}
    );

}


/* =========================================================
   LOG ANALYSIS
========================================================= */

function getLogAnalysis(
    bug
) {

    return (
        getAnalysis(
            bug
        ).log_analysis ||
        {}
    );

}


/* =========================================================
   ROOT CAUSE
========================================================= */

function getRootCause(
    bug
) {

    return (
        getAnalysis(
            bug
        ).root_cause ||
        {}
    );

}


/* =========================================================
   DUPLICATE DETECTION
========================================================= */

function getDuplicateDetection(
    bug
) {

    return (
        getAnalysis(
            bug
        ).duplicate_detection ||
        {}
    );

}


/* =========================================================
   REMEDIATION
========================================================= */

function getRemediation(
    bug
) {

    return (
        getAnalysis(
            bug
        ).remediation ||
        {}
    );

}


/* =========================================================
   BUG ID
========================================================= */

function getBugId(
    bug
) {

    return String(

        firstValue(
            bug,

            [
                "bug_id",
                "bugId",
                "id"
            ],

            ""
        )

    ).trim();

}


/* =========================================================
   TITLE
========================================================= */

function getBugTitle(
    bug
) {

    return String(

        firstValue(
            bug,

            [
                "title",
                "bug_title",
                "summary"
            ],

            "Submitted Bug"
        )

    ).trim();

}


/* =========================================================
   PROJECT
========================================================= */

function getBugProject(
    bug
) {

    return String(

        firstValue(
            bug,

            [
                "project",
                "project_name"
            ],

            "Custom Project"
        )

    ).trim();

}


/* =========================================================
   SEVERITY
========================================================= */

function getBugSeverity(
    bug
) {

    const triage =
        getTriage(
            bug
        );


    return String(

        firstValue(
            triage,

            [
                "severity"
            ],

            firstValue(
                bug,
                [
                    "severity",
                    "bugSeverity"
                ],
                "Unknown"
            )
        )

    ).trim();

}


/* =========================================================
   PRIORITY
========================================================= */

function getBugPriority(
    bug
) {

    const triage =
        getTriage(
            bug
        );


    return String(

        firstValue(
            triage,

            [
                "priority"
            ],

            firstValue(
                bug,
                [
                    "priority",
                    "bugPriority"
                ],
                "Unknown"
            )
        )

    ).trim();

}


/* =========================================================
   COMPONENT
========================================================= */

function getBugComponent(
    bug
) {

    const triage =
        getTriage(
            bug
        );


    return String(

        firstValue(
            triage,

            [
                "affected_component",
                "component"
            ],

            firstValue(
                bug,

                [
                    "affected_component",
                    "component"
                ],

                "Unknown"
            )

        )

    ).trim();

}


/* =========================================================
   EXCEPTION
========================================================= */

function getBugException(
    bug
) {

    const log =
        getLogAnalysis(
            bug
        );


    return String(

        firstValue(
            log,

            [
                "exception_type",
                "exception"
            ],

            "Unknown / Not Detected"
        )

    ).trim();

}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function getBugError(
    bug
) {

    const log =
        getLogAnalysis(
            bug
        );


    return String(

        firstValue(
            log,

            [
                "error_message",
                "error",
                "message"
            ],

            firstValue(
                bug,

                [
                    "error_message",
                    "error_information"
                ],

                getBugTitle(
                    bug
                )

            )

        )

    ).trim();

}


/* =========================================================
   ROOT CAUSE VALUE
========================================================= */

function getBugRootCause(
    bug
) {

    const root =
        getRootCause(
            bug
        );


    return String(

        firstValue(
            root,

            [
                "root_cause",
                "primary_hypothesis",
                "hypothesis"
            ],

            "Insufficient evidence"
        )

    ).trim();

}


/* =========================================================
   RESOLUTION
========================================================= */

function getBugResolution(
    bug
) {

    const remediation =
        getRemediation(
            bug
        );


    return String(

        firstValue(
            remediation,

            [
                "recommended_fix",
                "resolution"
            ],

            firstValue(
                bug,

                [
                    "resolution",
                    "recommended_fix"
                ],

                ""
            )

        )

    ).trim();

}


/* =========================================================
   SOURCE
========================================================= */

function getBugSource(
    bug
) {

    /*
       Firebase submissions are treated as
       submitted records.

       We do NOT read the backend "source"
       dataset because that is local/backend data.
    */

    return "submitted";

}


/* =========================================================
   FIREBASE TIMESTAMP
========================================================= */

function getFirebaseDateValue(
    value
) {

    if (!value) {
        return null;
    }


    if (
        value &&
        typeof value.toDate ===
            "function"
    ) {

        return value.toDate();

    }


    if (
        value instanceof Date
    ) {

        return value;

    }


    if (
        typeof value === "object" &&
        typeof value.seconds ===
            "number"
    ) {

        return new Date(
            value.seconds * 1000
        );

    }


    const date =
        new Date(
            value
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return null;

    }


    return date;

}


/* =========================================================
   GET BUG DATE
========================================================= */

function getBugDate(
    bug
) {

    const value =

        bug?.createdAt ??

        bug?.created_at ??

        bug?.submittedAt ??

        bug?.submitted_at ??

        bug?.updatedAt ??

        bug?.updated_at;


    return getFirebaseDateValue(
        value
    );

}


/* =========================================================
   LOCAL DATE KEY
========================================================= */

function getDateKey(
    date
) {

    if (!date) {
        return null;
    }


    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


/* =========================================================
   FIREBASE DATA LOADING
========================================================= */

async function loadFirebaseRecords() {

    await waitForFirebaseAuth();


    updateFirebaseStatus(
        "Loading Firebase...",
        "checking"
    );


    console.log(
        "🔥 Reading bugSubmissions from Firestore..."
    );


    const snapshot =
        await getDocs(
            collection(
                db,
                BUG_COLLECTION
            )
        );


    firebaseBugRecords =
        snapshot.docs.map(
            documentSnapshot => ({

                firestoreId:
                    documentSnapshot.id,

                ...documentSnapshot.data()

            })
        );


    console.log(
        "🔥 Firebase records:",
        firebaseBugRecords.length
    );


    updateFirebaseStatus(
        `Firebase Connected · ${firebaseBugRecords.length} records`,
        "success"
    );


    return firebaseBugRecords;

}


/* =========================================================
   FILTER RECORDS
========================================================= */

function applyFirebaseFilters(
    records
) {

    const project =
        document.getElementById(
            "project"
        )?.value
            ?.trim()
            .toLowerCase() || "";


    const severity =
        document.getElementById(
            "severity"
        )?.value
            ?.trim()
            .toLowerCase() || "";


    const priority =
        document.getElementById(
            "priority"
        )?.value
            ?.trim()
            .toLowerCase() || "";


    const component =
        document.getElementById(
            "component"
        )?.value
            ?.trim()
            .toLowerCase() || "";


    const exceptionType =
        document.getElementById(
            "exception_type"
        )?.value
            ?.trim()
            .toLowerCase() || "";


    const source =
        document.getElementById(
            "source"
        )?.value
            ?.trim()
            .toLowerCase() || "";


    const startDate =
        document.getElementById(
            "start_date"
        )?.value || "";


    const endDate =
        document.getElementById(
            "end_date"
        )?.value || "";


    return records.filter(
        bug => {

            const bugProject =
                getBugProject(
                    bug
                ).toLowerCase();


            const bugSeverity =
                getBugSeverity(
                    bug
                ).toLowerCase();


            const bugPriority =
                getBugPriority(
                    bug
                ).toLowerCase();


            const bugComponent =
                getBugComponent(
                    bug
                ).toLowerCase();


            const bugException =
                getBugException(
                    bug
                ).toLowerCase();


            const bugSource =
                getBugSource(
                    bug
                ).toLowerCase();


            if (
                project &&
                bugProject !== project
            ) {

                return false;

            }


            if (
                severity &&
                bugSeverity !== severity
            ) {

                return false;

            }


            if (
                priority &&
                bugPriority !== priority
            ) {

                return false;

            }


            if (
                component &&
                !bugComponent.includes(
                    component
                )
            ) {

                return false;

            }


            if (
                exceptionType &&
                !bugException.includes(
                    exceptionType
                )
            ) {

                return false;

            }


            if (
                source &&
                bugSource !== source
            ) {

                return false;

            }


            const bugDate =
                getBugDate(
                    bug
                );


            if (
                startDate &&
                bugDate
            ) {

                const start =
                    new Date(
                        `${startDate}T00:00:00`
                    );


                if (
                    bugDate < start
                ) {

                    return false;

                }

            }


            if (
                endDate &&
                bugDate
            ) {

                const end =
                    new Date(
                        `${endDate}T23:59:59.999`
                    );


                if (
                    bugDate > end
                ) {

                    return false;

                }

            }


            /*
               If a date filter is supplied but
               the Firebase document has no date,
               do not include it.
            */

            if (
                (
                    startDate ||
                    endDate
                ) &&
                !bugDate
            ) {

                return false;

            }


            return true;

        }
    );

}


/* =========================================================
   DISTRIBUTION COUNTER
========================================================= */

function createDistribution(
    records,
    getter
) {

    const counts =
        {};


    records.forEach(
        bug => {

            const value =
                String(
                    getter(
                        bug
                    ) ||
                    "Unknown"
                ).trim();


            const key =
                value ||
                "Unknown";


            counts[key] =
                (
                    counts[key] ||
                    0
                ) + 1;

        }
    );


    return Object.entries(
        counts
    )

        .map(
            ([label, value]) => ({

                label,

                value

            })
        )

        .sort(
            (a, b) =>
                b.value - a.value
        );

}


/* =========================================================
   LIMIT DISTRIBUTION
========================================================= */

function limitDistribution(
    data,
    limit = 10
) {

    return data
        .slice(
            0,
            limit
        );

}


/* =========================================================
   TOP VALUE
========================================================= */

function getTopValue(
    data
) {

    if (
        !data ||
        !data.length
    ) {

        return "—";

    }


    return data[0].label;

}


/* =========================================================
   RENDER BAR CHART
========================================================= */

function renderBars(
    elementId,
    data,
    limit = 10
) {

    const container =
        document.getElementById(
            elementId
        );


    if (!container) {
        return;
    }


    const values =
        limitDistribution(
            data || [],
            limit
        );


    if (!values.length) {

        showEmpty(
            container
        );

        return;

    }


    const maximum =
        Math.max(
            ...values.map(
                item =>
                    item.value
            )
        );


    container.innerHTML =

        values
            .map(
                item => {

                    const width =

                        maximum > 0

                            ? Math.max(
                                4,
                                (
                                    item.value /
                                    maximum
                                ) * 100
                            )

                            : 0;


                    return `

                        <div class="bar-row">

                            <div
                                class="bar-label"
                                title="${escapeHTML(
                                    item.label
                                )}"
                            >

                                ${escapeHTML(
                                    item.label
                                )}

                            </div>


                            <div class="bar-track">

                                <div
                                    class="bar-fill"
                                    style="width:${width}%"
                                ></div>

                            </div>


                            <div class="bar-value">

                                ${formatNumber(
                                    item.value
                                )}

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

}


/* =========================================================
   TIME-BASED ACTIVITY
========================================================= */

function buildTimeSeries(
    records
) {

    const counts =
        {};


    records.forEach(
        bug => {

            const date =
                getBugDate(
                    bug
                );


            const key =
                getDateKey(
                    date
                );


            if (!key) {
                return;
            }


            counts[key] =
                (
                    counts[key] ||
                    0
                ) + 1;

        }
    );


    return Object.entries(
        counts
    )

        .sort(
            ([a], [b]) =>
                a.localeCompare(
                    b
                )
        )

        .map(
            ([date, count]) => ({

                date,

                count

            })
        );

}


/* =========================================================
   RENDER TIME-BASED ACTIVITY
========================================================= */

function renderTimeSeries(
    records
) {

    const container =
        document.getElementById(
            "timeChart"
        );


    if (!container) {
        return;
    }


    const series =
        buildTimeSeries(
            records
        );


    if (!series.length) {

        showEmpty(
            container,
            "No Firebase submission dates available."
        );

        return;

    }


    const visible =
        series.slice(
            -30
        );


    const maximum =
        Math.max(
            ...visible.map(
                item =>
                    item.count
            )
        );


    container.innerHTML =

        visible

            .map(
                item => {

                    const width =

                        maximum > 0

                            ? Math.max(
                                4,
                                (
                                    item.count /
                                    maximum
                                ) * 100
                            )

                            : 0;


                    return `

                        <div class="bar-row">

                            <div
                                class="bar-label"
                                title="${escapeHTML(
                                    item.date
                                )}"
                            >

                                ${escapeHTML(
                                    item.date
                                )}

                            </div>


                            <div class="bar-track">

                                <div
                                    class="bar-fill"
                                    style="width:${width}%"
                                ></div>

                            </div>


                            <div class="bar-value">

                                ${formatNumber(
                                    item.count
                                )}

                            </div>

                        </div>

                    `;

                }
            )

            .join("");

}


/* =========================================================
   FILTER OPTIONS
========================================================= */

function getUniqueValues(
    records,
    getter
) {

    return [

        ...new Set(

            records

                .map(
                    bug =>
                        String(
                            getter(
                                bug
                            ) || ""
                        ).trim()
                )

                .filter(Boolean)

        )

    ].sort(
        (a, b) =>
            a.localeCompare(
                b
            )
    );

}


/* =========================================================
   ADD SELECT OPTIONS
========================================================= */

function addOptions(
    id,
    values,
    placeholder
) {

    const select =
        document.getElementById(
            id
        );


    if (!select) {
        return;
    }


    const currentValue =
        select.value;


    select.innerHTML =
        "";


    const first =
        document.createElement(
            "option"
        );


    first.value =
        "";


    first.textContent =
        placeholder;


    select.appendChild(
        first
    );


    values.forEach(
        value => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                value;


            option.textContent =
                value;


            select.appendChild(
                option
            );

        }
    );


    if (
        values.includes(
            currentValue
        )
    ) {

        select.value =
            currentValue;

    }

}


/* =========================================================
   LOAD FILTERS FROM FIREBASE
========================================================= */

function loadFirebaseFilters(
    records
) {

    addOptions(
        "project",

        getUniqueValues(
            records,
            getBugProject
        ),

        "All projects"
    );


    addOptions(
        "severity",

        getUniqueValues(
            records,
            getBugSeverity
        ),

        "All severities"
    );


    addOptions(
        "priority",

        getUniqueValues(
            records,
            getBugPriority
        ),

        "All priorities"
    );


    addOptions(
        "source",

        getUniqueValues(
            records,
            getBugSource
        ),

        "All sources"
    );

}


/* =========================================================
   RENDER ANALYTICS
========================================================= */

function renderFirebaseAnalytics(
    records
) {

    filteredBugRecords =
        applyFirebaseFilters(
            records
        );


    const severityData =
        createDistribution(
            filteredBugRecords,
            getBugSeverity
        );


    const componentData =
        createDistribution(
            filteredBugRecords,
            getBugComponent
        );


    const exceptionData =
        createDistribution(
            filteredBugRecords,
            getBugException
        );


    const errorData =
        createDistribution(
            filteredBugRecords,
            getBugError
        );


    /* =====================================================
       SUMMARY
    ===================================================== */

    setText(
        "total",
        formatNumber(
            filteredBugRecords.length
        )
    );


    setText(
        "topComponent",
        getTopValue(
            componentData
        )
    );


    setText(
        "topException",
        getTopValue(
            exceptionData
        )
    );


    setText(
        "topSeverity",
        getTopValue(
            severityData
        )
    );


    /* =====================================================
       DISTRIBUTIONS
    ===================================================== */

    renderBars(
        "severityChart",
        severityData,
        10
    );


    renderBars(
        "componentChart",
        componentData,
        10
    );


    renderBars(
        "exceptionChart",
        exceptionData,
        10
    );


    renderBars(
        "errorChart",
        errorData,
        10
    );


    /* =====================================================
       TIME ACTIVITY

       DIRECTLY FROM FIREBASE
    ===================================================== */

    renderTimeSeries(
        filteredBugRecords
    );


    console.log(
        "📊 Firebase Analytics:",
        {
            total:
                filteredBugRecords.length,

            severity:
                severityData,

            components:
                componentData,

            exceptions:
                exceptionData,

            errors:
                errorData,

            timeSeries:
                buildTimeSeries(
                    filteredBugRecords
                )
        }
    );

}


/* =========================================================
   LOAD ALL FIREBASE ANALYTICS
========================================================= */

async function loadAnalytics() {

    if (analyticsLoading) {
        return;
    }


    analyticsLoading =
        true;


    const chartIds = [

        "severityChart",

        "componentChart",

        "exceptionChart",

        "errorChart",

        "timeChart"

    ];


    chartIds.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                showLoading(
                    element,
                    "Loading Firebase data..."
                );

            }

        }
    );


    try {

        const records =
            await loadFirebaseRecords();


        loadFirebaseFilters(
            records
        );


        renderFirebaseAnalytics(
            records
        );


    } catch (error) {

        console.error(
            "❌ Firebase Analytics error:",
            error
        );


        updateFirebaseStatus(
            "Firebase Error",
            "error"
        );


        chartIds.forEach(
            id => {

                const element =
                    document.getElementById(
                        id
                    );


                if (element) {

                    showError(
                        element,
                        error.message
                    );

                }

            }
        );


        setText(
            "total",
            "—"
        );


        setText(
            "topComponent",
            "—"
        );


        setText(
            "topException",
            "—"
        );


        setText(
            "topSeverity",
            "—"
        );


    } finally {

        analyticsLoading =
            false;

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


    ids.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.value =
                    "";

            }

        }
    );


    renderFirebaseAnalytics(
        firebaseBugRecords
    );

}


/* =========================================================
   BUG ID SELECTOR
========================================================= */

function populateBugIdSelector() {

    const select =
        document.getElementById(
            "gBugId"
        );


    if (!select) {
        return;
    }


    select.innerHTML =
        "";


    const placeholder =
        document.createElement(
            "option"
        );


    placeholder.value =
        "";


    placeholder.textContent =

        firebaseBugRecords.length

            ? "Select a submitted bug"

            : "No submitted bugs available";


    placeholder.disabled =
        firebaseBugRecords.length > 0;


    placeholder.selected =
        true;


    select.appendChild(
        placeholder
    );


    const used =
        new Set();


    firebaseBugRecords.forEach(
        bug => {

            const id =
                getBugId(
                    bug
                );


            if (
                !id ||
                used.has(id)
            ) {

                return;

            }


            used.add(
                id
            );


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                id;


            const title =
                getBugTitle(
                    bug
                );


            const project =
                getBugProject(
                    bug
                );


            option.textContent =

                project

                    ? `${id} — ${title} (${project})`

                    : `${id} — ${title}`;


            select.appendChild(
                option
            );

        }
    );


    select.disabled =
        firebaseBugRecords.length === 0;

}


/* =========================================================
   FIND FIREBASE BUG
========================================================= */

function findFirebaseBug(
    bugId
) {

    return firebaseBugRecords.find(
        bug =>
            getBugId(
                bug
            ) ===
            String(
                bugId
            ).trim()
    ) || null;

}


/* =========================================================
   SET GROWTH FIELD
========================================================= */

function setGrowthField(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


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

function fillGrowthFields(
    bug
) {

    if (!bug) {
        return;
    }


    const triage =
        getTriage(
            bug
        );


    const log =
        getLogAnalysis(
            bug
        );


    setGrowthField(
        "gBugId",
        getBugId(
            bug
        )
    );


    setGrowthField(
        "gProject",
        getBugProject(
            bug
        )
    );


    setGrowthField(
        "gTitle",
        getBugTitle(
            bug
        )
    );


    setGrowthField(
        "gDescription",

        firstValue(
            bug,

            [
                "description",
                "bug_description"
            ],

            ""
        )
    );


    setGrowthField(
        "gComponent",
        getBugComponent(
            bug
        )
    );


    setGrowthField(
        "gStack",

        firstValue(
            bug,

            [
                "stack_trace",
                "error_information",
                "error_message"
            ],

            firstValue(
                log,

                [
                    "error_message"
                ],

                ""
            )
        )
    );


    setGrowthField(
        "gRoot",
        getBugRootCause(
            bug
        )
    );


    setGrowthField(
        "gResolution",
        getBugResolution(
            bug
        )
    );


    setGrowthField(
        "gSeverity",
        getBugSeverity(
            bug
        )
    );


    setGrowthField(
        "gPriority",
        getBugPriority(
            bug
        )
    );


    const confirmed =
        document.getElementById(
            "confirmedFix"
        );


    const approved =
        document.getElementById(
            "approved"
        );


    if (confirmed) {

        confirmed.checked =
            bug.confirmed_fix === true ||
            bug.confirmedFix === true;

    }


    if (approved) {

        approved.checked =
            bug.approved === true ||
            bug.approvedForKB === true;

    }


    const result =
        document.getElementById(
            "growthResult"
        );


    if (result) {

        result.className =
            "";


        result.textContent =

            `Firebase record selected: ${
                getBugId(
                    bug
                )
            }\n\n` +

            "Review the diagnosis, confirm the fix " +

            "and approve it for the Knowledge Base.";

    }

}


/* =========================================================
   CLEAR GROWTH FORM
========================================================= */

function clearGrowthFields() {

    const fields = [

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


    fields.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.value =
                    "";

            }

        }
    );


    const confirmed =
        document.getElementById(
            "confirmedFix"
        );


    const approved =
        document.getElementById(
            "approved"
        );


    if (confirmed) {

        confirmed.checked =
            false;

    }


    if (approved) {

        approved.checked =
            false;

    }

}


/* =========================================================
   BUG SELECT CHANGE
========================================================= */

function handleBugSelection(
    event
) {

    const bugId =
        event.target.value;


    if (!bugId) {

        selectedSubmittedBug =
            null;


        clearGrowthFields();


        return;

    }


    selectedSubmittedBug =
        findFirebaseBug(
            bugId
        );


    if (
        !selectedSubmittedBug
    ) {

        clearGrowthFields();


        return;

    }


    fillGrowthFields(
        selectedSubmittedBug
    );

}


/* =========================================================
   VALIDATE GROWTH FORM
========================================================= */

function validateGrowthForm(
    bug
) {

    if (!bug) {

        throw new Error(
            "Please select a submitted Firebase bug."
        );

    }


    const title =
        document.getElementById(
            "gTitle"
        )?.value.trim() || "";


    const description =
        document.getElementById(
            "gDescription"
        )?.value.trim() || "";


    const component =
        document.getElementById(
            "gComponent"
        )?.value.trim() || "";


    const stack =
        document.getElementById(
            "gStack"
        )?.value.trim() || "";


    const root =
        document.getElementById(
            "gRoot"
        )?.value.trim() || "";


    const resolution =
        document.getElementById(
            "gResolution"
        )?.value.trim() || "";


    if (!title) {

        throw new Error(
            "Title is required."
        );

    }


    if (!description) {

        throw new Error(
            "Description is required."
        );

    }


    if (!component) {

        throw new Error(
            "Affected Component is required."
        );

    }


    if (!stack) {

        throw new Error(
            "Error Information / Stack Trace is required."
        );

    }


    if (!root) {

        throw new Error(
            "Confirmed Root Cause is required."
        );

    }


    if (!resolution) {

        throw new Error(
            "Confirmed Resolution / Fix is required."
        );

    }


    const confirmed =
        document.getElementById(
            "confirmedFix"
        )?.checked === true;


    const approved =
        document.getElementById(
            "approved"
        )?.checked === true;


    if (!confirmed) {

        throw new Error(
            "Please confirm the fix."
        );

    }


    if (!approved) {

        throw new Error(
            "Please approve the fix for the Knowledge Base."
        );

    }

}


/* =========================================================
   SAVE KB GROWTH DIRECTLY TO FIREBASE
========================================================= */

async function submitGrowth() {

    if (growthLoading) {
        return;
    }


    growthLoading =
        true;


    const button =
        document.getElementById(
            "addGrowth"
        );


    const result =
        document.getElementById(
            "growthResult"
        );


    if (button) {

        button.disabled =
            true;


        button.textContent =
            "Saving to Firebase...";

    }


    try {

        await waitForFirebaseAuth();


        if (
            !selectedSubmittedBug
        ) {

            throw new Error(
                "Please select a submitted Firebase bug."
            );

        }


        validateGrowthForm(
            selectedSubmittedBug
        );


        const documentId =
            selectedSubmittedBug.firestoreId;


        if (!documentId) {

            throw new Error(
                "Firebase document ID is missing."
            );

        }


        const confirmedFix =
            document.getElementById(
                "confirmedFix"
            )?.checked === true;


        const approved =
            document.getElementById(
                "approved"
            )?.checked === true;


        const kbGrowth = {

            confirmedFix,

            approved,

            confirmedTitle:

                document.getElementById(
                    "gTitle"
                )?.value.trim() || "",

            confirmedDescription:

                document.getElementById(
                    "gDescription"
                )?.value.trim() || "",

            confirmedComponent:

                document.getElementById(
                    "gComponent"
                )?.value.trim() || "",

            confirmedStackTrace:

                document.getElementById(
                    "gStack"
                )?.value.trim() || "",

            confirmedRootCause:

                document.getElementById(
                    "gRoot"
                )?.value.trim() || "",

            confirmedResolution:

                document.getElementById(
                    "gResolution"
                )?.value.trim() || "",

            confirmedSeverity:

                document.getElementById(
                    "gSeverity"
                )?.value || "",

            confirmedPriority:

                document.getElementById(
                    "gPriority"
                )?.value || "",

            updatedAt:
                serverTimestamp()

        };


        await updateDoc(

            doc(
                db,

                BUG_COLLECTION,

                documentId
            ),

            {

                confirmed_fix:
                    true,

                approved:
                    true,

                kbGrowth:
                    kbGrowth,

                status:
                    "KB Confirmed",

                updatedAt:
                    serverTimestamp()

            }

        );


        /*
           Update local in-memory Firebase copy
           so the page immediately reflects the
           Firestore change without another source.
        */

        selectedSubmittedBug =
            {

                ...selectedSubmittedBug,

                confirmed_fix:
                    true,

                approved:
                    true,

                kbGrowth,

                status:
                    "KB Confirmed"

            };


        firebaseBugRecords =
            firebaseBugRecords.map(
                bug =>

                    bug.firestoreId ===
                    documentId

                        ? selectedSubmittedBug

                        : bug
            );


        if (result) {

            result.className =
                "result-success";


            result.textContent =

                "✓ Confirmed fix saved successfully to Firebase.\n\n" +

                `Bug ID: ${
                    getBugId(
                        selectedSubmittedBug
                    )
                }\n` +

                "Status: KB Confirmed\n" +

                "Approved: Yes";

        }


        /*
           Refresh Firebase analytics.
        */

        renderFirebaseAnalytics(
            applyFirebaseFilters(
                firebaseBugRecords
            )
        );


    } catch (error) {

        console.error(
            "❌ Firebase KB Growth error:",
            error
        );


        if (result) {

            result.className =
                "result-error";


            result.textContent =
                error.message;

        }


    } finally {

        growthLoading =
            false;


        if (button) {

            button.disabled =
                false;


            button.textContent =
                "Validate & Add to Knowledge Base";

        }

    }

}


/* =========================================================
   FIREBASE E2E VALIDATION
   ---------------------------------------------------------
   This does NOT call the Flask validation API.

   It validates the analysis records already stored
   in Firebase.
========================================================= */

async function runE2ETests() {

    if (e2eLoading) {
        return;
    }


    e2eLoading =
        true;


    const button =
        document.getElementById(
            "runE2E"
        );


    const result =
        document.getElementById(
            "e2eResult"
        );


    if (button) {

        button.disabled =
            true;


        button.textContent =
            "Checking Firebase...";

    }


    if (result) {

        result.className =
            "";


        result.textContent =
            "Validating Firebase analysis records...";

    }


    try {

        await waitForFirebaseAuth();


        const records =
            await loadFirebaseRecords();


        const total =
            records.length;


        const analyzed =
            records.filter(
                bug =>
                    bug?.analysis
            );


        const complete =
            analyzed.filter(
                bug => {

                    const analysis =
                        getAnalysis(
                            bug
                        );


                    return (

                        !!analysis.triage &&

                        !!analysis.log_analysis &&

                        !!analysis.root_cause &&

                        !!analysis.duplicate_detection &&

                        !!analysis.remediation

                    );

                }
            );


        const incomplete =
            total -
            complete.length;


        const report = {

            source:
                "Firebase Firestore",

            collection:
                BUG_COLLECTION,

            total_records:
                total,

            analyzed_records:
                analyzed.length,

            complete_analysis_records:
                complete.length,

            incomplete_records:
                incomplete,

            checks: {

                firebase_connected:
                    true,

                bug_submissions_available:
                    total > 0,

                analysis_available:
                    analyzed.length > 0,

                triage_available:
                    complete.filter(
                        bug =>
                            !!getTriage(
                                bug
                            )
                    ).length,

                log_analysis_available:
                    complete.filter(
                        bug =>
                            !!getLogAnalysis(
                                bug
                            )
                    ).length,

                root_cause_available:
                    complete.filter(
                        bug =>
                            !!getRootCause(
                                bug
                            )
                    ).length,

                duplicate_detection_available:
                    complete.filter(
                        bug =>
                            !!getDuplicateDetection(
                                bug
                            )
                    ).length,

                remediation_available:
                    complete.filter(
                        bug =>
                            !!getRemediation(
                                bug
                            )
                    ).length

            },

            status:

                incomplete === 0 &&
                total > 0

                    ? "PASS"

                    : "REVIEW REQUIRED"

        };


        if (result) {

            result.className =
                report.status === "PASS"

                    ? "result-success"

                    : "result-error";


            result.textContent =
                JSON.stringify(
                    report,
                    null,
                    2
                );

        }


    } catch (error) {

        console.error(
            "❌ Firebase E2E validation error:",
            error
        );


        if (result) {

            result.className =
                "result-error";


            result.textContent =
                error.message;

        }

    } finally {

        e2eLoading =
            false;


        if (button) {

            button.disabled =
                false;


            button.textContent =
                "Run Firebase E2E Validation";

        }

    }

}


/* =========================================================
   KEYBOARD FILTER SUPPORT
========================================================= */

function setupFilterKeyboardSupport() {

    const fields = [

        "component",

        "exception_type"

    ];


    fields.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (!element) {
                return;
            }


            element.addEventListener(
                "keydown",

                event => {

                    if (
                        event.key ===
                        "Enter"
                    ) {

                        event.preventDefault();


                        renderFirebaseAnalytics(
                            firebaseBugRecords
                        );

                    }

                }
            );

        }
    );

}


/* =========================================================
   MOBILE SIDEBAR
========================================================= */

function setupMobileSidebar() {

    const sidebar =
        document.getElementById(
            "bugaiSidebar"
        );


    const menuButton =
        document.getElementById(
            "sidebarMenuButton"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if (
        !sidebar ||
        !menuButton ||
        !overlay
    ) {

        return;

    }


    function closeSidebar() {

        sidebar.classList.remove(
            "open"
        );


        overlay.classList.remove(
            "open"
        );


        overlay.classList.remove(
            "show"
        );


        menuButton.setAttribute(
            "aria-expanded",
            "false"
        );

    }


    function openSidebar() {

        sidebar.classList.add(
            "open"
        );


        overlay.classList.add(
            "open"
        );


        overlay.classList.add(
            "show"
        );


        menuButton.setAttribute(
            "aria-expanded",
            "true"
        );

    }


    menuButton.addEventListener(
        "click",

        () => {

            if (
                sidebar.classList.contains(
                    "open"
                )
            ) {

                closeSidebar();

            } else {

                openSidebar();

            }

        }
    );


    overlay.addEventListener(
        "click",
        closeSidebar
    );


    sidebar
        .querySelectorAll(
            ".sidebar-link"
        )
        .forEach(
            link => {

                link.addEventListener(
                    "click",
                    closeSidebar
                );

            }
        );


    document.addEventListener(
        "keydown",

        event => {

            if (
                event.key ===
                "Escape"
            ) {

                closeSidebar();

            }

        }
    );


    window.addEventListener(
        "resize",

        () => {

            if (
                window.innerWidth >
                900
            ) {

                closeSidebar();

            }

        }
    );

}


/* =========================================================
   SETUP FILTERS
========================================================= */

function setupFilters() {

    const apply =
        document.getElementById(
            "apply"
        );


    if (apply) {

        apply.addEventListener(
            "click",

            () => {

                renderFirebaseAnalytics(
                    firebaseBugRecords
                );

            }

        );

    }


    const reset =
        document.getElementById(
            "reset"
        );


    if (reset) {

        reset.addEventListener(
            "click",
            resetFilters
        );

    }

}


/* =========================================================
   SETUP BUG SELECTOR
========================================================= */

function setupBugSelector() {

    const select =
        document.getElementById(
            "gBugId"
        );


    if (!select) {
        return;
    }


    select.addEventListener(
        "change",
        handleBugSelection
    );

}


/* =========================================================
   SETUP GROWTH
========================================================= */

function setupGrowth() {

    const button =
        document.getElementById(
            "addGrowth"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        submitGrowth
    );

}


/* =========================================================
   SETUP E2E
========================================================= */

function setupE2E() {

    const button =
        document.getElementById(
            "runE2E"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        runE2ETests
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",

    async () => {

        console.log(
            "🚀 BugAI Firebase Analytics loading..."
        );


        /* -------------------------------------------------
           MOBILE
        ------------------------------------------------- */

        setupMobileSidebar();


        /* -------------------------------------------------
           FILTERS
        ------------------------------------------------- */

        setupFilters();


        setupFilterKeyboardSupport();


        /* -------------------------------------------------
           BUG SELECTOR
        ------------------------------------------------- */

        setupBugSelector();


        /* -------------------------------------------------
           KNOWLEDGE BASE GROWTH
        ------------------------------------------------- */

        setupGrowth();


        /* -------------------------------------------------
           E2E
        ------------------------------------------------- */

        setupE2E();


        /* -------------------------------------------------
           INITIAL STATUS
        ------------------------------------------------- */

        updateFirebaseStatus(
            "Connecting to Firebase...",
            "checking"
        );


        try {

            /* ---------------------------------------------
               AUTH
            --------------------------------------------- */

            await waitForFirebaseAuth();


            /* ---------------------------------------------
               FIREBASE DATA
            --------------------------------------------- */

            await loadFirebaseRecords();


            /* ---------------------------------------------
               FILTERS
            --------------------------------------------- */

            loadFirebaseFilters(
                firebaseBugRecords
            );


            /* ---------------------------------------------
               BUG SELECTOR
            --------------------------------------------- */

            populateBugIdSelector();


            /* ---------------------------------------------
               ANALYTICS
            --------------------------------------------- */

            renderFirebaseAnalytics(
                firebaseBugRecords
            );


            /* ---------------------------------------------
               FINAL STATUS
            --------------------------------------------- */

            updateFirebaseStatus(
                `Firebase Connected · ${firebaseBugRecords.length} records`,
                "success"
            );


            console.log(
                "✅ BugAI Firebase Analytics initialized."
            );


        } catch (error) {

            console.error(
                "❌ Firebase Analytics initialization failed:",
                error
            );


            updateFirebaseStatus(
                "Firebase Connection Error",
                "error"
            );


            const chartIds = [

                "severityChart",

                "componentChart",

                "exceptionChart",

                "errorChart",

                "timeChart"

            ];


            chartIds.forEach(
                id => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (element) {

                        showError(
                            element,
                            error.message
                        );

                    }

                }
            );

        }

    }
);