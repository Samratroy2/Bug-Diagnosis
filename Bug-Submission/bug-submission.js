/* =========================================================
   BUGAI — BUG SUBMISSION
   Frontend → Flask Backend → RAG / FAISS
   Backend: http://127.0.0.1:5000
   ========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const form = document.getElementById("bugForm");
const fileInput = document.getElementById("logFile");
const dropZone = document.getElementById("dropZone");
const fileInfo = document.getElementById("fileInfo");
const result = document.getElementById("result");
const resetBtn = document.getElementById("resetBtn");


/* =========================================================
   FILE VALIDATION
   ========================================================= */

function showFile(file) {

    if (!file) {
        return;
    }

    const allowedExtensions = [
        "txt",
        "log",
        "json",
        "csv"
    ];

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    if (!allowedExtensions.includes(extension)) {

        alert(
            "Invalid file type.\n\n" +
            "Supported files: TXT, LOG, JSON and CSV."
        );

        if (fileInput) {
            fileInput.value = "";
        }

        if (fileInfo) {
            fileInfo.textContent = "";
        }

        return;
    }


    /* Maximum file size = 10 MB */

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {

        alert(
            "File is too large.\n\n" +
            "Maximum allowed size is 10 MB."
        );

        if (fileInput) {
            fileInput.value = "";
        }

        if (fileInfo) {
            fileInfo.textContent = "";
        }

        return;
    }


    const sizeKB = file.size / 1024;

    if (fileInfo) {

        fileInfo.textContent =
            `Selected file: ${file.name} (${sizeKB.toFixed(1)} KB)`;
    }
}


/* =========================================================
   NORMAL FILE SELECTION
   ========================================================= */

if (fileInput) {

    fileInput.addEventListener(
        "change",
        function (event) {

            const file = event.target.files[0];

            showFile(file);
        }
    );
}


/* =========================================================
   DRAG OVER
   ========================================================= */

if (dropZone) {

    dropZone.addEventListener(
        "dragover",
        function (event) {

            event.preventDefault();

            dropZone.classList.add("dragging");
        }
    );


    dropZone.addEventListener(
        "dragleave",
        function () {

            dropZone.classList.remove("dragging");
        }
    );


    dropZone.addEventListener(
        "drop",
        function (event) {

            event.preventDefault();

            dropZone.classList.remove("dragging");

            const files = event.dataTransfer.files;

            if (!files || files.length === 0) {
                return;
            }

            const file = files[0];


            /*
             * Assign dropped file to the file input
             */

            try {

                const dataTransfer = new DataTransfer();

                dataTransfer.items.add(file);

                fileInput.files = dataTransfer.files;

            } catch (error) {

                console.warn(
                    "Could not assign dropped file:",
                    error
                );
            }


            showFile(file);
        }
    );
}


/* =========================================================
   RESET
   ========================================================= */

if (resetBtn) {

    resetBtn.addEventListener(
        "click",
        function () {

            if (form) {
                form.reset();
            }

            if (fileInfo) {
                fileInfo.textContent = "";
            }

            if (result) {

                result.innerHTML = "";

                result.classList.add("hidden");
            }
        }
    );
}


/* =========================================================
   FORM SUBMISSION
   ========================================================= */

