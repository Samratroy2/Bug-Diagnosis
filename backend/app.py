from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pathlib import Path
import csv, json, re, os, traceback
import numpy as np

try:
    import faiss
    from sentence_transformers import SentenceTransformer
except ImportError:
    faiss = None
    SentenceTransformer = None

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "defects.csv"
STORE = ROOT / "backend" / "vector_store"
STORE.mkdir(parents=True, exist_ok=True)
INDEX_FILE = STORE / "defects.faiss"
META_FILE = STORE / "metadata.json"
MODEL_NAME = os.getenv("BUGAI_EMBEDDING_MODEL", "all-MiniLM-L6-v2")

app = Flask(__name__, static_folder=None)
CORS(app)

_model = None

def load_records():
    records = []
    with DATA.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            records.append(row)
    return records

def clean_text(text):
    text = text or ""
    text = re.sub(r"\s+", " ", text).strip()
    return text

def chunk_text(text, max_chars=500, overlap=60):
    text = clean_text(text)
    if len(text) <= max_chars:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks

def record_text(r):
    return "\n".join([
        f"Project: {r.get('project','')}",
        f"Title: {r.get('title','')}",
        f"Description: {r.get('description','')}",
        f"Stack Trace: {r.get('stack_trace','')}",
        f"Resolution: {r.get('resolution','')}",
    ])

def get_model():
    global _model
    if _model is None:
        if SentenceTransformer is None:
            raise RuntimeError("sentence-transformers is not installed.")
        _model = SentenceTransformer(MODEL_NAME)
    return _model

def build_index():
    if faiss is None:
        raise RuntimeError("faiss-cpu is not installed.")
    records = load_records()
    chunks, metadata = [], []
    for r in records:
        for i, chunk in enumerate(chunk_text(record_text(r))):
            chunks.append(chunk)
            metadata.append({
                "bug_id": r["bug_id"], "project": r["project"], "title": r["title"],
                "description": r["description"], "stack_trace": r["stack_trace"],
                "resolution": r["resolution"], "chunk_id": i, "chunk": chunk
            })
    model = get_model()
    vectors = model.encode(chunks, normalize_embeddings=True, show_progress_bar=False)
    vectors = np.asarray(vectors, dtype="float32")
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)
    faiss.write_index(index, str(INDEX_FILE))
    META_FILE.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(records), len(chunks)

def ensure_index():
    if not INDEX_FILE.exists() or not META_FILE.exists():
        return build_index()
    return len(load_records()), len(json.loads(META_FILE.read_text(encoding="utf-8")))

def search_index(query, top_k=5, project=""):
    ensure_index()
    index = faiss.read_index(str(INDEX_FILE))
    metadata = json.loads(META_FILE.read_text(encoding="utf-8"))
    q = get_model().encode([query], normalize_embeddings=True)
    scores, ids = index.search(np.asarray(q, dtype="float32"), min(max(top_k * 4, top_k), index.ntotal))
    results, seen = [], set()
    for score, idx in zip(scores[0], ids[0]):
        if idx < 0: continue
        m = metadata[int(idx)]
        if project and m["project"] != project: continue
        if m["bug_id"] in seen: continue
        seen.add(m["bug_id"])
        results.append({k:m[k] for k in ["bug_id","project","title","description","resolution"]} | {"score": float(score)})
        if len(results) >= top_k: break
    return results


# =========================================================
# MILESTONE 2 — TRIAGE AGENT
# =========================================================

SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"]
PRIORITY_LEVELS = ["P1", "P2", "P3", "P4"]

COMPONENT_KEYWORDS = {
    "Authentication / Session": [
        "login", "logout", "authentication", "auth", "session", "account"
    ],
    "Networking / HTTP": [
        "network", "http", "request", "connection", "socket", "timeout",
        "api", "endpoint", "service unavailable"
    ],
    "File / Logging": [
        "log file", "logging", "write file", "file", "permission", "access denied"
    ],
    "Editor / Document": [
        "editor", "document", "document provider", "resource"
    ],
    "Indexing / Memory": [
        "index", "indexing", "heap", "memory", "out of memory", "large project"
    ],
    "Database": [
        "database", "db", "query", "sql", "transaction"
    ],
    "UI / Frontend": [
        "page", "button", "screen", "display", "ui", "frontend", "loading state"
    ],
}

