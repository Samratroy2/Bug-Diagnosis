import {
    db,
    collection,
    addDoc,
    doc,
    setDoc,
    serverTimestamp
} from "../firebase.js";


/* ============================================================
   BUGAI — BUG SUBMISSION
   Firebase + Flask Analysis Integration
   ============================================================ */


/* ============================================================
   CONFIGURATION
   ============================================================ */

const API_BASE_URL =
    "http://127.0.0.1:5000";

const MAX_FILE_SIZE =
    10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
    "txt",
    "log",
    "json",
    "csv"
];


/* ============================================================
   DOM ELEMENTS
   ============================================================ */

let bugForm;
let bugTitle;
let project;
let description;
let stackTrace;
let severity;
let priority;
let component;
let dropZone;
let logFile;
let fileInfo;
let resetBtn;
let result;


/* ============================================================
   STATE
   ============================================================ */

let selectedFile = null;
let submissionDocumentId = null;


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeElements();

        initializeEvents();

        console.log(
            "BugAI Bug Submission initialized."
        );

    }
);


/* ============================================================
   INITIALIZE DOM ELEMENTS
   ============================================================ */

function initializeElements() {

    bugForm =
        document.getElementById(
            "bugForm"
        );

    bugTitle =
        document.getElementById(
            "bugTitle"
        );

    project =
        document.getElementById(
            "project"
        );

    description =
        document.getElementById(
            "description"
        );

    stackTrace =
        document.getElementById(
            "stackTrace"
        );

    severity =
        document.getElementById(
            "severity"
        ) ||
        document.getElementById(
            "bugSeverity"
        );

    priority =
        document.getElementById(
            "priority"
        ) ||
        document.getElementById(
            "bugPriority"
        );

    component =
        document.getElementById(
            "component"
        ) ||
        document.getElementById(
            "affectedComponent"
        ) ||
        document.getElementById(
            "bugComponent"
        );

    dropZone =
        document.getElementById(
            "dropZone"
        );

    logFile =
        document.getElementById(
            "logFile"
        );

    fileInfo =
        document.getElementById(
            "fileInfo"
        );

    resetBtn =
        document.getElementById(
            "resetBtn"
        );

    result =
        document.getElementById(
            "result"
        );
}


/* ============================================================
   INITIALIZE EVENTS
   ============================================================ */
function initializeEvents() {

    if (bugForm) {
        bugForm.addEventListener(
            "submit",
            handleSubmit
        );
    }

    if (resetBtn) {
        resetBtn.addEventListener(
            "click",
            resetForm
        );
    }

    if (logFile) {
        logFile.addEventListener(
            "change",
            handleFileSelection
        );
    }

    if (dropZone) {
        dropZone.addEventListener(
            "dragover",
            handleDragOver
        );

        dropZone.addEventListener(
            "dragleave",
            handleDragLeave
        );

        dropZone.addEventListener(
            "drop",
            handleFileDrop
        );

        dropZone.addEventListener(
            "click",
            handleUploadZoneClick
        );
    }

    /* READ MORE / READ LESS */
    document.addEventListener(
        "click",
        handleReadMoreClick
    );
}


/* ============================================================
   FILE UPLOAD
   ============================================================ */

function handleUploadZoneClick(event) {

    if (
        event.target === logFile
    ) {
        return;
    }

    if (logFile) {
        logFile.click();
    }

}


function handleDragOver(event) {

    event.preventDefault();

    if (dropZone) {

        dropZone.classList.add(
            "drag-over"
        );

    }

}


function handleDragLeave(event) {

    event.preventDefault();

    if (dropZone) {

        dropZone.classList.remove(
            "drag-over"
        );

    }

}


function handleFileDrop(event) {

    event.preventDefault();

    if (dropZone) {

        dropZone.classList.remove(
            "drag-over"
        );

    }

    const files =
        event.dataTransfer?.files;

    if (
        !files ||
        files.length === 0
    ) {
        return;
    }

    const file =
        files[0];

    processSelectedFile(
        file
    );

}


function handleFileSelection(event) {

    const file =
        event.target.files?.[0];

    if (!file) {

        selectedFile = null;

        updateFileInfo();

        return;

    }

    processSelectedFile(
        file
    );

}


function processSelectedFile(file) {

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

    updateFileInfo();

}


/* ============================================================
   FILE VALIDATION
   ============================================================ */

function validateFile(file) {

    if (!file) {

        return {
            valid: false,
            message:
                "Please select a file."
        };

    }


    if (
        file.size >
        MAX_FILE_SIZE
    ) {

        return {
            valid: false,
            message:
                "File size must not exceed 10 MB."
        };

    }


    const extension =
        getFileExtension(
            file.name
        );

    if (
        !ALLOWED_EXTENSIONS.includes(
            extension
        )
    ) {

        return {
            valid: false,
            message:
                "Only TXT, LOG, JSON and CSV files are allowed."
        };

    }


    return {
        valid: true,
        message: ""
    };

}


