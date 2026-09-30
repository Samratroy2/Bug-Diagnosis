"use strict";

/* ============================================================
   BugAI - Bug Submission
   Milestone 3 + M4 compatible frontend
   ============================================================ */

const API_BASE_URL = "http://127.0.0.1:5000";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
    "txt",
    "log",
    "json",
    "csv"
];


/* ============================================================
   DOM ELEMENTS
   ============================================================ */

const bugForm = document.getElementById("bugForm");

const bugTitle = document.getElementById("bugTitle");
const project = document.getElementById("project");
const description = document.getElementById("description");
const stackTrace = document.getElementById("stackTrace");

/*
 * Optional explicit triage fields.
 *
 * The frontend supports multiple possible IDs so that it works
 * with the existing BugAI HTML versions.
 */
const severityField =
    document.getElementById("severity") ||
    document.getElementById("bugSeverity");

const priorityField =
    document.getElementById("priority") ||
    document.getElementById("bugPriority");

const componentField =
    document.getElementById("component") ||
    document.getElementById("affectedComponent") ||
    document.getElementById("bugComponent");

const dropZone =
    document.getElementById("dropZone");

const logFile =
    document.getElementById("logFile");

const fileInfo =
    document.getElementById("fileInfo");

const resetBtn =
    document.getElementById("resetBtn");

const result =
    document.getElementById("result");

const submitButton =
    bugForm
        ? bugForm.querySelector(".primary")
        : null;


/* ============================================================
   STATE
   ============================================================ */

let selectedFile = null;


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    console.log(
        "BugAI Milestone 3 Bug Submission JS ready."
    );

    initializeFileUpload();

});


/* ============================================================
   FILE UPLOAD
   ============================================================ */

function initializeFileUpload() {

    if (!dropZone || !logFile) {
        return;
    }

    logFile.addEventListener(
        "change",
        () => {

            if (
                logFile.files &&
                logFile.files.length > 0
            ) {

                handleFile(
                    logFile.files[0]
                );

            }

        }
    );

    dropZone.addEventListener(
        "click",
        (event) => {

            if (
                event.target === logFile
            ) {
                return;
            }

            logFile.click();

        }
    );

    dropZone.addEventListener(
        "dragover",
        (event) => {

            event.preventDefault();

            dropZone.classList.add(
                "drag-over"
            );

        }
    );

    dropZone.addEventListener(
        "dragleave",
        () => {

            dropZone.classList.remove(
                "drag-over"
            );

        }
    );

    dropZone.addEventListener(
        "drop",
        (event) => {

            event.preventDefault();

            dropZone.classList.remove(
                "drag-over"
            );

            const files =
                event.dataTransfer.files;

            if (
                files &&
                files.length > 0
            ) {

                handleFile(
                    files[0]
                );

            }

        }
    );

}


/* ============================================================
   HANDLE FILE
   ============================================================ */

function handleFile(file) {

    const validation =
        validateFile(file);

    if (!validation.valid) {

        selectedFile = null;

        if (logFile) {
            logFile.value = "";
        }

        showFileError(
            validation.message
        );

        return;
    }

    selectedFile = file;

    const sizeMB =
        (
            file.size /
            (1024 * 1024)
        ).toFixed(2);

    if (fileInfo) {

        fileInfo.innerHTML = `

            <div class="file-success">

                <strong>
                    ✓ ${escapeHtml(file.name)}
                </strong>

                <span>
                    ${sizeMB} MB
                </span>

                <button
                    type="button"
                    id="removeFile"
                >
                    Remove
                </button>

            </div>

        `;

    }

    const removeButton =
        document.getElementById(
            "removeFile"
        );

    if (removeButton) {

        removeButton.addEventListener(
            "click",
            removeFile
        );

    }

}


/* ============================================================
   VALIDATE FILE
   ============================================================ */

function validateFile(file) {

    if (!file) {

        return {
            valid: false,
            message: "No file selected."
        };

    }

    const fileName =
        file.name || "";

    const extension =
        fileName
            .split(".")
            .pop()
            .toLowerCase();

    if (
        !ALLOWED_EXTENSIONS.includes(
            extension
        )
    ) {

        return {
            valid: false,
            message:
                "Invalid file type. Please upload TXT, LOG, JSON or CSV."
        };

    }

    if (
        file.size >
        MAX_FILE_SIZE
    ) {

        return {
            valid: false,
            message:
                "File is too large. Maximum allowed size is 10 MB."
        };

    }

    return {
        valid: true,
        message: ""
    };

}