def _contains_any(text, terms):
    return any(term in text for term in terms)

def _severity_from_text(text):
    # Critical: service/application unusable, crash, security, data loss, OOM
    if _contains_any(text, [
        "security breach", "data loss", "data corruption", "production down",
        "service down", "system unavailable", "out of memory", "crash", "crashes"
    ]):
        return "Critical"
    if _contains_any(text, [
        "exception", "failure", "cannot start", "connection refused",
        "permission denied", "timeout", "terminates", "cannot connect"
    ]):
        return "High"
    if _contains_any(text, [
        "incorrect", "wrong", "degraded", "slow", "loading", "intermittent"
    ]):
        return "Medium"
    return "Low"

def _priority_from_severity(severity, text):
    if severity == "Critical":
        return "P1"
    if severity == "High":
        return "P2"
    if severity == "Medium":
        return "P3"
    return "P4"

def _component_from_text(text):
    scores = {}
    for component, terms in COMPONENT_KEYWORDS.items():
        scores[component] = sum(1 for term in terms if term in text)
    component, score = max(scores.items(), key=lambda item: item[1])
    return (component if score else "Unknown / Unclassified"), score

def triage_agent(bug):
    title = clean_text(bug.get("title", ""))
    description = clean_text(bug.get("description", ""))
    logs = clean_text(bug.get("stack_trace", ""))
    text = f"{title} {description} {logs}".lower()

    severity = _severity_from_text(text)
    priority = _priority_from_severity(severity, text)
    component, component_hits = _component_from_text(text)

    signals = []
    signal_rules = [
        ("crash", ["crash", "crashes"]),
        ("exception", ["exception", "error"]),
        ("data-loss-risk", ["data loss", "data corruption"]),
        ("security-risk", ["security", "unauthorized", "vulnerability"]),
        ("availability-impact", ["cannot start", "service down", "unavailable"]),
        ("timeout", ["timeout", "timed out"]),
        ("permission", ["permission denied", "access denied"]),
        ("memory", ["out of memory", "outofmemory", "heap"]),
    ]
    for name, terms in signal_rules:
        if _contains_any(text, terms):
            signals.append(name)

    # Deterministic confidence: stronger evidence from explicit signals,
    # technical logs and component keyword matches increases confidence.
    confidence = 0.55
    if signals:
        confidence += min(0.25, 0.05 * len(signals))
    if logs:
        confidence += 0.10
    if component_hits:
        confidence += min(0.08, 0.02 * component_hits)
    confidence = round(min(confidence, 0.98), 2)

    reasoning = (
        f"Severity {severity} was selected from impact/error signals "
        f"({', '.join(signals) if signals else 'no strong impact signal'}). "
        f"Priority {priority} follows the severity-to-priority policy. "
        f"Affected component was inferred as '{component}' from the bug "
        f"description and technical evidence."
    )

    return {
        "agent": "Triage Agent",
        "severity": severity,
        "priority": priority,
        "affected_component": component,
        "confidence": confidence,
        "signals": signals,
        "reasoning": reasoning,
        "summary": f"{severity} severity / {priority} priority / {component}."
    }


# =========================================================
# MILESTONE 2 — LOG ANALYSIS AGENT
# =========================================================

EXCEPTION_PATTERNS = [
    ("NullPointerException", r"\bNullPointerException\b"),
    ("TimeoutError", r"\bTimeout(?:Error)?\b"),
    ("ConnectionError", r"\bConnection(?:Error|Refused)?\b"),
    ("PermissionError", r"\bPermission(?:Error)?\b"),
    ("OutOfMemoryError", r"\bOutOfMemoryError\b|\bOutOfMemory\b|\bMemoryError\b"),
    ("FileNotFoundError", r"\bFileNotFoundError\b|\bNoSuchFile\b"),
    ("ValueError", r"\bValueError\b"),
    ("TypeError", r"\bTypeError\b"),
    ("IndexError", r"\bIndexError\b"),
    ("KeyError", r"\bKeyError\b"),
]

