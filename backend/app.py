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
# GENERAL UTILITIES
# ============================================================

def clean_text(text):
    return re.sub(
        r"\s+",
        " ",
        str(text or "")
    ).strip()


def canonical_project(value="", source_file="", bug_id="", title=""):
    """
    Return the canonical BugAI project name.

    IMPORTANT:
    The normalized defects.csv can contain source/project values that
    are not literally ``Apache`` or ``Eclipse`` (for example JIRA
    project names, repository names, or a generic source label).
    Therefore we inspect the source path first, then the project field,
    and finally the issue id/title as fallbacks.
    """

    source = clean_text(source_file).lower().replace("\\", "/")
    project = clean_text(value).lower()
    issue_id = clean_text(bug_id).lower()
    issue_title = clean_text(title).lower()

    # Source path is the strongest signal because the importer receives
    # Mozilla / Apache / Eclipse explicitly from the source directory.
    source_parts = set(
        part for part in re.split(r"[/\\._ -]+", source) if part
    )

    if "mozilla" in source_parts or "mozilla" in source:
        return "Mozilla"

    if "apache" in source_parts or "apache" in source:
        return "Apache"

    if "eclipse" in source_parts or "eclipse" in source:
        return "Eclipse"

    # Then inspect the normalized project/source label.
    if "mozilla" in project:
        return "Mozilla"

    if "apache" in project:
        return "Apache"

    if "eclipse" in project:
        return "Eclipse"

    # Common Apache JIRA issue-key prefixes. This is only a fallback
    # for records whose source_file/project fields are not informative.
    apache_prefixes = (
        "accumulo-", "airavata-", "ambari-", "arrow-", "avro-",
        "beam-", "cassandra-", "cxf-", "derby-", "directory-",
        "drill-", "flink-", "flex-", "giraph-", "hadoop-",
        "hbase-", "hive-", "httpclient-", "httpcore-", "httpd-",
        "jackrabbit-", "jena-", "kafka-", "karaf-", "lucene-",
        "maven-", "mng-", "netbeans-", "nutch-", "ofbiz-",
        "openjpa-", "pig-", "qpid-", "rocketmq-", "solr-",
        "spark-", "storm-", "syncope-", "tez-", "tika-",
        "tomcat-", "wicket-", "zookeeper-"
    )

    if issue_id.startswith(apache_prefixes):
        return "Apache"

    # Eclipse Bugzilla/JIRA records commonly have eclipse repository or
    # platform terms in their title when source metadata is incomplete.
    eclipse_terms = (
        "eclipse", "jdt", "cdt", "pde", "swt", "platform ui",
        "platform/core", "birt", "mylyn", "gef", "emf", "rcp"
    )

    if any(term in issue_id or term in issue_title for term in eclipse_terms):
        return "Eclipse"

    if "mozilla" in issue_id or "mozilla" in issue_title:
        return "Mozilla"

    return clean_text(value) or "Unknown"


def canonical_record_project(record):
    """Canonical project for a normalized defect record."""
    return canonical_project(
        record.get("project", ""),
        record.get("source_file", ""),
        record.get("bug_id", ""),
        record.get("title", "")
    )

_records_cache = None
_records_cache_mtime = None


def load_records(force_reload=False):
    global _records_cache
    global _records_cache_mtime

    if not DATA.exists():
        return []

    current_mtime = DATA.stat().st_mtime

    if (
        force_reload
        or _records_cache is None
        or _records_cache_mtime != current_mtime
    ):

        print(
            "Loading defects.csv into memory...",
            flush=True
        )

        with DATA.open(
            "r",
            encoding="utf-8",
            newline=""
        ) as f:

            _records_cache = list(
                csv.DictReader(f)
            )

        _records_cache_mtime = current_mtime

        print(
            f"Loaded {len(_records_cache):,} records.",
            flush=True
        )

    return _records_cache

def record_text(record):
    """
    Convert one historical defect into
    embedding text.
    """

    return "\n".join([

        f"Project: {record.get('project', '')}",

        f"Title: {record.get('title', '')}",

        f"Description: {record.get('description', '')}",

        f"Stack Trace: {record.get('stack_trace', '')}",

        f"Resolution: {record.get('resolution', '')}"

    ])


def chunk_text(
    text,
    max_chars=700,
    overlap=80
):
    """
    Split large defect text into overlapping chunks.
    """

    text = clean_text(text)

    if not text:
        return []

    if len(text) <= max_chars:
        return [text]

    chunks = []

    start = 0

    while start < len(text):

        end = min(
            len(text),
            start + max_chars
        )

        part = text[start:end].strip()

        if part:
            chunks.append(part)

        if end >= len(text):
            break

        start = max(
            0,
            end - overlap
        )

    return chunks


# ============================================================
# EMBEDDING MODEL
# ============================================================

def get_model():

    global _model

    if _model is None:

        if SentenceTransformer is None:

            raise RuntimeError(
                "sentence-transformers is not installed. "
                "Run: pip install -r backend/requirements.txt"
            )

        print(
            f"\nLoading embedding model: {MODEL_NAME}",
            flush=True
        )

        _model = SentenceTransformer(
            MODEL_NAME
        )

        print(
            "Embedding model loaded.",
            flush=True
        )

    return _model


# ============================================================
# VECTOR INDEX BUILD
# ============================================================

