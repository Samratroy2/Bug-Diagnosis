from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pathlib import Path

import csv
import json
import re
import os
import traceback
import math
import sys
import gc
import hashlib
import sqlite3
import threading
import time
from datetime import datetime, timezone

import numpy as np


# ============================================================
# CSV FIELD SIZE FIX
# ============================================================
# Public bug datasets can contain very large descriptions,
# comments, logs, patches, etc.

try:
    csv.field_size_limit(sys.maxsize)
except OverflowError:
    limit = sys.maxsize

    while True:
        try:
            csv.field_size_limit(limit)
            break
        except OverflowError:
            limit //= 10


# ============================================================
# FAISS / SENTENCE TRANSFORMERS
# ============================================================

try:
    import faiss
    from sentence_transformers import SentenceTransformer
except ImportError:
    faiss = None
    SentenceTransformer = None


# ============================================================
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

DATA = ROOT / "data" / "defects.csv"

# ============================================================
# COMPLETED FULL FAISS INDEX
# ============================================================
# The production/full index was built separately and contains
# 1,311,079 vectors in data/defects.faiss.
#
# Do NOT point the application back to backend/vector_store/.
# That directory may contain an old partial index.
#
INDEX_FILE = ROOT / "data" / "defects.faiss"
META_FILE = ROOT / "data" / "defects_metadata.json"

# Temporary paths used only if manual rebuilding is explicitly enabled.
TEMP_INDEX_FILE = ROOT / "data" / "defects_building.faiss"
TEMP_META_FILE = ROOT / "data" / "defects_metadata_building.json"

# Safety switch: rebuilding 1.31M embeddings from the Flask endpoint
# is disabled by default. The completed index should be reused.
ALLOW_INDEX_BUILD = os.getenv(
    "BUGAI_ALLOW_INDEX_BUILD",
    "0"
).lower() in ("1", "true", "yes")


# ============================================================
# MODEL CONFIGURATION
# ============================================================

MODEL_NAME = os.getenv(
    "BUGAI_EMBEDDING_MODEL",
    "all-MiniLM-L6-v2"
)

# Number of chunks loaded into memory at one time.
EMBED_BATCH_SIZE = 256

# Internal sentence-transformers batch size.
MODEL_BATCH_SIZE = 32


# ============================================================
# FLASK
# ============================================================

app = Flask(
    __name__,
    static_folder=None
)

CORS(app)

_model = None

# ============================================================
# MILESTONE 4 STORAGE
# ============================================================

SUBMITTED_BUGS_FILE = ROOT / "data" / "submitted_bugs.jsonl"
KB_GROWTH_LOG = ROOT / "data" / "kb_growth.jsonl"
ANALYTICS_DB = ROOT / "data" / "analytics.db"
_M4_WRITE_LOCK = threading.Lock()
_M4_ANALYTICS_LOCK = threading.Lock()
_M4_ANALYTICS_BUILDING = False
_M4_ANALYTICS_READY = False
_M4_ANALYTICS_ERROR = ""


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def safe_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "approved", "confirmed"}


def normalized_fingerprint(record):
    parts = [
        clean_text(record.get("title", "")),
        clean_text(record.get("description", "")),
        clean_text(record.get("stack_trace", "") or record.get("error_info", "")),
        clean_text(record.get("resolution", "")),
    ]
    raw = "|".join(parts).lower()
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()


def append_jsonl(path, item):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")