ERROR_MESSAGE_PATTERNS = [
    r"(?im)^(?:Caused by:\s*)?([A-Za-z0-9_.]+(?:Error|Exception))\s*:\s*(.+)$",
    r"(?im)^(?:ERROR|FATAL)\s*[:\-]\s*(.+)$",
]

# Java: at com.example.Class.method(File.java:123)
JAVA_FRAME_RE = re.compile(
    r"\bat\s+([\w.$]+)\.([\w$<>]+)\(([^():]+):(\d+)\)"
)
# Python: File ".../file.py", line 12, in method
PYTHON_FRAME_RE = re.compile(
    r'File\s+"([^"]+)",\s*line\s+(\d+),\s*in\s+([^\s]+)'
)

def _extract_exception(text):
    for name, pattern in EXCEPTION_PATTERNS:
        match = re.search(pattern, text, re.I)
        if match:
            return name
    return "Unknown / Not Detected"

def _extract_error_message(text, exception_type):
    for pattern in ERROR_MESSAGE_PATTERNS:
        match = re.search(pattern, text)
        if match:
            value = match.group(match.lastindex).strip()
            return value[:500]
    if exception_type != "Unknown / Not Detected":
        line = re.search(
            rf"(?im)^{re.escape(exception_type)}\s*:\s*(.+)$", text
        )
        if line:
            return line.group(1).strip()[:500]
    # Fallback to a meaningful non-empty line
    for line in text.splitlines():
        line = line.strip()
        if line and len(line) > 5:
            return line[:500]
    return ""

def _extract_failure_point(text):
    match = JAVA_FRAME_RE.search(text)
    if match:
        class_name, method, file_name, line = match.groups()
        return {
            "file": file_name,
            "class": class_name,
            "method": method,
            "line": int(line),
            "format": "java"
        }
    match = PYTHON_FRAME_RE.search(text)
    if match:
        file_name, line, method = match.groups()
        return {
            "file": file_name,
            "class": None,
            "method": method,
            "line": int(line),
            "format": "python"
        }
    return {
        "file": None,
        "class": None,
        "method": None,
        "line": None,
        "format": "unknown"
    }

def _extract_code_path(text):
    frames = []
    for class_name, method, file_name, line in JAVA_FRAME_RE.findall(text):
        frames.append({
            "class": class_name,
            "method": method,
            "file": file_name,
            "line": int(line)
        })
    for file_name, line, method in PYTHON_FRAME_RE.findall(text):
        frames.append({
            "class": None,
            "method": method,
            "file": file_name,
            "line": int(line)
        })
    return frames[:20]

def log_agent(logs):
    text = logs or ""
    exception_type = _extract_exception(text)
    error_message = _extract_error_message(text, exception_type)
    failure_point = _extract_failure_point(text)
    code_path = _extract_code_path(text)

    patterns = []
    if exception_type != "Unknown / Not Detected":
        patterns.append(exception_type)
    pattern_aliases = [
        ("Timeout", r"timeout|timed out"),
        ("Connection Refused", r"connection refused|connectionerror"),
        ("Permission Denied", r"permission denied|access denied"),
        ("Out of Memory", r"outofmemory|out of memory|memoryerror"),
        ("Null Value", r"\bnull\b|\bnone\b"),
    ]
    for name, pattern in pattern_aliases:
        if re.search(pattern, text, re.I) and name not in patterns:
            patterns.append(name)

    confidence = 0.35
    if exception_type != "Unknown / Not Detected":
        confidence += 0.30
    if error_message:
        confidence += 0.10
    if failure_point["file"] or failure_point["line"]:
        confidence += 0.15
    if code_path:
        confidence += 0.08
    confidence = round(min(confidence, 0.98), 2)

    summary = (
        f"{exception_type}; failure point "
        f"{failure_point['file'] or 'not available'}"
        f"{':' + str(failure_point['line']) if failure_point['line'] else ''}."
    )

    return {
        "agent": "Log Analysis Agent",
        "exception_type": exception_type,
        "error_message": error_message,
        "failure_point": failure_point,
        "code_path": code_path,
        "patterns": patterns,
        "confidence": confidence,
        "summary": summary
    }