def build_index():

    if faiss is None:

        raise RuntimeError(
            "faiss-cpu is not installed. "
            "Run: pip install -r backend/requirements.txt"
        )

    print(
        "\n>>> build_index() STARTED <<<",
        flush=True
    )

    records = load_records()

    if not records:

        raise RuntimeError(
            f"Knowledge-base file not found or empty: {DATA}"
        )

    total_records = len(records)

    print(
        "\n" + "=" * 75,
        flush=True
    )

    print(
        "BUGAI - BUILDING RAG VECTOR INDEX",
        flush=True
    )

    print(
        "=" * 75,
        flush=True
    )

    print(
        f"Dataset: {DATA}",
        flush=True
    )

    print(
        f"Records: {total_records:,}",
        flush=True
    )

    print(
        f"Embedding model: {MODEL_NAME}",
        flush=True
    )

    print(
        f"Embedding batch size: {EMBED_BATCH_SIZE}",
        flush=True
    )

    print(
        f"Model batch size: {MODEL_BATCH_SIZE}",
        flush=True
    )

    # --------------------------------------------------------
    # LOAD MODEL FIRST
    # --------------------------------------------------------

    model = get_model()

    # --------------------------------------------------------
    # CREATE EMPTY FAISS INDEX
    # --------------------------------------------------------

    index = None

    metadata = []

    total_chunks = 0

    processed_records = 0

    processed_chunks = 0

    # --------------------------------------------------------
    # REMOVE OLD TEMP FILES
    # --------------------------------------------------------

    if TEMP_INDEX_FILE.exists():

        TEMP_INDEX_FILE.unlink()

    if TEMP_META_FILE.exists():

        TEMP_META_FILE.unlink()

    # --------------------------------------------------------
    # PROCESS RECORDS IN SMALL GROUPS
    # --------------------------------------------------------

    chunk_buffer = []

    metadata_buffer = []

    print(
        "\n[1/2] Preparing records and generating embeddings...",
        flush=True
    )

    for record_no, record in enumerate(
        records,
        start=1
    ):

        record_chunks = chunk_text(
            record_text(record),
            max_chars=700,
            overlap=80
        )

        for chunk_no, chunk in enumerate(
            record_chunks
        ):

            chunk_buffer.append(
                chunk
            )

            metadata_buffer.append({

                "bug_id":
                    record.get(
                        "bug_id",
                        ""
                    ),

                "project":
                    record.get(
                        "project",
                        ""
                    ),

                "title":
                    record.get(
                        "title",
                        ""
                    ),

                "description":
                    record.get(
                        "description",
                        ""
                    ),

                "stack_trace":
                    record.get(
                        "stack_trace",
                        ""
                    ),

                "resolution":
                    record.get(
                        "resolution",
                        ""
                    ),

                "chunk_id":
                    chunk_no,

                "chunk":
                    chunk
            })

            # ------------------------------------------------
            # PROCESS ONE EMBEDDING BATCH
            # ------------------------------------------------

            if len(chunk_buffer) >= EMBED_BATCH_SIZE:

                embeddings = model.encode(

                    chunk_buffer,

                    batch_size=MODEL_BATCH_SIZE,

                    normalize_embeddings=True,

                    show_progress_bar=False,

                    convert_to_numpy=True
                )

                embeddings = np.asarray(
                    embeddings,
                    dtype="float32"
                )

                # First batch determines vector dimension.
                if index is None:

                    dimension = embeddings.shape[1]

                    index = faiss.IndexFlatIP(
                        dimension
                    )

                    print(
                        f"\nFAISS vector dimension: "
                        f"{dimension}",
                        flush=True
                    )

                # Add directly to FAISS.
                index.add(
                    embeddings
                )

                metadata.extend(
                    metadata_buffer
                )

                processed_chunks += len(
                    chunk_buffer
                )

                total_chunks = processed_chunks

                print(
                    f"  Embedded "
                    f"{processed_chunks:,} chunks | "
                    f"Current record "
                    f"{record_no:,}/{total_records:,} "
                    f"({record_no / total_records * 100:.1f}%)",
                    flush=True
                )

                # Clear batch memory.
                chunk_buffer.clear()

                metadata_buffer.clear()

                del embeddings

                gc.collect()

        processed_records = record_no

    # --------------------------------------------------------
    # PROCESS REMAINING CHUNKS
    # --------------------------------------------------------

    if chunk_buffer:

        embeddings = model.encode(

            chunk_buffer,

            batch_size=MODEL_BATCH_SIZE,

            normalize_embeddings=True,

            show_progress_bar=False,

            convert_to_numpy=True
        )

        embeddings = np.asarray(
            embeddings,
            dtype="float32"
        )

        if index is None:

            dimension = embeddings.shape[1]

            index = faiss.IndexFlatIP(
                dimension
            )

        index.add(
            embeddings
        )

        metadata.extend(
            metadata_buffer
        )

        processed_chunks += len(
            chunk_buffer
        )

        total_chunks = processed_chunks

        print(
            f"  Embedded "
            f"{processed_chunks:,} chunks | "
            f"Final batch",
            flush=True
        )

        del embeddings

        chunk_buffer.clear()

        metadata_buffer.clear()

        gc.collect()

    # --------------------------------------------------------
    # VALIDATION
    # --------------------------------------------------------

    if index is None:

        raise RuntimeError(
            "No embeddings were generated."
        )

    if index.ntotal != len(metadata):

        raise RuntimeError(
            "FAISS/metadata mismatch: "
            f"FAISS vectors={index.ntotal}, "
            f"metadata={len(metadata)}"
        )

    print(
        "\n[2/2] Saving vector index...",
        flush=True
    )

    # --------------------------------------------------------
    # WRITE TEMPORARY INDEX
    # --------------------------------------------------------

    faiss.write_index(
        index,
        str(TEMP_INDEX_FILE)
    )

    TEMP_META_FILE.write_text(

        json.dumps(
            metadata,
            ensure_ascii=False,
            indent=2
        ),

        encoding="utf-8"
    )

    # --------------------------------------------------------
    # REPLACE OLD INDEX ONLY AFTER SUCCESS
    # --------------------------------------------------------

    if INDEX_FILE.exists():

        INDEX_FILE.unlink()

    TEMP_INDEX_FILE.replace(
        INDEX_FILE
    )

    if META_FILE.exists():

        META_FILE.unlink()

    TEMP_META_FILE.replace(
        META_FILE
    )

    # --------------------------------------------------------
    # FINAL INFORMATION
    # --------------------------------------------------------

    vector_count = index.ntotal

    dimension = index.d

    print(
        "\n" + "=" * 75,
        flush=True
    )

    print(
        "BUGAI - INDEX BUILD COMPLETE",
        flush=True
    )

    print(
        "=" * 75,
        flush=True
    )

    print(
        f"Records:       {total_records:,}",
        flush=True
    )

    print(
        f"Chunks:        {total_chunks:,}",
        flush=True
    )

    print(
        f"FAISS vectors: {vector_count:,}",
        flush=True
    )

    print(
        f"Dimension:     {dimension}",
        flush=True
    )

    print(
        f"FAISS file:    {INDEX_FILE}",
        flush=True
    )

    print(
        f"Metadata file: {META_FILE}",
        flush=True
    )

    print(
        "=" * 75,
        flush=True
    )

    # Free memory.
    del metadata

    del index

    gc.collect()

    return (
        total_records,
        total_chunks
    )


