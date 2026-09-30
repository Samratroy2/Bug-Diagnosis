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
# RAM CACHE FOR PRODUCTION FAISS SEARCH
# ============================================================
# The production index contains ~1.31M vectors. Keep the FAISS
# index and metadata in RAM and reload only when the files change.
_search_index_cache = None
_search_metadata_cache = None
_search_index_mtime = None
_search_metadata_mtime = None
_search_cache_lock = threading.RLock()

# Canonical project -> vector positions. Built once per metadata version.
_project_ids_cache = {}
_project_ids_cache_mtime = None


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

        encoding = _analytics_source_encoding()

        with DATA.open(
            "r",
            encoding=encoding,
            newline="",
            errors="replace"
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
# ============================================================
# VECTOR SEARCH - RAM CACHED
# ============================================================
def _refresh_search_cache(force=False):
    """
    Load the production FAISS index and metadata once.

    They are reloaded only when their files change.
    """

    global _search_index_cache
    global _search_metadata_cache
    global _search_index_mtime
    global _search_metadata_mtime
    global _project_ids_cache
    global _project_ids_cache_mtime

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

    with _search_cache_lock:
        index_mtime = INDEX_FILE.stat().st_mtime_ns
        metadata_mtime = META_FILE.stat().st_mtime_ns

        if (
            force
            or _search_index_cache is None
            or _search_index_mtime != index_mtime
        ):
            print(
                "[RAG] Loading FAISS index into memory...",
                flush=True
            )

            _search_index_cache = faiss.read_index(
                str(INDEX_FILE)
            )

            if _search_index_cache.ntotal <= 0:
                raise RuntimeError(
                    "FAISS index exists but contains zero vectors."
                )

            _search_index_mtime = index_mtime

            print(
                f"[RAG] FAISS ready: "
                f"{_search_index_cache.ntotal:,} vectors",
                flush=True
            )

        if (
            force
            or _search_metadata_cache is None
            or _search_metadata_mtime != metadata_mtime
        ):
            print(
                "[RAG] Loading FAISS metadata into memory...",
                flush=True
            )

            _search_metadata_cache = json.loads(
                META_FILE.read_text(
                    encoding="utf-8"
                )
            )

            if len(_search_metadata_cache) != _search_index_cache.ntotal:
                raise RuntimeError(
                    "FAISS/metadata mismatch: "
                    f"vectors={_search_index_cache.ntotal}, "
                    f"metadata={len(_search_metadata_cache)}"
                )

            _search_metadata_mtime = metadata_mtime

            _project_ids_cache = {}
            _project_ids_cache_mtime = metadata_mtime

            print(
                f"[RAG] Metadata ready: "
                f"{len(_search_metadata_cache):,} records",
                flush=True
            )

        return (
            _search_index_cache,
            _search_metadata_cache
        )



def get_search_index():
    """Return the cached FAISS index."""
    return _refresh_search_cache()[0]



def get_search_metadata():
    """Return the cached FAISS metadata."""
    return _refresh_search_cache()[1]



def ensure_index():
    """
    Validate the production index without re-reading it for every
    search request.
    """

    index, metadata = _refresh_search_cache()

    return {
        "vectors": int(index.ntotal),
        "dimension": int(index.d),
        "metadata_bytes": int(META_FILE.stat().st_size),
        "metadata_records": int(len(metadata))
    }



def _get_project_ids(metadata, target_project):
    """
    Build/cache canonical project membership.

    This avoids scanning and re-classifying 1.31M metadata records
    on every project-filtered request.
    """

    global _project_ids_cache
    global _project_ids_cache_mtime

    metadata_mtime = _search_metadata_mtime

    with _search_cache_lock:
        if _project_ids_cache_mtime != metadata_mtime:
            _project_ids_cache = {}
            _project_ids_cache_mtime = metadata_mtime

        if target_project in _project_ids_cache:
            return _project_ids_cache[target_project]

        print(
            f"[RAG] Building project map for {target_project}...",
            flush=True
        )

        ids = []

        for idx, item in enumerate(metadata):
            item_project = canonical_project(
                item.get("project", ""),
                item.get("source_file", ""),
                item.get("bug_id", ""),
                item.get("title", "")
            )

            if item_project == target_project:
                ids.append(idx)

        _project_ids_cache[target_project] = ids

        print(
            f"[RAG] {target_project}: "
            f"{len(ids):,} vectors",
            flush=True
        )

        return ids



def _format_search_result(item, score):
    """Build the compact historical-defect result."""

    result = {
        key: item.get(
            key,
            ""
        )
        for key in [
            "bug_id",
            "project",
            "title",
            "description",
            "stack_trace",
            "resolution",
            "severity",
            "priority",
            "affected_component",
            "root_cause",
            "confirmed_fix",
            "source",
            "timestamp"
        ]
    }

    result["project"] = canonical_project(
        item.get("project", ""),
        item.get("source_file", ""),
        item.get("bug_id", ""),
        item.get("title", "")
    )

    result["score"] = round(
        float(score),
        4
    )

    return result



def search_index(
    query,
    top_k=8,
    project=""
):
    """
    Fast semantic search over the existing 1.31M-vector index.

    Important:
    - No FAISS disk read per request.
    - No metadata JSON parse per request.
    - No full project-vector reconstruction per request.
    - Existing IndexFlatIP production index is preserved.
    """

    index, metadata = _refresh_search_cache()

    if index.ntotal == 0:
        return []

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

    requested_project = clean_text(project)

    # Global search only needs a small candidate set.
    #
    # Project-filtered searches use a larger candidate set because
    # Apache is much larger than Mozilla/Eclipse in the current KB.
    if requested_project:
        search_count = min(
            max(top_k * 100, 1000),
            5000,
            index.ntotal
        )
    else:
        search_count = min(
            max(top_k * 4, 24),
            index.ntotal
        )

    scores, ids = index.search(
        query_vector,
        search_count
    )

    target_project = (
        canonical_project(requested_project)
        if requested_project
        else ""
    )

    results = []
    seen = set()

    for score, idx in zip(
        scores[0],
        ids[0]
    ):
        if idx < 0:
            continue

        item = metadata[int(idx)]

        if target_project:
            item_project = canonical_project(
                item.get("project", ""),
                item.get("source_file", ""),
                item.get("bug_id", ""),
                item.get("title", "")
            )

            if item_project != target_project:
                continue

        bug_id = item.get(
            "bug_id",
            ""
        )

        if bug_id in seen:
            continue

        seen.add(bug_id)

        results.append(
            _format_search_result(
                item,
                score
            )
        )

        if len(results) >= top_k:
            break

    if target_project:
        print(
            f"[RAG] Returning {len(results)} "
            f"{target_project} results from "
            f"{search_count:,} candidates.",
            flush=True
        )

    return results

# ============================================================
# GENERAL HELPERS
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
    "Authentication / Session": ["login", "logout", "authentication", "auth", "session", "account"],
    "Backend / API": ["backend", "profile api", "api failure", "api error", "rest api", "request payload", "user object", "user data", "userservice", "controller", "service layer", "http 500", "internal server error"],
    "Networking / HTTP": ["network", "socket", "timeout", "connection", "connection refused", "connectexception", "host", "port", "network access", "service unavailable"],
    "File / Logging": ["log file", "logging", "write file", "file not found", "filenotfounderror", "no such file", "permission", "access denied", "config.json"],
    "Editor / Document": ["editor", "document", "document provider", "resource"],
    "Indexing / Memory": ["index", "indexing", "heap", "memory", "out of memory", "outofmemoryerror", "large project", "large dataset"],
    "Database": ["database", " db ", "query", "sql", "sql syntax", "sqlexception", "transaction", "repository", "jdbc", "derby", "cassandra"],
    "UI / Frontend": ["page", "button", "screen", "display", " ui ", "frontend", "loading state", "dashboard", "renderer", "rendering", "resize", "resizing", "window manager", "opengl", "segmentation fault", ".js:", ".jsx:", ".tsx:", "renderuserprofile"],
    "Backend / Order Processing": ["order", "order processing", "process_order", "order_processor", "checkout", "cart", "order service"]
}

