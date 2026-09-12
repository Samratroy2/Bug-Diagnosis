const API_BASE_URL="http://127.0.0.1:5000";
const metrics=document.getElementById("metrics");
const results=document.getElementById("results");
const status=document.getElementById("status");
const runBtn=document.getElementById("runBtn");

function pct(value){return `${Number(value||0).toFixed(2)}%`;}

async function runValidation(){
    runBtn.disabled=true;
    runBtn.textContent="Running...";
    status.textContent="Executing seeded and varied test cases...";
    try{
        const response=await fetch(`${API_BASE_URL}/api/validation/milestone2`);
        const data=await response.json();
        if(!response.ok || !data.ok) throw new Error(data.error||"Validation failed.");
        const m=data.metrics||{};
        const items=[
            ["triage_severity_accuracy","Triage Severity"],
            ["triage_priority_accuracy","Triage Priority"],
            ["triage_component_accuracy","Triage Component"],
            ["log_exception_accuracy","Exception Type"],
            ["log_failure_file_accuracy","Failure File"],
            ["log_failure_line_accuracy","Failure Line"]
        ];
        metrics.innerHTML=items.map(([key,label])=>`<div class="metric"><strong>${pct(m[key])}</strong><span>${label}</span></div>`).join("");
        results.innerHTML=(data.results||[]).map(row=>{
            const checks=row.checks||{};
            const pass=Object.values(checks).every(v=>v===true);
            return `<tr>
                <td>${escapeHTML(row.id)}</td>
                <td>${mark(checks.severity)}</td>
                <td>${mark(checks.priority)}</td>
                <td>${mark(checks.affected_component)}</td>
                <td>${mark(checks.exception_type)}</td>
                <td class="${pass?"pass":"fail"}">${pass?"PASS":"REVIEW"}</td>
            </tr>`;
        }).join("");
        status.textContent=`${data.test_cases} test cases completed. Review any marked REVIEW cases before final submission.`;
    }catch(error){
        status.textContent=error.message;
        results.innerHTML=`<tr><td colspan="6" class="fail">${escapeHTML(error.message)}</td></tr>`;
    }finally{
        runBtn.disabled=false;
        runBtn.textContent="Run Validation";
    }
}
function mark(value){
    if(value===undefined) return "—";
    return value ? '<span class="pass">✓</span>' : '<span class="fail">✗</span>';
}
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
runBtn.addEventListener("click",runValidation);
runValidation();