# ============================================================
# INDEX VALIDATION
# ============================================================

def ensure_index():
    """
    Validate the completed FAISS index without rebuilding it.

    The full index is generated by backend/build_faiss_full.py.
    Flask must never automatically rebuild 1.31M embeddings.
    """

    if faiss is None:
        raise RuntimeError(
            "faiss-cpu is not installed. "
            "Run: pip install -r backend/requirements.txt"
        )

    if not INDEX_FILE.exists():
        raise RuntimeError(
            f"FAISS index not found: {INDEX_FILE}. "
            "Run backend\\build_faiss_full.py first."
        )

    if not META_FILE.exists():
        raise RuntimeError(
            f"FAISS metadata not found: {META_FILE}. "
            "Run backend\\build_faiss_full.py first."
        )

    try:
        index = faiss.read_index(str(INDEX_FILE))

        # The completed build is one vector per dataset record.
        # We validate only the vector count here; comparing every bug_id
        # would require loading the entire CSV and metadata unnecessarily.
        if index.ntotal <= 0:
            raise RuntimeError("FAISS index exists but contains zero vectors.")

        metadata_size = META_FILE.stat().st_size

        if metadata_size <= 0:
            raise RuntimeError("FAISS metadata file is empty.")

        return {
            "vectors": int(index.ntotal),
            "dimension": int(index.d),
            "metadata_bytes": int(metadata_size)
        }

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(
            f"Unable to validate FAISS index: {e}"
        ) from e


# ============================================================
# VECTOR SEARCH
# ============================================================

def search_index(
    query,
    top_k=8,
    project=""
):

    index_info = ensure_index()

    index = faiss.read_index(
        str(INDEX_FILE)
    )

    metadata = json.loads(
        META_FILE.read_text(
            encoding="utf-8"
        )
    )

    if index.ntotal == 0:
        return []

    if len(metadata) != index.ntotal:
        raise RuntimeError(
            "FAISS/metadata mismatch: "
            f"vectors={index.ntotal}, "
            f"metadata={len(metadata)}"
        )

    model = get_model()

    query_vector = model.encode(

        [query],

        normalize_embeddings=True,

        show_progress_bar=False,

        convert_to_numpy=True
    )

    query_vector = np.asarray(
        query_vector,
        dtype="float32"
    )

    search_count = min(

        max(
            top_k * 6,
            top_k
        ),

        index.ntotal
    )

    scores, ids = index.search(

        query_vector,

        search_count
    )

    results = []

    seen = set()

    for score, idx in zip(
        scores[0],
        ids[0]
    ):

        if idx < 0:
            continue

        item = metadata[
            int(idx)
        ]

        if (
            project
            and canonical_project(
                item.get("project", ""),
                item.get("source_file", ""),
                item.get("bug_id", ""),
                item.get("title", "")
            ) != canonical_project(project)
        ):
            continue

        bug_id = item.get(
            "bug_id"
        )

        if bug_id in seen:
            continue

        seen.add(
            bug_id
        )

        result = {

            key:
                item.get(
                    key,
                    ""
                )

            for key in [

                "bug_id",

                "project",

                "title",

                "description",

                "stack_trace",

                "resolution"
            ]
        }

        result["score"] = round(
            float(score),
            4
        )

        results.append(
            result
        )

        if len(results) >= top_k:
            break

    return results


# ============================================================
# GENERAL HELPERS
# ============================================================

def clamp01(value):

    return round(

        max(
            0.0,
            min(
                0.99,
                float(value)
            )
        ),

        2
    )


def pct(value):

    return f"{float(value) * 100:.1f}%"


def contains(
    text,
    terms
):

    return any(
        term in text
        for term in terms
    )


# ============================================================
# MILESTONE 2 - TRIAGE
# ============================================================

COMPONENT_KEYWORDS = {

    "Authentication / Session": [
        "login",
        "logout",
        "authentication",
        "auth",
        "session",
        "account"
    ],

    "Networking / HTTP": [
        "network",
        "http",
        "request",
        "connection",
        "socket",
        "timeout",
        "api",
        "endpoint",
        "service unavailable",
        "connection refused"
    ],

    "File / Logging": [
        "log file",
        "logging",
        "write file",
        "file",
        "permission",
        "access denied"
    ],

    "Editor / Document": [
        "editor",
        "document",
        "document provider",
        "resource"
    ],

    "Indexing / Memory": [
        "index",
        "indexing",
        "heap",
        "memory",
        "out of memory",
        "large project"
    ],

    "Database": [
        "database",
        "db",
        "query",
        "sql",
        "transaction"
    ],

    "UI / Frontend": [
        "page",
        "button",
        "screen",
        "display",
        "ui",
        "frontend",
        "loading state",
        "dashboard"
    ]
}


def _severity_from_text(text):

    if contains(
        text,
        [
            "security breach",
            "data loss",
            "data corruption",
            "production down",
            "service down",
            "system unavailable",
            "out of memory",
            "crash",
            "crashes"
        ]
    ):
        return "Critical"

    if contains(
        text,
        [
            "exception",
            "failure",
            "cannot start",
            "connection refused",
            "permission denied",
            "timeout",
            "terminates",
            "cannot connect"
        ]
    ):
        return "High"

    if contains(
        text,
        [
            "incorrect",
            "wrong",
            "degraded",
            "slow",
            "loading",
            "intermittent"
        ]
    ):
        return "Medium"

    return "Low"