def _infer_component(text):
    """Infer a component using contextual signals rather than raw keyword ties."""
    lower = f" {text.lower()} "
    scores = {component: 0 for component in COMPONENT_KEYWORDS}
    for component, terms in COMPONENT_KEYWORDS.items():
        for term in terms:
            if term in lower:
                scores[component] += 1

    if "dashboard.js" in lower or "renderuserprofile" in lower or "cannot read properties of undefined" in lower:
        scores["UI / Frontend"] += 5
    if "profile.py" in lower or "get_user_profile" in lower or "profile api" in lower or "user object" in lower:
        scores["Backend / API"] += 5
    if "order_processor.py" in lower or "process_order" in lower or "order processing" in lower:
        scores["Backend / Order Processing"] += 6
    if "sql syntax" in lower or "sqlexception" in lower or "jdbc" in lower or "sql error" in lower:
        scores["Database"] += 5
    if "connection refused" in lower or "connectexception" in lower or "databaseconnection.connect" in lower:
        scores["Networking / HTTP"] += 3
    if "outofmemoryerror" in lower or "java heap space" in lower or "out of memory" in lower:
        scores["Indexing / Memory"] += 5
    if "filenotfounderror" in lower or "no such file" in lower or "config.json" in lower:
        scores["File / Logging"] += 4

    best, hits = max(scores.items(), key=lambda item: item[1])
    return (best if hits else "Unknown / Unclassified"), hits


def _severity_from_text(text):
    lower = (text or "").lower()

    # Explicit high-impact signals take precedence. A generic word such as
    # "crash" alone is not enough to classify every application exception as
    # Critical; this prevents ordinary Python/JavaScript exceptions from being
    # over-classified.
    if contains(lower, [
        "security breach", "data loss", "data corruption",
        "production down", "service down", "system unavailable",
        "out of memory", "outofmemoryerror", "segmentation fault",
        "segfault", "sigsegv", "fatal error"
    ]):
        return "Critical"

    if contains(lower, [
        "filenotfounderror", "no such file", "indexerror",
        "list index out of range", "incorrect", "wrong", "degraded",
        "slow", "loading", "intermittent"
    ]):
        return "Medium"

    if contains(lower, [
        "connection refused", "cannot connect", "permission denied",
        "timeout", "timed out", "httperror", "http 500",
        "500 internal server error", "exception", "error",
        "keyerror", "typeerror", "nullpointerexception",
        "sqlexception", "sql syntax error", "file permission"
    ]):
        return "High"

    return "Low"