def load_jsonl(path):
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line=line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def save_submitted_analysis(bug, triage, log_analysis, root_cause, duplicate_detection, remediation):
    item = {
        "bug_id": clean_text(bug.get("bug_id")) or f"SUB-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
        "title": clean_text(bug.get("title")),
        "description": clean_text(bug.get("description")),
        "stack_trace": clean_text(bug.get("stack_trace")),
        "project": clean_text(bug.get("project")) or "Custom Project",
        "timestamp": utc_now(),
        "source": "submitted",
        "severity": triage.get("severity", ""),
        "priority": triage.get("priority", ""),
        "affected_component": triage.get("affected_component", ""),
        "exception_type": log_analysis.get("exception_type", ""),
        "failure_point": log_analysis.get("failure_point", ""),
        "error_message": log_analysis.get("error_message", ""),
        "root_cause": root_cause.get("root_cause", root_cause.get("hypothesis", "")),
        "root_cause_status": root_cause.get("status", ""),
        "duplicate_status": duplicate_detection.get("status", ""),
        "resolution": remediation.get("recommended_fix", remediation.get("resolution", "")),
        "confirmed_fix": False,
        "fingerprint": normalized_fingerprint(bug),
    }
    with _M4_WRITE_LOCK:
        append_jsonl(SUBMITTED_BUGS_FILE, item)
    invalidate_analytics_db()
    return item


def extract_error_message(stack_trace):
    text = clean_text(stack_trace)
    if not text:
        return ""
    lines = [x.strip() for x in re.split(r"[\n\r]+", text) if x.strip()]
    return lines[-1][:500] if lines else ""


def _analytics_db_connect():
    ANALYTICS_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(ANALYTICS_DB), timeout=60)
    conn.row_factory = sqlite3.Row
    return conn


def _analytics_db_ready():
    if not ANALYTICS_DB.exists():
        return False
    try:
        conn = _analytics_db_connect()
        row = conn.execute("SELECT value FROM meta WHERE key='ready'").fetchone()
        ready = bool(row and row["value"] == "1")
        conn.close()
        return ready
    except Exception:
        return False


def _analytics_source_encoding():
    with DATA.open("rb") as f:
        head = f.read(4)
    if head.startswith(b"\xff\xfe") or head.startswith(b"\xfe\xff"):
        return "utf-16"
    if head.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig"
    return "utf-8"


def _analytics_row(row, source="historical"):
    stack = clean_text(row.get("stack_trace", ""))
    exception = clean_text(row.get("exception_type", "")) or extract_exception_type(stack)
    error_message = clean_text(row.get("error_message", "")) or extract_error_message(stack) or clean_text(row.get("title", ""))
    return (
        clean_text(row.get("bug_id", "")),
        canonical_record_project(row),
        clean_text(row.get("severity", "")),
        clean_text(row.get("priority", "")),
        clean_text(row.get("affected_component", row.get("component", ""))),
        exception or "Unknown / Not Detected",
        error_message,
        clean_text(row.get("root_cause", "")),
        clean_text(row.get("duplicate_status", "")),
        clean_text(row.get("timestamp", "")),
        source,
    )


def _create_analytics_db():
    global _M4_ANALYTICS_BUILDING, _M4_ANALYTICS_READY, _M4_ANALYTICS_ERROR
    temp_db = ANALYTICS_DB.with_suffix(".building.db")
    try:
        if temp_db.exists():
            temp_db.unlink()
        conn = sqlite3.connect(str(temp_db), timeout=60)
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        conn.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute("""CREATE TABLE defects (
            bug_id TEXT, project TEXT, severity TEXT, priority TEXT, component TEXT,
            exception_type TEXT, error_message TEXT, root_cause TEXT, duplicate_status TEXT,
            timestamp TEXT, source TEXT
        )""")
        insert_sql = "INSERT INTO defects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        batch = []
        with DATA.open("r", encoding=_analytics_source_encoding(), newline="", errors="replace") as f:
            for row in csv.DictReader(f):
                batch.append(_analytics_row(row, "historical"))
                if len(batch) >= 10000:
                    conn.executemany(insert_sql, batch)
                    conn.commit()
                    batch.clear()
        if batch:
            conn.executemany(insert_sql, batch)
            conn.commit()
            batch.clear()

        if SUBMITTED_BUGS_FILE.exists():
            with SUBMITTED_BUGS_FILE.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    batch.append(_analytics_row(row, clean_text(row.get("source")) or "submitted"))
                    if len(batch) >= 10000:
                        conn.executemany(insert_sql, batch)
                        conn.commit()
                        batch.clear()
            if batch:
                conn.executemany(insert_sql, batch)
                conn.commit()

        for column in ("project", "severity", "priority", "component", "exception_type", "source", "timestamp"):
            conn.execute(f"CREATE INDEX idx_defects_{column} ON defects({column})")

        total = conn.execute("SELECT COUNT(*) FROM defects").fetchone()[0]
        conn.execute("INSERT INTO meta VALUES('ready','1')")
        conn.execute("INSERT INTO meta VALUES('total',?)", (str(total),))
        conn.commit()
        conn.close()
        temp_db.replace(ANALYTICS_DB)

        with _M4_ANALYTICS_LOCK:
            _M4_ANALYTICS_READY = True
            _M4_ANALYTICS_BUILDING = False
            _M4_ANALYTICS_ERROR = ""
        print(f"[M4 Analytics] Ready: {total:,} records", flush=True)
    except Exception as e:
        try:
            if temp_db.exists():
                temp_db.unlink()
        except Exception:
            pass
        with _M4_ANALYTICS_LOCK:
            _M4_ANALYTICS_READY = False
            _M4_ANALYTICS_BUILDING = False
            _M4_ANALYTICS_ERROR = str(e)
        traceback.print_exc()


