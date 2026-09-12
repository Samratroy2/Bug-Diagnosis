const workflowSteps=[
["01","Bug Intake","Capture title, project, description, stack trace and attached logs."],
["02","Triage Agent","Classify severity, priority and affected component with confidence and reasoning."],
["03","Log Analysis Agent","Extract exception type, error message, failure point and code path."],
["04","Multi-Agent Orchestration","Run both agents automatically and combine their outputs into a common bug context."],
["05","Diagnosis & Retrieval","Pass the structured context to historical defect retrieval, root-cause analysis and remediation."]
];
document.addEventListener("DOMContentLoaded",()=>{
 const el=document.getElementById("workflow");
 el.className="workflow";
 el.innerHTML=workflowSteps.map(s=>`<article class="step"><div class="step-number">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p></article>`).join("");
});
