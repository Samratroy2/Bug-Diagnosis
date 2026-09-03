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

def triage_agent(bug):
    severity = bug.get("severity", "Medium")
    text = f"{bug.get('title','')} {bug.get('description','')}".lower()
    signals = []
    for word in ["crash", "exception", "failure", "data loss", "security"]:
        if word in text: signals.append(word)
    return {"severity": severity, "signals": signals, "summary": f"Classified as {severity} severity with {len(signals)} diagnostic signal(s)."}

def log_agent(logs):
    text = logs or ""
    patterns = []
    for name, pattern in [
        ("NullPointerException", r"nullpointerexception|noneType|cannot read properties"),
        ("Timeout", r"timeout|timed out"),
        ("Connection Error", r"connection refused|connectionerror|socket"),
        ("Permission Error", r"permission denied|access denied"),
        ("Out of Memory", r"outofmemory|out of memory|memoryerror"),
    ]:
        if re.search(pattern, text, re.I): patterns.append(name)
    return {"patterns": patterns, "summary": f"Detected {len(patterns)} known log/error pattern(s)."}

def root_cause_agent(bug, similar):
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
        bug = request.get_json(force=True)
        if not bug.get("title") or not bug.get("description"):
            return jsonify({"error":"Bug title and description are required."}), 400
        triage = triage_agent(bug)
        logs = log_agent(bug.get("stack_trace",""))
        query = f"{bug['title']}. {bug['description']}. {bug.get('stack_trace','')}"
        similar = search_index(query, 5, bug.get("project","") if bug.get("project") != "Custom Project" else "")
        root = root_cause_agent(bug, similar)
        remediation = remediation_agent(root, similar)
        return jsonify({
            "ok":True, "triage":triage, "log_analysis":logs,
            "root_cause":root, "similar_defects":similar, "remediation":remediation
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok":False,"error":str(e)}), 500

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