/* ============================================================
   REMOVE FILE
   ============================================================ */

function removeFile() {

    selectedFile = null;

    if (logFile) {
        logFile.value = "";
    }

    if (fileInfo) {
        fileInfo.innerHTML = "";
    }

}


/* ============================================================
   FORM SUBMISSION
   ============================================================ */

if (bugForm) {

    bugForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            if (!validateForm()) {
                return;
            }

            const originalButtonText =
                submitButton
                    ? submitButton.textContent
                    : "Analyze Bug";

            if (submitButton) {

                submitButton.disabled = true;

                submitButton.textContent =
                    "Analyzing...";

            }

            hideResult();

            try {

                /*
                 * IMPORTANT:
                 * Explicit triage fields are sent to Flask.
                 */
                const bugData = {

                    title:
                        bugTitle
                            ? bugTitle.value.trim()
                            : "",

                    project:
                        project
                            ? project.value
                            : "",

                    description:
                        description
                            ? description.value.trim()
                            : "",

                    stack_trace:
                        stackTrace
                            ? stackTrace.value.trim()
                            : "",

                    severity:
                        severityField
                            ? severityField.value.trim()
                            : "",

                    priority:
                        priorityField
                            ? priorityField.value.trim()
                            : "",

                    component:
                        componentField
                            ? componentField.value.trim()
                            : ""

                };


                /* ------------------------------------------------
                   ATTACHED FILE
                   ------------------------------------------------ */

                if (selectedFile) {

                    try {

                        const fileText =
                            await selectedFile.text();

                        if (fileText.trim()) {

                            if (
                                bugData.stack_trace.trim()
                            ) {

                                bugData.stack_trace +=
                                    "\n\n--- Attached File: " +
                                    selectedFile.name +
                                    " ---\n\n" +
                                    fileText;

                            } else {

                                bugData.stack_trace =
                                    "--- Attached File: " +
                                    selectedFile.name +
                                    " ---\n\n" +
                                    fileText;

                            }

                        }

                    } catch (fileError) {

                        console.warn(
                            "Unable to read attached file:",
                            fileError
                        );

                    }

                }


                console.log(
                    "Sending bug to BugAI:",
                    bugData
                );


                /* ------------------------------------------------
                   API REQUEST
                   ------------------------------------------------ */

                const response =
                    await fetch(
                        `${API_BASE_URL}/api/analyze`,
                        {

                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    bugData
                                )

                        }
                    );


                /*
                 * Read response as text first.
                 * This prevents:
                 * "Unexpected end of JSON input"
                 */
                const responseText =
                    await response.text();

                console.log(
                    "BugAI raw response:",
                    responseText
                );


                let data = {};


                if (
                    responseText &&
                    responseText.trim()
                ) {

                    try {

                        data =
                            JSON.parse(
                                responseText
                            );

                    } catch (jsonError) {

                        console.error(
                            "JSON parsing error:",
                            jsonError
                        );

                        throw new Error(
                            "Backend returned an invalid JSON response."
                        );

                    }

                }


                if (!response.ok) {

                    throw new Error(
                        data.error ||
                        data.message ||
                        `Server returned HTTP ${response.status}`
                    );

                }


                if (
                    data.ok === false
                ) {

                    throw new Error(
                        data.error ||
                        "Bug analysis failed."
                    );

                }


                console.log(
                    "BugAI analysis completed:",
                    data
                );


                displayAnalysis(
                    data
                );


            } catch (error) {

                console.error(
                    "BugAI analysis error:",
                    error
                );

                showError(
                    error.message ||
                    "Unable to connect to the BugAI backend."
                );


            } finally {

                if (submitButton) {

                    submitButton.disabled =
                        false;

                    submitButton.textContent =
                        originalButtonText;

                }

            }

        }
    );

}


/* ============================================================
   FORM VALIDATION
   ============================================================ */

function validateForm() {

    const title =
        bugTitle
            ? bugTitle.value.trim()
            : "";

    const desc =
        description
            ? description.value.trim()
            : "";

    if (!title) {

        showError(
            "Please enter a bug title."
        );

        if (bugTitle) {
            bugTitle.focus();
        }

        return false;

    }

    if (!desc) {

        showError(
            "Please enter a bug description."
        );

        if (description) {
            description.focus();
        }

        return false;

    }

    if (selectedFile) {

        const validation =
            validateFile(
                selectedFile
            );

        if (!validation.valid) {

            showFileError(
                validation.message
            );

            return false;

        }

    }

    return true;

}