function getFileExtension(
    filename
) {

    const name =
        String(
            filename || ""
        ).toLowerCase();

    const parts =
        name.split(".");

    if (
        parts.length < 2
    ) {
        return "";
    }

    return parts
        .pop()
        .trim();

}


/* ============================================================
   FILE INFORMATION
   ============================================================ */

function updateFileInfo() {

    if (!fileInfo) {
        return;
    }

    if (!selectedFile) {

        fileInfo.innerHTML = "";

        return;
    }

    fileInfo.innerHTML = `
        <div class="selected-file">

            <strong>
                ${escapeHtml(
                    selectedFile.name
                )}
            </strong>

            <span>
                ${formatFileSize(
                    selectedFile.size
                )}
            </span>

        </div>
    `;

}


function formatFileSize(
    bytes
) {

    if (
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {
        return "0 Bytes";
    }

    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];

    const index =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            ),
            units.length - 1
        );

    const value =
        bytes /
        Math.pow(
            1024,
            index
        );

    return `${value.toFixed(
        index === 0 ? 0 : 2
    )} ${units[index]}`;

}


/* ============================================================
   FILE ERRORS
   ============================================================ */

function showFileError(
    message
) {

    if (!fileInfo) {
        return;
    }

    fileInfo.innerHTML = `
        <div class="file-error">
            ${escapeHtml(
                message
            )}
        </div>
    `;

}


/* ============================================================
   FORM SUBMISSION
   ============================================================ */

async function handleSubmit(
    event
) {

    event.preventDefault();

    clearResult();

    if (
        !validateForm()
    ) {
        return;
    }

    const submitButton =
        bugForm?.querySelector(
            'button[type="submit"]'
        );

    const originalText =
        submitButton?.textContent ||
        "Analyze Bug";

    try {

        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Analyzing...";

        }


        const bugData =
            await buildBugData();


        /* ----------------------------------------------------
           SAVE INITIAL SUBMISSION TO FIREBASE
           ---------------------------------------------------- */

        submissionDocumentId =
            await saveBugSubmission(
                bugData
            );


        console.log(
            "Firebase submission ID:",
            submissionDocumentId
        );


        /* ----------------------------------------------------
           SEND BUG TO FLASK
           ---------------------------------------------------- */

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


        const rawText =
            await response.text();


        let data;

        try {

            data =
                rawText
                    ? JSON.parse(
                        rawText
                    )
                    : {};

        } catch (parseError) {

            throw new Error(
                `Backend returned invalid JSON. HTTP ${response.status}.`
            );

        }


        if (!response.ok) {

            throw new Error(
                data?.error ||
                data?.message ||
                `Analysis failed with HTTP ${response.status}.`
            );

        }


        if (
            data?.ok === false
        ) {

            throw new Error(
                data?.error ||
                data?.message ||
                "Bug analysis failed."
            );

        }


        /* ----------------------------------------------------
           DISPLAY ANALYSIS
           ---------------------------------------------------- */

        displayAnalysis(
            data
        );


        /* ----------------------------------------------------
           UPDATE FIREBASE DOCUMENT
           ---------------------------------------------------- */

        await updateBugSubmissionAnalysis(
            submissionDocumentId,
            data
        );


        /* ----------------------------------------------------
           DASHBOARD REFRESH SIGNAL
           ---------------------------------------------------- */

        notifyDashboard();


    } catch (error) {

        console.error(
            "BugAI submission error:",
            error
        );

        showError(
            error?.message ||
            "Something went wrong while analyzing the bug."
        );

    } finally {

        if (submitButton) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                originalText;

        }

    }

}


/* ============================================================
   BUILD BUG DATA
   ============================================================ */

async function buildBugData() {

    let uploadedFileText =
        "";

    let uploadedFileMetadata =
        null;


    if (selectedFile) {

        uploadedFileText =
            await readFileAsText(
                selectedFile
            );

        uploadedFileMetadata = {

            name:
                selectedFile.name,

            size:
                selectedFile.size,

            type:
                selectedFile.type,

            extension:
                getFileExtension(
                    selectedFile.name
                )

        };

    }


    const manualStackTrace =
        getElementValue(
            stackTrace
        );


    let combinedStackTrace =
        manualStackTrace;


    if (uploadedFileText) {

        combinedStackTrace =
            manualStackTrace
                ? `${manualStackTrace}\n\n${uploadedFileText}`
                : uploadedFileText;

    }


    return {

        title:
            getElementValue(
                bugTitle
            ),

        project:
            getElementValue(
                project
            ),

        description:
            getElementValue(
                description
            ),

        stack_trace:
            combinedStackTrace,

        severity:
            getElementValue(
                severity
            ),

        priority:
            getElementValue(
                priority
            ),

        component:
            getElementValue(
                component
            ),

        attached_file:
            uploadedFileMetadata,

        attached_file_content:
            uploadedFileText &&
            uploadedFileText.length <= 700000
                ? uploadedFileText
                : uploadedFileText
                    ? "[File content omitted because it exceeds the Firestore storage limit used by this page.]"
                    : "",

        submitted_from:
            "Bug Submission",

        client_timestamp:
            new Date().toISOString()

    };

}