# =========================================================
# MILESTONE 2 — ORCHESTRATION
# =========================================================

def orchestrate_agents(bug):
    """
    Runs both first-level agents independently and combines their
    outputs into a stable context object for Milestone 3.
    """
    triage = triage_agent(bug)
    log_analysis = log_agent(bug.get("stack_trace", ""))

    return {
        "triage": triage,
        "log_analysis": log_analysis,
        "bug_context": {
            "bug": {
                "title": bug.get("title", ""),
                "project": bug.get("project", ""),
                "description": bug.get("description", ""),
                "stack_trace": bug.get("stack_trace", ""),
            },
            "triage": triage,
            "log_analysis": log_analysis,
        }
    }


# =========================================================
# MILESTONE 2 — ROOT CAUSE / REMEDIATION
# =========================================================

def root_cause_agent(bug, similar, context=None):
    if similar:
        return f"Probable cause is related to the failure pattern seen in historical defect {similar[0]['bug_id']}: {similar[0]['title']}."
    logs = (bug.get("stack_trace","") + " " + bug.get("description","")).lower()
    if "null" in logs: return "Probable null/None value is being accessed without validation."
    if "timeout" in logs: return "Probable timeout or unavailable dependency is causing the failure."
    if "permission" in logs: return "Probable access-control or file/resource permission issue."
    return "Insufficient historical evidence for a precise root cause; inspect the failing execution path and logs."

def remediation_agent(root_cause, similar):
    if similar and similar[0].get("resolution"):
        return f"Review and adapt the historical resolution from {similar[0]['bug_id']}: {similar[0]['resolution']}"
    if "null" in root_cause.lower(): return "Add null/None validation before dereferencing the object and add a regression test."
    if "timeout" in root_cause.lower(): return "Validate dependency availability, tune timeout/retry handling and add failure-path tests."
    if "permission" in root_cause.lower(): return "Verify required permissions and handle authorization failures explicitly."
    return "Add targeted diagnostics, reproduce the defect, isolate the failing component and create a regression test."


# =========================================================
# MILESTONE 2 — VALIDATION
# =========================================================

def _label_matches(actual, expected):
    if expected is None or expected == "":
        return None
    return str(actual).strip().lower() == str(expected).strip().lower()