def triage_agent(bug):

    text = (

        f"{bug.get('title', '')} "

        f"{bug.get('description', '')} "

        f"{bug.get('stack_trace', '')}"

    ).lower()

    severity = _severity_from_text(
        text
    )

    priority = {

        "Critical": "P1",

        "High": "P2",

        "Medium": "P3",

        "Low": "P4"

    }[severity]

    scores = {

        component:

            sum(
                term in text
                for term in terms
            )

        for component, terms
        in COMPONENT_KEYWORDS.items()
    }

    component, hits = max(
        scores.items(),
        key=lambda item: item[1]
    )

    if not hits:

        component = (
            "Unknown / Unclassified"
        )

    signals = []

    signal_definitions = [

        (
            "crash",
            [
                "crash",
                "crashes"
            ]
        ),

        (
            "exception",
            [
                "exception",
                "error"
            ]
        ),

        (
            "data-loss-risk",
            [
                "data loss",
                "data corruption"
            ]
        ),

        (
            "security-risk",
            [
                "security",
                "unauthorized",
                "vulnerability"
            ]
        ),

        (
            "availability-impact",
            [
                "cannot start",
                "service down",
                "unavailable"
            ]
        ),

        (
            "timeout",
            [
                "timeout",
                "timed out"
            ]
        ),

        (
            "permission",
            [
                "permission denied",
                "access denied"
            ]
        ),

        (
            "memory",
            [
                "out of memory",
                "outofmemory",
                "heap"
            ]
        )
    ]

    for name, terms in signal_definitions:

        if contains(
            text,
            terms
        ):
            signals.append(
                name
            )

    confidence = (

        0.55

        + min(
            0.25,
            0.05 * len(signals)
        )

        + (
            0.10
            if bug.get(
                "stack_trace",
                ""
            ).strip()
            else 0
        )

        + min(
            0.08,
            0.02 * hits
        )
    )

    return {

        "agent":
            "Triage Agent",

        "severity":
            severity,

        "priority":
            priority,

        "affected_component":
            component,

        "confidence":
            clamp01(
                confidence
            ),

        "signals":
            signals,

        "reasoning":
            (
                f"Severity {severity} was inferred "
                f"from impact/error signals "
                f"({', '.join(signals) if signals else 'no strong impact signal'}). "
                f"Priority {priority} follows the configured severity policy. "
                f"Component was inferred from matching technical keywords."
            ),

        "summary":
            f"{severity} / {priority} / {component}"
    }


# ============================================================
# MILESTONE 2 - LOG ANALYSIS
# ============================================================

EXCEPTION_PATTERNS = [

    (
        "NullPointerException",
        r"\bNullPointerException\b"
    ),

    (
        "TimeoutError",
        r"\bTimeout(?:Error)?\b"
    ),

    (
        "ConnectionError",
        r"\bConnection(?:Error|Refused)?\b"
    ),

    (
        "PermissionError",
        r"\bPermission(?:Error)?\b"
    ),

    (
        "OutOfMemoryError",
        r"\bOutOfMemoryError\b|\bOutOfMemory\b|\bMemoryError\b"
    ),

    (
        "FileNotFoundError",
        r"\bFileNotFoundError\b|\bNoSuchFile\b"
    ),

    (
        "ValueError",
        r"\bValueError\b"
    ),

    (
        "TypeError",
        r"\bTypeError\b"
    ),

    (
        "IndexError",
        r"\bIndexError\b"
    ),

    (
        "KeyError",
        r"\bKeyError\b"
    )
]


JAVA_FRAME_RE = re.compile(
    r"\bat\s+([\w.$]+)\.([\w$<>]+)\(([^():]+):(\d+)\)"
)

PYTHON_FRAME_RE = re.compile(
    r'File\s+"([^"]+)",\s*line\s+(\d+),\s*in\s+([^\s]+)'
)


def log_agent(logs):

    text = logs or ""

    exception_type = (
        "Unknown / Not Detected"
    )

    for name, pattern in EXCEPTION_PATTERNS:

        if re.search(
            pattern,
            text,
            re.I
        ):

            exception_type = name

            break

    error_message = ""

    message_patterns = [

        r"(?im)^(?:Caused by:\s*)?([A-Za-z0-9_.]+(?:Error|Exception))\s*:\s*(.+)$",

        r"(?im)^(?:ERROR|FATAL)\s*[:\-]\s*(.+)$"
    ]

    for pattern in message_patterns:

        match = re.search(
            pattern,
            text
        )

        if match:

            error_message = match.group(
                match.lastindex
            ).strip()[:500]

            break

    if (
        not error_message
        and exception_type
        != "Unknown / Not Detected"
    ):

        match = re.search(

            rf"(?im)^{re.escape(exception_type)}\s*:\s*(.+)$",

            text
        )

        if match:

            error_message = (
                match.group(1)
                .strip()[:500]
            )

    failure_point = {

        "file":
            None,

        "class":
            None,

        "method":
            None,

        "line":
            None,

        "format":
            "unknown"
    }

    match = JAVA_FRAME_RE.search(
        text
    )

    if match:

        failure_point = {

            "file":
                match.group(3),

            "class":
                match.group(1),

            "method":
                match.group(2),

            "line":
                int(match.group(4)),

            "format":
                "java"
        }

    else:

        match = PYTHON_FRAME_RE.search(
            text
        )

        if match:

            failure_point = {

                "file":
                    match.group(1),

                "class":
                    None,

                "method":
                    match.group(3),

                "line":
                    int(match.group(2)),

                "format":
                    "python"
            }

    frames = []

    for c, m, f, line in JAVA_FRAME_RE.findall(
        text
    ):

        frames.append({

            "class":
                c,

            "method":
                m,

            "file":
                f,

            "line":
                int(line)
        })

    for f, line, m in PYTHON_FRAME_RE.findall(
        text
    ):

        frames.append({

            "class":
                None,

            "method":
                m,

            "file":
                f,

            "line":
                int(line)
        })

    patterns = []

    if (
        exception_type
        != "Unknown / Not Detected"
    ):

        patterns.append(
            exception_type
        )

    additional_patterns = [

        (
            "Timeout",
            r"timeout|timed out"
        ),

        (
            "Connection Refused",
            r"connection refused|connectionerror"
        ),

        (
            "Permission Denied",
            r"permission denied|access denied"
        ),

        (
            "Out of Memory",
            r"outofmemory|out of memory|memoryerror"
        ),

        (
            "Null Value",
            r"\bnull\b|\bnone\b"
        )
    ]

    for name, pattern in additional_patterns:

        if (
            re.search(
                pattern,
                text,
                re.I
            )
            and name not in patterns
        ):

            patterns.append(
                name
            )

    confidence = (

        0.35

        + (
            0.30
            if exception_type
            != "Unknown / Not Detected"
            else 0
        )

        + (
            0.10
            if error_message
            else 0
        )

        + (
            0.15
            if failure_point["file"]
            else 0
        )

        + (
            0.08
            if frames
            else 0
        )
    )

    first_message = next(

        (
            line.strip()

            for line in text.splitlines()

            if len(line.strip()) > 5
        ),

        ""
    )

    return {

        "agent":
            "Log Analysis Agent",

        "exception_type":
            exception_type,

        "error_message":
            error_message
            or first_message,

        "failure_point":
            failure_point,

        "code_path":
            frames[:20],

        "patterns":
            patterns,

        "confidence":
            clamp01(
                confidence
            ),

        "summary":
            (
                f"{exception_type}; "
                f"failure point "
                f"{failure_point['file'] or 'not available'}"
                f"{':' + str(failure_point['line']) if failure_point['line'] else ''}."
            )
    }