/* ============================================================
   READ FILE
   ============================================================ */

function readFileAsText(
    file
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const reader =
                new FileReader();

            reader.onload = () => {

                resolve(
                    String(
                        reader.result || ""
                    )
                );

            };

            reader.onerror = () => {

                reject(
                    new Error(
                        "Unable to read the selected file."
                    )
                );

            };

            reader.readAsText(
                file
            );

        }
    );

}


/* ============================================================
   FIREBASE — SAVE SUBMISSION
   ============================================================ */

async function saveBugSubmission(
    bugData,
    analysisData = null
) {

    const submission = {

        title:
            bugData.title || "",

        project:
            bugData.project || "",

        description:
            bugData.description || "",

        stack_trace:
            bugData.stack_trace || "",

        severity:
            bugData.severity || "",

        priority:
            bugData.priority || "",

        component:
            bugData.component || "",

        analysis:
            analysisData || null,

        attached_file:
            bugData.attached_file || null,

        attached_file_content:
            bugData.attached_file_content || "",

        status:
            analysisData
                ? "Analyzed"
                : "Submitted",

        createdAt:
            serverTimestamp(),

        updatedAt:
            serverTimestamp()

    };


    const docRef =
        await addDoc(
            collection(
                db,
                "bugSubmissions"
            ),
            submission
        );


    return docRef.id;

}


/* ============================================================
   FIREBASE — UPDATE ANALYSIS
   ============================================================ */

async function updateBugSubmissionAnalysis(
    documentId,
    analysisData
) {

    if (!documentId) {

        console.warn(
            "No Firebase document ID available for analysis update."
        );

        return;

    }


    const submissionRef =
        doc(
            db,
            "bugSubmissions",
            documentId
        );


    await setDoc(
        submissionRef,
        {
            analysis:
                analysisData || null,

            status:
                "Analyzed",

            updatedAt:
                serverTimestamp()

        },
        {
            merge: true
        }
    );

}


/* ============================================================
   FORM VALIDATION
   ============================================================ */

