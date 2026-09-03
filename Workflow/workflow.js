const workflowSteps=[
["01","Bug Intake","Capture title, project, severity, description, stack trace and logs."],
["02","Triage","Classify the defect and identify priority and initial signals."],
["03","Log Analysis","Extract meaningful errors, exceptions and failure patterns."],
["04","Diagnosis & Retrieval","Compare the defect with historical records using semantic retrieval."],
["05","Remediation","Present probable cause, similar defects and a fix recommendation."]
];
document.addEventListener("DOMContentLoaded",()=>{
 const el=document.getElementById("workflow");
 el.className="workflow";
 el.innerHTML=workflowSteps.map(s=>`<article class="step"><div class="step-number">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p></article>`).join("");
});
