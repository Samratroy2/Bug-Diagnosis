/* =========================================================
   BUGAI — KNOWLEDGE BASE PIPELINE
   Firebase + Model/Technology Information
========================================================= */


/* =========================================================
   FIREBASE IMPORTS
========================================================= */

import {
    auth,
    db,
    collection,
    getDocs,
    onAuthStateChanged
} from "../firebase.js";


/* =========================================================
   CONSTANTS
========================================================= */

const EMBEDDING_MODEL = "all-MiniLM-L6-v2";
const EMBEDDING_FRAMEWORK = "Sentence Transformers";
const VECTOR_DIMENSION = 384;
const VECTOR_INDEX = "FAISS";


/* =========================================================
   DOM HELPER
========================================================= */

function getElement(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const element = getElement(id);

    if (!element) {
        return;
    }

    element.textContent = value;

}


/* =========================================================
   NUMBER FORMATTER
========================================================= */

function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === "" ||
        Number.isNaN(Number(value))
    ) {

        return "—";

    }

    return Number(value).toLocaleString("en-IN");

}


/* =========================================================
   STRING HELPER
========================================================= */

function safeString(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }

    return String(value).trim();

}


/* =========================================================
   PROJECT NORMALIZATION
========================================================= */

function normalizeProject(project) {

    const value =
        safeString(project).toLowerCase();


    if (value.includes("apache")) {

        return "Apache";

    }


    if (value.includes("eclipse")) {

        return "Eclipse";

    }


    if (value.includes("mozilla")) {

        return "Mozilla";

    }


    return "Other";

}


/* =========================================================
   ANALYSIS STAGE CHECK
========================================================= */

function hasObject(value) {

    return (
        value !== null &&
        value !== undefined &&
        typeof value === "object"
    );

}


/* =========================================================
   GET BUG SUBMISSIONS FROM FIREBASE
========================================================= */

async function loadBugSubmissions() {

    const snapshot =
        await getDocs(
            collection(
                db,
                "bugSubmissions"
            )
        );


    const submissions = [];


    snapshot.forEach(
        (documentSnapshot) => {

            const data =
                documentSnapshot.data();


            submissions.push({

                id:
                    documentSnapshot.id,

                ...data

            });

        }
    );


    return submissions;

}


/* =========================================================
   CALCULATE STATISTICS
========================================================= */

function calculateStatistics(
    submissions
) {

    const statistics = {

        totalRecords:
            submissions.length,

        apache:
            0,

        eclipse:
            0,

        mozilla:
            0,

        other:
            0,

        analyzed:
            0,

        completePipeline:
            0

    };


    submissions.forEach(
        (bug) => {

            const project =
                normalizeProject(
                    bug.project
                );


            /* ---------------------------------------------
               PROJECT COUNT
            --------------------------------------------- */

            switch (project) {

                case "Apache":

                    statistics.apache++;

                    break;


                case "Eclipse":

                    statistics.eclipse++;

                    break;


                case "Mozilla":

                    statistics.mozilla++;

                    break;


                default:

                    statistics.other++;

                    break;

            }


            /* ---------------------------------------------
               ANALYSIS COUNT
            --------------------------------------------- */

            const analysis =
                bug.analysis;


            if (
                !hasObject(
                    analysis
                )
            ) {

                return;

            }


            statistics.analyzed++;


            /* ---------------------------------------------
               COMPLETE BUGAI PIPELINE
            --------------------------------------------- */

            const hasTriage =
                hasObject(
                    analysis.triage
                );


            const hasLogAnalysis =
                hasObject(
                    analysis.log_analysis
                );


            const hasRootCause =
                hasObject(
                    analysis.root_cause
                );


            const hasDuplicateDetection =
                hasObject(
                    analysis.duplicate_detection
                );


            const hasRemediation =
                hasObject(
                    analysis.remediation
                );


            if (
                hasTriage &&
                hasLogAnalysis &&
                hasRootCause &&
                hasDuplicateDetection &&
                hasRemediation
            ) {

                statistics.completePipeline++;

            }

        }
    );


    return statistics;

}