if (form) {

    form.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            /* -------------------------------------------------
               SUBMIT BUTTON
            ------------------------------------------------- */

            const submitButton =
                form.querySelector(
                    'button[type="submit"]'
                );


            /* -------------------------------------------------
               GET FORM VALUES
            ------------------------------------------------- */

            const titleElement =
                document.getElementById("bugTitle");

            const projectElement =
                document.getElementById("project");

            const severityElement =
                document.getElementById("severity");

            const descriptionElement =
                document.getElementById("description");

            const stackTraceElement =
                document.getElementById("stackTrace");


            const bugTitle =
                titleElement
                    ? titleElement.value.trim()
                    : "";


            const project =
                projectElement
                    ? projectElement.value.trim()
                    : "";


            const severity =
                severityElement
                    ? severityElement.value.trim()
                    : "";


            const description =
                descriptionElement
                    ? descriptionElement.value.trim()
                    : "";


            let stackTrace =
                stackTraceElement
                    ? stackTraceElement.value.trim()
                    : "";


            /* -------------------------------------------------
               BASIC VALIDATION
            ------------------------------------------------- */

            if (!bugTitle) {

                alert(
                    "Please enter a bug title."
                );

                return;
            }


            if (!project) {

                alert(
                    "Please select a project."
                );

                return;
            }


            if (!severity) {

                alert(
                    "Please select a severity."
                );

                return;
            }


            if (!description) {

                alert(
                    "Please enter a bug description."
                );

                return;
            }


            /* -------------------------------------------------
               READ ATTACHED FILE
            ------------------------------------------------- */

            const file =
                fileInput &&
                fileInput.files &&
                fileInput.files.length > 0
                    ? fileInput.files[0]
                    : null;


            if (file) {

                try {

                    const fileContent =
                        await file.text();


                    if (fileContent.trim()) {

                        stackTrace +=
                            "\n\n" +
                            "Attached File: " +
                            file.name +
                            "\n" +
                            fileContent;
                    }

                } catch (error) {

                    console.error(
                        "File reading error:",
                        error
                    );

                    alert(
                        "Unable to read the attached file."
                    );

                    return;
                }
            }


            /* -------------------------------------------------
               CREATE API PAYLOAD
            ------------------------------------------------- */

            const payload = {

                title: bugTitle,

                project: project,

                severity: severity,

                description: description,

                stack_trace: stackTrace
            };


            console.log(
                "BugAI API Request:",
                payload
            );


            /* -------------------------------------------------
               BUTTON STATE
            ------------------------------------------------- */

            if (submitButton) {

                submitButton.disabled = true;

                submitButton.textContent =
                    "Analyzing...";
            }


            /* -------------------------------------------------
               SHOW ANALYZING STATE
            ------------------------------------------------- */

            if (result) {

                result.classList.remove(
                    "hidden"
                );

                result.innerHTML = `
                    <h2>Analyzing Bug...</h2>

                    <p>
                        BugAI is processing the submitted
                        defect through the diagnosis pipeline.
                    </p>

                    <div class="result-box">

                        <p>
                            <strong>Project:</strong>
                            ${escapeHTML(project)}
                        </p>

                        <p>
                            <strong>Severity:</strong>
                            ${escapeHTML(severity)}
                        </p>

                        <p>
                            <strong>Status:</strong>
                            Searching historical defects...
                        </p>

                    </div>
                `;
            }


            /* -------------------------------------------------
               BACKEND REQUEST
            ------------------------------------------------- */

            try {

                const response = await fetch(
                    `${API_BASE_URL}/api/analyze`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(payload)
                    }
                );


                /* -------------------------------------------------
                   READ RESPONSE SAFELY
                ------------------------------------------------- */

                const responseText =
                    await response.text();


                console.log(
                    "Backend HTTP Status:",
                    response.status
                );

                console.log(
                    "Backend Response:",
                    responseText
                );


                let data = {};


                if (responseText.trim()) {

                    try {

                        data =
                            JSON.parse(
                                responseText
                            );

                    } catch (jsonError) {

                        console.error(
                            "Invalid JSON returned by backend:",
                            responseText
                        );

                        throw new Error(
                            `Backend returned invalid JSON (HTTP ${response.status}).`
                        );
                    }
                }


                /* -------------------------------------------------
                   HANDLE HTTP ERRORS
                ------------------------------------------------- */

                if (!response.ok) {

                    throw new Error(
                        data.error ||
                        data.message ||
                        `Backend request failed (HTTP ${response.status}).`
                    );
                }


                /* -------------------------------------------------
                   SAVE ANALYSIS HISTORY
                ------------------------------------------------- */

                saveAnalysisHistory(
                    payload,
                    data
                );


                /* -------------------------------------------------
                   DISPLAY RESULT
                ------------------------------------------------- */

                renderResult(
                    data
                );


            } catch (error) {

                console.error(
                    "BugAI Analysis Error:",
                    error
                );


                if (result) {

                    result.classList.remove(
                        "hidden"
                    );

                    result.innerHTML = `

                        <h2>
                            Analysis Error
                        </h2>

                        <p>
                            ${escapeHTML(
                                getFriendlyErrorMessage(
                                    error
                                )
                            )}
                        </p>


                        <div class="result-box">

                            <h3>
                                Check the following
                            </h3>

                            <p>
                                <strong>1.</strong>
                                Make sure the Python backend
                                is running.
                            </p>

                            <p>
                                <strong>2.</strong>
                                Run:
                            </p>

                            <pre>python backend/app.py</pre>

                            <p>
                                <strong>3.</strong>
                                Confirm that the backend is
                                available at:
                            </p>

                            <pre>http://127.0.0.1:5000</pre>

                            <p>
                                <strong>4.</strong>
                                Open the browser console
                                with F12 to see detailed
                                API errors.
                            </p>

                        </div>
                    `;
                }

            } finally {

                if (submitButton) {

                    submitButton.disabled = false;

                    submitButton.textContent =
                        "Analyze Bug";
                }
            }
        }
    );
}


