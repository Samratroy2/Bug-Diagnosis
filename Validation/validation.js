/* =========================================================
   BUGAI — MILESTONE 4 VALIDATION
   Firebase Test Cases
   ========================================================= */

import {
    auth,
    db,
    collection,
    getDocs,
    onAuthStateChanged
} from "../firebase.js";


/* =========================================================
   CONFIGURATION
   ========================================================= */

const COLLECTION_NAME = "bugSubmissions";


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const resultsTable =
    document.getElementById("results");

const statusElement =
    document.getElementById("status");

const runButton =
    document.getElementById("runBtn");

const metricsContainer =
    document.getElementById("metrics");


/* =========================================================
   FIREBASE DATA
   ========================================================= */

let submissions = [];


/* =========================================================
   TEST CASES
   ========================================================= */

const TEST_CASES = [

    {
        id: "M4-001",

        name: "Triage Analysis",

        expected:
            "Triage analysis should be available",

        test: (bug) => {

            return Boolean(
                bug?.analysis?.triage
            );

        }
    },


    {
        id: "M4-002",

        name: "Log Analysis",

        expected:
            "Log analysis should be available",

        test: (bug) => {

            return Boolean(
                bug?.analysis?.log_analysis
            );

        }
    },


    {
        id: "M4-003",

        name: "Exception Detection",

        expected:
            "Exception information should be detected",

        test: (bug) => {

            const log =
                bug?.analysis?.log_analysis;

            if (!log) {
                return false;
            }

            return Boolean(
                log.exception_type ||
                log.exception ||
                log.error_message ||
                log.failure_point
            );

        }
    },


    {
        id: "M4-004",

        name: "Root Cause Analysis",

        expected:
            "Root cause analysis should be available",

        test: (bug) => {

            return Boolean(
                bug?.analysis?.root_cause
            );

        }
    },


    {
        id: "M4-005",

        name: "Duplicate Detection",

        expected:
            "Duplicate detection result should be available",

        test: (bug) => {

            return Boolean(
                bug?.analysis?.duplicate_detection
            );

        }
    },


    {
        id: "M4-006",

        name: "Remediation Recommendation",

        expected:
            "Remediation recommendation should be available",

        test: (bug) => {

            return Boolean(
                bug?.analysis?.remediation
            );

        }
    },


    {
        id: "M4-007",

        name: "Complete Diagnosis Pipeline",

        expected:
            "All M2 and M3 analysis stages should exist",

        test: (bug) => {

            const analysis =
                bug?.analysis;

            if (!analysis) {
                return false;
            }

            return Boolean(
                analysis.triage &&
                analysis.log_analysis &&
                analysis.root_cause &&
                analysis.duplicate_detection &&
                analysis.remediation
            );

        }
    },


    {
        id: "M4-008",

        name: "Triage Confidence",

        expected:
            "Triage confidence should be between 0 and 100",

        test: (bug) => {

            const triage =
                bug?.analysis?.triage;

            if (!triage) {
                return false;
            }

            const confidence =
                Number(
                    triage.confidence
                );

            return (
                Number.isFinite(confidence) &&
                confidence >= 0 &&
                confidence <= 100
            );

        }
    },


    {
        id: "M4-009",

        name: "Root Cause Confidence",

        expected:
            "Root cause confidence should be between 0 and 100",

        test: (bug) => {

            const rootCause =
                bug?.analysis?.root_cause;

            if (!rootCause) {
                return false;
            }

            const confidence =
                Number(
                    rootCause.confidence
                );

            return (
                Number.isFinite(confidence) &&
                confidence >= 0 &&
                confidence <= 100
            );

        }
    },


    {
        id: "M4-010",

        name: "Duplicate Detection Result",

        expected:
            "Duplicate detection should provide a classification",

        test: (bug) => {

            const duplicate =
                bug?.analysis?.duplicate_detection;

            if (!duplicate) {
                return false;
            }

            return Boolean(
                duplicate.status ||
                duplicate.classification ||
                duplicate.result ||
                duplicate.label
            );

        }
    }

];


/* =========================================================
   LOAD FIREBASE SUBMISSIONS
   ========================================================= */

async function loadSubmissions() {

    const snapshot =
        await getDocs(
            collection(
                db,
                COLLECTION_NAME
            )
        );

    submissions =
        snapshot.docs.map(
            (doc) => ({
                id: doc.id,
                ...doc.data()
            })
        );

    return submissions;
}


/* =========================================================
   RUN TEST CASES
   ========================================================= */