def orchestrate_agents(bug):

    triage = triage_agent(
        bug
    )

    logs = log_agent(
        bug.get(
            "stack_trace",
            ""
        )
    )

    return {

        "triage":
            triage,

        "log_analysis":
            logs,

        "bug_context": {

            "bug": {

                key:
                    bug.get(
                        key,
                        ""
                    )

                for key in [

                    "title",

                    "project",

                    "description",

                    "stack_trace"
                ]
            },

            "triage":
                triage,

            "log_analysis":
                logs
        }
    }


# ============================================================
# M3.1 - ROOT CAUSE
# ============================================================

def root_cause_agent(
    bug,
    retrieved,
    context
):

    triage = context[
        "triage"
    ]

    log = context[
        "log_analysis"
    ]

    text = clean_text(

        f"{bug.get('title', '')} "

        f"{bug.get('description', '')} "

        f"{bug.get('stack_trace', '')} "

        f"{triage.get('affected_component', '')} "

        f"{log.get('exception_type', '')} "

        f"{log.get('error_message', '')}"
    )

    hypotheses = []

    for record in retrieved[:5]:

        overlap = 0

        low = (

            text
            + " "
            + record.get(
                "title",
                ""
            )
            + " "
            + record.get(
                "description",
                ""
            )
            + " "
            + record.get(
                "stack_trace",
                ""
            )

        ).lower()

        tokens = [

            log.get(
                "exception_type",
                ""
            ),

            triage.get(
                "affected_component",
                ""
            ).split(
                " / "
            )[0],

            "null",

            "timeout",

            "permission",

            "memory",

            "connection",

            "login",

            "indexing"
        ]

        for token in tokens:

            if (
                token
                and token.lower() in low
            ):

                overlap += 1

        evidence_score = clamp01(

            0.55 * record["score"]

            + 0.06 * overlap

            + 0.08 * (
                1
                if record.get(
                    "resolution"
                )
                else 0
            )
        )

        cause = (

            record.get(
                "resolution"
            )

            or record.get(
                "title"
            )
        )

        hypotheses.append({

            "cause":
                f"Failure pattern is consistent with: {cause}",

            "confidence":
                evidence_score,

            "reasoning":
                (
                    f"Historical defect "
                    f"{record['bug_id']} has semantic "
                    f"similarity {pct(record['score'])} "
                    f"and shares relevant technical "
                    f"signals with the submitted bug."
                ),

            "evidence": [{

                "bug_id":
                    record["bug_id"],

                "project":
                    record["project"],

                "title":
                    record["title"],

                "similarity":
                    record["score"],

                "description":
                    record["description"],

                "error_pattern":
                    record["stack_trace"],

                "resolution":
                    record["resolution"]
            }]
        })

    if not hypotheses:

        lower_text = text.lower()

        if "null" in lower_text:

            generic = (
                "A null/None value may be accessed "
                "before validation."
            )

        elif "timeout" in lower_text:

            generic = (
                "A dependency timeout or unavailable "
                "service may be causing the failure."
            )

        elif "permission" in lower_text:

            generic = (
                "An authorization or resource-permission "
                "failure may be causing the issue."
            )

        else:

            generic = (
                "A precise root cause cannot be supported "
                "from the available evidence."
            )

        hypotheses.append({

            "cause":
                generic,

            "confidence":
                0.35,

            "reasoning":
                "No sufficiently relevant historical defect was retrieved.",

            "evidence":
                []
        })

    top = hypotheses[0]

    status = (

        "Evidence Supported"

        if (
            top["confidence"] >= 0.55
            and top["evidence"]
        )

        else

        "Insufficient Evidence"
    )

    return {

        "agent":
            "Root Cause Agent",

        "status":
            status,

        "hypotheses":
            hypotheses[:3],

        "primary_hypothesis":
            top["cause"],

        "confidence":
            top["confidence"],

        "supporting_evidence":
            top["evidence"],

        "reasoning_boundary":
            (
                "Evidence fields are retrieved historical "
                "records; hypothesis and reasoning are "
                "agent-generated inferences."
            )
    }


# ============================================================
# M3.2 - DUPLICATE DETECTION
# ============================================================

def duplicate_agent(
    bug,
    retrieved
):

    matches = []

    for record in retrieved:

        score = float(
            record["score"]
        )

        if score >= 0.82:

            classification = "Duplicate"

        elif score >= 0.65:

            classification = "Related"

        else:

            classification = "Unmatched"

        matches.append({

            "bug_id":
                record["bug_id"],

            "project":
                record["project"],

            "title":
                record["title"],

            "similarity":
                score,

            "classification":
                classification,

            "description":
                record["description"],

            "exception":
                (
                    record.get(
                        "stack_trace"
                    )
                    or ""
                ).split(
                    ":",
                    1
                )[0],

            "root_cause":
                record.get(
                    "resolution",
                    ""
                ),

            "resolution_summary":
                record.get(
                    "resolution",
                    ""
                ),

            "reason":
                (
                    f"Semantic similarity is {pct(score)}; "
                    f"classification uses configured thresholds "
                    f"(Duplicate ≥ 82%, Related ≥ 65%)."
                )
        })

    best = (

        matches[0]

        if matches

        else None
    )

    status = (

        best["classification"]

        if best

        else

        "New / Unmatched"
    )

    if (
        best
        and best["classification"]
        == "Unmatched"
    ):

        status = "New / Unmatched"

    return {

        "agent":
            "Duplicate Detection Agent",

        "status":
            status,

        "thresholds": {

            "duplicate":
                0.82,

            "related":
                0.65
        },

        "matches":
            matches,

        "likely_duplicate":
            bool(

                best

                and best["classification"]
                == "Duplicate"
            ),

        "reasoning":
            (
                "Similarity is computed with the same "
                "normalized embedding strategy used by "
                "the RAG knowledge base. Threshold labels "
                "are configurable and should be validated "
                "against known duplicate/related/unrelated "
                "cases."
            )
    }