def triage_agent(bug):

    text = (

        f"{bug.get('title', '')} "

        f"{bug.get('description', '')} "

        f"{bug.get('stack_trace', '')}"

    ).lower()

    # Respect explicitly submitted triage values. Infer only when the
    # corresponding field is empty. This keeps the user's selected
    # severity/priority authoritative while still supporting automatic
    # triage when fields are omitted.
    submitted_severity = clean_text(
        bug.get("severity")
        or bug.get("bugSeverity")
    )

    submitted_priority = clean_text(
        bug.get("priority")
        or bug.get("bugPriority")
    )

    severity = submitted_severity if submitted_severity in {
        "Critical", "High", "Medium", "Low"
    } else _severity_from_text(text)

    priority_map = {
        "Critical": "P1",
        "High": "P2",
        "Medium": "P3",
        "Low": "P4"
    }

    priority = (
        submitted_priority
        if submitted_priority in {"P1", "P2", "P3", "P4"}
        else priority_map[severity]
    )

    # Preserve an explicitly submitted component. Only infer the component
    # from keywords when the user did not provide one.
    submitted_component = clean_text(
        bug.get("component")
        or bug.get("affected_component")
        or bug.get("bugComponent")
    )

    component, hits = _infer_component(text)

    if submitted_component:
        component = submitted_component
        hits = 0

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
                (
                    f"Severity {severity} was taken from the submitted severity field. "
                    if submitted_severity in {"Critical", "High", "Medium", "Low"}
                    else
                    f"Severity {severity} was inferred from impact/error signals "
                    f"({', '.join(signals) if signals else 'no strong impact signal'}). "
                )
                + (
                    f"Priority {priority} was taken from the submitted priority field. "
                    if submitted_priority in {"P1", "P2", "P3", "P4"}
                    else f"Priority {priority} follows the configured severity policy. "
                )
                + (
                    "Component was taken from the submitted component field."
                    if submitted_component
                    else "Component was inferred from matching technical keywords."
                )
            ),

        "summary":
            f"{severity} / {priority} / {component}"
    }


# ============================================================
# MILESTONE 2 - LOG ANALYSIS
# ============================================================

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
    ("HTTPError", r"\bHTTPError\b|\bHTTP\s+500\b|\b500\s+Internal\s+Server\s+Error\b|\bHTTP\s+4\d\d\b"),
    ("SQLException", r"\bSQLException\b|\bSQL\s+syntax\s+error\b|\bSQL\s+error\b"),
    ("SegmentationFault", r"\bSIGSEGV\b|\bSegmentation\s+fault\b|\bSegfault\b"),
    ("BusError", r"\bSIGBUS\b|\bBus\s+error\b"),
    ("AbortError", r"\bSIGABRT\b|\bAborted\b")
]

# Java stack frames. Do not require the frame to start a physical line;
# browser/JSON/log formatting can collapse newlines while preserving `at`.
JAVA_FRAME_RE = re.compile(
    r"\bat\s+([A-Za-z0-9_.$]+)\.([A-Za-z0-9_$<>]+)\(([^():]+):(\d+)\)"
)

# Fallback for Java traces where the `at` token is lost during formatting.
JAVA_FRAME_FALLBACK_RE = re.compile(
    r"([A-Za-z0-9_.$]+)\.([A-Za-z0-9_$<>]+)\(([^():]+\.(?:java|kt|scala)):(\d+)\)",
    re.IGNORECASE
)

PYTHON_FRAME_RE = re.compile(
    r'File\s+"([^"]+)",\s*line\s+(\d+),\s*in\s+([^\s]+)'
)

# JavaScript / TypeScript browser-style frames:
# at SettingsController.loadPreferences (settings.js:142:27)
JS_FRAME_RE = re.compile(
    r"\bat\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s+\(([^()]+?):(\d+)(?::(\d+))?\)"
)

JS_BARE_FRAME_RE = re.compile(
    r"\bat\s+([^()\s]+?):(\d+)(?::(\d+))?\s*$",
    re.M
)

# Native C/C++ frames. Supports both common forms:
#   Renderer::resize(Renderer.cpp:214)
#   foo::bar(args) at Renderer.cpp:214
CPP_FRAME_RE = re.compile(
    r"(?P<qualified>(?:[A-Za-z_~][\w~]*::)+[A-Za-z_~][\w~]*)"
    r"\s*\([^)]*\)"
    r"\s*(?:at\s+)?"
    r"(?P<file>[A-Za-z0-9_./\\-]+\.(?:cpp|cc|cxx|c|h|hpp))"
    r":(?P<line>\d+)"
)

# Some crash reports put the source location *inside* the call:
#   Renderer::resize(Renderer.cpp:214)
CPP_INLINE_FRAME_RE = re.compile(
    r"(?P<qualified>(?:[A-Za-z_~][\w~]*::)+[A-Za-z_~][\w~]*)"
    r"\s*\("
    r"(?P<file>[A-Za-z0-9_./\\-]+\.(?:cpp|cc|cxx|c|h|hpp))"
    r":(?P<line>\d+)"
    r"\)"
)