/* =========================================================
   UPDATE PROJECT CARD
========================================================= */

function updateProjectCard(
    prefix,
    count,
    total
) {

    setText(
        `${prefix}Count`,
        formatNumber(count)
    );


    const percentage =
        total > 0
            ? (count / total) * 100
            : 0;


    setText(
        `${prefix}Percentage`,
        `${percentage.toFixed(1)}% of Firebase records`
    );


    const progressBar =
        getElement(
            `${prefix}Bar`
        );


    if (progressBar) {

        progressBar.style.width =
            `${Math.min(
                percentage,
                100
            )}%`;

    }

}


/* =========================================================
   UPDATE KNOWLEDGE BASE STATUS
========================================================= */

function updateKnowledgeBaseStatus(
    statistics
) {

    /*
       These values are part of the current
       BugAI knowledge-base configuration.
    */

    setText(
        "totalRecords",
        formatNumber(
            statistics.totalRecords
        )
    );


    setText(
        "vectorDimension",
        VECTOR_DIMENSION
    );


    /*
       Firebase does not contain the actual FAISS
       index-vector count.

       Therefore we show the source honestly
       instead of inventing a number.
    */

    setText(
        "faissVectors",
        "Backend"
    );


    setText(
        "indexStatus",
        VECTOR_INDEX
    );


    setText(
        "embeddingModel",
        EMBEDDING_MODEL
    );


    /* ---------------------------------------------
       PROJECT DISTRIBUTION
    --------------------------------------------- */

    updateProjectCard(
        "apache",
        statistics.apache,
        statistics.totalRecords
    );


    updateProjectCard(
        "eclipse",
        statistics.eclipse,
        statistics.totalRecords
    );


    updateProjectCard(
        "mozilla",
        statistics.mozilla,
        statistics.totalRecords
    );

}


/* =========================================================
   UPDATE EMBEDDING COMPONENT
========================================================= */

function updateEmbeddingComponent() {

    const badge =
        getElement(
            "embeddingStatusBadge"
        );


    const statusText =
        getElement(
            "embeddingStatus"
        );


    if (statusText) {

        statusText.textContent =
            `${EMBEDDING_MODEL} · ${VECTOR_DIMENSION}-dimensional embeddings`;

    }


    if (badge) {

        badge.textContent =
            "IMPLEMENTED";

        badge.classList.add(
            "ready"
        );

    }

}


/* =========================================================
   UPDATE FAISS COMPONENT
========================================================= */

function updateFAISSComponent() {

    const badge =
        getElement(
            "faissStatusBadge"
        );


    if (badge) {

        badge.textContent =
            "IMPLEMENTED";

        badge.classList.add(
            "ready"
        );

    }

}


/* =========================================================
   UPDATE PIPELINE HEADER
========================================================= */

function updatePipelineHeader(
    statistics
) {

    const pipelineStatus =
        document.querySelector(
            ".pipeline-status"
        );


    if (!pipelineStatus) {
        return;
    }


    const statusText =
        pipelineStatus.querySelector(
            "span:last-child"
        );


    if (!statusText) {
        return;
    }


    if (
        statistics.totalRecords > 0
    ) {

        statusText.textContent =
            "Pipeline Data Available";

    }
    else {

        statusText.textContent =
            "Waiting for Firebase Data";

    }

}


/* =========================================================
   ADD FIREBASE DATA NOTE
========================================================= */