def ensure_analytics_db():
    global _M4_ANALYTICS_BUILDING, _M4_ANALYTICS_READY
    if _analytics_db_ready():
        _M4_ANALYTICS_READY = True
        return True
    with _M4_ANALYTICS_LOCK:
        if not _M4_ANALYTICS_BUILDING:
            _M4_ANALYTICS_BUILDING = True
            threading.Thread(target=_create_analytics_db, name="bugai-m4-analytics-builder", daemon=True).start()
    return False


def invalidate_analytics_db():
    """Mark the analytics DB stale and rebuild it in the background."""
    global _M4_ANALYTICS_READY, _M4_ANALYTICS_BUILDING
    try:
        if ANALYTICS_DB.exists():
            conn = _analytics_db_connect()
            conn.execute("UPDATE meta SET value='0' WHERE key='ready'")
            conn.commit()
            conn.close()
    except Exception:
        pass
    with _M4_ANALYTICS_LOCK:
        _M4_ANALYTICS_READY = False
    ensure_analytics_db()



def analytics_status_payload():
    ready = _analytics_db_ready()
    with _M4_ANALYTICS_LOCK:
        building = _M4_ANALYTICS_BUILDING
        error = _M4_ANALYTICS_ERROR
    total = 0
    if ready:
        try:
            conn = _analytics_db_connect()
            row = conn.execute("SELECT value FROM meta WHERE key='total'").fetchone()
            total = int(row["value"]) if row else 0
            conn.close()
        except Exception:
            pass
    return {"ok": True, "ready": ready, "building": building and not ready, "error": error, "total_records": total}


def _analytics_where(args):
    clauses = []
    values = []
    for key, col in (("project", "project"), ("severity", "severity"), ("priority", "priority"), ("source", "source")):
        value = clean_text(args.get(key, ""))
        if value:
            clauses.append(f"{col} = ?")
            values.append(canonical_project(value) if key == "project" else value)
    for key, col in (("component", "component"), ("exception_type", "exception_type")):
        value = clean_text(args.get(key, ""))
        if value:
            clauses.append(f"LOWER({col}) = LOWER(?)")
            values.append(value)
    start = clean_text(args.get("start_date", ""))
    end = clean_text(args.get("end_date", ""))
    if start:
        clauses.append("substr(timestamp,1,10) >= ?")
        values.append(start)
    if end:
        clauses.append("substr(timestamp,1,10) <= ?")
        values.append(end)
    return ((" WHERE " + " AND ".join(clauses)) if clauses else ""), values


