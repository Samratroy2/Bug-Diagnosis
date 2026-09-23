const workflowSteps=[
["01","Bug Intake","Capture title, project, description, stack trace and attached logs."],
["02","Triage Agent","Classify severity, priority and affected component with confidence and reasoning."],
["03","Log Analysis Agent","Extract exception type, error message, failure point and code path."],
["04","Historical RAG Retrieval","Generate the semantic query and retrieve relevant historical defect records and resolutions."],
["05","Root Cause Agent","Generate probable root-cause hypotheses with confidence and evidence from retrieved defects."],
["06","Duplicate Detection Agent","Rank historical matches and classify them as Duplicate, Related, or New / Unmatched."],
["07","Remediation Agent","Generate actionable fixes from historical resolutions and clearly labelled best-practice reasoning."],
["08","Structured Findings","Display the complete M2 + M3 diagnosis report in one structured view."]
];
document.addEventListener("DOMContentLoaded",()=>{const el=document.getElementById("workflow");el.className="workflow";el.innerHTML=workflowSteps.map(s=>`<article class="step"><div class="step-number">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p></article>`).join("");});