function runTestCases() {

    const results = [];

    TEST_CASES.forEach(
        (testCase) => {

            let passed = 0;

            let failed = 0;

            let checked = 0;


            submissions.forEach(
                (bug) => {

                    checked++;

                    let result = false;

                    try {

                        result =
                            Boolean(
                                testCase.test(
                                    bug
                                )
                            );

                    } catch (error) {

                        result = false;

                    }


                    if (result) {
                        passed++;
                    } else {
                        failed++;
                    }

                }
            );


            const success =
                checked > 0 &&
                passed > 0;


            results.push({

                id: testCase.id,

                name: testCase.name,

                expected:
                    testCase.expected,

                actual:
                    `${passed}/${checked} submissions passed`,

                status:
                    success
                        ? "PASS"
                        : "REVIEW",

                passed,

                failed,

                checked

            });

        }
    );


    return results;
}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults(results) {

    if (!resultsTable) {
        return;
    }


    if (!results.length) {

        resultsTable.innerHTML = `
            <tr>
                <td colspan="5">
                    No validation results available.
                </td>
            </tr>
        `;

        return;
    }


    resultsTable.innerHTML =
        results.map(
            (result) => {

                const statusClass =
                    result.status === "PASS"
                        ? "pass"
                        : "fail";


                return `
                    <tr>

                        <td>
                            <strong>
                                ${escapeHTML(result.id)}
                            </strong>

                            <br>

                            ${escapeHTML(result.name)}
                        </td>


                        <td>
                            ${escapeHTML(result.expected)}
                        </td>


                        <td>
                            ${escapeHTML(result.actual)}
                        </td>


                        <td class="${statusClass}">
                            ${escapeHTML(result.status)}
                        </td>


                        <td>
                            ${result.passed}
                            /
                            ${result.checked}
                        </td>

                    </tr>
                `;

            }
        ).join("");

}


/* =========================================================
   RENDER METRICS
   ========================================================= */

function renderMetrics(results) {

    if (!metricsContainer) {
        return;
    }


    const total =
        results.length;


    const passed =
        results.filter(
            (result) =>
                result.status === "PASS"
        ).length;


    const percentage =
        total > 0
            ? Math.round(
                (passed / total) * 100
            )
            : 0;


    const triage =
        findResult(
            results,
            "M4-001"
        );


    const exception =
        findResult(
            results,
            "M4-003"
        );


    const duplicate =
        findResult(
            results,
            "M4-005"
        );


    const pipeline =
        findResult(
            results,
            "M4-007"
        );


    const metrics =
        metricsContainer.querySelectorAll(
            ".metric"
        );


    if (metrics[0]) {

        metrics[0].querySelector(
            "strong"
        ).textContent =
            `${percentage}%`;

    }


    if (metrics[1]) {

        metrics[1].querySelector(
            "strong"
        ).textContent =
            `${passed}/${total}`;

    }


    if (metrics[2]) {

        metrics[2].querySelector(
            "strong"
        ).textContent =
            formatCoverage(
                triage
            );

    }


    if (metrics[3]) {

        metrics[3].querySelector(
            "strong"
        ).textContent =
            formatCoverage(
                exception
            );

    }


    if (metrics[4]) {

        metrics[4].querySelector(
            "strong"
        ).textContent =
            formatCoverage(
                duplicate
            );

    }


    if (metrics[5]) {

        metrics[5].querySelector(
            "strong"
        ).textContent =
            pipeline?.status ||
            "REVIEW";

    }

}


/* =========================================================
   FIND RESULT
   ========================================================= */

function findResult(
    results,
    id
) {

    return results.find(
        (result) =>
            result.id === id
    );

}


/* =========================================================
   FORMAT COVERAGE
   ========================================================= */

function formatCoverage(result) {

    if (!result) {
        return "--";
    }

    if (!result.checked) {
        return "0%";
    }


    return `${Math.round(
        (result.passed /
            result.checked) *
        100
    )}%`;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
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
   RUN VALIDATION
   ========================================================= */

async function runValidation() {

    try {

        if (statusElement) {

            statusElement.textContent =
                "Loading Firebase submissions...";

        }


        if (runButton) {

            runButton.disabled = true;

            runButton.textContent =
                "Running...";

        }


        await loadSubmissions();


        if (!submissions.length) {

            if (statusElement) {

                statusElement.textContent =
                    "No bug submissions found in Firebase.";

            }


            if (resultsTable) {

                resultsTable.innerHTML = `
                    <tr>
                        <td colspan="5">
                            No Firebase submissions available
                            for validation.
                        </td>
                    </tr>
                `;

            }

            return;
        }


        const results =
            runTestCases();


        renderResults(
            results
        );


        renderMetrics(
            results
        );


        const passed =
            results.filter(
                (result) =>
                    result.status === "PASS"
            ).length;


        if (statusElement) {

            statusElement.textContent =
                `Validation completed: ${passed}/${results.length} test cases passed.`;

        }

    } catch (error) {

        console.error(
            "Validation error:",
            error
        );


        if (statusElement) {

            statusElement.textContent =
                "Validation failed. Check Firebase connection.";

        }


        if (resultsTable) {

            resultsTable.innerHTML = `
                <tr>
                    <td colspan="5">
                        Unable to run validation.
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;

        }

    } finally {

        if (runButton) {

            runButton.disabled = false;

            runButton.textContent =
                "Run Validation";

        }

    }

}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            if (statusElement) {

                statusElement.textContent =
                    "Please sign in to run validation.";

            }

            return;
        }


        await runValidation();

    }
);


/* =========================================================
   MANUAL VALIDATION BUTTON
   ========================================================= */

if (runButton) {

    runButton.addEventListener(
        "click",
        runValidation
    );

}