function addFirebaseDataNote(
    statistics
) {

    const existing =
        getElement(
            "firebasePipelineNote"
        );


    if (existing) {

        existing.remove();

    }


    const statsSection =
        document.querySelector(
            ".stats-section"
        );


    if (!statsSection) {
        return;
    }


    const note =
        document.createElement(
            "div"
        );


    note.id =
        "firebasePipelineNote";


    note.style.marginTop =
        "16px";


    note.style.padding =
        "13px 15px";


    note.style.border =
        "1px solid #dbeafe";


    note.style.borderRadius =
        "10px";


    note.style.background =
        "#eff6ff";


    note.style.color =
        "#1e40af";


    note.style.fontSize =
        "11px";


    note.style.lineHeight =
        "1.6";


    note.innerHTML = `
        <strong>Live Firebase data:</strong>
        ${formatNumber(statistics.totalRecords)}
        bug submission record(s) found.
        ${formatNumber(statistics.analyzed)}
        contain analysis data and
        ${formatNumber(statistics.completePipeline)}
        contain all major diagnosis stages.
        <br>
        <strong>Embedding:</strong>
        ${EMBEDDING_MODEL}
        (${VECTOR_DIMENSION} dimensions)
        · <strong>Vector Index:</strong>
        ${VECTOR_INDEX}.
        <br>
        FAISS vector count is maintained by the backend index
        and is not stored in the Firebase
        <code>bugSubmissions</code> collection.
    `;


    statsSection.appendChild(
        note
    );

}


/* =========================================================
   MODEL INFORMATION PANEL
   ========================================================= */

function addModelInformationPanel() {

    /*
       If a Model & Technology Map was already added
       to the HTML, do not create another one.
    */

    if (
        document.querySelector(
            ".model-section"
        )
    ) {

        return;

    }


    const configurationSection =
        document.querySelector(
            ".configuration-section"
        );


    if (!configurationSection) {
        return;
    }


    const modelSection =
        document.createElement(
            "section"
        );


    modelSection.className =
        "model-section";


    modelSection.style.marginBottom =
        "26px";


    modelSection.style.padding =
        "26px";


    modelSection.style.background =
        "#ffffff";


    modelSection.style.border =
        "1px solid #e5e7eb";


    modelSection.style.borderRadius =
        "14px";


    modelSection.style.boxShadow =
        "0 8px 30px rgba(15, 23, 42, 0.06)";


    modelSection.innerHTML = `

        <div class="section-title">

            <div>

                <span class="section-number">
                    04
                </span>

                <h2>
                    Model & Technology Map
                </h2>

            </div>

            <p>
                Model and technology used at each
                pipeline stage.
            </p>

        </div>


        <div class="model-map">

            <div class="model-row">

                <div>
                    <strong>
                        Data Processing
                    </strong>

                    <small>
                        Cleaning and normalization
                    </small>
                </div>

                <span>
                    Custom Python Processing
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Embedding Generation
                    </strong>

                    <small>
                        Semantic vector generation
                    </small>
                </div>

                <span>
                    ${EMBEDDING_MODEL}
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Vector Representation
                    </strong>

                    <small>
                        Embedding size
                    </small>
                </div>

                <span>
                    ${VECTOR_DIMENSION} Dimensions
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Vector Database
                    </strong>

                    <small>
                        Similarity index
                    </small>
                </div>

                <span>
                    ${VECTOR_INDEX}
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Semantic Retrieval
                    </strong>

                    <small>
                        Historical defect retrieval
                    </small>
                </div>

                <span>
                    Vector Similarity Search
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        RAG
                    </strong>

                    <small>
                        Retrieved knowledge context
                    </small>
                </div>

                <span>
                    Custom RAG Pipeline
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Triage Agent
                    </strong>

                    <small>
                        Severity, priority and component
                    </small>
                </div>

                <span>
                    Custom BugAI Agent Logic
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Log Analysis Agent
                    </strong>

                    <small>
                        Exception and failure analysis
                    </small>
                </div>

                <span>
                    Custom BugAI Agent Logic
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Root Cause Agent
                    </strong>

                    <small>
                        Root-cause hypothesis
                    </small>
                </div>

                <span>
                    RAG + Custom Agent Logic
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Duplicate Detection
                    </strong>

                    <small>
                        Semantic defect similarity
                    </small>
                </div>

                <span>
                    ${EMBEDDING_MODEL} + Similarity
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Remediation Agent
                    </strong>

                    <small>
                        Recommended fixes
                    </small>
                </div>

                <span>
                    Custom Agent Logic + RAG Evidence
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>


            <div class="model-row">

                <div>
                    <strong>
                        Agent Orchestration
                    </strong>

                    <small>
                        Coordinates diagnosis stages
                    </small>
                </div>

                <span>
                    Custom BugAI Orchestration
                </span>

                <b>
                    IMPLEMENTED
                </b>

            </div>

        </div>

    `;


    configurationSection.insertAdjacentElement(
        "afterend",
        modelSection
    );

}