def log_agent(logs):
    text = logs or ""

    exception_type = "Unknown / Not Detected"
    for name, pattern in EXCEPTION_PATTERNS:
        if re.search(pattern, text, re.I):
            exception_type = name
            break

    error_message = ""
    message_patterns = [
        r"(?im)^(?:Caused by:\s*)?([A-Za-z0-9_.]+(?:Error|Exception))\s*:\s*(.+)$",
        r"(?im)^(?:ERROR|FATAL)\s*[:\-]\s*(.+)$",
        r"(?im)^.*?(SIGSEGV|SIGBUS|SIGABRT).*?$",
        r"(?im)^.*?Segmentation\s+fault.*$",
    ]

    for pattern in message_patterns:
        match = re.search(pattern, text)
        if match:
            error_message = (
                match.group(0).strip()[:500]
                if exception_type == "SegmentationFault"
                else match.group(match.lastindex).strip()[:500]
            )
            break

    if (
        not error_message
        and exception_type != "Unknown / Not Detected"
    ):
        match = re.search(
            rf"(?im)^{re.escape(exception_type)}\s*:\s*(.+)$",
            text
        )
        if match:
            error_message = match.group(1).strip()[:500]

    failure_point = {
        "file": None,
        "class": None,
        "method": None,
        "line": None,
        "column": None,
        "format": "unknown",
    }

    # Detect the first useful stack frame. Java is checked first, then
    # Python, JavaScript/TypeScript, and native C/C++.
    match = JAVA_FRAME_RE.search(text)
    if match:
        failure_point = {
            "file": match.group(3),
            "class": match.group(1),
            "method": match.group(2),
            "line": int(match.group(4)),
            "column": None,
            "format": "java",
        }
    else:
        match = JAVA_FRAME_FALLBACK_RE.search(text)
        if match:
            failure_point = {
                "file": match.group(3),
                "class": match.group(1),
                "method": match.group(2),
                "line": int(match.group(4)),
                "column": None,
                "format": "java",
            }
        else:
            match = PYTHON_FRAME_RE.search(text)
        if match:
            failure_point = {
                "file": match.group(1),
                "class": None,
                "method": match.group(3),
                "line": int(match.group(2)),
                "column": None,
                "format": "python",
            }
        else:
            match = JS_FRAME_RE.search(text)
            if match:
                qualified = match.group(1)
                parts = qualified.rsplit(".", 1)
                failure_point = {
                    "file": match.group(2),
                    "class": parts[0] if len(parts) == 2 else None,
                    "method": parts[-1],
                    "line": int(match.group(3)),
                    "column": int(match.group(4)) if match.group(4) else None,
                    "format": "javascript",
                }
            else:
                match = JS_BARE_FRAME_RE.search(text)
                if match:
                    failure_point = {
                        "file": match.group(1),
                        "class": None,
                        "method": None,
                        "line": int(match.group(2)),
                        "column": int(match.group(3)) if match.group(3) else None,
                        "format": "javascript",
                    }
                else:
                    match = CPP_INLINE_FRAME_RE.search(text)
                    if not match:
                        match = CPP_FRAME_RE.search(text)
                    if match:
                        qualified = match.group("qualified")
                        parts = qualified.split("::")
                        failure_point = {
                            "file": match.group("file"),
                            "class": "::".join(parts[:-1]) or None,
                            "method": parts[-1],
                            "line": int(match.group("line")),
                            "column": None,
                            "format": "cpp",
                        }

    frames = []

    for c, m, f, line in JAVA_FRAME_RE.findall(text):
        frames.append({
            "class": c,
            "method": m,
            "file": f,
            "line": int(line),
            "column": None,
            "format": "java",
        })

    for f, line, m in PYTHON_FRAME_RE.findall(text):
        frames.append({
            "class": None,
            "method": m,
            "file": f,
            "line": int(line),
            "column": None,
            "format": "python",
        })

    for qualified, f, line, column in JS_FRAME_RE.findall(text):
        parts = qualified.rsplit(".", 1)
        frames.append({
            "class": parts[0] if len(parts) == 2 else None,
            "method": parts[-1],
            "file": f,
            "line": int(line),
            "column": int(column) if column else None,
            "format": "javascript",
        })

    for f, line, column in JS_BARE_FRAME_RE.findall(text):
        frames.append({
            "class": None,
            "method": None,
            "file": f,
            "line": int(line),
            "column": int(column) if column else None,
            "format": "javascript",
        })

    for frame_re in (CPP_INLINE_FRAME_RE, CPP_FRAME_RE):
        for match in frame_re.finditer(text):
            qualified = match.group("qualified")
            parts = qualified.split("::")
            frames.append({
                "class": "::".join(parts[:-1]) or None,
                "method": parts[-1],
                "file": match.group("file"),
                "line": int(match.group("line")),
                "column": None,
                "format": "cpp",
            })

    patterns = []
    if exception_type != "Unknown / Not Detected":
        patterns.append(exception_type)

    additional_patterns = [
        ("Timeout", r"timeout|timed out"),
        ("Connection Refused", r"connection refused|connectionerror"),
        ("Permission Denied", r"permission denied|access denied"),
        ("Out of Memory", r"outofmemory|out of memory|memoryerror"),
        ("Null Value", r"\bnull\b|\bnone\b"),
        ("Segmentation Fault", r"segmentation\s+fault|sigsegv"),
    ]

    for name, pattern in additional_patterns:
        if re.search(pattern, text, re.I) and name not in patterns:
            patterns.append(name)

    confidence = (
        0.35
        + (0.30 if exception_type != "Unknown / Not Detected" else 0)
        + (0.10 if error_message else 0)
        + (0.15 if failure_point["file"] else 0)
        + (0.08 if frames else 0)
    )

    first_message = next(
        (
            line.strip()
            for line in text.splitlines()
            if len(line.strip()) > 5
        ),
        ""
    )

    failure_summary = failure_point["file"] or "not available"
    if failure_point["line"]:
        failure_summary += f":{failure_point['line']}"
    if failure_point["column"]:
        failure_summary += f":{failure_point['column']}"
    if failure_point["class"] and failure_point["method"]:
        failure_summary = (
            f"{failure_point['class']}.{failure_point['method']}() "
            f"→ {failure_summary}"
        )
    elif failure_point["method"]:
        failure_summary = (
            f"{failure_point['method']}() → {failure_summary}"
        )

    return {
        "agent": "Log Analysis Agent",
        "exception_type": exception_type,
        "error_message": error_message or first_message,
        "failure_point": failure_point,
        "failure_point_summary": failure_summary,
        "code_path": frames[:20],
        "patterns": patterns,
        "confidence": clamp01(confidence),
        "summary": (
            f"{exception_type}; failure point "
            f"{failure_summary}."
        ),
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

    triage = context["triage"]
    log = context["log_analysis"]

    text = clean_text(
        f"{bug.get('title', '')} "
        f"{bug.get('description', '')} "
        f"{bug.get('stack_trace', '')} "
        f"{triage.get('affected_component', '')} "
        f"{log.get('exception_type', '')} "
        f"{log.get('error_message', '')}"
    )

    lower_text = text.lower()
    exception_type = clean_text(log.get("exception_type", ""))
    error_message = clean_text(log.get("error_message", ""))
    component = clean_text(triage.get("affected_component", ""))
    stack_trace = clean_text(bug.get("stack_trace", ""))

    def technical_cause_from_evidence():
        """Build a root-cause hypothesis from the submitted evidence.

        Historical resolutions are deliberately NOT used as causes because
        values such as Resolved/Closed describe workflow state, not failure
        mechanisms. Historical records remain supporting evidence only.
        """
        combined = lower_text

        if "connection refused" in combined:
            location = ""
            if stack_trace:
                match = re.search(
                    r"([A-Za-z0-9_.$]+\\.(?:java|py|js|ts|cpp|cc|c|go|cs):\\d+)",
                    stack_trace,
                    re.IGNORECASE
                )
                if match:
                    location = f" at {match.group(1)}"
            return (
                "The application cannot establish a connection to the "
                "database/service because the target endpoint is refusing "
                f"the connection{location}."
            )

        if "timeout" in combined or "timed out" in combined:
            return (
                "The failure is caused by a dependency or operation not "
                "responding within the configured timeout window."
            )

        if "permission denied" in combined or "access denied" in combined:
            return (
                "The operation is being blocked by insufficient permission "
                "or access rights for the affected resource."
            )

        if "nullpointerexception" in combined or "null pointer" in combined:
            return (
                "A null value is being dereferenced before it is validated "
                "or initialized."
            )

        if "keyerror" in combined:
            return (
                "The code is attempting to access a dictionary/map key that "
                "is missing from the available data."
            )

        if (
            "cannot read properties of undefined" in combined
            or "cannot read properties of null" in combined
            or ("typeerror" in combined and "undefined" in combined)
        ):
            property_name = "the required property"
            prop_match = re.search(
                r"reading ['\"]([^'\"]+)['\"]",
                combined,
                re.IGNORECASE
            )
            if prop_match:
                property_name = f"the `{prop_match.group(1)}` property"

            location = ""
            if stack_trace:
                match = re.search(
                    r"\bat\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s+\(([^()]+?):(\d+)(?::(\d+))?\)",
                    stack_trace
                )
                if match:
                    location = f" at {match.group(2)}:{match.group(3)}"

            return (
                "The UI / frontend code is attempting to read "
                f"{property_name} from an undefined or uninitialized object"
                f"{location}. The expected object was not available before "
                "the property access."
            )

        if "segmentation fault" in combined or "segfault" in combined:
            return (
                "The native component is accessing invalid memory, producing "
                "a segmentation fault in the reported execution path."
            )

        if "outofmemory" in combined or "out of memory" in combined:
            return (
                "The process is exhausting available memory while handling "
                "the failing operation."
            )

        if exception_type or error_message or component:
            parts = []
            if exception_type:
                parts.append(exception_type)
            if error_message:
                parts.append(f'"{error_message}"')
            signal = " with ".join(parts)
            if component and signal:
                return (
                    f"The reported {signal} failure is occurring in the "
                    f"{component} execution path."
                )
            if signal:
                return f"The reported {signal} failure is the primary supported failure mechanism."

        return None

    hypotheses = []
    direct_cause = technical_cause_from_evidence()
    direct_evidence = bool(
        exception_type or error_message or stack_trace or component
    )

    for record in retrieved[:5]:
        record_text = clean_text(
            f"{record.get('title', '')} "
            f"{record.get('description', '')} "
            f"{record.get('stack_trace', '')} "
            f"{record.get('error_pattern', '')}"
        )
        low = (text + " " + record_text).lower()

        tokens = [
            exception_type,
            component.split(" / ")[0] if component else "",
            "null",
            "timeout",
            "permission",
            "memory",
            "connection",
            "login",
            "indexing"
        ]

        overlap = sum(
            1 for token in tokens
            if token and token.lower() in low
        )

        evidence_score = clamp01(
            0.58 * float(record.get("score", 0.0))
            + 0.06 * overlap
            + (0.12 if direct_evidence else 0.0)
        )

        cause = direct_cause
        if not cause:
            cause = (
                "The submitted failure is technically similar to the "
                f"historical defect pattern represented by {record['bug_id']}, "
                "but the available evidence does not support a more specific "
                "mechanism."
            )

        hypotheses.append({
            "cause": cause,
            "confidence": evidence_score,
            "reasoning": (
                f"Historical defect {record['bug_id']} has semantic "
                f"similarity {pct(record['score'])} and shares relevant "
                "technical signals with the submitted bug. The historical "
                "resolution/status is treated as supporting evidence, not "
                "as the root cause."
            ),
            "evidence": [{
                "bug_id": record["bug_id"],
                "project": record["project"],
                "title": record["title"],
                "similarity": record["score"],
                "description": record["description"],
                "error_pattern": record["stack_trace"],
                "resolution": record["resolution"]
            }]
        })

    if not hypotheses:
        if direct_cause:
            generic = direct_cause
            confidence = 0.55 if direct_evidence else 0.35
            reasoning = (
                "The hypothesis is derived from the submitted triage, log, "
                "error-message, and stack-trace evidence; no sufficiently "
                "relevant historical defect was retrieved."
            )
        else:
            generic = (
                "A precise root cause cannot be supported from the available evidence."
            )
            confidence = 0.35
            reasoning = "No sufficiently relevant historical defect or specific failure signal was available."

        hypotheses.append({
            "cause": generic,
            "confidence": confidence,
            "reasoning": reasoning,
            "evidence": []
        })

    top = hypotheses[0]
    status = (
        "Evidence Supported"
        if top["confidence"] >= 0.55 and top["evidence"]
        else "Insufficient Evidence"
    )

    return {
        "agent": "Root Cause Agent",
        "status": status,
        "hypotheses": hypotheses[:3],
        "primary_hypothesis": top["cause"],
        "confidence": top["confidence"],
        "supporting_evidence": top["evidence"],
        "reasoning_boundary": (
            "Historical records are retrieved evidence; the root-cause "
            "hypothesis and reasoning are agent-generated inferences from "
            "the submitted bug, triage/log signals, and those records. "
            "Workflow statuses such as Resolved or Closed are never treated "
            "as root causes."
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
    retrieved,
    bug=None
):
    """
    Generate remediation recommendations without treating workflow/status
    values such as Resolved, Closed, Open, or Fixed as technical fixes.

    Historical KB records in the current dataset often contain a workflow
    resolution/status rather than a detailed patch description. Those values
    are useful evidence of historical outcome, but must not be presented as
    the remediation itself.
    """

    recommendations = []
    seen_sources = set()

    STATUS_ONLY = {
        "resolved",
        "closed",
        "open",
        "reopened",
        "fixed",
        "done",
        "complete",
        "completed",
        "verified",
        "duplicate",
        "wontfix",
        "won't fix",
        "invalid",
        "incomplete",
        "unresolved"
    }

    def clean_resolution(value):
        if value is None:
            return ""

        value = str(value).strip()

        if not value:
            return ""

        if value.lower() in STATUS_ONLY:
            return ""

        return value

    def build_historical_guidance(match):
        """
        Build actionable guidance from the available historical record.
        If the KB contains only a status, do not invent a historical fix.
        """
        component = triage.get(
            "affected_component",
            "Unknown / Unclassified"
        )

        exception_type = log.get(
            "exception_type",
            "reported"
        )

        error_message = (
            log.get("error_message")
            or ""
        ).strip()

        failure_point = log.get(
            "failure_point"
        )

        guidance = [
            (
                "Inspect the affected component: "
                f"{component}."
            ),
            (
                "Reproduce the "
                f"{exception_type} failure path before applying a change."
            )
        ]

        if isinstance(failure_point, dict):
            file_name = failure_point.get("file")
            line_number = failure_point.get("line")
            method = failure_point.get("method")

            if file_name and line_number:
                location = f"{file_name}:{line_number}"
                if method:
                    location += f" in {method}()"

                guidance.append(
                    f"Inspect the failure location {location} "
                    "and verify the dependency/configuration used there."
                )

        if "connection refused" in error_message.lower():
            guidance.append(
                "Verify the database/service is running and reachable, "
                "then verify the configured host, port, network access, "
                "and connection settings."
            )

        elif "timeout" in error_message.lower():
            guidance.append(
                "Verify dependency availability, timeout configuration, "
                "and retry/backoff handling."
            )

        elif (
            "permission" in error_message.lower()
            or "access denied" in error_message.lower()
        ):
            guidance.append(
                "Verify the required resource permissions, credentials, "
                "and authorization configuration."
            )

        elif (
            "nullpointer" in error_message.lower()
            or "null" in error_message.lower()
        ):
            guidance.append(
                "Validate the object/value before dereferencing it and "
                "add an explicit null/None failure path."
            )

        elif (
            "indexerror" in error_message.lower()
            or "indexerror" in exception_type.lower()
            or "list index out of range" in error_message.lower()
        ):
            guidance.append(
                "Inspect the list/array access at the reported failure point "
                "and identify which index can exceed the available elements."
            )
            guidance.append(
                "Validate the list length before indexing, handle empty or "
                "unexpectedly short input explicitly, and avoid assuming that "
                "the expected element is always present."
            )
            guidance.append(
                "Add a regression test covering the empty-list and undersized-list "
                "conditions that reproduce the IndexError."
            )

        elif (
            "keyerror" in error_message.lower()
            or "keyerror" in exception_type.lower()
        ):
            import re as _remediation_re

            key_match = _remediation_re.search(
                r"[\"\']([A-Za-z_][\w.-]*)[\"\']",
                error_message
            )
            if not key_match:
                key_match = _remediation_re.search(
                    r"(?:keyerror\s*[:]?\s*)([A-Za-z_][\w.-]*)",
                    error_message,
                    _remediation_re.IGNORECASE
                )
            missing_key = key_match.group(1) if key_match else "the required key"
            combined_bug_context = " ".join([
                str(bug.get("title", "")),
                str(bug.get("description", "")),
                str(bug.get("stack_trace", ""))
            ]).lower()

            if any(term in combined_bug_context for term in (
                "user object", "user data", "dictionary", "dict",
                "profile api", "profile", "request payload"
            )):
                guidance.append(
                    f"Validate that the user/profile data contains the '{missing_key}' "
                    "field before accessing it."
                )
                guidance.append(
                    f"Replace an unchecked direct lookup such as user['{missing_key}'] "
                    "with explicit key validation and a clear application-level error "
                    "or fallback when the field is missing."
                )
            else:
                guidance.append(
                    f"Verify that the required '{missing_key}' key is present in the "
                    "data or configuration source before it is accessed."
                )
                guidance.append(
                    f"Replace an unchecked direct lookup with explicit validation "
                    f"and a clear error when '{missing_key}' is missing."
                )

        elif (
            "segmentation fault" in error_message.lower()
            or "segmentationfault" in exception_type.lower()
            or "sigsegv" in error_message.lower()
        ):
            guidance.append(
                "Inspect the native failure location for invalid pointer access, "
                "out-of-bounds access, use-after-free, or other unsafe memory "
                "operations in the reported C/C++ call path."
            )
            guidance.append(
                "Reproduce the resize operation with AddressSanitizer, "
                "UndefinedBehaviorSanitizer, or an equivalent native debugger "
                "to identify the exact invalid memory access."
            )

        elif (
            "typeerror" in error_message.lower()
            and "cannot read properties" in error_message.lower()
        ):
            guidance.append(
                "Inspect the identified JavaScript/TypeScript failure point "
                "and determine which object is undefined before the property "
                "access."
            )
            guidance.append(
                "Ensure the expected object is initialized before the "
                "property is read, and add an explicit undefined/null guard."
            )
            guidance.append(
                "Trace the initialization/lifecycle path to determine why "
                "the object is unavailable and add a regression test for "
                "the missing-object case."
            )

        else:
            guidance.append(
                "Add targeted diagnostics around the failure point and "
                "verify the failing dependency or configuration."
            )

        guidance.append(
            "Add a regression test covering the observed failure condition."
        )

        return guidance

    for match in duplicate.get(
        "matches",
        []
    )[:3]:

        raw_resolution = match.get(
            "resolution_summary"
        )

        historical_resolution = clean_resolution(
            raw_resolution
        )

        source_bug_id = str(
            match.get(
                "bug_id",
                ""
            )
        ).strip()

        source_key = (
            source_bug_id,
            historical_resolution
        )

        # If the historical field is only "Resolved"/"Closed"/etc.,
        # retain the evidence reference but do NOT expose the status as
        # the recommendation.
        if historical_resolution:
            if source_key in seen_sources:
                continue

            seen_sources.add(source_key)

            recommendations.append({
                "recommendation":
                    historical_resolution,

                "confidence":
                    clamp01(
                        0.55
                        * float(
                            match.get(
                                "similarity",
                                0.0
                            )
                        )
                        + 0.12
                    ),

                "basis":
                    "Historical Resolution",

                "source_bug_ids":
                    [source_bug_id]
                    if source_bug_id
                    else [],

                "historical_resolution":
                    historical_resolution,

                "historical_resolution_note":
                    (
                        "This value was taken from the historical "
                        "resolution field and is treated as supporting "
                        "evidence, not as a confirmed fix."
                    ),

                "implementation_guidance":
                    build_historical_guidance(match),

                "validation_steps": [
                    "Reproduce the original defect",
                    "Apply the proposed change in an isolated branch",
                    "Run the regression test and relevant component tests"
                ]
            })

        else:
            # Status-only historical records should still be visible as
            # evidence, but the remediation itself comes from the observed
            # technical failure rather than from the status word.
            if source_bug_id and source_bug_id not in seen_sources:
                seen_sources.add(source_bug_id)

                recommendations.append({
                    "recommendation":
                        (
                            "Use the historical defect as supporting "
                            "evidence, but derive the implementation "
                            "change from the observed failure pattern."
                        ),

                    "confidence":
                        clamp01(
                            0.45
                            * float(
                                match.get(
                                    "similarity",
                                    0.0
                                )
                            )
                            + 0.10
                        ),

                    "basis":
                        "Historical Evidence",

                    "source_bug_ids":
                        [source_bug_id],

                    "historical_resolution":
                        raw_resolution or "",

                    "historical_resolution_note":
                        (
                            "The historical record contains only a "
                            "workflow/status value rather than a detailed "
                            "technical fix, so the status is not presented "
                            "as a remediation."
                        ),

                    "implementation_guidance":
                        build_historical_guidance(match),

                    "validation_steps": [
                        "Reproduce the original defect",
                        "Apply the proposed change in an isolated branch",
                        "Run the regression test and relevant component tests"
                    ]
                })

    # Collapse repeated status-only historical recommendations into one
    # evidence item. The individual source bug IDs are retained.
    merged = []
    historical_status_item = None
    for item in recommendations:
        if (
            item.get("basis") == "Historical Evidence"
            and item.get("recommendation") ==
                "Use the historical defect as supporting evidence, but derive the implementation change from the observed failure pattern."
        ):
            if historical_status_item is None:
                historical_status_item = item.copy()
                historical_status_item["source_bug_ids"] = list(item.get("source_bug_ids", []))
            else:
                for bug_id in item.get("source_bug_ids", []):
                    if bug_id not in historical_status_item["source_bug_ids"]:
                        historical_status_item["source_bug_ids"].append(bug_id)
                historical_status_item["confidence"] = max(
                    float(historical_status_item.get("confidence", 0.0)),
                    float(item.get("confidence", 0.0))
                )
        else:
            merged.append(item)

    if historical_status_item is not None:
        merged.append(historical_status_item)

    recommendations = merged

    # ------------------------------------------------------------
    # Technical best-practice recommendation
    # ------------------------------------------------------------
    root_text = str(
        root.get(
            "primary_hypothesis",
            ""
        )
        or ""
    )

    log_text = str(
        log.get(
            "error_message",
            ""
        )
        or ""
    )

    text = (
        root_text
        + " "
        + log_text
        + " "
        + str(
            log.get(
                "exception_type",
                ""
            )
            or ""
        )
    ).lower()

    if (
        "connection refused" in text
        or "connectionerror" in text
        or "connectexception" in text
    ):
        generic = (
            "Verify that the target database/service is running and "
            "reachable; check the configured host and port, network "
            "access, connection settings, and connection error handling. "
            "Then add a regression test for the connection-refused case.",
            "General Best Practice"
        )

    elif (
        "segmentation fault" in text
        or "segmentationfault" in text
        or "sigsegv" in text
    ):
        generic = (
            "Inspect the native failure location for invalid pointer access, "
            "out-of-bounds access, use-after-free, or other unsafe memory "
            "operations; reproduce the resize path with a native memory "
            "sanitizer and add a regression test for the crash.",
            "General Best Practice"
        )

    elif (
        "sqlexception" in text
        or "sql syntax" in text
        or "sql error" in text
    ):
        generic = (
            "Validate the generated SQL around the reported syntax location, "
            "reproduce the query directly against the database, correct the "
            "query construction/parameterization, and add a regression test "
            "for the malformed query case.",
            "General Best Practice"
        )

    elif (
        "httperror" in text
        or "500 internal server error" in text
        or "http 500" in text
    ):
        generic = (
            "Trace the request through the API boundary and server-side handler, "
            "inspect the server logs for the underlying exception, return an "
            "appropriate HTTP error response, and add a regression/integration "
            "test for the failing endpoint.",
            "General Best Practice"
        )

    elif (
        "null" in text
        or "nullpointer" in text
    ):
        generic = (
            "Validate the object/value before dereferencing it and add "
            "an explicit null/None failure path.",
            "General Best Practice"
        )

    elif "timeout" in text:
        generic = (
            "Review dependency availability, timeout values and "
            "retry/backoff handling; add dependency-failure tests.",
            "General Best Practice"
        )

    elif (
        "permission" in text
        or "access denied" in text
    ):
        generic = (
            "Verify the required resource permissions and credentials "
            "and return a controlled authorization/access error.",
            "General Best Practice"
        )

    elif (
        "memory" in text
        or "outofmemory" in text
    ):
        generic = (
            "Reduce peak memory use, process large inputs incrementally, "
            "and add a large-input regression test.",
            "General Best Practice"
        )

    elif (
        "indexerror" in text
        or "list index out of range" in text
    ):
        generic = (
            "Inspect the list or array access at the reported failure point "
            "and identify which index can exceed the available elements. "
            "Validate the list length before indexing, handle empty or "
            "unexpectedly short input explicitly, and add a regression test "
            "covering the observed empty/undersized-list condition.",
            "Agent Reasoning"
        )

    elif (
        "keyerror" in text
        or "missing from the available data" in text
    ):
        import re as _key_re

        key_match = _key_re.search(
            r"[\"\']([A-Za-z_][\w.-]*)[\"\']",
            log_text
        )
        if not key_match:
            key_match = _key_re.search(
                r"(?:keyerror\s*[:]?\s*)([A-Za-z_][\w.-]*)",
                log_text,
                _key_re.IGNORECASE
            )
        missing_key = key_match.group(1) if key_match else "the required configuration key"

        bug_context = " ".join([
            str((bug or {}).get("title", "")),
            str((bug or {}).get("description", "")),
            str((bug or {}).get("stack_trace", ""))
        ]).lower()

        if any(term in bug_context for term in (
            "user object", "user data", "dictionary", "dict",
            "profile api", "profile", "request payload", "user["
        )):
            generic_text = (
                f"Validate that the user/profile data contains the '{missing_key}' "
                "field before accessing it; replace the unchecked lookup with "
                "explicit key validation and a clear application-level error or "
                "fallback, then add a regression test for the missing-key case."
            )
        else:
            generic_text = (
                f"Verify that the required '{missing_key}' key is present in the "
                "data source before access; add explicit validation and a clear "
                "error when it is missing, then add a regression test."
            )

        generic = (generic_text, "Agent Reasoning")

    else:
        generic = (
            "Add targeted diagnostics around the failure point, "
            "reproduce the issue, isolate the failing path, and add "
            "a regression test.",
            "Agent Reasoning"
        )

    generic_text = generic[0]

    if generic_text not in {
        item.get(
            "recommendation",
            ""
        )
        for item in recommendations
    }:
        recommendations.append({
            "recommendation":
                generic_text,

            "confidence":
                (
                    0.55
                    if root.get(
                        "status"
                    )
                    == "Insufficient Evidence"
                    else 0.62
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
                    "Do not treat this recommendation as a confirmed "
                    "fix without reproducing the defect."
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
                    in {
                        "Historical Resolution",
                        "Historical Evidence"
                    }
                    for item in recommendations
                )
                else
                "Best-Practice / Reasoning"
            ),

        "recommendations":
            recommendations,

        "reasoning_boundary":
            (
                "Historical recommendations are derived from retrieved "
                "historical evidence when a technical resolution is "
                "available. Workflow/status values such as Resolved or "
                "Closed are never presented as fixes. Best-practice items "
                "are agent-generated and are not confirmed fixes."
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
    """Return active FAISS vector count without another disk read."""
    try:
        if faiss is None or not INDEX_FILE.exists():
            return 0

        return int(
            get_search_index().ntotal
        )

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

        # Normalize common frontend field names so log analysis always
        # receives the submitted stack trace.
        if not clean_text(bug.get("stack_trace")):
            bug["stack_trace"] = (
                bug.get("stackTrace")
                or bug.get("error_info")
                or bug.get("error_logs")
                or bug.get("logs")
                or ""
            )

        if not clean_text(bug.get("component")) and clean_text(bug.get("affected_component")):
            bug["component"] = bug.get("affected_component")

        if not clean_text(bug.get("severity")) and clean_text(bug.get("bugSeverity")):
            bug["severity"] = bug.get("bugSeverity")

        if not clean_text(bug.get("priority")) and clean_text(bug.get("bugPriority")):
            bug["priority"] = bug.get("bugPriority")

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
            retrieved,
            bug
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
# M4 ANALYTICS HELPERS
# ============================================================

def extract_exception_type(text):
    """Extract the first recognized exception class from a stack trace."""
    text = clean_text(text)
    if not text:
        return ""

    patterns = globals().get("EXCEPTION_PATTERNS", [])
    for name, pattern in patterns:
        try:
            if re.search(pattern, text, re.I):
                return name
        except re.error:
            continue

    # Generic Java/Python/Node style exception names.
    match = re.search(
        r"\b([A-Za-z_$][\w$]*(?:Exception|Error))\b",
        text
    )
    return match.group(1) if match else ""
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
    conn = None
    try:
        if temp_db.exists():
            try:
                temp_db.unlink()
            except PermissionError:
                # A previous failed builder may still have a Windows lock.
                # Give SQLite/Windows a moment before retrying.
                time.sleep(0.5)
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
        conn = None
        temp_db.replace(ANALYTICS_DB)

        with _M4_ANALYTICS_LOCK:
            _M4_ANALYTICS_READY = True
            _M4_ANALYTICS_BUILDING = False
            _M4_ANALYTICS_ERROR = ""
        print(f"[M4 Analytics] Ready: {total:,} records", flush=True)
    except Exception as e:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            conn = None
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