def validate_milestone2():
    """
    Validates seeded historical defects plus deliberately varied formats.
    Expected labels are derived from the controlled seed corpus and the
    representative test cases below, not from model self-evaluation.
    """
    cases = [
        {
            "id": "SEED-MOZ-101",
            "title": "Browser crashes when session object is missing",
            "description": "The browser crashes during login when the session object is not initialized.",
            "stack_trace": "NullPointerException: session is null",
            "expected": {
                "severity": "Critical", "priority": "P1",
                "component": "Authentication / Session",
                "exception_type": "NullPointerException"
            }
        },
        {
            "id": "SEED-MOZ-102",
            "title": "Page load timeout after network interruption",
            "description": "A page remains in loading state after a temporary network interruption and eventually reports a timeout.",
            "stack_trace": "TimeoutError: request timed out",
            "expected": {
                "severity": "High", "priority": "P2",
                "component": "Networking / HTTP",
                "exception_type": "TimeoutError"
            }
        },
        {
            "id": "SEED-APA-201",
            "title": "Connection refused while starting service",
            "description": "The application cannot connect to a configured service when the dependency is unavailable.",
            "stack_trace": "ConnectionError: connection refused",
            "expected": {
                "severity": "High", "priority": "P2",
                "component": "Networking / HTTP",
                "exception_type": "ConnectionError"
            }
        },
        {
            "id": "SEED-APA-202",
            "title": "Permission denied while writing log file",
            "description": "The service fails when it attempts to create or append to a log file without sufficient permissions.",
            "stack_trace": "PermissionError: access denied",
            "expected": {
                "severity": "High", "priority": "P2",
                "component": "File / Logging",
                "exception_type": "PermissionError"
            }
        },
        {
            "id": "SEED-ECL-301",
            "title": "Null value causes editor exception",
            "description": "The editor throws an exception when a document provider returns a null value for an optional resource.",
            "stack_trace": "NullPointerException: document provider returned null",
            "expected": {
                "severity": "High", "priority": "P2",
                "component": "Editor / Document",
                "exception_type": "NullPointerException"
            }
        },
        {
            "id": "SEED-ECL-302",
            "title": "Out of memory during large project indexing",
            "description": "Indexing a very large project consumes excessive memory and the process terminates.",
            "stack_trace": "OutOfMemoryError: Java heap space",
            "expected": {
                "severity": "Critical", "priority": "P1",
                "component": "Indexing / Memory",
                "exception_type": "OutOfMemoryError"
            }
        },
        {
            "id": "VAR-JAVA",
            "title": "Login fails with null session",
            "description": "Application crashes when session is missing.",
            "stack_trace": (
                "java.lang.NullPointerException: session is null\n"
                "    at com.example.auth.SessionManager.login(SessionManager.java:42)\n"
                "    at com.example.web.LoginController.submit(LoginController.java:88)"
            ),
            "expected": {
                "severity": "Critical", "priority": "P1",
                "component": "Authentication / Session",
                "exception_type": "NullPointerException",
                "failure_file": "SessionManager.java", "failure_line": 42
            }
        },
        {
            "id": "VAR-PYTHON",
            "title": "API request failed",
            "description": "The API request crashes after an invalid value is returned.",
            "stack_trace": (
                "Traceback (most recent call last):\n"
                '  File "/app/client.py", line 27, in request_data\n'
                "    raise ValueError('bad response')\n"
                "ValueError: bad response"
            ),
            "expected": {
                "severity": "High", "priority": "P2",
                "component": "Networking / HTTP",
                "exception_type": "ValueError",
                "failure_file": "/app/client.py", "failure_line": 27
            }
        },
        {
            "id": "VAR-MESSY",
            "title": "Service unavailable",
            "description": "service cannot start",
            "stack_trace": "2026-09-12 ERROR connection refused by dependency\nretry exhausted",
            "expected": {
                "severity": "High", "priority": "P2",
                "component": "Networking / HTTP",
                "exception_type": "Unknown / Not Detected"
            }
        },
        {
            "id": "VAR-DESCRIPTION-ONLY",
            "title": "Dashboard loads slowly",
            "description": "The dashboard is slow and remains in loading state.",
            "stack_trace": "",
            "expected": {
                "severity": "Medium", "priority": "P3",
                "component": "UI / Frontend",
                "exception_type": "Unknown / Not Detected"
            }
        },
    ]

    # Add seed records as validation cases, but keep controlled expectations.
    results = []
    triage_fields = ["severity", "priority", "affected_component"]
    log_fields = ["exception_type"]

    for case in cases:
        context = orchestrate_agents(case)
        t = context["triage"]
        l = context["log_analysis"]
        expected = case["expected"]

        checks = {
            "severity": _label_matches(t["severity"], expected.get("severity")),
            "priority": _label_matches(t["priority"], expected.get("priority")),
            "affected_component": _label_matches(t["affected_component"], expected.get("component")),
            "exception_type": _label_matches(l["exception_type"], expected.get("exception_type")),
        }
        if "failure_file" in expected:
            checks["failure_file"] = _label_matches(
                l["failure_point"].get("file"), expected["failure_file"]
            )
            checks["failure_line"] = (
                l["failure_point"].get("line") == expected["failure_line"]
            )

        results.append({
            "id": case["id"],
            "checks": checks,
            "triage": t,
            "log_analysis": l
        })

    def accuracy(field, rows):
        values = [r["checks"].get(field) for r in rows if r["checks"].get(field) is not None]
        return round(sum(values) / len(values) * 100, 2) if values else 0

    return {
        "ok": True,
        "test_cases": len(results),
        "metrics": {
            "triage_severity_accuracy": accuracy("severity", results),
            "triage_priority_accuracy": accuracy("priority", results),
            "triage_component_accuracy": accuracy("affected_component", results),
            "log_exception_accuracy": accuracy("exception_type", results),
            "log_failure_file_accuracy": accuracy("failure_file", results),
            "log_failure_line_accuracy": accuracy("failure_line", results),
        },
        "results": results
    }

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "embedding_model": MODEL_NAME, "faiss_available": faiss is not None})