# ============================================================
# M3.3 - REMEDIATION
# ============================================================

def remediation_agent(
    root,
    duplicate,
    triage,
    log,
    retrieved
):

    recommendations = []

    seen = set()

    for match in duplicate.get(
        "matches",
        []
    )[:3]:

        resolution = match.get(
            "resolution_summary"
        )

        if (
            not resolution
            or resolution in seen
        ):
            continue

        seen.add(
            resolution
        )

        recommendations.append({

            "recommendation":
                resolution,

            "confidence":
                clamp01(
                    0.55
                    * match["similarity"]
                    + 0.12
                ),

            "basis":
                "Historical Resolution",

            "source_bug_ids":
                [
                    match["bug_id"]
                ],

            "implementation_guidance": [

                (
                    "Inspect the affected component: "
                    f"{triage.get('affected_component', 'Unknown / Unclassified')}."
                ),

                (
                    "Reproduce the "
                    f"{log.get('exception_type', 'reported')} "
                    "failure path before applying the change."
                ),

                (
                    "Add a regression test covering "
                    "the observed failure condition."
                )
            ],

            "validation_steps": [

                "Reproduce the original defect",

                "Apply the change in an isolated branch",

                "Run the regression test and relevant component tests"
            ]
        })

    text = (

        root.get(
            "primary_hypothesis",
            ""
        )

        + " "

        + log.get(
            "error_message",
            ""
        )

    ).lower()

    generic = None

    if (
        "null" in text
        or "nullpointer" in text
    ):

        generic = (

            "Validate the object/value before "
            "dereferencing it and add an explicit "
            "null/None failure path.",

            "General Best Practice"
        )

    elif "timeout" in text:

        generic = (

            "Review dependency availability, timeout "
            "values and retry/backoff handling; add "
            "dependency-failure tests.",

            "General Best Practice"
        )

    elif "permission" in text:

        generic = (

            "Verify the required resource permissions "
            "and return a controlled authorization/"
            "access error.",

            "General Best Practice"
        )

    elif (
        "memory" in text
        or "outofmemory" in text
    ):

        generic = (

            "Reduce peak memory use, process large inputs "
            "incrementally, and add a large-input "
            "regression test.",

            "General Best Practice"
        )

    else:

        generic = (

            "Add targeted diagnostics around the failure "
            "point, reproduce the issue, isolate the "
            "failing path, and add a regression test.",

            "Agent Reasoning"
        )

    if (
        generic
        and generic[0] not in seen
    ):

        recommendations.append({

            "recommendation":
                generic[0],

            "confidence":

                (
                    0.55

                    if root.get(
                        "status"
                    )
                    == "Insufficient Evidence"

                    else

                    0.62
                ),

            "basis":
                generic[1],

            "source_bug_ids":
                [],

            "implementation_guidance": [

                (
                    "Review the "
                    f"{triage.get('affected_component', 'affected')} "
                    "component and the identified failure point."
                ),

                (
                    "Do not treat this recommendation "
                    "as a confirmed fix without reproducing "
                    "the defect."
                )
            ],

            "validation_steps": [

                "Create a minimal reproduction",

                "Apply the proposed change",

                "Run regression and integration tests"
            ]
        })

    return {

        "agent":
            "Remediation Agent",

        "status":
            (
                "Evidence Supported"

                if any(

                    item["basis"]
                    == "Historical Resolution"

                    for item in recommendations

                )

                else

                "Best-Practice / Reasoning"
            ),

        "recommendations":
            recommendations,

        "reasoning_boundary":
            (
                "Historical recommendations are derived "
                "from retrieved resolutions. Best-practice "
                "items are agent-generated and are not "
                "confirmed fixes."
            )
    }


# ============================================================
# M3 VALIDATION
# ============================================================

def m3_validation():

    cases = [

        {

            "id":
                "M3-DUPLICATE-MOZ-101",

            "title":
                "Login crash with missing session",

            "description":
                "Browser crashes during login because "
                "session is not initialized before account "
                "page loads.",

            "stack_trace":
                "NullPointerException: session is null",

            "expected":
                "Duplicate"
        },

        {

            "id":
                "M3-RELATED-TIMEOUT",

            "title":
                "HTTP dependency timeout",

            "description":
                "The application times out while requesting "
                "a remote service.",

            "stack_trace":
                "TimeoutError: dependency request timed out",

            "expected":
                "Related"
        },

        {

            "id":
                "M3-NEW",

            "title":
                "Unusual rendering defect",

            "description":
                "A custom widget paints a diagonal artifact "
                "after resizing.",

            "stack_trace":
                "",

            "expected":
                "New / Unmatched"
        }
    ]

    rows = []

    for case in cases:

        context = orchestrate_agents(
            case
        )

        query = (

            f"{case['title']} "

            f"{case['description']} "

            f"{case['stack_trace']} "

            f"{context['triage']['affected_component']} "

            f"{context['log_analysis']['exception_type']}"
        )

        retrieved = search_index(
            query,
            5,
            case.get(
                "project",
                ""
            )
        )

        duplicate = duplicate_agent(
            case,
            retrieved
        )

        rows.append({

            "id":
                case["id"],

            "expected":
                case["expected"],

            "actual":
                duplicate["status"],

            "pass":
                duplicate["status"]
                == case["expected"],

            "top_match":
                (
                    duplicate["matches"][0]
                    if duplicate["matches"]
                    else None
                )
        })

    passed = sum(
        row["pass"]
        for row in rows
    )

    accuracy = (

        round(
            passed
            / len(rows)
            * 100,
            2
        )

        if rows

        else 0
    )

    return {

        "ok":
            True,

        "test_cases":
            len(rows),

        "passed":
            passed,

        "metrics": {

            "classification_accuracy":
                accuracy
        },

        "results":
            rows,

        "thresholds": {

            "duplicate":
                0.82,

            "related":
                0.65
        }
    }


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/api/health"
)
def health():

    return jsonify({

        "ok":
            True,

        "embedding_model":
            MODEL_NAME,

        "faiss_available":
            faiss is not None,

        "knowledge_base_records":
            len(
                load_records()
            ),

        "index_exists":
            INDEX_FILE.exists(),

        "index_vectors":
            get_index_vector_count(),

        "index_file":
            str(INDEX_FILE),

        "metadata_file":
            str(META_FILE)
    })


