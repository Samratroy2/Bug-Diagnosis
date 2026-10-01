/* =========================================================
   BUGAI — VALIDATION
   Milestone 2 / 3 + M4 End-to-End Validation
   ========================================================= */

const API = "http://127.0.0.1:5000";

const metrics =
    document.getElementById("metrics");

const results =
    document.getElementById("results");

const status =
    document.getElementById("status");

const runBtn =
    document.getElementById("runBtn");


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function esc(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[character])
    );

}


/* =========================================================
   FETCH JSON
   ========================================================= */

async function fetchJSON(url) {

    const response = await fetch(
        url,
        {
            cache: "no-store"
        }
    );


    if (!response.ok) {

        throw new Error(
            `Request failed: ${response.status} ${response.statusText}`
        );

    }


    return response.json();

}


/* =========================================================
   SAFE NUMBER
   ========================================================= */

function numberValue(value, fallback = 0) {

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;

}


/* =========================================================
   FORMAT PERCENTAGE
   ========================================================= */

function formatPercentage(value) {

    const number =
        numberValue(value);

    return `${number}%`;

}


/* =========================================================
   RENDER METRICS
   ========================================================= */

function renderMetrics(m2, m3) {

    const m2Metrics =
        m2?.metrics || {};

    const m3Metrics =
        m3?.metrics || {};


    const m3Passed =
        numberValue(m3?.passed);

    const m3Total =
        numberValue(m3?.test_cases);


    const m2Triage =
        numberValue(
            m2Metrics.triage_severity_accuracy
        );


    const m2Exception =
        numberValue(
            m2Metrics.log_exception_accuracy
        );


    const m3Classification =
        numberValue(
            m3Metrics.classification_accuracy
        );


    const allM3Passed =
        m3Total > 0 &&
        m3Passed === m3Total;


    const overall =
        allM3Passed &&
        m2Triage >= 0 &&
        m2Exception >= 0;


    metrics.innerHTML = `

        <div class="metric">

            <strong>
                ${overall ? "PASS" : "REVIEW"}
            </strong>

            <span>
                Overall Validation
            </span>

        </div>


        <div class="metric">

            <strong>
                ${m3Passed}/${m3Total}
            </strong>

            <span>
                Tests Passed
            </span>

        </div>


        <div class="metric">

            <strong>
                ${formatPercentage(m2Triage)}
            </strong>

            <span>
                M2 Triage Accuracy
            </span>

        </div>


        <div class="metric">

            <strong>
                ${formatPercentage(m2Exception)}
            </strong>

            <span>
                M2 Exception Detection
            </span>

        </div>


        <div class="metric">

            <strong>
                ${formatPercentage(m3Classification)}
            </strong>

            <span>
                M3 Duplicate Classification
            </span>

        </div>


        <div class="metric">

            <strong>
                ${allM3Passed ? "READY" : "REVIEW"}
            </strong>

            <span>
                Pipeline Status
            </span>

        </div>

    `;

}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults(m3) {

    const validationResults =
        Array.isArray(m3?.results)
            ? m3.results
            : [];


    if (!validationResults.length) {

        results.innerHTML = `
            <tr>
                <td colspan="5">
                    No validation result records returned.
                </td>
            </tr>
        `;

        return;

    }


    results.innerHTML =
        validationResults
            .map(result => {

                const pass =
                    Boolean(result?.pass);


                const topMatch =
                    result?.top_match;


                const matchId =
                    topMatch?.bug_id || "—";


                const similarity =
                    topMatch &&
                    Number.isFinite(
                        Number(topMatch.similarity)
                    )
                        ? ` (${(
                            Number(topMatch.similarity) * 100
                        ).toFixed(1)}%)`
                        : "";


                return `

                    <tr>

                        <td>
                            ${esc(result?.id)}
                        </td>

                        <td>
                            ${esc(result?.expected)}
                        </td>

                        <td>
                            ${esc(result?.actual)}
                        </td>

                        <td class="${pass ? "pass" : "fail"}">

                            ${pass ? "PASS" : "REVIEW"}

                        </td>

                        <td>

                            ${esc(matchId)}
                            ${esc(similarity)}

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* =========================================================
   RUN VALIDATION
   ========================================================= */

async function runValidation() {

    if (!runBtn) {
        return;
    }


    runBtn.disabled = true;

    runBtn.textContent = "Running...";


    if (status) {

        status.textContent =
            "Running M2, M3 and end-to-end validation...";

    }


    if (results) {

        results.innerHTML = `
            <tr>
                <td colspan="5">
                    Running validation tests...
                </td>
            </tr>
        `;

    }


    try {

        /*
         * Existing backend validation APIs.
         *
         * M2:
         * - Triage extraction
         * - Log/exception extraction
         *
         * M3:
         * - Duplicate classification
         * - Historical similarity matching
         */

        const [
            milestone2,
            milestone3
        ] = await Promise.all([

            fetchJSON(
                `${API}/api/validation/milestone2`
            ),

            fetchJSON(
                `${API}/api/validation/milestone3`
            )

        ]);


        renderMetrics(
            milestone2,
            milestone3
        );


        renderResults(
            milestone3
        );


        const passed =
            numberValue(
                milestone3?.passed
            );


        const total =
            numberValue(
                milestone3?.test_cases
            );


        const classification =
            numberValue(
                milestone3?.metrics
                    ?.classification_accuracy
            );


        if (status) {

            status.textContent =
                `Validation completed: ${passed}/${total} `
                + `M3 classification cases passed `
                + `(${classification}% classification accuracy).`;

        }


    } catch (error) {

        console.error(
            "BugAI validation error:",
            error
        );


        if (status) {

            status.textContent =
                `Validation failed: ${error.message}`;

        }


        if (results) {

            results.innerHTML = `

                <tr>

                    <td
                        colspan="5"
                        class="fail">

                        ${esc(error.message)}

                    </td>

                </tr>

            `;

        }

    } finally {

        runBtn.disabled = false;

        runBtn.textContent =
            "Run Validation";

    }

}


/* =========================================================
   BUTTON
   ========================================================= */

if (runBtn) {

    runBtn.addEventListener(
        "click",
        runValidation
    );

}


/* =========================================================
   INITIAL RUN
   ========================================================= */

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        runValidation
    );

} else {

    runValidation();

}