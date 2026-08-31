/* =========================================================
   BUG AI FRONTEND
   Vanilla JavaScript
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
    ====================================================== */

    const pages =
        document.querySelectorAll(".page");

    const navItems =
        document.querySelectorAll(".nav-item");

    const pageTitle =
        document.getElementById("pageTitle");

    const pageSubtitle =
        document.getElementById("pageSubtitle");

    const sidebar =
        document.getElementById("sidebar");

    const mobileMenu =
        document.getElementById("mobileMenu");

    const bugForm =
        document.getElementById("bugForm");

    const description =
        document.getElementById("description");

    const descriptionCount =
        document.getElementById("descriptionCount");

    const uploadArea =
        document.getElementById("uploadArea");

    const logFile =
        document.getElementById("logFile");

    const selectedFile =
        document.getElementById("selectedFile");

    const analysisLoader =
        document.getElementById("analysisLoader");

    const progressBar =
        document.getElementById("analysisProgress");

    const loaderStatus =
        document.getElementById("loaderStatus");

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById("toastMessage");


    /* =====================================================
       PAGE DATA
    ====================================================== */

    const pageInformation = {

        dashboard: {
            title: "Dashboard",
            subtitle:
                "Monitor and analyze software bugs using AI"
        },

        "new-analysis": {
            title: "New Analysis",
            subtitle:
                "Submit a bug for AI-powered diagnosis"
        },

        result: {
            title: "Analysis Result",
            subtitle:
                "AI diagnosis, findings and recommendations"
        },

        history: {
            title: "Analysis History",
            subtitle:
                "Review previously analyzed bugs"
        },

        architecture: {
            title: "AI Agents",
            subtitle:
                "Multi-agent bug diagnosis architecture"
        },

        settings: {
            title: "Settings",
            subtitle:
                "Configure frontend preferences"
        }

    };


    /* =====================================================
       PAGE NAVIGATION
    ====================================================== */

    function openPage(pageId) {

        pages.forEach(page => {
            page.classList.remove("active-page");
        });


        const target =
            document.getElementById(pageId);

        if (!target) {
            return;
        }

        target.classList.add("active-page");


        navItems.forEach(item => {

            item.classList.remove("active");

            if (
                item.dataset.page === pageId ||
                (
                    pageId === "result" &&
                    item.dataset.page === "new-analysis"
                )
            ) {
                item.classList.add("active");
            }

        });


        const info =
            pageInformation[pageId];

        if (info) {

            pageTitle.textContent =
                info.title;

            pageSubtitle.textContent =
                info.subtitle;

        }


        sidebar.classList.remove("open");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    }


    navItems.forEach(item => {

        item.addEventListener("click", () => {

            openPage(
                item.dataset.page
            );

        });

    });


    document
        .querySelectorAll("[data-open]")
        .forEach(button => {

            button.addEventListener("click", () => {

                openPage(
                    button.dataset.open
                );

            });

        });


    /* =====================================================
       MAIN ANALYZE BUTTONS
    ====================================================== */

    const headerAnalyzeBtn =
        document.getElementById(
            "headerAnalyzeBtn"
        );

    const startAnalysisBtn =
        document.getElementById(
            "startAnalysisBtn"
        );


    headerAnalyzeBtn.addEventListener(
        "click",
        () => openPage("new-analysis")
    );


    startAnalysisBtn.addEventListener(
        "click",
        () => openPage("new-analysis")
    );


    /* =====================================================
       MOBILE MENU
    ====================================================== */

    mobileMenu.addEventListener(
        "click",
        () => {

            sidebar.classList.toggle(
                "open"
            );

        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                window.innerWidth <= 850 &&
                sidebar.classList.contains("open")
            ) {

                if (
                    !sidebar.contains(event.target) &&
                    !mobileMenu.contains(event.target)
                ) {
                    sidebar.classList.remove("open");
                }

            }

        }
    );


    /* =====================================================
       DESCRIPTION COUNTER
    ====================================================== */

    description.addEventListener(
        "input",
        () => {

            const maxLength = 3000;

            if (
                description.value.length >
                maxLength
            ) {

                description.value =
                    description.value.substring(
                        0,
                        maxLength
                    );

            }

            descriptionCount.textContent =
                `${description.value.length} / ${maxLength}`;

        }
    );


    /* =====================================================
       FILE UPLOAD
    ====================================================== */

    uploadArea.addEventListener(
        "click",
        () => {

            logFile.click();

        }
    );


    logFile.addEventListener(
        "change",
        () => {

            if (
                logFile.files.length > 0
            ) {

                showSelectedFile(
                    logFile.files[0]
                );

            }

        }
    );


    uploadArea.addEventListener(
        "dragover",
        event => {

            event.preventDefault();

            uploadArea.classList.add(
                "dragging"
            );

        }
    );


    uploadArea.addEventListener(
        "dragleave",
        () => {

            uploadArea.classList.remove(
                "dragging"
            );

        }
    );


    uploadArea.addEventListener(
        "drop",
        event => {

            event.preventDefault();

            uploadArea.classList.remove(
                "dragging"
            );


            const files =
                event.dataTransfer.files;


            if (!files.length) {
                return;
            }


            const file =
                files[0];


            if (
                file.size >
                10 * 1024 * 1024
            ) {

                showToast(
                    "File size must be below 10 MB."
                );

                return;
            }


            const transfer =
                new DataTransfer();

            transfer.items.add(file);

            logFile.files =
                transfer.files;


            showSelectedFile(file);

        }
    );


    function showSelectedFile(file) {

        const size =
            (
                file.size /
                1024
            ).toFixed(1);


        selectedFile.textContent =
            `✓ ${file.name} (${size} KB)`;

    }


    /* =====================================================
       FORM RESET
    ====================================================== */

    document
        .getElementById("resetForm")
        .addEventListener(
            "click",
            () => {

                selectedFile.textContent =
                    "";

                descriptionCount.textContent =
                    "0 / 3000";

            }
        );


    /* =====================================================
       BUG ANALYSIS
       FRONTEND DEMO
    ====================================================== */

    bugForm.addEventListener(
        "submit",
        event => {

            event.preventDefault();


            const title =
                document
                    .getElementById(
                        "bugTitle"
                    )
                    .value
                    .trim();


            const bugDescription =
                description.value.trim();


            if (
                !title ||
                !bugDescription
            ) {

                showToast(
                    "Please enter the bug title and description."
                );

                return;

            }


            startAnalysis();

        }
    );


    function startAnalysis() {

        analysisLoader.classList.add(
            "show"
        );


        progressBar.style.width =
            "0%";


        const steps = [

            {
                progress: 15,
                message:
                    "Triage Agent is classifying the bug...",
                agent:
                    "agentTriage"
            },

            {
                progress: 35,
                message:
                    "Analyzing logs and stack trace...",
                agent:
                    "agentLogs"
            },

            {
                progress: 57,
                message:
                    "Identifying probable root cause...",
                agent:
                    "agentRoot"
            },

            {
                progress: 78,
                message:
                    "Searching for duplicate historical bugs...",
                agent:
                    "agentDuplicate"
            },

            {
                progress: 94,
                message:
                    "Generating fix recommendations...",
                agent:
                    "agentFix"
            },

            {
                progress: 100,
                message:
                    "Analysis complete."
            }

        ];


        document
            .querySelectorAll(
                ".loader-agents span"
            )
            .forEach(agent => {

                agent.classList.remove(
                    "active",
                    "completed"
                );

            });


        let stepIndex = 0;


        function nextStep() {

            if (
                stepIndex >= steps.length
            ) {

                setTimeout(
                    finishAnalysis,
                    450
                );

                return;

            }


            const step =
                steps[stepIndex];


            progressBar.style.width =
                `${step.progress}%`;


            loaderStatus.textContent =
                step.message;


            document
                .querySelectorAll(
                    ".loader-agents span"
                )
                .forEach(agent => {

                    agent.classList.remove(
                        "active"
                    );

                });


            if (step.agent) {

                const current =
                    document.getElementById(
                        step.agent
                    );


                current.classList.add(
                    "active"
                );


                if (stepIndex > 0) {

                    const previous =
                        steps[
                            stepIndex - 1
                        ].agent;


                    if (previous) {

                        document
                            .getElementById(
                                previous
                            )
                            .classList.add(
                                "completed"
                            );

                    }

                }

            }


            stepIndex++;


            setTimeout(
                nextStep,
                650
            );

        }


        setTimeout(
            nextStep,
            300
        );

    }


    /* =====================================================
       ANALYSIS COMPLETE
    ====================================================== */

    function finishAnalysis() {

        const bugTitle =
            document
                .getElementById(
                    "bugTitle"
                )
                .value;


        const severity =
            document
                .getElementById(
                    "severity"
                )
                .value;


        document
            .getElementById(
                "resultBugTitle"
            )
            .textContent =
            bugTitle;


        document
            .getElementById(
                "resultSeverity"
            )
            .textContent =
            severity.toUpperCase();


        const randomId =
            Math.floor(
                1000 +
                Math.random() * 9000
            );


        document
            .getElementById(
                "analysisId"
            )
            .textContent =
            `BUG-${randomId}`;


        analysisLoader.classList.remove(
            "show"
        );


        openPage("result");


        showToast(
            "Bug analysis completed successfully."
        );

    }


    /* =====================================================
       COPY FIX CODE
    ====================================================== */

    const copyCode =
        document.getElementById(
            "copyCode"
        );


    copyCode.addEventListener(
        "click",
        async () => {

            const code =
                document
                    .getElementById(
                        "fixCode"
                    )
                    .innerText;


            try {

                await navigator
                    .clipboard
                    .writeText(code);


                copyCode.textContent =
                    "Copied";


                showToast(
                    "Fix code copied."
                );


                setTimeout(
                    () => {

                        copyCode.textContent =
                            "Copy";

                    },
                    1500
                );

            }

            catch {

                showToast(
                    "Unable to copy code."
                );

            }

        }
    );


    /* =====================================================
       EXPORT REPORT
    ====================================================== */

    const downloadReport =
        document.getElementById(
            "downloadReport"
        );


    downloadReport.addEventListener(
        "click",
        () => {

            const title =
                document
                    .getElementById(
                        "resultBugTitle"
                    )
                    .textContent;


            const id =
                document
                    .getElementById(
                        "analysisId"
                    )
                    .textContent;


            const severity =
                document
                    .getElementById(
                        "resultSeverity"
                    )
                    .textContent;


            const report = `
BUG AI DIAGNOSIS REPORT
==============================

Analysis ID:
${id}

Bug:
${title}

Severity:
${severity}

Probable Root Cause:
The issue appears to originate during backend
request processing.

Recommendations:
1. Validate input data.
2. Add exception handling.
3. Review logs around the failing operation.

Generated by BugAI Frontend Demo.
            `.trim();


            const blob =
                new Blob(
                    [report],
                    {
                        type:
                            "text/plain"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;

            link.download =
                `${id}-report.txt`;


            document.body.appendChild(
                link
            );


            link.click();

            link.remove();


            URL.revokeObjectURL(
                url
            );


            showToast(
                "Report exported."
            );

        }
    );


    /* =====================================================
       HISTORY SEARCH
    ====================================================== */

    const historySearch =
        document.getElementById(
            "historySearch"
        );


    historySearch.addEventListener(
        "input",
        () => {

            const search =
                historySearch
                    .value
                    .toLowerCase();


            const rows =
                document.querySelectorAll(
                    "#historyTable tbody tr"
                );


            rows.forEach(row => {

                const text =
                    row.textContent
                        .toLowerCase();


                row.style.display =
                    text.includes(search)
                        ? ""
                        : "none";

            });

        }
    );


    /* =====================================================
       THEME
    ====================================================== */

    const themeToggle =
        document.getElementById(
            "themeToggle"
        );


    const savedTheme =
        localStorage.getItem(
            "bugai-theme"
        );


    if (
        savedTheme === "dark"
    ) {

        document.body.classList.add(
            "dark"
        );

        themeToggle.checked =
            true;

    }


    themeToggle.addEventListener(
        "change",
        () => {

            document.body.classList.toggle(
                "dark",
                themeToggle.checked
            );


            localStorage.setItem(
                "bugai-theme",
                themeToggle.checked
                    ? "dark"
                    : "light"
            );


            showToast(
                themeToggle.checked
                    ? "Dark mode enabled."
                    : "Light mode enabled."
            );

        }
    );


    /* =====================================================
       TOAST
    ====================================================== */

    let toastTimer;


    function showToast(message) {

        toastMessage.textContent =
            message;


        toast.classList.add(
            "show"
        );


        clearTimeout(
            toastTimer
        );


        toastTimer =
            setTimeout(
                () => {

                    toast.classList.remove(
                        "show"
                    );

                },
                2600
            );

    }

});