function validateForm() {

    const title =
        getElementValue(
            bugTitle
        ).trim();

    const desc =
        getElementValue(
            description
        ).trim();


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

function displayAnalysis(
    data
) {

    const triage =
        data?.triage || {};

    const log =
        data?.log_analysis || {};

    const rootCause =
        data?.root_cause || {};

    const duplicate =
        data?.duplicate_detection || {};

    const remediation =
        data?.remediation || {};

    const retrieval =
        data?.retrieval || {};

    const orchestration =
        data?.orchestration || {};


    if (!result) {
        return;
    }


    const componentValue =
        triage.affected_component ||
        triage.component ||
        getElementValue(
            component
        ) ||
        bugDataComponentFallback(
            data
        ) ||
        "Not classified";


    const rootHypothesis =
        rootCause.primary_hypothesis ||
        rootCause.hypothesis ||
        rootCause.root_cause ||
        "Insufficient evidence";


    const matches =
        Array.isArray(
            duplicate.matches
        )
            ? duplicate.matches
            : [];


    const duplicateStatus =
        getDuplicateDisplayStatus(
            duplicate,
            matches
        );


    /*
     * submissionDocumentId is the actual
     * Firebase Firestore document ID.
     */

    const documentId =
        submissionDocumentId ||
        "Not available";


    result.classList.remove(
        "hidden"
    );


    result.innerHTML = `

        <!-- ====================================================
             RESULT HEADER
             ==================================================== -->

        <div class="result-header">

            <div>

                <h2>
                    Bug Analysis Results
                </h2>

                <p>
                    BugAI intelligent diagnosis completed successfully.
                </p>

            </div>

            <span class="status-badge">
                Analysis Complete
            </span>

        </div>


        <!-- ====================================================
             SUBMISSION SUMMARY
             ==================================================== -->

        <div class="result-section">

            <h3>
                Submission Summary
            </h3>

            <div class="analysis-grid">

                ${renderSummaryItem(
                    "Severity",
                    triage.severity ||
                    "Not classified"
                )}

                ${renderSummaryItem(
                    "Priority",
                    triage.priority ||
                    "Not classified"
                )}

                ${renderSummaryItem(
                    "Component",
                    componentValue
                )}

                ${renderSummaryItem(
                    "Firebase Document",
                    documentId
                )}

            </div>

        </div>


        <!-- ====================================================
             TRIAGE AGENT
             ==================================================== -->

        <div class="result-section">

            <div class="section-heading-row">

                <h3>
                    Triage Agent
                </h3>

                <span class="agent-status">
                    COMPLETED
                </span>

            </div>

            <div class="analysis-grid">

                ${renderSummaryItem(
                    "Severity",
                    triage.severity ||
                    "Not classified"
                )}

                ${renderSummaryItem(
                    "Priority",
                    triage.priority ||
                    "Not classified"
                )}

                ${renderSummaryItem(
                    "Component",
                    componentValue
                )}

                ${renderSummaryItem(
                    "Confidence",
                    formatConfidence(
                        triage.confidence
                    )
                )}

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


        <!-- ====================================================
             LOG ANALYSIS AGENT
             ==================================================== -->

        <div class="result-section">

            <div class="section-heading-row">

                <h3>
                    Log Analysis Agent
                </h3>

                <span class="agent-status">
                    COMPLETED
                </span>

            </div>

            <div class="analysis-grid">

                ${renderSummaryItem(
                    "Exception Type",
                    log.exception_type ||
                    "Not detected"
                )}

                ${renderSummaryItem(
                    "Confidence",
                    formatConfidence(
                        log.confidence
                    )
                )}

                ${renderSummaryItem(
                    "Failure Point",
                    formatFailurePoint(
                        log.failure_point
                    )
                )}

                ${renderSummaryItem(
                    "Error Message",
                    log.error_message ||
                    "Not detected"
                )}

            </div>

            ${
                log.failure_point_summary
                    ? `
                        <div class="reasoning-box">

                            <strong>
                                Failure Point Summary
                            </strong>

                            <p>
                                ${escapeHtml(
                                    log.failure_point_summary
                                )}
                            </p>

                        </div>
                    `
                    : ""
            }

            ${
                log.summary
                    ? `
                        <div class="reasoning-box">

                            <strong>
                                Analysis Summary
                            </strong>

                            <p>
                                ${escapeHtml(
                                    log.summary
                                )}
                            </p>

                        </div>
                    `
                    : ""
            }

            ${renderPatterns(
                log.patterns
            )}

        </div>


        <!-- ====================================================
             ROOT CAUSE ANALYSIS
             ==================================================== -->

        <div class="result-section">

            <div class="section-heading-row">

                <h3>
                    Root Cause Analysis
                </h3>

                <span class="analysis-badge">

                    ${escapeHtml(
                        rootCause.status ||
                        "Evidence Supported"
                    )}

                </span>

            </div>


            <div class="root-cause-box">

                <div>

                    <span class="root-cause-label">
                        Probable Root Cause
                    </span>

                    ${renderReadMore(
                        rootHypothesis,
                        240
                    )}

                </div>


                <div class="root-confidence">

                    <strong>
                        Confidence
                    </strong>

                    <span>

                        ${formatConfidence(
                            rootCause.confidence
                        )}

                    </span>

                </div>

            </div>


            ${renderSupportingEvidence(
                rootCause.supporting_evidence
            )}


            ${
                rootCause.reasoning_boundary
                    ? `
                        <div class="boundary-note">

                            <strong>
                                Reasoning Boundary
                            </strong>

                            ${renderReadMore(
                                rootCause.reasoning_boundary,
                                240
                            )}

                        </div>
                    `
                    : ""
            }

        </div>


        <!-- ====================================================
             DUPLICATE DETECTION
             ==================================================== -->

        <div class="result-section">

            <div class="section-heading-row">

                <h3>
                    Duplicate Detection
                </h3>

                <span class="analysis-badge">

                    ${escapeHtml(
                        duplicateStatus
                    )}

                </span>

            </div>


            ${
                matches.length
                    ? renderSimilarDefects(
                        matches
                    )
                    : `
                        <div class="empty-state">

                            No similar historical defects
                            were retrieved.

                        </div>
                    `
            }


            ${
                duplicate.reasoning
                    ? `
                        <div class="reasoning-box">

                            <strong>
                                Detection Reasoning
                            </strong>

                            <p>
                                ${escapeHtml(
                                    duplicate.reasoning
                                )}
                            </p>

                        </div>
                    `
                    : ""
            }

        </div>


        <!-- ====================================================
             REMEDIATION AGENT
             ==================================================== -->

        <div class="result-section">

            <div class="section-heading-row">

                <h3>
                    Remediation Agent
                </h3>

                <span class="analysis-badge">

                    ${escapeHtml(
                        remediation.status ||
                        "Recommendation"
                    )}

                </span>

            </div>


            ${renderRecommendationsRobust(
                remediation
            )}

        </div>


        <!-- ====================================================
             AGENT ORCHESTRATION
             ==================================================== -->

        <div class="result-section">

            <div class="section-heading-row">

                <h3>
                    Agent Orchestration
                </h3>

                <span class="analysis-badge">

                    ${escapeHtml(
                        orchestration.status ||
                        "Completed"
                    )}

                </span>

            </div>


            ${renderOrchestration(
                orchestration
            )}

        </div>


        <!-- ====================================================
             KNOWLEDGE BASE EVIDENCE
             ==================================================== -->

        <div class="result-section">

            <h3>
                Knowledge Base Evidence
            </h3>

            <p>

                Retrieved

                <strong>
                    ${Number(
                        retrieval.count ||
                        matches.length ||
                        0
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
   SUMMARY ITEM
   ============================================================ */

function renderSummaryItem(
    label,
    value
) {

    return `

        <div class="analysis-item">

            <span class="label">

                ${escapeHtml(
                    label
                )}

            </span>

            <strong>

                ${escapeHtml(
                    value
                )}

            </strong>

        </div>

    `;

}


/* ============================================================
   COMPONENT FALLBACK
   ============================================================ */

function bugDataComponentFallback(
    data
) {

    const query =
        String(
            data?.orchestration?.retrieval_query ||
            ""
        ).toLowerCase();

    const log =
        data?.log_analysis || {};

    const exception =
        String(
            log.exception_type ||
            ""
        ).toLowerCase();

    const error =
        String(
            log.error_message ||
            ""
        ).toLowerCase();


    if (

        query.includes("mysql") ||

        query.includes("database") ||

        exception.includes("sql") ||

        exception.includes("mysql") ||

        error.includes("mysql") ||

        error.includes("database") ||

        error.includes("connection refused")

    ) {

        return "Database / MySQL";

    }


    return "";

}


/* ============================================================
   READ MORE / READ LESS
   ============================================================ */

function renderReadMore(
    text,
    maxLength = 240
) {

    const value =
        String(text || "").trim();


    if (!value) {
        return "";
    }


    /*
     * Short text does not need a button.
     */

    if (
        value.length <= maxLength
    ) {

        return `

            <div class="read-more-text">

                ${escapeHtml(
                    value
                )}

            </div>

        `;

    }


    const shortText =
        value
            .slice(
                0,
                maxLength
            )
            .trim();


    return `

        <div class="read-more-container">

            <div
                class="read-more-text"
                data-full-text="${escapeHtml(
                    value
                )}"
                data-short-text="${escapeHtml(
                    shortText
                )}"
            >

                ${escapeHtml(
                    shortText
                )}...

            </div>


            <button
                type="button"
                class="read-more-button"
            >

                Read more

            </button>

        </div>

    `;

}


function handleReadMoreClick(event) {

    const button =
        event.target.closest(
            ".read-more-button"
        );

    if (!button) {
        return;
    }

    event.preventDefault();

    toggleReadMore(button);
}


/* ============================================================
   TOGGLE READ MORE
   ============================================================ */
function toggleReadMore(
    button
) {

    const container =
        button.closest(
            ".read-more-container"
        );

    if (!container) {
        return;
    }

    const textElement =
        container.querySelector(
            ".read-more-text"
        );

    if (!textElement) {
        return;
    }

    const fullText =
        textElement.dataset.fullText || "";

    const shortText =
        textElement.dataset.shortText || "";

    if (
        textElement.classList.contains(
            "expanded"
        )
    ) {

        textElement.textContent =
            `${shortText}...`;

        textElement.classList.remove(
            "expanded"
        );

        button.textContent =
            "Read more";

        return;
    }

    textElement.textContent =
        fullText;

    textElement.classList.add(
        "expanded"
    );

    button.textContent =
        "Read less";
}


/* Make function available to inline onclick */
window.toggleReadMore = toggleReadMore;


/* ============================================================
   ROOT CAUSE — SUPPORTING EVIDENCE
   ============================================================ */

function renderSupportingEvidence(
    evidence
) {

    if (
        !Array.isArray(evidence) ||
        evidence.length === 0
    ) {

        return `

            <div class="supporting-evidence">

                <strong>
                    Supporting Evidence
                </strong>

                <p>
                    No supporting historical evidence available.
                </p>

            </div>

        `;

    }


    return `

        <div class="supporting-evidence">

            <strong>
                Supporting Evidence
            </strong>


            ${
                evidence
                    .slice(0, 5)
                    .map(
                        item => {

                            /*
                             * STRING EVIDENCE
                             */

                            if (
                                typeof item ===
                                "string"
                            ) {

                                return `

                                    <div class="evidence-item">

                                        ${renderReadMore(
                                            item,
                                            220
                                        )}

                                    </div>

                                `;

                            }


                            /*
                             * OBJECT EVIDENCE
                             */

                            const text =
                                item?.description ||
                                item?.title ||
                                item?.evidence ||
                                item?.reason ||
                                "Historical evidence";


                            const similarity =
                                item?.similarity !==
                                undefined

                                    ? `

                                        <span class="evidence-similarity">

                                            Similarity:

                                            ${formatConfidence(
                                                item.similarity
                                            )}

                                        </span>

                                    `

                                    : "";


                            return `

                                <div class="evidence-item">

                                    ${renderReadMore(
                                        text,
                                        220
                                    )}

                                    ${similarity}

                                </div>

                            `;

                        }
                    )
                    .join("")
            }

        </div>

    `;

}


/* ============================================================
   REMEDIATION ROBUST RENDERER
   ============================================================ */

function renderRecommendationsRobust(
    remediation
) {

    console.log(
        "BUGAI Remediation data:",
        remediation
    );


    const source =
        remediation &&
        typeof remediation === "object"
            ? remediation
            : {};


    let recommendations = [];


    if (
        Array.isArray(
            source.recommendations
        )
    ) {

        recommendations =
            source.recommendations.filter(
                item =>
                    item !== null &&
                    item !== undefined
            );

    }


    if (
        recommendations.length > 0
    ) {

        return `

            <div class="bugai-remediation-content">

                ${
                    recommendations
                        .map(
                            (item, index) => {

                                const recommendation =
                                    typeof item === "string"
                                        ? item
                                        : (
                                            item?.recommendation ||
                                            item?.recommended_fix ||
                                            item?.resolution ||
                                            "No recommendation text available."
                                        );


                                const confidence =
                                    typeof item === "object"
                                        ? formatConfidence(
                                            item?.confidence
                                        )
                                        : "";


                                const basis =
                                    typeof item === "object"
                                        ? (
                                            item?.basis ||
                                            ""
                                        )
                                        : "";


                                const sourceBugIds =
                                    typeof item === "object" &&
                                    Array.isArray(
                                        item?.source_bug_ids
                                    )
                                        ? item.source_bug_ids
                                        : [];


                                const historicalResolution =
                                    typeof item === "object"
                                        ? (
                                            item?.historical_resolution ||
                                            ""
                                        )
                                        : "";


                                return `

                                    <div class="bugai-remediation-card">

                                        <div class="bugai-remediation-card-header">

                                            <strong>
                                                Recommendation ${index + 1}
                                            </strong>

                                            ${
                                                confidence
                                                    ? `
                                                        <span>
                                                            ${escapeHtml(
                                                                confidence
                                                            )}
                                                        </span>
                                                    `
                                                    : ""
                                            }

                                        </div>


                                        <div class="bugai-remediation-main">

                                            ${escapeHtml(
                                                recommendation
                                            )}

                                        </div>


                                        ${
                                            basis
                                                ? `
                                                    <div class="bugai-remediation-detail">

                                                        <strong>
                                                            Basis:
                                                        </strong>

                                                        ${escapeHtml(
                                                            basis
                                                        )}

                                                    </div>
                                                `
                                                : ""
                                        }


                                        ${
                                            sourceBugIds.length
                                                ? `
                                                    <div class="bugai-remediation-detail">

                                                        <strong>
                                                            Source Bug(s):
                                                        </strong>

                                                        <div class="bugai-source-bugs">

                                                            ${
                                                                sourceBugIds
                                                                    .map(
                                                                        id => `
                                                                            <span>
                                                                                ${escapeHtml(
                                                                                    id
                                                                                )}
                                                                            </span>
                                                                        `
                                                                    )
                                                                    .join("")
                                                            }

                                                        </div>

                                                    </div>
                                                `
                                                : ""
                                        }


                                        ${
                                            historicalResolution
                                                ? `
                                                    <div class="bugai-remediation-detail">

                                                        <strong>
                                                            Historical Resolution:
                                                        </strong>

                                                        ${renderReadMore(
                                                            historicalResolution,
                                                            220
                                                        )}

                                                    </div>
                                                `
                                                : ""
                                        }

                                    </div>

                                `;

                            }
                        )
                        .join("")
                }

            </div>

        `;

    }


    const fallback =
        source.recommended_fix ||
        source.resolution ||
        source.recommendation;


    if (
        fallback
    ) {

        return `

            <div class="bugai-remediation-content">

                <div class="bugai-remediation-card">

                    <div class="bugai-remediation-card-header">

                        <strong>
                            Recommendation 1
                        </strong>

                    </div>


                    ${renderReadMore(
                        fallback,
                        240
                    )}

                </div>

            </div>

        `;

    }


    return `

        <div class="bugai-remediation-content">

            <div class="bugai-remediation-card">

                <strong>
                    No remediation recommendation was generated.
                </strong>

                <p>
                    The Remediation Agent completed, but the
                    backend did not provide a recommendation
                    from the available evidence.
                </p>

            </div>

        </div>

    `;

}


/* ============================================================
   ORCHESTRATION RENDERER
   ============================================================ */

function renderOrchestration(
    orchestration
) {

    console.log(
        "BUGAI Orchestration data:",
        orchestration
    );


    const source =
        orchestration &&
        typeof orchestration === "object"
            ? orchestration
            : {};


    let agents =
        Array.isArray(
            source.agents
        )
            ? source.agents.filter(
                agent =>
                    agent !== null &&
                    agent !== undefined &&
                    String(agent).trim() !== ""
            )
            : [];


    if (
        agents.length === 0
    ) {

        agents = [
            "Triage Agent",
            "Log Analysis Agent",
            "Root Cause Agent",
            "Duplicate Detection Agent",
            "Remediation Agent"
        ];

    }


    const contextReady =
        source.context_ready_for_milestone_3 !== false;


    return `

        <div class="bugai-orchestration-content">

            ${
                agents
                    .map(
                        (
                            agent,
                            index
                        ) => `

                            <div class="bugai-orchestration-item">

                                <span class="bugai-orchestration-number">

                                    ${index + 1}

                                </span>


                                <span class="bugai-orchestration-agent">

                                    ${escapeHtml(
                                        String(
                                            agent
                                        )
                                    )}

                                </span>


                                <span class="bugai-orchestration-completed">

                                    ✓ COMPLETED

                                </span>

                            </div>

                        `
                    )
                    .join("")
            }

        </div>


        <div class="bugai-orchestration-context">

            <strong>
                Downstream Agent Context:
            </strong>

            <span>

                ${
                    contextReady
                        ? "Ready"
                        : "Not Ready"
                }

            </span>

        </div>

    `;

}


/* ============================================================
   SIMILAR DEFECTS
   ============================================================ */

function renderSimilarDefects(
    matches
) {

    if (
        !matches ||
        !Array.isArray(
            matches
        ) ||
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

            ${
                matches
                    .slice(0, 8)
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


                                <div class="defect-meta">

                                    ${
                                        match.project
                                            ? `
                                                <span>

                                                    Project:

                                                    ${escapeHtml(
                                                        match.project
                                                    )}

                                                </span>
                                            `
                                            : ""
                                    }


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
                                    match.description
                                        ? `

                                            <div class="defect-description">

                                                <strong>
                                                    Description:
                                                </strong>

                                                ${renderReadMore(
                                                    match.description,
                                                    220
                                                )}

                                            </div>

                                        `
                                        : ""
                                }


                                ${
                                    match.exception
                                        ? `

                                            <div class="resolution">

                                                <strong>
                                                    Exception:
                                                </strong>

                                                ${renderReadMore(
                                                    match.exception,
                                                    180
                                                )}

                                            </div>

                                        `
                                        : ""
                                }


                                ${
                                    match.resolution_summary
                                        ? `

                                            <div class="resolution">

                                                <strong>
                                                    Historical Resolution:
                                                </strong>

                                                ${renderReadMore(
                                                    match.resolution_summary,
                                                    220
                                                )}

                                            </div>

                                        `
                                        : ""
                                }


                                ${
                                    match.root_cause
                                        ? `

                                            <div class="resolution">

                                                <strong>
                                                    Historical Root Cause:
                                                </strong>

                                                ${renderReadMore(
                                                    match.root_cause,
                                                    220
                                                )}

                                            </div>

                                        `
                                        : ""
                                }


                                ${
                                    match.reason
                                        ? `

                                            <div class="boundary-note">

                                                ${renderReadMore(
                                                    match.reason,
                                                    220
                                                )}

                                            </div>

                                        `
                                        : ""
                                }

                            </div>

                        `
                    )
                    .join("")
            }

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
        !Array.isArray(
            recommendations
        ) ||
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

            ${
                recommendations
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


                                ${renderReadMore(
                                    item.recommendation ||
                                    "No recommendation provided.",
                                    240
                                )}


                                ${
                                    item.basis
                                        ? `

                                            <div class="recommendation-basis">

                                                <strong>
                                                    Basis:
                                                </strong>

                                                ${renderReadMore(
                                                    item.basis,
                                                    200
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

                                                ${
                                                    item.source_bug_ids
                                                        .map(
                                                            id => `

                                                                <span>

                                                                    ${escapeHtml(
                                                                        id
                                                                    )}

                                                                </span>

                                                            `
                                                        )
                                                        .join("")
                                                }

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

                                                ${renderReadMore(
                                                    item.historical_resolution,
                                                    220
                                                )}

                                            </div>

                                        `
                                        : ""
                                }


                                ${
                                    item.historical_resolution_note
                                        ? `

                                            <div class="boundary-note">

                                                ${renderReadMore(
                                                    item.historical_resolution_note,
                                                    220
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

                                            <div class="implementation-guidance">

                                                <strong>
                                                    Implementation Guidance:
                                                </strong>

                                                <ul>

                                                    ${
                                                        item.implementation_guidance
                                                            .map(
                                                                step => `

                                                                    <li>

                                                                        ${renderReadMore(
                                                                            step,
                                                                            180
                                                                        )}

                                                                    </li>

                                                                `
                                                            )
                                                            .join("")
                                                    }

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

                                            <div class="validation-steps">

                                                <strong>
                                                    Validation Steps:
                                                </strong>

                                                <ol>

                                                    ${
                                                        item.validation_steps
                                                            .map(
                                                                step => `

                                                                    <li>

                                                                        ${renderReadMore(
                                                                            step,
                                                                            180
                                                                        )}

                                                                    </li>

                                                                `
                                                            )
                                                            .join("")
                                                    }

                                                </ol>

                                            </div>

                                        `
                                        : ""
                                }

                            </div>

                        `
                    )
                    .join("")
            }

        </div>

    `;

}