/* =========================================================
   UPDATE MODEL CONFIGURATION
========================================================= */

function updateModelConfiguration() {

    setText(
        "embeddingModel",
        EMBEDDING_MODEL
    );


    setText(
        "vectorDimension",
        VECTOR_DIMENSION
    );


    /*
       The HTML configuration already contains
       the framework and FAISS labels.

       We also make sure any matching values
       are correct.
    */

    const configItems =
        document.querySelectorAll(
            ".configuration-card .config-item"
        );


    configItems.forEach(
        (item) => {

            const label =
                item.querySelector(
                    "span"
                );


            const value =
                item.querySelector(
                    "strong"
                );


            if (
                !label ||
                !value
            ) {

                return;

            }


            const labelText =
                label.textContent
                    .trim()
                    .toLowerCase();


            if (
                labelText.includes(
                    "embedding model"
                )
            ) {

                value.textContent =
                    EMBEDDING_MODEL;

            }


            if (
                labelText.includes(
                    "framework"
                )
            ) {

                value.textContent =
                    EMBEDDING_FRAMEWORK;

            }


            if (
                labelText.includes(
                    "vector dimension"
                )
            ) {

                value.textContent =
                    VECTOR_DIMENSION;

            }


            if (
                labelText.includes(
                    "vector index"
                )
            ) {

                value.textContent =
                    VECTOR_INDEX;

            }

        }
    );

}


/* =========================================================
   UPDATE RETRIEVAL CARDS
========================================================= */

function updateRetrievalCards() {

    const retrievalCards =
        document.querySelectorAll(
            ".retrieval-card"
        );


    if (
        !retrievalCards ||
        retrievalCards.length === 0
    ) {

        return;

    }


    retrievalCards.forEach(
        (card) => {

            const title =
                card.querySelector(
                    "h3"
                );


            const paragraph =
                card.querySelector(
                    "p"
                );


            if (
                !title ||
                !paragraph
            ) {

                return;

            }


            const titleText =
                title.textContent
                    .trim()
                    .toLowerCase();


            if (
                titleText ===
                "query embedding"
            ) {

                paragraph.textContent =
                    `The new bug is converted into a ${VECTOR_DIMENSION}-dimensional vector using ${EMBEDDING_MODEL}.`;

            }


            if (
                titleText ===
                "vector search"
            ) {

                paragraph.textContent =
                    `FAISS compares the query vector against the indexed historical defect vectors to retrieve semantically similar records.`;

            }


            if (
                titleText ===
                "retrieved context"
            ) {

                paragraph.textContent =
                    "Relevant historical defects are passed into the RAG context for downstream diagnosis.";

            }


            if (
                titleText ===
                "diagnosis"
            ) {

                paragraph.textContent =
                    "BugAI diagnosis agents use the retrieved evidence for triage, log analysis, root cause, duplicate detection and remediation.";

            }

        }
    );

}


/* =========================================================
   UPDATE PIPELINE STEP DESCRIPTIONS
========================================================= */

function updatePipelineSteps() {

    const steps =
        document.querySelectorAll(
            ".pipeline-step"
        );


    steps.forEach(
        (step) => {

            const stepNumber =
                Number(
                    step.dataset.step
                );


            const paragraph =
                step.querySelector(
                    "p"
                );


            if (!paragraph) {
                return;
            }


            switch (stepNumber) {

                case 4:

                    paragraph.textContent =
                        `${EMBEDDING_MODEL} converts defect documents into ${VECTOR_DIMENSION}-dimensional semantic vectors.`;

                    break;


                case 5:

                    paragraph.textContent =
                        `${VECTOR_INDEX} stores the generated vectors for efficient similarity retrieval.`;

                    break;


                case 7:

                    paragraph.textContent =
                        `Semantic similarity search uses the ${VECTOR_INDEX} index to find related historical defects.`;

                    break;


                case 9:

                    paragraph.textContent =
                        "Retrieved historical evidence is assembled into the RAG context used by the diagnosis pipeline.";

                    break;


                case 10:

                    paragraph.textContent =
                        "BugAI diagnosis agents use the retrieved evidence for root cause analysis, duplicate detection and remediation.";

                    break;

            }

        }
    );

}