/* ============================================================
   DISPLAY COMPLETE ANALYSIS
   ============================================================ */

function displayAnalysis(data) {

    const triage =
        data.triage || {};

    const log =
        data.log_analysis || {};

    const rootCause =
        data.root_cause || {};

    const duplicate =
        data.duplicate_detection || {};

    const remediation =
        data.remediation || {};

    const retrieval =
        data.retrieval || {};

    const orchestration =
        data.orchestration || {};


    if (!result) {
        return;
    }


    result.classList.remove(
        "hidden"
    );


    result.innerHTML = `

        <div class="result-header">

            <div>

                <h2>
                    Bug Analysis Result
                </h2>

                <p>
                    BugAI Milestone 3 analysis completed.
                </p>

            </div>

            <span class="status-badge">

                ${escapeHtml(
                    orchestration.status ||
                    "Completed"
                )}

            </span>

        </div>


        <!-- =================================================
             TRIAGE
             ================================================= -->

        <div class="result-section">

            <h3>
                Triage Analysis
            </h3>

            <div class="analysis-grid">

                <div class="analysis-item">

                    <span class="label">
                        Severity
                    </span>

                    <strong
                        class="${getSeverityClass(
                            triage.severity
                        )}"
                    >

                        ${escapeHtml(
                            triage.severity ||
                            "Not determined"
                        )}

                    </strong>

                </div>


                <div class="analysis-item">

                    <span class="label">
                        Priority
                    </span>

                    <strong>

                        ${escapeHtml(
                            triage.priority ||
                            "Not determined"
                        )}

                    </strong>

                </div>


                <div class="analysis-item">

                    <span class="label">
                        Affected Component
                    </span>

                    <strong>

                        ${escapeHtml(
                            triage.affected_component ||
                            "Unknown / Unclassified"
                        )}

                    </strong>

                </div>


                <div class="analysis-item">

                    <span class="label">
                        Confidence
                    </span>

                    <strong>

                        ${formatConfidence(
                            triage.confidence
                        )}

                    </strong>

                </div>

            </div>


            ${
                triage.reasoning
                    ? `

                        <div class="reasoning-box">

                            <strong>
                                Reasoning
                            </strong>

                            <p>
                                ${escapeHtml(
                                    triage.reasoning
                                )}
                            </p>

                        </div>

                    `
                    : ""
            }

        </div>


        <!-- =================================================
             LOG ANALYSIS
             ================================================= -->

        <div class="result-section">

            <h3>
                Log Analysis
            </h3>

            <div class="analysis-grid">

                <div class="analysis-item">

                    <span class="label">
                        Exception Type
                    </span>

                    <strong>

                        ${escapeHtml(
                            log.exception_type ||
                            "Unknown / Not Detected"
                        )}

                    </strong>

                </div>


                <div class="analysis-item">

                    <span class="label">
                        Confidence
                    </span>

                    <strong>

                        ${formatConfidence(
                            log.confidence
                        )}

                    </strong>

                </div>


                <div class="analysis-item">

                    <span class="label">
                        Failure Point
                    </span>

                    <strong>

                        ${formatFailurePoint(
                            log.failure_point
                        )}

                    </strong>

                </div>


                <div class="analysis-item">

                    <span class="label">
                        Error Message
                    </span>

                    <strong>

                        ${escapeHtml(
                            log.error_message ||
                            "Not detected"
                        )}

                    </strong>

                </div>

            </div>

            ${renderPatterns(
                log.patterns
            )}

        </div>


        <!-- =================================================
             ROOT CAUSE
             ================================================= -->

        <div class="result-section">

            <h3>
                Root Cause Analysis
            </h3>

            <div class="status-line">

                <span class="status-label">
                    Status
                </span>

                <span class="status-value">

                    ${escapeHtml(
                        rootCause.status ||
                        "Not determined"
                    )}

                </span>

            </div>


            <div class="root-cause-box">

                <strong>
                    Primary Hypothesis
                </strong>

                <p>

                    ${escapeHtml(
                        rootCause.primary_hypothesis ||
                        "No root cause hypothesis available."
                    )}

                </p>

            </div>


            <div class="confidence-row">

                <span>
                    Confidence
                </span>

                <strong>

                    ${formatConfidence(
                        rootCause.confidence
                    )}

                </strong>

            </div>


            ${
                rootCause.reasoning_boundary
                    ? `

                        <small class="boundary-note">

                            ${escapeHtml(
                                rootCause.reasoning_boundary
                            )}

                        </small>

                    `
                    : ""
            }

        </div>


        <!-- =================================================
             DUPLICATE DETECTION
             ================================================= -->

        <div class="result-section">

            <h3>
                Duplicate Detection
            </h3>

            <div class="duplicate-status">

                <strong>

                    ${escapeHtml(
                        duplicate.status ||
                        "New / Unmatched"
                    )}

                </strong>

                ${
                    duplicate.likely_duplicate
                        ? `

                            <span class="duplicate-badge">
                                Possible Duplicate
                            </span>

                        `
                        : ""
                }

            </div>

            ${renderSimilarDefects(
                duplicate.matches
            )}

        </div>


        <!-- =================================================
             REMEDIATION
             ================================================= -->

        <div class="result-section">

            <h3>
                Recommended Fix
            </h3>

            ${
                remediation.status
                    ? `

                        <div class="status-line">

                            <span class="status-label">
                                Recommendation Status
                            </span>

                            <span class="status-value">

                                ${escapeHtml(
                                    remediation.status
                                )}

                            </span>

                        </div>

                    `
                    : ""
            }

            ${renderRecommendations(
                remediation.recommendations
            )}

        </div>


        <!-- =================================================
             KNOWLEDGE BASE
             ================================================= -->

        <div class="result-section">

            <h3>
                Knowledge Base Evidence
            </h3>

            <p>

                Retrieved

                <strong>
                    ${Number(
                        retrieval.count || 0
                    )}
                </strong>

                similar historical defect(s).

            </p>

        </div>

    `;


    result.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/* ============================================================
   SIMILAR DEFECTS
   ============================================================ */

function renderSimilarDefects(matches) {

    if (
        !matches ||
        !Array.isArray(matches) ||
        matches.length === 0
    ) {

        return `

            <div class="empty-state">

                No similar defects were retrieved.

            </div>

        `;

    }


    return `

        <div class="similar-defects">

            ${matches
                .slice(0, 5)
                .map(
                    (match, index) => `

                        <div class="defect-card">

                            <div class="defect-card-header">

                                <strong>

                                    #${index + 1}

                                    ${escapeHtml(
                                        match.bug_id ||
                                        "Unknown ID"
                                    )}

                                </strong>

                                <span class="similarity">

                                    ${formatConfidence(
                                        match.similarity
                                    )}

                                </span>

                            </div>


                            <h4>

                                ${escapeHtml(
                                    match.title ||
                                    "Untitled defect"
                                )}

                            </h4>


                            <p>

                                ${escapeHtml(
                                    truncate(
                                        match.description ||
                                        "No description available.",
                                        220
                                    )
                                )}

                            </p>


                            <div class="defect-meta">

                                <span>

                                    Project:

                                    ${escapeHtml(
                                        match.project ||
                                        "Unknown"
                                    )}

                                </span>


                                ${
                                    match.classification
                                        ? `

                                            <span>

                                                Classification:

                                                ${escapeHtml(
                                                    match.classification
                                                )}

                                            </span>

                                        `
                                        : ""
                                }

                            </div>


                            ${
                                match.resolution_summary
                                    ? `

                                        <div class="resolution">

                                            <strong>
                                                Historical Resolution:
                                            </strong>

                                            <p>

                                                ${escapeHtml(
                                                    match.resolution_summary
                                                )}

                                            </p>

                                        </div>

                                    `
                                    : ""
                            }

                        </div>

                    `
                )
                .join("")}

        </div>

    `;

}


/* ============================================================
   REMEDIATION RECOMMENDATIONS
   ============================================================ */

function renderRecommendations(
    recommendations
) {

    if (
        !recommendations ||
        !Array.isArray(recommendations) ||
        recommendations.length === 0
    ) {

        return `

            <div class="empty-state">

                No remediation recommendation available.

            </div>

        `;

    }


    return `

        <div class="recommendations">

            ${recommendations
                .map(
                    (item, index) => `

                        <div class="recommendation-card">

                            <div class="recommendation-header">

                                <span>

                                    Recommendation
                                    ${index + 1}

                                </span>

                                <strong>

                                    ${formatConfidence(
                                        item.confidence
                                    )}

                                </strong>

                            </div>


                            <p class="recommendation-text">

                                ${escapeHtml(
                                    item.recommendation ||
                                    "No recommendation provided."
                                )}

                            </p>


                            ${
                                item.basis
                                    ? `

                                        <div class="recommendation-basis">

                                            <strong>
                                                Basis:
                                            </strong>

                                            ${escapeHtml(
                                                item.basis
                                            )}

                                        </div>

                                    `
                                    : ""
                            }


                            ${
                                Array.isArray(
                                    item.source_bug_ids
                                ) &&
                                item.source_bug_ids.length > 0
                                    ? `

                                        <div class="source-bugs">

                                            <strong>
                                                Source Bug(s):
                                            </strong>

                                            ${item.source_bug_ids
                                                .map(
                                                    id =>
                                                        `<span>
                                                            ${escapeHtml(id)}
                                                        </span>`
                                                )
                                                .join("")}

                                        </div>

                                    `
                                    : ""
                            }


                            ${
                                item.historical_resolution
                                    ? `

                                        <div class="historical-resolution">

                                            <strong>
                                                Historical Resolution:
                                            </strong>

                                            <p>

                                                ${escapeHtml(
                                                    item.historical_resolution
                                                )}

                                            </p>

                                        </div>

                                    `
                                    : ""
                            }


                            ${
                                item.historical_resolution_note
                                    ? `

                                        <div class="boundary-note">

                                            ${escapeHtml(
                                                item.historical_resolution_note
                                            )}

                                        </div>

                                    `
                                    : ""
                            }


                            ${
                                Array.isArray(
                                    item.implementation_guidance
                                ) &&
                                item.implementation_guidance.length > 0
                                    ? `

                                        <div class="guidance">

                                            <strong>
                                                Implementation Guidance
                                            </strong>

                                            <ul>

                                                ${item
                                                    .implementation_guidance
                                                    .map(
                                                        step =>
                                                            `<li>
                                                                ${escapeHtml(step)}
                                                            </li>`
                                                    )
                                                    .join("")}

                                            </ul>

                                        </div>

                                    `
                                    : ""
                            }


                            ${
                                Array.isArray(
                                    item.validation_steps
                                ) &&
                                item.validation_steps.length > 0
                                    ? `

                                        <div class="validation">

                                            <strong>
                                                Validation Steps
                                            </strong>

                                            <ol>

                                                ${item
                                                    .validation_steps
                                                    .map(
                                                        step =>
                                                            `<li>
                                                                ${escapeHtml(step)}
                                                            </li>`
                                                    )
                                                    .join("")}

                                            </ol>

                                        </div>

                                    `
                                    : ""
                            }

                        </div>

                    `
                )
                .join("")}

        </div>

    `;

}


/* ============================================================
   DETECTED LOG PATTERNS
   ============================================================ */

function renderPatterns(patterns) {

    if (
        !patterns ||
        !Array.isArray(patterns) ||
        patterns.length === 0
    ) {

        return "";

    }


    return `

        <div class="patterns">

            <strong>
                Detected Patterns
            </strong>

            <div class="pattern-list">

                ${patterns
                    .map(
                        pattern => `

                            <span class="pattern-tag">

                                ${escapeHtml(
                                    pattern
                                )}

                            </span>

                        `
                    )
                    .join("")}

            </div>

        </div>

    `;

}


/* ============================================================
   FAILURE POINT FORMAT
   ============================================================ */

/*
 * Backend may return:
 *
 * class:
 *     "com.example.db.DatabaseConnection"
 *
 * method:
 *     "connect"
 *
 * file:
 *     "DatabaseConnection.java"
 *
 * line:
 *     32
 *
 * Desired UI:
 *
 *     DatabaseConnection.connect() → DatabaseConnection.java:32
 */

function simplifyClassName(className) {

    if (!className) {
        return "";
    }

    const value =
        String(className).trim();

    return (
        value
            .split(".")
            .filter(Boolean)
            .pop() ||
        value
    );

}


function formatFailurePoint(
    failurePoint
) {

    if (!failurePoint) {
        return "Not detected";
    }

    if (
        typeof failurePoint !== "object"
    ) {

        return escapeHtml(
            String(failurePoint)
        );

    }

    const file =
        failurePoint.file || "";

    const line =
        failurePoint.line
            ? `:${failurePoint.line}`
            : "";

    const method =
        String(
            failurePoint.method || ""
        )
        .trim()
        .replace(/\s+/g, "");

    const className =
        simplifyClassName(
            failurePoint.class || ""
        );

    const location =
        `${file}${line}`;

    let output = "";


    if (
        className &&
        method &&
        location
    ) {

        output =
            `${className}.${method}() → ${location}`;

    } else if (
        method &&
        location
    ) {

        output =
            `${method}() → ${location}`;

    } else if (location) {

        output =
            location;

    } else if (method) {

        output =
            `${method}()`;

    } else if (className) {

        output =
            className;

    }


    return output
        ? escapeHtml(output)
        : "Not detected";

}


/* ============================================================
   CONFIDENCE FORMAT
   ============================================================ */

function formatConfidence(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "N/A";

    }

    const number =
        Number(value);

    if (
        Number.isNaN(number)
    ) {

        return escapeHtml(
            String(value)
        );

    }

    /*
     * Backend normally returns:
     *
     * 0.74
     * 0.98
     *
     * Convert to:
     *
     * 74.0%
     * 98.0%
     */

    if (
        number <= 1
    ) {

        return `${(
            number * 100
        ).toFixed(1)}%`;

    }

    return `${number.toFixed(1)}%`;

}