@app.get("/api/knowledge-base/stats")
def stats():
    records = load_records()
    by_project = {"Mozilla":0,"Apache":0,"Eclipse":0}
    for r in records:
        if r["project"] in by_project: by_project[r["project"]] += 1
    indexed = 0
    if META_FILE.exists():
        try:
            indexed = len({m["bug_id"] for m in json.loads(META_FILE.read_text(encoding="utf-8"))})
        except Exception: pass
    return jsonify({"total_records":len(records), "by_project":by_project, "indexed_records":indexed})

@app.get("/api/knowledge-base/records")
def records():
    return jsonify({"records": load_records()})

@app.post("/api/knowledge-base/index")
def index_route():
    try:
        records_count, chunks_count = build_index()
        return jsonify({"ok":True,"indexed_records":records_count,"total_chunks":chunks_count,"embedding_model":MODEL_NAME})
    except Exception as e:
        return jsonify({"ok":False,"error":str(e)}), 500

@app.get("/api/search")
def search_route():
    q = request.args.get("q","").strip()
    if not q: return jsonify({"ok":False,"error":"Query is required."}), 400
    try:
        results = search_index(q, int(request.args.get("top_k",5)), request.args.get("project",""))
        return jsonify({"ok":True,"results":results})
    except Exception as e:
        return jsonify({"ok":False,"error":str(e)}), 500

@app.post("/api/analyze")
def analyze():
    try:
        bug = request.get_json(force=True) or {}
        if not bug.get("title") or not bug.get("description"):
            return jsonify({
                "ok": False,
                "error": "Bug title and description are required."
            }), 400

        # M2.3: both agents run automatically and their structured outputs
        # are collected before downstream retrieval/diagnosis.
        orchestration = orchestrate_agents(bug)
        triage = orchestration["triage"]
        logs = orchestration["log_analysis"]

        query = (
            f"{bug['title']}. {bug['description']}. "
            f"{bug.get('stack_trace','')}. "
            f"Component: {triage['affected_component']}. "
            f"Exception: {logs['exception_type']}"
        )

        similar = search_index(
            query,
            5,
            bug.get("project","") if bug.get("project") != "Custom Project" else ""
        )
        root = root_cause_agent(bug, similar, orchestration["bug_context"])
        remediation = remediation_agent(root, similar)

        return jsonify({
            "ok": True,
            "orchestration": {
                "status": "completed",
                "agents": ["Triage Agent", "Log Analysis Agent"],
                "context_ready_for_milestone_3": True,
                "error_handling": {
                    "missing_logs": not bool(bug.get("stack_trace", "").strip()),
                    "invalid_input": False,
                    "agent_failures": []
                }
            },
            "bug_context": orchestration["bug_context"],
            "triage": triage,
            "log_analysis": logs,
            "root_cause": root,
            "similar_defects": similar,
            "remediation": remediation
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "ok": False,
            "error": str(e),
            "orchestration": {
                "status": "failed",
                "context_ready_for_milestone_3": False
            }
        }), 500

@app.get("/api/validation/milestone2")
def milestone2_validation():
    try:
        return jsonify(validate_milestone2())
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500

@app.get("/")
def root():
    return send_from_directory(str(ROOT), "Dashboard/dashboard.html")

@app.get("/<path:path>")
def static_files(path):
    target = ROOT / path
    if target.is_file():
        return send_from_directory(str(ROOT), path)
    return "Not found", 404

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
