/* =========================================================
   BUGAI — BUG SUBMISSION
   Backend: http://127.0.0.1:5000
   ========================================================= */

const API_BASE_URL = "http://127.0.0.1:5000";

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

        fileInput.value = "";
        fileInfo.textContent = "";

        return;
    }


    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {

        alert(
            "File is too large.\n\n" +
            "Maximum allowed size is 10 MB."
        );

        fileInput.value = "";
        fileInfo.textContent = "";

        return;
    }


    const sizeKB = file.size / 1024;

    fileInfo.textContent =
        `Selected file: ${file.name} (${sizeKB.toFixed(1)} KB)`;
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
             * Assign dropped file to the file input.
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

            form.reset();

            fileInfo.textContent = "";

            result.innerHTML = "";

            result.classList.add("hidden");

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


            const submitButton =
                form.querySelector(
                    'button[type="submit"]'
                );


            const bugTitle =
                document.getElementById(
                    "bugTitle"
                ).value.trim();


            const project =
                document.getElementById(
                    "project"
                ).value;


            const severity =
                document.getElementById(
                    "severity"
                ).value;


            const description =
                document.getElementById(
                    "description"
                ).value.trim();


            let stackTrace =
                document.getElementById(
                    "stackTrace"
                ).value.trim();


            /* ---------------------------------------------
               BASIC VALIDATION
            --------------------------------------------- */

            if (!bugTitle) {

                alert("Please enter a bug title.");

                return;

            }


            if (!description) {

                alert("Please enter a bug description.");

                return;

            }


            /* ---------------------------------------------
               READ ATTACHED FILE
            --------------------------------------------- */

            const file =
                fileInput &&
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


            /* ---------------------------------------------
               CREATE PAYLOAD
            --------------------------------------------- */

            const payload = {

                title: bugTitle,

                project: project,

                severity: severity,

                description: description,

                stack_trace: stackTrace

            };


            /* ---------------------------------------------
               BUTTON STATE
            --------------------------------------------- */

            submitButton.disabled = true;

            submitButton.textContent =
                "Analyzing...";


            result.classList.remove("hidden");

            result.innerHTML = `
                <h2>Analyzing Bug...</h2>

                <p>
                    The BugAI backend is processing the
                    defect through the diagnosis pipeline.
                </p>
            `;


            try {

                /* -----------------------------------------
                   BACKEND REQUEST
                ----------------------------------------- */

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


                /* -----------------------------------------
                   HANDLE EMPTY / INVALID RESPONSE
                ----------------------------------------- */

                const responseText =
                    await response.text();


                let data;


                try {

                    data =
                        responseText
                            ? JSON.parse(responseText)
                            : {};

                } catch (jsonError) {

                    console.error(
                        "Invalid JSON response:",
                        responseText
                    );

                    throw new Error(
                        `Backend returned an invalid response (HTTP ${response.status}).`
                    );

                }


                if (!response.ok) {

                    throw new Error(
                        data.error ||
                        `Backend request failed (HTTP ${response.status}).`
                    );

                }


                /* -----------------------------------------
                   SAVE LOCAL ANALYSIS HISTORY
                ----------------------------------------- */

                const analyses =
                    JSON.parse(
                        localStorage.getItem(
                            "bugaiAnalyses"
                        ) || "[]"
                    );


                analyses.unshift({

                    ...payload,

                    created_at:
                        new Date()
                            .toLocaleString()

                });


                localStorage.setItem(

                    "bugaiAnalyses",

                    JSON.stringify(
                        analyses.slice(0, 20)
                    )

                );


                /* -----------------------------------------
                   DISPLAY RESULT
                ----------------------------------------- */

                renderResult(data);


            } catch (error) {

                console.error(
                    "BugAI Analysis Error:",
                    error
                );


                result.classList.remove(
                    "hidden"
                );


                result.innerHTML = `

                    <h2>
                        Analysis Error
                    </h2>

                    <p>
                        ${escapeHTML(
                            getFriendlyErrorMessage(error)
                        )}
                    </p>

                    <div class="result-box">

                        <h3>
                            Check the following
                        </h3>

                        <p>
                            1. Make sure the Python backend
                            is running.
                        </p>

                        <p>
                            2. Run:
                            <strong>
                                python backend/app.py
                            </strong>
                        </p>

                        <p>
                            3. Confirm that the backend is
                            available at:
                            <strong>
                                http://127.0.0.1:5000
                            </strong>
                        </p>

                    </div>

                `;

            } finally {

                submitButton.disabled = false;

                submitButton.textContent =
                    "Analyze Bug";

            }

        }
    );

}


/* =========================================================
   RENDER ANALYSIS RESULT
   ========================================================= */

function renderResult(data) {

    result.classList.remove(
        "hidden"
    );


    const triage =
        data.triage || {};


    const logAnalysis =
        data.log_analysis || {};


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


    let similarHTML =
        "<p>No similar historical defects found.</p>";


    if (similarDefects.length > 0) {

        similarHTML =
            similarDefects
                .map(function (match) {

                    const score =
                        Number(
                            match.score || 0
                        ) * 100;


                    return `

                        <div class="match">

                            <div>
                                <strong>
                                    ${escapeHTML(
                                        match.title
                                    )}
                                </strong>

                                <span>
                                    —
                                    ${escapeHTML(
                                        match.project
                                    )}
                                </span>

                                <span class="score">
                                    ${score.toFixed(1)}%
                                </span>
                            </div>

                            <small>
                                Bug ID:
                                ${escapeHTML(
                                    match.bug_id
                                )}
                            </small>

                            <div>
                                ${escapeHTML(
                                    match.resolution ||
                                    "No resolution recorded."
                                )}
                            </div>

                        </div>

                    `;

                })
                .join("");

    }


    result.innerHTML = `

        <h2>
            Bug Analysis Result
        </h2>


        <div class="result-grid">


            <!-- Triage -->

            <div class="result-box">

                <h3>
                    Triage Agent
                </h3>

                <p>
                    ${escapeHTML(
                        triage.summary ||
                        "No triage summary."
                    )}
                </p>

                ${
                    triage.signals &&
                    triage.signals.length
                        ? `
                            <p>
                                <strong>
                                    Signals:
                                </strong>

                                ${triage.signals
                                    .map(
                                        escapeHTML
                                    )
                                    .join(", ")}
                            </p>
                          `
                        : ""
                }

            </div>


            <!-- Log Analysis -->

            <div class="result-box">

                <h3>
                    Log Analysis Agent
                </h3>

                <p>
                    ${escapeHTML(
                        logAnalysis.summary ||
                        "No log analysis summary."
                    )}
                </p>

                ${
                    logAnalysis.patterns &&
                    logAnalysis.patterns.length
                        ? `
                            <p>
                                <strong>
                                    Detected Patterns:
                                </strong>

                                ${logAnalysis.patterns
                                    .map(
                                        escapeHTML
                                    )
                                    .join(", ")}
                            </p>
                          `
                        : ""
                }

            </div>


            <!-- Root Cause -->

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


            <!-- Remediation -->

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


    result.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/* =========================================================
   FRIENDLY ERROR MESSAGE
   ========================================================= */

function getFriendlyErrorMessage(error) {

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


    return error.message ||
        "An unexpected error occurred.";

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