def _counter_sql(conn, field, where, values, limit=None):
    sql = f"SELECT COALESCE(NULLIF(TRIM({field}),''),'Unknown / Not Detected') AS value, COUNT(*) AS count FROM defects {where} GROUP BY {field} ORDER BY count DESC"
    if limit:
        sql += f" LIMIT {int(limit)}"
    return [{"value": r["value"], "count": int(r["count"])} for r in conn.execute(sql, values)]


def analytics_from_db(args):
    conn = _analytics_db_connect()
    where, values = _analytics_where(args)
    total = conn.execute(f"SELECT COUNT(*) FROM defects{where}", values).fetchone()[0]
    stats = {
        "by_project": _counter_sql(conn, "project", where, values),
        "by_severity": _counter_sql(conn, "severity", where, values),
        "by_priority": _counter_sql(conn, "priority", where, values),
        "by_component": _counter_sql(conn, "component", where, values),
        "by_exception": _counter_sql(conn, "exception_type", where, values),
        "by_root_cause": _counter_sql(conn, "root_cause", where, values),
        "by_duplicate_status": _counter_sql(conn, "duplicate_status", where, values),
        "by_source": _counter_sql(conn, "source", where, values),
    }
    errors = _counter_sql(conn, "error_message", where, values, 20)
    time_where = (where + " AND timestamp <> ''") if where else " WHERE timestamp <> ''"
    times = [{"date": r["date"], "count": int(r["count"])} for r in conn.execute(
        f"SELECT substr(timestamp,1,10) AS date, COUNT(*) AS count FROM defects{time_where} GROUP BY substr(timestamp,1,10) ORDER BY date", values
    )]
    conn.close()
    return {"ok": True, "ready": True, "model": "milestone-4-analytics-sqlite", "total_records": int(total), "filters": {k: args.get(k, "") for k in ("project", "severity", "priority", "component", "exception_type", "source", "start_date", "end_date")}, "statistics": stats, "top_recurring_errors": errors, "time_series": times}


@app.get("/api/analytics/status")
def milestone4_analytics_status():
    ensure_analytics_db()
    return jsonify(analytics_status_payload())


@app.get("/api/analytics")
def milestone4_analytics():
    try:
        if not ensure_analytics_db():
            return jsonify({"ok": True, "ready": False, "building": True, "message": "Analytics index is being prepared in the background."})
        return jsonify(analytics_from_db(request.args))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/analytics/filters")
def milestone4_analytics_filters():
    try:
        ready = _analytics_db_ready()
        payload = {
            "ok": True,
            "ready": ready,
            "projects": ["Apache", "Eclipse", "Mozilla", "Custom Project"],
            "severities": ["Critical", "High", "Medium", "Low"],
            "priorities": ["P1", "P2", "P3", "P4"],
            "components": [],
            "exception_types": [],
            "sources": ["historical", "submitted", "resolved-confirmed"],
        }
        if ready:
            conn = _analytics_db_connect()
            payload["components"] = [r["value"] for r in conn.execute("SELECT component AS value FROM defects WHERE TRIM(component)<>'' GROUP BY component ORDER BY COUNT(*) DESC LIMIT 100")]
            payload["exception_types"] = [r["value"] for r in conn.execute("SELECT exception_type AS value FROM defects WHERE TRIM(exception_type)<>'' GROUP BY exception_type ORDER BY COUNT(*) DESC LIMIT 100")]
            conn.close()
        else:
            ensure_analytics_db()
        return jsonify(payload)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


def validate_growth_record(bug):
    required = {
        "bug_id": clean_text(bug.get("bug_id")),
        "title": clean_text(bug.get("title")),
        "description": clean_text(bug.get("description")),
        "affected_component": clean_text(bug.get("affected_component") or bug.get("component")),
        "stack_trace": clean_text(bug.get("stack_trace") or bug.get("error_info") or bug.get("error_message")),
        "root_cause": clean_text(bug.get("root_cause")),
        "resolution": clean_text(bug.get("resolution")),
        "project": clean_text(bug.get("project")) or "Custom Project",
        "severity": clean_text(bug.get("severity")) or "",
        "priority": clean_text(bug.get("priority")) or "",
    }
    missing = [k for k in ["bug_id", "title", "description", "affected_component", "stack_trace", "root_cause", "resolution"] if not required[k]]
    if missing:
        return None, f"Missing required fields: {', '.join(missing)}"
    if not safe_bool(bug.get("confirmed_fix")):
        return None, "confirmed_fix must be true."
    if not safe_bool(bug.get("approved")):
        return None, "approved must be true before indexing."
    return required, None