/* =========================================================
   SAVE ANALYSIS HISTORY
   ========================================================= */

function saveAnalysisHistory(
    payload,
    data
) {

    try {

        const analyses =
            JSON.parse(
                localStorage.getItem(
                    "bugaiAnalyses"
                ) || "[]"
            );


        analyses.unshift({

            ...payload,

            analysis: data,

            created_at:
                new Date().toLocaleString()
        });


        localStorage.setItem(
            "bugaiAnalyses",
            JSON.stringify(
                analyses.slice(0, 20)
            )
        );


    } catch (error) {

        console.warn(
            "Could not save analysis history:",
            error
        );
    }
}


/* =========================================================
   RENDER ANALYSIS RESULT
   ========================================================= */

function renderResult(data) {

    if (!result) {
        return;
    }


    result.classList.remove(
        "hidden"
    );


    /* -------------------------------------------------
       EXTRACT RESPONSE DATA
    ------------------------------------------------- */

    const triage =
        data.triage || {};


    const logAnalysis =
        data.log_analysis || {};

    const orchestration =
        data.orchestration || {};


    const similarDefects =
        Array.isArray(
            data.similar_defects
        )
            ? data.similar_defects
            : [];


    const rootCause =
        data.root_cause ||
        "No root cause could be determined.";


    const remediation =
        data.remediation ||
        "No remediation recommendation available.";


    /* -------------------------------------------------
       SIMILAR DEFECTS
    ------------------------------------------------- */

    let similarHTML =
        `<p>No similar historical defects found.</p>`;


    if (similarDefects.length > 0) {

        similarHTML =
            similarDefects
                .map(function (match) {

                    const rawScore =
                        Number(
                            match.score || 0
                        );


                    /*
                     * Backend normally returns
                     * similarity between 0 and 1.
                     */

                    const score =
                        rawScore <= 1
                            ? rawScore * 100
                            : rawScore;


                    return `

                        <div class="match">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        match.title ||
                                        "Untitled defect"
                                    )}
                                </strong>

                                <span>
                                    —
                                    ${escapeHTML(
                                        match.project ||
                                        "Unknown project"
                                    )}
                                </span>

                                <span class="score">
                                    ${score.toFixed(1)}%
                                </span>

                            </div>


                            <small>

                                Bug ID:
                                ${escapeHTML(
                                    match.bug_id ||
                                    "N/A"
                                )}

                            </small>


                            <div>

                                ${escapeHTML(
                                    match.resolution ||
                                    match.description ||
                                    "No resolution recorded."
                                )}

                            </div>

                        </div>

                    `;

                })
                .join("");
    }


    /* -------------------------------------------------
       TRIAGE SIGNALS
    ------------------------------------------------- */

    let triageSignalsHTML = "";


    if (
        Array.isArray(
            triage.signals
        ) &&
        triage.signals.length > 0
    ) {

        triageSignalsHTML = `

            <p>

                <strong>
                    Signals:
                </strong>

                ${triage.signals
                    .map(function (signal) {

                        return escapeHTML(
                            signal
                        );

                    })
                    .join(", ")}

            </p>

        `;
    }


    /* -------------------------------------------------
       LOG PATTERNS
    ------------------------------------------------- */

    let logPatternsHTML = "";


    if (
        Array.isArray(
            logAnalysis.patterns
        ) &&
        logAnalysis.patterns.length > 0
    ) {

        logPatternsHTML = `

            <p>

                <strong>
                    Detected Patterns:
                </strong>

                ${logAnalysis.patterns
                    .map(function (pattern) {

                        return escapeHTML(
                            pattern
                        );

                    })
                    .join(", ")}

            </p>

        `;
    }


    /* -------------------------------------------------
       RESULT HTML
    ------------------------------------------------- */

    result.innerHTML = `

        <h2>
            Bug Analysis Result
        </h2>


        <div class="result-grid">


            <!-- Triage Agent -->

            <div class="result-box agent-card">

                <div class="agent-heading">
                    <h3>Triage Agent</h3>
                    <span class="agent-status">Completed</span>
                </div>

                <p>
                    <strong>Severity:</strong>
                    ${escapeHTML(triage.severity || "N/A")}
                </p>
                <p>
                    <strong>Priority:</strong>
                    ${escapeHTML(triage.priority || "N/A")}
                </p>
                <p>
                    <strong>Affected Component:</strong>
                    ${escapeHTML(triage.affected_component || "N/A")}
                </p>
                <p>
                    <strong>Confidence:</strong>
                    ${Number(triage.confidence || 0) * 100}%
                </p>
                <p>
                    <strong>Reasoning:</strong>
                    ${escapeHTML(triage.reasoning || triage.summary || "N/A")}
                </p>

                ${triageSignalsHTML}

            </div>


            <!-- Log Analysis Agent -->

            <div class="result-box agent-card">

                <div class="agent-heading">
                    <h3>Log Analysis Agent</h3>
                    <span class="agent-status">Completed</span>
                </div>

                <p>
                    <strong>Exception Type:</strong>
                    ${escapeHTML(logAnalysis.exception_type || "N/A")}
                </p>
                <p>
                    <strong>Error Message:</strong>
                    ${escapeHTML(logAnalysis.error_message || "Not available")}
                </p>
                <p>
                    <strong>Failure Point:</strong>
                    ${escapeHTML(
                        (logAnalysis.failure_point?.file || "N/A") +
                        (logAnalysis.failure_point?.line ? ":" + logAnalysis.failure_point.line : "")
                    )}
                </p>
                <p>
                    <strong>Method:</strong>
                    ${escapeHTML(logAnalysis.failure_point?.method || "N/A")}
                </p>
                <p>
                    <strong>Confidence:</strong>
                    ${Number(logAnalysis.confidence || 0) * 100}%
                </p>

                ${logPatternsHTML}

            </div>


            <!-- Combined Agent Context -->

            <div class="result-box agent-card">

                <div class="agent-heading">
                    <h3>Agent Orchestration</h3>
                    <span class="agent-status">Ready for M3</span>
                </div>

                <p>
                    <strong>Status:</strong>
                    ${escapeHTML(orchestration.status || "completed")}
                </p>
                <p>
                    Triage and Log Analysis outputs were combined into a
                    structured bug context for downstream diagnosis.
                </p>

            </div>


            <!-- Root Cause Agent -->

            <div class="result-box">

                <h3>
                    Root Cause Agent
                </h3>

                <p>
                    ${escapeHTML(
                        rootCause
                    )}
                </p>

            </div>


            <!-- Remediation Agent -->

            <div class="result-box">

                <h3>
                    Remediation Agent
                </h3>

                <p>
                    ${escapeHTML(
                        remediation
                    )}
                </p>

            </div>

        </div>


        <!-- Historical Defects -->

        <div class="historical-results">

            <h3>
                Duplicate / Similar Historical Defects
            </h3>

            ${similarHTML}

        </div>

    `;


    /* -------------------------------------------------
       SCROLL TO RESULT
    ------------------------------------------------- */

    result.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* =========================================================
   FRIENDLY ERROR MESSAGE
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
            "Unable to connect to the BugAI backend. " +
            "Please make sure python backend/app.py " +
            "is running on port 5000."
        );
    }


    if (
        error &&
        error.message
    ) {

        return error.message;
    }


    return (
        "An unexpected error occurred."
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