/* ============================================================
   PATTERNS
   ============================================================ */

function renderPatterns(
    patterns
) {

    if (
        !Array.isArray(
            patterns
        ) ||
        patterns.length === 0
    ) {

        return "";

    }


    return `

        <div class="patterns-box">

            <strong>
                Detected Patterns
            </strong>


            <div class="pattern-list">

                ${
                    patterns
                        .slice(0, 10)
                        .map(
                            pattern => `

                                <span class="pattern-tag">

                                    ${escapeHtml(
                                        typeof pattern ===
                                        "string"
                                            ? pattern
                                            : (
                                                pattern?.pattern ||
                                                pattern?.name ||
                                                JSON.stringify(
                                                    pattern
                                                )
                                            )
                                    )}

                                </span>

                            `
                        )
                        .join("")
                }

            </div>

        </div>

    `;

}


/* ============================================================
   DUPLICATE STATUS
   ============================================================ */

function getDuplicateDisplayStatus(
    duplicate,
    matches
) {

    if (
        duplicate.likely_duplicate
    ) {

        return "Possible Duplicate";

    }


    if (
        matches.length > 0
    ) {

        return "Similar Defects Found";

    }


    return (
        duplicate.status ||
        "New / Unmatched"
    );

}


/* ============================================================
   FORMAT CONFIDENCE
   ============================================================ */