@app.post("/api/knowledge-base/growth")
def knowledge_base_growth():
    """Validate and incrementally index one confirmed resolved defect."""
    try:
        payload = request.get_json(force=True) or {}
        record, error = validate_growth_record(payload)
        if error:
            return jsonify({"ok": False, "status": "rejected", "error": error}), 400

        with _M4_WRITE_LOCK:
            existing = load_records()
            existing_ids = {clean_text(r.get("bug_id")) for r in existing}
            growth_rows = load_jsonl(KB_GROWTH_LOG)
            existing_ids.update(clean_text(r.get("bug_id")) for r in growth_rows)

            if record["bug_id"] in existing_ids:
                return jsonify({"ok": False, "status": "duplicate", "error": "bug_id already exists."}), 409

            fp = normalized_fingerprint(record)
            existing_fingerprints = {normalized_fingerprint(r) for r in existing if r.get("description")}
            existing_fingerprints.update(clean_text(r.get("fingerprint")) for r in growth_rows)
            if fp in existing_fingerprints:
                return jsonify({"ok": False, "status": "duplicate", "error": "Equivalent defect already exists."}), 409

            record["source_file"] = "data/resolved_bugs.csv"
            record["split"] = "resolved"
            record["source"] = "resolved-confirmed"
            record["timestamp"] = utc_now()
            record["confirmed_fix"] = True
            record["fingerprint"] = fp

            # Write the normalized CSV record first; this is the durable KB record.
            DATA.parent.mkdir(parents=True, exist_ok=True)
            with DATA.open("a", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "bug_id", "project", "title", "description", "stack_trace",
                    "resolution", "severity", "priority", "affected_component",
                    "source_file", "split"
                ])
                writer.writerow({k: record.get(k, "") for k in [
                    "bug_id", "project", "title", "description", "stack_trace",
                    "resolution", "severity", "priority", "affected_component",
                    "source_file", "split"
                ]})

            # Incremental embedding uses exactly the production model/config.
            model = get_model()
            text = "\n".join([
                f"Project: {record['project']}",
                f"Bug ID: {record['bug_id']}",
                f"Title: {record['title']}",
                f"Description: {record['description']}",
                f"Stack Trace: {record['stack_trace']}",
                f"Resolution: {record['resolution']}",
                f"Severity: {record['severity']}",
                f"Priority: {record['priority']}",
                f"Component: {record['affected_component']}",
                f"Root Cause: {record['root_cause']}",
            ])[:12000]
            vector = model.encode([text], normalize_embeddings=True, show_progress_bar=False, convert_to_numpy=True)
            vector = np.asarray(vector, dtype="float32")

            ensure_index()
            index = faiss.read_index(str(INDEX_FILE))
            metadata = json.loads(META_FILE.read_text(encoding="utf-8"))
            index.add(vector)
            metadata.append({
                "bug_id": record["bug_id"],
                "project": record["project"],
                "title": record["title"],
                "description": record["description"],
                "stack_trace": record["stack_trace"],
                "resolution": record["resolution"],
                "severity": record["severity"],
                "priority": record["priority"],
                "affected_component": record["affected_component"],
                "root_cause": record["root_cause"],
                "confirmed_fix": True,
                "source": "resolved-confirmed",
                "timestamp": record["timestamp"],
                "chunk_id": 0,
                "chunk": text,
            })

            temp_index = INDEX_FILE.with_suffix(".growth.tmp.faiss")
            temp_meta = META_FILE.with_suffix(".growth.tmp.json")
            faiss.write_index(index, str(temp_index))
            temp_meta.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            temp_index.replace(INDEX_FILE)
            temp_meta.replace(META_FILE)
            append_jsonl(KB_GROWTH_LOG, record)
            load_records(force_reload=True)
            invalidate_analytics_db()

        return jsonify({
            "ok": True,
            "status": "indexed",
            "bug_id": record["bug_id"],
            "source": "resolved-confirmed",
            "confirmed_fix": True,
            "index_vectors": get_index_vector_count(),
            "embedding_model": MODEL_NAME,
            "message": "Resolved bug validated, stored, embedded, and added to the active FAISS index."
        }), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "status": "failed", "error": str(e)}), 500