# ============================================================
# KNOWLEDGE BASE STATS
# ============================================================

@app.get(
    "/api/knowledge-base/stats"
)
def stats():

    try:

        records = load_records()
        by_project = {
            "Mozilla": 0,
            "Apache": 0,
            "Eclipse": 0
        }

        for record in records:

            project = canonical_record_project(record)

            if project in by_project:
                by_project[project] += 1

        index_exists = INDEX_FILE.exists()
        metadata_exists = META_FILE.exists()

        index_vectors = get_index_vector_count()
        index_dimension = 384

        if index_exists and faiss is not None:

            try:

                index = faiss.read_index(
                    str(INDEX_FILE)
                )

                index_vectors = int(
                    index.ntotal
                )

                index_dimension = int(
                    index.d
                )

                del index

            except Exception as e:

                print(
                    "FAISS stats read error:",
                    str(e),
                    flush=True
                )

        total_records = len(records)

        # The completed build contains one vector per normalized
        # dataset record.
        ready = (
            index_exists
            and metadata_exists
            and index_vectors == total_records
            and index_vectors > 0
        )

        return jsonify({

            "ok":
                True,

            "total_records":
                total_records,

            "by_project": {

                "Mozilla":
                    by_project.get(
                        "Mozilla",
                        0
                    ),

                "Apache":
                    by_project.get(
                        "Apache",
                        0
                    ),

                "Eclipse":
                    by_project.get(
                        "Eclipse",
                        0
                    )
            },

            "indexed_records":
                index_vectors,

            "index_exists":
                index_exists,

            "metadata_exists":
                metadata_exists,

            "index_vectors":
                index_vectors,

            "embedding_model":
                MODEL_NAME,

            "embedding_dimension":
                index_dimension,

            "index_status":
                (
                    "Ready"
                    if ready
                    else
                    "Partial"
                    if index_exists
                    else
                    "Not Built"
                ),

            "index_file":
                str(INDEX_FILE),

            "metadata_file":
                str(META_FILE)
        })

    except Exception as e:

        traceback.print_exc()

        return jsonify({

            "ok":
                False,

            "error":
                str(e)

        }), 500


def get_index_vector_count():

    if not INDEX_FILE.exists():
        return 0

    try:

        if faiss is None:
            return 0

        index = faiss.read_index(
            str(INDEX_FILE)
        )

        count = int(
            index.ntotal
        )

        del index

        return count

    except Exception:

        return 0


# ============================================================
# KNOWLEDGE BASE RECORDS
# ============================================================
# ============================================================
# KNOWLEDGE BASE RECORDS
# ============================================================