/* =========================================================
   EMPTY STATE
========================================================= */

function showEmptyState() {

    setText(
        "totalRecords",
        "0"
    );


    setText(
        "vectorDimension",
        VECTOR_DIMENSION
    );


    setText(
        "faissVectors",
        "Backend"
    );


    setText(
        "indexStatus",
        VECTOR_INDEX
    );


    setText(
        "embeddingModel",
        EMBEDDING_MODEL
    );


    updateProjectCard(
        "apache",
        0,
        0
    );


    updateProjectCard(
        "eclipse",
        0,
        0
    );


    updateProjectCard(
        "mozilla",
        0,
        0
    );


    updateEmbeddingComponent();

    updateFAISSComponent();

}


/* =========================================================
   ERROR STATE
========================================================= */

function showErrorState(error) {

    console.error(
        "Knowledge Base Pipeline error:",
        error
    );


    setText(
        "totalRecords",
        "Error"
    );


    setText(
        "vectorDimension",
        VECTOR_DIMENSION
    );


    setText(
        "faissVectors",
        "Backend"
    );


    setText(
        "indexStatus",
        "Unavailable"
    );


    setText(
        "embeddingModel",
        EMBEDDING_MODEL
    );


    const indexStatus =
        getElement(
            "indexStatus"
        );


    if (indexStatus) {

        indexStatus.classList.add(
            "error-value"
        );

    }


    const pipelineStatus =
        document.querySelector(
            ".pipeline-status"
        );


    if (pipelineStatus) {

        const statusText =
            pipelineStatus.querySelector(
                "span:last-child"
            );


        if (statusText) {

            statusText.textContent =
                "Firebase Data Unavailable";

        }

    }

}


/* =========================================================
   LOAD PIPELINE DATA
========================================================= */

async function loadPipelineData() {

    try {

        const submissions =
            await loadBugSubmissions();


        const statistics =
            calculateStatistics(
                submissions
            );


        updateKnowledgeBaseStatus(
            statistics
        );


        updateModelConfiguration();

        updateEmbeddingComponent();

        updateFAISSComponent();

        updatePipelineHeader(
            statistics
        );

        updateRetrievalCards();

        updatePipelineSteps();

        addFirebaseDataNote(
            statistics
        );


        console.log(
            "BugAI Knowledge Base Pipeline:",
            statistics
        );

    }
    catch (error) {

        showErrorState(
            error
        );

    }

}


/* =========================================================
   AUTHENTICATION
========================================================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            console.warn(
                "BugAI: User is not authenticated."
            );


            showEmptyState();

            return;

        }


        console.log(
            "BugAI: Authenticated:",
            user.uid
        );


        await loadPipelineData();

    }
);


/* =========================================================
   DOM READY
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /*
           Add the model map dynamically.

           If you later place the model table
           directly inside HTML, this function
           automatically detects it and does not
           create a duplicate.
        */

        addModelInformationPanel();


        updateModelConfiguration();

        updateRetrievalCards();

        updatePipelineSteps();


        /* ---------------------------------------------
           Pipeline card hover
        --------------------------------------------- */

        const pipelineSteps =
            document.querySelectorAll(
                ".pipeline-step"
            );


        pipelineSteps.forEach(
            (step) => {

                step.addEventListener(
                    "mouseenter",
                    () => {

                        step.setAttribute(
                            "data-hover",
                            "true"
                        );

                    }
                );


                step.addEventListener(
                    "mouseleave",
                    () => {

                        step.removeAttribute(
                            "data-hover"
                        );

                    }
                );

            }
        );

    }
);