@app.get("/api/knowledge-base/growth")
def knowledge_base_growth_status():
    try:
        rows = load_jsonl(KB_GROWTH_LOG)
        return jsonify({
            "ok": True,
            "growth_records": len(rows),
            "confirmed_records": sum(1 for r in rows if safe_bool(r.get("confirmed_fix"))),
            "last_added": rows[-1] if rows else None,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================================
# MILESTONE 4 - END-TO-END VALIDATION
# ============================================================

@app.get("/api/validation/milestone4")
def milestone4_validation():
    """Run five distinct pipeline cases covering common bug formats."""
    cases = [
        {"id":"M4-JAVA-DB", "title":"Database connection refused", "description":"Dashboard cannot connect to PostgreSQL.", "stack_trace":"java.sql.SQLException: Connection refused\\n at com.example.db.DatabaseConnection.connect(DatabaseConnection.java:32)", "project":"Custom Project"},
        {"id":"M4-PYTHON-KEY", "title":"Missing user key", "description":"API fails when a request has no user object.", "stack_trace":"Traceback (most recent call last):\\n File \"api.py\", line 81, in get_user\\n KeyError: 'user'", "project":"Custom Project"},
        {"id":"M4-JS-TIMEOUT", "title":"Remote service timeout", "description":"Frontend request to payment service times out.", "stack_trace":"AxiosError: timeout of 5000ms exceeded\\n at processTicksAndRejections (node:internal/process/task_queues:96:5)", "project":"Custom Project"},
        {"id":"M4-CPP-SEGFAULT", "title":"Renderer crash", "description":"Renderer crashes while resizing a custom widget.", "stack_trace":"Segmentation fault at Renderer::resize(Renderer.cpp:214)", "project":"Custom Project"},
        {"id":"M4-SPARSE", "title":"Settings page broken", "description":"Settings page does not load correctly.", "stack_trace":"", "project":"Custom Project"},
    ]
    rows = []
    started = time.time() if "time" in globals() else None
    for case in cases:
        t0 = time.time() if "time" in globals() else 0
        try:
            with app.test_client() as client:
                response = client.post("/api/analyze", json=case)
                payload = response.get_json(silent=True) or {}
            if not response.is_json or not payload.get("ok"):
                raise RuntimeError(payload.get("error", f"HTTP {response.status_code}"))
            triage = payload.get("triage", {})
            log = payload.get("log_analysis", {})
            root = payload.get("root_cause", {})
            dup = payload.get("duplicate_detection", {})
            rem = payload.get("remediation", {})
            retrieved = payload.get("retrieval", {}).get("records", [])
            rows.append({
                "id": case["id"], "pass": True,
                "stages": {
                    "submission": True, "triage": bool(triage), "log_analysis": bool(log),
                    "rag": len(retrieved) > 0, "root_cause": bool(root),
                    "duplicate_detection": bool(dup), "remediation": bool(rem),
                    "structured_findings": bool(payload.get("orchestration", {}).get("status") == "completed")
                },
                "triage": triage, "log_analysis": log,
                "root_cause": root, "duplicate_detection": dup,
                "remediation": rem, "retrieval_count": len(retrieved),
                "processing_ms": round((time.time()-t0)*1000, 2),
            })
        except Exception as e:
            rows.append({"id": case["id"], "pass": False, "error": str(e), "processing_ms": round((time.time()-t0)*1000,2)})
    passed = sum(1 for r in rows if r["pass"])
    return jsonify({
        "ok": True,
        "test_cases": len(rows), "passed": passed,
        "failed": len(rows)-passed,
        "pipeline_completion_rate": round(passed/len(rows)*100,2) if rows else 0,
        "results": rows,
        "coverage": ["Java", "Python", "JavaScript/Node", "C++", "sparse/no-stack-trace"]
    })


# ============================================================
# DATASET PROJECT DIAGNOSTICS
# ============================================================

@app.get(
    "/api/knowledge-base/project-diagnostics"
)
def project_diagnostics():
    """
    Show how records are being classified without modifying the CSV.
    Useful when source/project labels differ across imported datasets.
    """

    try:
        records = load_records()

        raw_projects = {}
        canonical_counts = {
            "Mozilla": 0,
            "Apache": 0,
            "Eclipse": 0,
            "Unknown": 0,
        }

        source_counts = {}

        for record in records:
            raw = clean_text(record.get("project", "")) or "<empty>"
            raw_projects[raw] = raw_projects.get(raw, 0) + 1

            source = clean_text(record.get("source_file", "")) or "<empty>"
            source_root = source.replace("\\", "/").split("/")
            source_group = source_root[1] if len(source_root) > 1 else source_root[0]
            source_counts[source_group] = source_counts.get(source_group, 0) + 1

            project = canonical_record_project(record)
            canonical_counts[project] = canonical_counts.get(project, 0) + 1

        return jsonify({
            "ok": True,
            "total_records": len(records),
            "canonical_counts": canonical_counts,
            "top_raw_project_values": sorted(
                raw_projects.items(),
                key=lambda item: item[1],
                reverse=True
            )[:50],
            "top_source_paths": sorted(
                source_counts.items(),
                key=lambda item: item[1],
                reverse=True
            )[:50]
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================================
# DATASET SUMMARY
# ============================================================

@app.get(
    "/api/datasets/summary"
)
def dataset_summary():

    records = load_records()

    by_project = {
        "Mozilla": 0,
        "Apache": 0,
        "Eclipse": 0
    }

    for record in records:

        project = canonical_project(
            record.get(
                "project",
                ""
            )
        )

        if project in by_project:
            by_project[project] += 1

    return jsonify({

        "ok":
            True,

        "manifest": {

            "files": [
                "data/defects.csv"
            ],

            "total_normalized_rows":
                len(records),

            "by_project":
                by_project
        },

        "validation_rows_with_labels":
            3
    })


# ============================================================
# FRONTEND
# ============================================================

@app.get("/")
def root():

    return send_from_directory(
        str(ROOT),
        "Dashboard/dashboard.html"
    )


@app.get(
    "/<path:path>"
)
def static_files(path):

    target = ROOT / path

    if target.is_file():

        return send_from_directory(
            str(ROOT),
            path
        )

    return "Not found", 404


# ============================================================
# START FLASK
# ============================================================

if __name__ == "__main__":

    print("\n" + "=" * 75, flush=True)
    print("BUGAI SERVER", flush=True)
    print("=" * 75, flush=True)
    print(f"Dataset       : {DATA}", flush=True)
    print(f"FAISS index   : {INDEX_FILE}", flush=True)
    print(f"FAISS metadata: {META_FILE}", flush=True)
    print(f"Index exists  : {INDEX_FILE.exists()}", flush=True)
    print(f"Metadata exists: {META_FILE.exists()}", flush=True)
    print(f"Build enabled : {ALLOW_INDEX_BUILD}", flush=True)
    print("=" * 75 + "\n", flush=True)

    app.run(

        host="127.0.0.1",

        port=5000,

        # IMPORTANT:
        # Long-running vector indexing should not use
        # Flask's debug reloader.
        debug=False,

        use_reloader=False
    )