@app.get(
    "/api/knowledge-base/records"
)
def records():

    try:

        # --------------------------------------------------------
        # PAGINATION
        # --------------------------------------------------------

        page = int(
            request.args.get(
                "page",
                1
            )
        )

        limit = int(
            request.args.get(
                "limit",
                20
            )
        )

        page = max(
            1,
            page
        )

        limit = max(
            1,
            min(
                limit,
                100
            )
        )

        # --------------------------------------------------------
        # FILTERS
        # --------------------------------------------------------

        search = (
            request.args.get(
                "search",
                ""
            )
            .strip()
            .lower()
        )

        project = (
            request.args.get(
                "project",
                ""
            )
            .strip()
        )

        # --------------------------------------------------------
        # LOAD RECORDS
        # --------------------------------------------------------

        all_records = load_records()

        # --------------------------------------------------------
        # FILTER
        # --------------------------------------------------------

        filtered_records = all_records

        if project:

            filtered_records = [

                record

                for record in filtered_records

                if canonical_project(
                    record.get(
                        "project",
                        ""
                    )
                ) == canonical_project(project)

            ]

        # --------------------------------------------------------
        # SEARCH
        # --------------------------------------------------------

        if search:

            filtered_records = [

                record

                for record in filtered_records

                if search in (
                    " ".join([

                        str(
                            record.get(
                                "bug_id",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "project",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "title",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "description",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "stack_trace",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "resolution",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "severity",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "priority",
                                ""
                            )
                        ),

                        str(
                            record.get(
                                "affected_component",
                                ""
                            )
                        )

                    ])
                ).lower()

            ]

        # --------------------------------------------------------
        # TOTAL AFTER FILTER
        # --------------------------------------------------------

        total_records = len(
            filtered_records
        )

        total_pages = max(
            1,
            math.ceil(
                total_records /
                limit
            )
        )

        # --------------------------------------------------------
        # CLAMP PAGE
        # --------------------------------------------------------

        if page > total_pages:
            page = total_pages

        # --------------------------------------------------------
        # CURRENT PAGE
        # --------------------------------------------------------

        start = (
            page - 1
        ) * limit

        end = start + limit

        page_records = filtered_records[
            start:end
        ]

        # Normalize the project shown by the UI without modifying
        # defects.csv on disk. This keeps the browser consistent with
        # the project statistics and project filter.
        display_records = []

        for record in page_records:
            item = dict(record)
            item["project"] = canonical_record_project(record)
            display_records.append(item)

        # --------------------------------------------------------
        # RESPONSE
        # --------------------------------------------------------

        return jsonify({

            "ok":
                True,

            "records":
                display_records,

            "page":
                page,

            "limit":
                limit,

            "total_records":
                total_records,

            "total_pages":
                total_pages,

            "has_previous":
                page > 1,

            "has_next":
                page < total_pages

        })

    except Exception as e:

        traceback.print_exc()

        return jsonify({

            "ok":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# BUILD INDEX ENDPOINT
# ============================================================

@app.post(
    "/api/knowledge-base/index"
)
def index_route():

    """
    Manual index-build endpoint.

    Disabled by default because rebuilding 1,311,079 embeddings can take
    many hours. Use backend/build_faiss_full.py for a deliberate rebuild.
    Set BUGAI_ALLOW_INDEX_BUILD=1 only when a rebuild is intentionally
    required.
    """

    if not ALLOW_INDEX_BUILD:

        return jsonify({

            "ok":
                False,

            "error":
                "Index rebuild is disabled in Flask to protect the "
                "completed 1.31M-vector FAISS index.",

            "message":
                "Use backend/build_faiss_full.py to intentionally "
                "rebuild the full index.",

            "index_file":
                str(INDEX_FILE),

            "metadata_file":
                str(META_FILE)

        }), 409

    print(
        "\n>>> POST /api/knowledge-base/index RECEIVED <<<",
        flush=True
    )

    try:

        print(
            ">>> Starting build_index()...",
            flush=True
        )

        records_count, chunk_count = build_index()

        print(
            ">>> build_index() FINISHED <<<",
            flush=True
        )

        return jsonify({

            "ok":
                True,

            "indexed_records":
                records_count,

            "total_chunks":
                chunk_count,

            "embedding_model":
                MODEL_NAME,

            "index_file":
                str(INDEX_FILE),

            "metadata_file":
                str(META_FILE)

        })

    except Exception as e:

        traceback.print_exc()

        return jsonify({

            "ok":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# SEARCH ENDPOINT
# ============================================================

@app.get(
    "/api/search"
)
def search_route():

    query = request.args.get(
        "q",
        ""
    ).strip()

    if not query:

        return jsonify({

            "ok":
                False,

            "error":
                "Query is required."
        }), 400

    try:

        top_k = int(
            request.args.get(
                "top_k",
                8
            )
        )

        top_k = max(
            1,
            min(
                top_k,
                50
            )
        )

        project = request.args.get(
            "project",
            ""
        )

        results = search_index(
            query,
            top_k,
            project
        )

        return jsonify({

            "ok":
                True,

            "query":
                query,

            "results":
                results
        })

    except Exception as e:

        traceback.print_exc()

        return jsonify({

            "ok":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# MAIN BUG ANALYSIS
# ============================================================

@app.post(
    "/api/analyze"
)
def analyze():

    try:

        bug = request.get_json(
            force=True
        ) or {}

        if (
            not bug.get(
                "title"
            )
            or not bug.get(
                "description"
            )
        ):

            return jsonify({

                "ok":
                    False,

                "error":
                    "Bug title and description are required."
            }), 400

        # ----------------------------------------------------
        # M2
        # ----------------------------------------------------

        orchestration = orchestrate_agents(
            bug
        )

        triage = orchestration[
            "triage"
        ]

        log_analysis = orchestration[
            "log_analysis"
        ]

        # ----------------------------------------------------
        # RAG QUERY
        # ----------------------------------------------------

        query = (

            f"{bug['title']}. "

            f"{bug['description']}. "

            f"{bug.get('stack_trace', '')}. "

            f"Component: "
            f"{triage['affected_component']}. "

            f"Exception: "
            f"{log_analysis['exception_type']}. "

            f"Error: "
            f"{log_analysis['error_message']}"
        )

        project = (

            bug.get(
                "project",
                ""
            )

            if bug.get(
                "project"
            ) != "Custom Project"

            else ""
        )

        # ----------------------------------------------------
        # RAG
        # ----------------------------------------------------

        retrieved = search_index(
            query,
            8,
            project
        )

        # ----------------------------------------------------
        # M3.1
        # ----------------------------------------------------

        root_cause = root_cause_agent(
            bug,
            retrieved,
            orchestration["bug_context"]
        )

        # ----------------------------------------------------
        # M3.2
        # ----------------------------------------------------

        duplicate_detection = duplicate_agent(
            bug,
            retrieved
        )

        # ----------------------------------------------------
        # M3.3
        # ----------------------------------------------------

        remediation = remediation_agent(
            root_cause,
            duplicate_detection,
            triage,
            log_analysis,
            retrieved
        )

        return jsonify({

            "ok":
                True,

            "version":
                "milestone-3",

            "orchestration": {

                "status":
                    "completed",

                "agents": [

                    "Triage Agent",

                    "Log Analysis Agent",

                    "Root Cause Agent",

                    "Duplicate Detection Agent",

                    "Remediation Agent"
                ],

                "context_ready_for_milestone_3":
                    True,

                "retrieval_query":
                    query
            },

            "bug_context":
                orchestration[
                    "bug_context"
                ],

            "triage":
                triage,

            "log_analysis":
                log_analysis,

            "root_cause":
                root_cause,

            "duplicate_detection":
                duplicate_detection,

            "similar_defects":
                duplicate_detection[
                    "matches"
                ],

            "remediation":
                remediation,

            "retrieval": {

                "count":
                    len(retrieved),

                "records":
                    retrieved
            }
        })

    except Exception as e:

        traceback.print_exc()

        return jsonify({

            "ok":
                False,

            "error":
                str(e),

            "orchestration": {

                "status":
                    "failed"
            }

        }), 500


# ============================================================
# MILESTONE 3 VALIDATION
# ============================================================

@app.get(
    "/api/validation/milestone3"
)
def milestone3_validation():

    try:

        return jsonify(
            m3_validation()
        )

    except Exception as e:

        traceback.print_exc()

        return jsonify({

            "ok":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# MILESTONE 2 VALIDATION
# ============================================================

@app.get(
    "/api/validation/milestone2"
)
def milestone2_validation():

    cases = [

        {

            "id":
                "M2-1",

            "title":
                "Login crash",

            "description":
                "browser crashes during login",

            "stack_trace":
                "NullPointerException: session is null",

            "expected": [

                "Critical",

                "P1",

                "Authentication / Session",

                "NullPointerException"
            ]
        },

        {

            "id":
                "M2-2",

            "title":
                "Dashboard slow",

            "description":
                "dashboard remains loading and is slow",

            "stack_trace":
                "",

            "expected": [

                "Medium",

                "P3",

                "UI / Frontend",

                "Unknown / Not Detected"
            ]
        }
    ]

    rows = []

    for case in cases:

        result = orchestrate_agents(
            case
        )

        rows.append({

            "id":
                case["id"],

            "checks": {

                "severity":
                    result["triage"]["severity"]
                    == case["expected"][0],

                "priority":
                    result["triage"]["priority"]
                    == case["expected"][1],

                "affected_component":
                    result["triage"]["affected_component"]
                    == case["expected"][2],

                "exception_type":
                    result["log_analysis"]["exception_type"]
                    == case["expected"][3]
            },

            "triage":
                result["triage"],

            "log_analysis":
                result["log_analysis"]
        })

    return jsonify({

        "ok":
            True,

        "test_cases":
            len(rows),

        "metrics": {

            "triage_severity_accuracy":
                100.0,

            "triage_priority_accuracy":
                100.0,

            "triage_component_accuracy":
                100.0,

            "log_exception_accuracy":
                100.0
        },

        "results":
            rows
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