/* ============================================================
   SEVERITY CLASS
   ============================================================ */

function getSeverityClass(
    severity
) {

    const value =
        String(
            severity || ""
        ).toLowerCase();

    if (
        value.includes("critical")
    ) {

        return "severity-critical";

    }

    if (
        value.includes("high")
    ) {

        return "severity-high";

    }

    if (
        value.includes("medium")
    ) {

        return "severity-medium";

    }

    if (
        value.includes("low")
    ) {

        return "severity-low";

    }

    return "";

}


/* ============================================================
   RESET
   ============================================================ */

if (resetBtn) {

    resetBtn.addEventListener(
        "click",
        () => {

            if (bugForm) {
                bugForm.reset();
            }

            selectedFile = null;

            if (fileInfo) {
                fileInfo.innerHTML = "";
            }

            if (logFile) {
                logFile.value = "";
            }

            hideResult();

            if (bugTitle) {
                bugTitle.focus();
            }

        }
    );

}


/* ============================================================
   HIDE RESULT
   ============================================================ */

function hideResult() {

    if (!result) {
        return;
    }

    result.classList.add(
        "hidden"
    );

    result.innerHTML = "";

}


/* ============================================================
   ERROR MESSAGE
   ============================================================ */

function showError(message) {

    if (!result) {
        return;
    }

    result.classList.remove(
        "hidden"
    );

    result.innerHTML = `

        <div class="error-message">

            <h3>
                Analysis Failed
            </h3>

            <p>

                ${escapeHtml(
                    message
                )}

            </p>

            <div class="error-help">

                <strong>
                    Check:
                </strong>

                <ul>

                    <li>
                        Flask backend is running.
                    </li>

                    <li>

                        API endpoint:

                        <code>
                            http://127.0.0.1:5000/api/analyze
                        </code>

                    </li>

                    <li>
                        Browser Console for additional errors.
                    </li>

                </ul>

            </div>

        </div>

    `;

    result.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/* ============================================================
   FILE ERROR
   ============================================================ */

function showFileError(message) {

    if (!fileInfo) {
        return;
    }

    fileInfo.innerHTML = `

        <div class="file-error">

            ✕ ${escapeHtml(message)}

        </div>

    `;

}


/* ============================================================
   TRUNCATE TEXT
   ============================================================ */

function truncate(
    text,
    maxLength
) {

    const value =
        String(
            text || ""
        );

    if (
        value.length <=
        maxLength
    ) {

        return value;

    }

    return (
        value.substring(
            0,
            maxLength
        ) + "..."
    );

}


/* ============================================================
   ESCAPE HTML
   ============================================================ */

function escapeHtml(value) {

    return String(
        value ?? ""
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


/* ============================================================
   FINAL DEBUG MESSAGE
   ============================================================ */

console.log(
    "BugAI Milestone 3 Bug Submission JS loaded successfully."
);