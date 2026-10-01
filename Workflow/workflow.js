const workflowSteps = [
    [
        "01",
        "Bug Submission",
        "Capture bug ID, title, project, description, severity, stack trace, error details and optional log or bug files."
    ],

    [
        "02",
        "Bug Processing & Validation",
        "Validate the submitted input, prepare the bug context, read uploaded content and normalize the information for downstream analysis."
    ],

    [
        "03",
        "Triage Agent",
        "Classify severity, priority and affected component with confidence and reasoning."
    ],

    [
        "04",
        "Log Analysis Agent",
        "Extract exception type, error message, failure point, stack information and relevant code-path details from the submitted logs or stack trace."
    ],

    [
        "05",
        "Historical RAG Retrieval",
        "Generate a semantic retrieval query, create embeddings and retrieve relevant historical Apache, Eclipse and Mozilla defects from the FAISS knowledge base."
    ],

    [
        "06",
        "Root Cause Agent",
        "Generate probable root-cause hypotheses with confidence and supporting evidence using the retrieved historical defect context."
    ],

    [
        "07",
        "Duplicate Detection Agent",
        "Compare the submitted bug with historical defects, rank semantic matches and classify the issue as Duplicate, Related or New / Unmatched."
    ],

    [
        "08",
        "Remediation Agent",
        "Generate actionable fix recommendations using historical resolutions, retrieved evidence and findings from the upstream agents."
    ],

    [
        "09",
        "Structured Findings",
        "Combine triage, log analysis, root cause, duplicate detection, retrieved evidence and remediation into a single diagnosis report."
    ],

    [
        "10",
        "Defect Pattern Analytics",
        "Analyze submitted and historical defects by severity, component, exception, source, error, root cause, duplicate status and time-based patterns."
    ],

    [
        "11",
        "Knowledge Base Growth",
        "Add approved resolved bugs with confirmed fixes to the historical knowledge base through the implemented incremental FAISS update workflow."
    ],

    [
        "12",
        "Validation & End-to-End Testing",
        "Validate the complete pipeline across different languages, exception formats, stack traces, severity levels and available technical information."
    ]
];

document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("workflow");

    if (!el) {
        console.error("BugAI: Workflow container not found.");
        return;
    }

    el.className = "workflow";

    el.innerHTML = workflowSteps
        .map(step => `
            <article class="step">
                <div class="step-number">${step[0]}</div>
                <h3>${step[1]}</h3>
                <p>${step[2]}</p>
            </article>
        `)
        .join("");
});