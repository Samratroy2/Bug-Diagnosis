const agents=[
["AGENT 01","Triage Agent","Classifies incoming defects, severity and initial diagnostic signals."],
["AGENT 02","Log Analysis Agent","Extracts exceptions, stack-trace patterns and meaningful log evidence."],
["AGENT 03","Root Cause Agent","Combines bug context and retrieved historical evidence to infer probable causes."],
["AGENT 04","Duplicate Detection Agent","Ranks historical defects by semantic similarity to identify related or duplicate reports."],
["AGENT 05","Remediation Agent","Uses the diagnosis and historical resolutions to propose a practical fix direction."]
];
document.addEventListener("DOMContentLoaded",()=>{
 document.getElementById("agents").innerHTML=agents.map(a=>`<article class="agent-card"><div class="agent-number">${a[0]}</div><h3>${a[1]}</h3><p>${a[2]}</p></article>`).join("");
});