function formatConfidence(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "Not available";

    }


    const number =
        Number(
            value
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        return escapeHtml(
            String(value)
        );

    }


    const percentage =
        number <= 1
            ? number * 100
            : number;


    return `${percentage.toFixed(
        1
    )}%`;

}


/* ============================================================
   FAILURE POINT
   ============================================================ */

function formatFailurePoint(
    value
) {

    if (!value) {
        return "Not detected";
    }


    if (
        typeof value ===
        "string"
    ) {

        return value;

    }


    if (
        typeof value ===
        "object"
    ) {

        return (
            value.file ||
            value.path ||
            value.location ||
            value.line ||
            JSON.stringify(
                value
            )
        );

    }


    return String(
        value
    );

}


/* ============================================================
   GENERIC ELEMENT VALUE
   ============================================================ */

function getElementValue(
    element
) {

    if (!element) {
        return "";
    }

    return String(
        element.value || ""
    );

}


/* ============================================================
   RESET
   ============================================================ */

function resetForm() {

    if (bugForm) {
        bugForm.reset();
    }

    selectedFile = null;

    submissionDocumentId = null;


    if (fileInfo) {
        fileInfo.innerHTML = "";
    }


    clearResult();

}


/* ============================================================
   CLEAR RESULT
   ============================================================ */

function clearResult() {

    if (!result) {
        return;
    }

    result.innerHTML = "";

    result.classList.add(
        "hidden"
    );

}


/* ============================================================
   SHOW ERROR
   ============================================================ */

function showError(
    message
) {

    if (!result) {

        alert(
            message
        );

        return;
    }


    result.classList.remove(
        "hidden"
    );


    result.innerHTML = `

        <div class="result-header error-header">

            <div>

                <h2>
                    Analysis Error
                </h2>

                <p>

                    ${escapeHtml(
                        message
                    )}

                </p>

            </div>

        </div>

    `;


    result.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/* ============================================================
   DASHBOARD REFRESH
   ============================================================ */

function notifyDashboard() {

    try {

        localStorage.setItem(
            "bugai-dashboard-refresh",
            String(
                Date.now()
            )
        );


        window.dispatchEvent(
            new CustomEvent(
                "bugai:submission-created"
            )
        );

    } catch (error) {

        console.warn(
            "Unable to notify dashboard.",
            error
        );

    }

}


/* ============================================================
   HTML ESCAPE
   ============================================================ */

function escapeHtml(
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


/* ============================================================
   END
   ============================================================ */