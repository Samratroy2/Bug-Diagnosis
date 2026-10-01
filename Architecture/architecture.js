/* =========================================================
   BUGAI — AI SYSTEM ARCHITECTURE
   Architecture Data
   ========================================================= */


/* =========================================================
   IMPLEMENTED SYSTEM LAYERS
   ========================================================= */

const architectureLayers = [

    [
        "LAYER 01",
        "Bug Intake & Processing",
        "Collects the bug report, project information, description, "
        + "stack trace and optional diagnostic files, then prepares "
        + "the information for downstream analysis."
    ],

    [
        "LAYER 02",
        "Triage & Log Analysis",
        "The Triage Agent determines severity, priority and affected "
        + "component while the Log Analysis Agent extracts exception "
        + "type, error message, failure point and relevant diagnostic evidence."
    ],

    [
        "LAYER 03",
        "Semantic Representation",
        "Bug information is converted into semantic representations "
        + "using the all-MiniLM-L6-v2 sentence-transformer embedding model."
    ],

    [
        "LAYER 04",
        "Historical RAG Retrieval",
        "FAISS performs semantic similarity search over the historical "
        + "Mozilla, Apache and Eclipse defect knowledge base and retrieves "
        + "relevant historical evidence."
    ],

    [
        "LAYER 05",
        "Multi-Agent Diagnosis",
        "Root Cause, Duplicate Detection and Remediation agents use "
        + "the bug context, upstream findings and historical retrieval "
        + "results to produce downstream diagnosis."
    ],

    [
        "LAYER 06",
        "Structured Findings",
        "All major findings are combined into a structured diagnosis "
        + "containing triage, log analysis, root cause, duplicate "
        + "detection, evidence and remediation."
    ],

    [
        "LAYER 07",
        "Analytics & Knowledge Growth",
        "Milestone 4 extends the system with defect pattern analytics, "
        + "submitted-bug tracking and knowledge-base growth capabilities."
    ],

    [
        "LAYER 08",
        "Validation",
        "The complete pipeline is validated using varied defect types, "
        + "programming languages, stack traces, severity levels and "
        + "available diagnostic information."
    ]

];


/* =========================================================
   DIAGNOSIS AGENTS
   ========================================================= */

const agents = [

    [
        "AGENT 01",
        "Triage Agent",
        "Classifies incoming defects by severity, priority and "
        + "affected component and provides diagnostic confidence "
        + "and reasoning."
    ],

    [
        "AGENT 02",
        "Log Analysis Agent",
        "Extracts exception type, error message, failure point, "
        + "stack-trace information and relevant code-path evidence "
        + "from submitted diagnostic information."
    ],

    [
        "AGENT 03",
        "Root Cause Agent",
        "Uses the submitted bug context together with historical "
        + "RAG evidence to generate probable root-cause hypotheses "
        + "with confidence and supporting evidence."
    ],

    [
        "AGENT 04",
        "Duplicate Detection Agent",
        "Performs semantic comparison against historical defects, "
        + "ranks relevant matches and determines whether the issue "
        + "is Duplicate, Related or New / Unmatched."
    ],

    [
        "AGENT 05",
        "Remediation Agent",
        "Uses upstream diagnosis results, historical resolutions "
        + "and retrieved evidence to generate actionable fix "
        + "recommendations."
    ]

];


/* =========================================================
   RENDER SYSTEM LAYERS
   ========================================================= */

function renderArchitectureLayers() {

    const container =
        document.getElementById("architectureLayers");

    if (!container) {
        return;
    }


    container.innerHTML =
        architectureLayers.map(layer => {

            return `
                <article class="architecture-layer-card">

                    <div class="architecture-layer-number">
                        ${layer[0]}
                    </div>

                    <h3>
                        ${layer[1]}
                    </h3>

                    <p>
                        ${layer[2]}
                    </p>

                </article>
            `;

        }).join("");

}


/* =========================================================
   RENDER AGENTS
   ========================================================= */

function renderAgents() {

    const container =
        document.getElementById("agents");

    if (!container) {
        return;
    }


    container.innerHTML =
        agents.map(agent => {

            return `
                <article class="agent-card">

                    <div class="agent-number">
                        ${agent[0]}
                    </div>

                    <h3>
                        ${agent[1]}
                    </h3>

                    <p>
                        ${agent[2]}
                    </p>

                </article>
            `;

        }).join("");

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        renderArchitectureLayers();
        renderAgents();

    }
);