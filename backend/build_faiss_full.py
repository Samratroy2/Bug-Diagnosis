import csv
import gc
import json
import sys
import time
csv.field_size_limit(sys.maxsize)
from pathlib import Path

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer


# ============================================================
# CONFIGURATION
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

CSV_FILE = ROOT / "data" / "defects.csv"

FAISS_FILE = ROOT / "data" / "defects.faiss"
METADATA_FILE = ROOT / "data" / "defects_metadata.json"

TEMP_FAISS_FILE = ROOT / "data" / "defects.faiss.tmp"
TEMP_METADATA_FILE = ROOT / "data" / "defects_metadata.json.tmp"

MODEL_NAME = "all-MiniLM-L6-v2"

EMBED_BATCH_SIZE = 256
MODEL_BATCH_SIZE = 32

EXPECTED_RECORDS = 1_311_079

CSV_COLUMNS = [
    "bug_id",
    "project",
    "title",
    "description",
    "stack_trace",
    "resolution",
    "severity",
    "priority",
    "affected_component",
    "source_file",
    "split",
]


# ============================================================
# TEXT PREPARATION
# ============================================================

def clean(value):
    if value is None:
        return ""

    return str(value).strip()


def record_text(row):
    parts = []

    fields = [
        ("Project", row.get("project")),
        ("Bug ID", row.get("bug_id")),
        ("Title", row.get("title")),
        ("Description", row.get("description")),
        ("Stack Trace", row.get("stack_trace")),
        ("Resolution", row.get("resolution")),
        ("Severity", row.get("severity")),
        ("Priority", row.get("priority")),
        ("Component", row.get("affected_component")),
    ]

    for label, value in fields:
        value = clean(value)

        if value:
            parts.append(f"{label}: {value}")

    text = "\n".join(parts)

    # Prevent extremely large Apache descriptions from
    # creating unnecessarily large model inputs.
    return text[:12000]


# ============================================================
# METADATA
# ============================================================

def metadata_from_row(row):
    return {
        "bug_id": clean(row.get("bug_id")),
        "project": clean(row.get("project")),
        "title": clean(row.get("title")),
        "description": clean(row.get("description")),
        "stack_trace": clean(row.get("stack_trace")),
        "resolution": clean(row.get("resolution")),
        "severity": clean(row.get("severity")),
        "priority": clean(row.get("priority")),
        "affected_component": clean(
            row.get("affected_component")
        ),
        "source_file": clean(row.get("source_file")),
        "split": clean(row.get("split")),
    }


# ============================================================
# BUILD INDEX
# ============================================================

def build_index():

    print("=" * 75, flush=True)
    print("BUGAI FULL FAISS INDEX BUILD", flush=True)
    print("=" * 75, flush=True)

    if not CSV_FILE.exists():
        print(
            f"ERROR: CSV not found: {CSV_FILE}",
            flush=True
        )
        sys.exit(1)

    print(
        f"Dataset : {CSV_FILE}",
        flush=True
    )

    print(
        f"Model   : {MODEL_NAME}",
        flush=True
    )

    print(
        f"Expected records: {EXPECTED_RECORDS:,}",
        flush=True
    )

    print(
        f"Embedding batch: {EMBED_BATCH_SIZE}",
        flush=True
    )

    print(
        f"Model batch: {MODEL_BATCH_SIZE}",
        flush=True
    )

    print(flush=True)

    # --------------------------------------------------------
    # Load embedding model
    # --------------------------------------------------------

    print(
        "Loading SentenceTransformer...",
        flush=True
    )

    model = SentenceTransformer(
        MODEL_NAME
    )

    dimension = (
        model.get_embedding_dimension()
    )

    print(
        f"Embedding dimension: {dimension}",
        flush=True
    )

    print(flush=True)

    # --------------------------------------------------------
    # Create FAISS index
    # --------------------------------------------------------

    index = faiss.IndexFlatIP(
        dimension
    )

    metadata = []

    processed = 0
    added = 0

    start_time = time.time()
    last_report = start_time

    # --------------------------------------------------------
    # Remove stale temporary files
    # --------------------------------------------------------

    if TEMP_FAISS_FILE.exists():
        TEMP_FAISS_FILE.unlink()

    if TEMP_METADATA_FILE.exists():
        TEMP_METADATA_FILE.unlink()

    # --------------------------------------------------------
    # Stream CSV
    # --------------------------------------------------------

    print(
        "Starting CSV streaming...",
        flush=True
    )

    print(flush=True)

    with CSV_FILE.open(
        "r",
        encoding="utf-8",
        newline=""
    ) as f:

        reader = csv.DictReader(f)

        if reader.fieldnames != CSV_COLUMNS:

            print(
                "ERROR: Unexpected CSV schema.",
                flush=True
            )

            print(
                "Found:",
                reader.fieldnames,
                flush=True
            )

            print(
                "Expected:",
                CSV_COLUMNS,
                flush=True
            )

            sys.exit(1)

        text_batch = []
        metadata_batch = []

        for row in reader:

            text_batch.append(
                record_text(row)
            )

            metadata_batch.append(
                metadata_from_row(row)
            )

            processed += 1

            if len(text_batch) >= EMBED_BATCH_SIZE:

                embeddings = model.encode(
                    text_batch,
                    batch_size=MODEL_BATCH_SIZE,
                    show_progress_bar=False,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                )

                embeddings = np.asarray(
                    embeddings,
                    dtype="float32"
                )

                index.add(
                    embeddings
                )

                metadata.extend(
                    metadata_batch
                )

                added += len(text_batch)

                text_batch.clear()
                metadata_batch.clear()

                del embeddings

                gc.collect()

                now = time.time()

                if now - last_report >= 5:

                    elapsed = (
                        now - start_time
                    )

                    rate = (
                        added / elapsed
                        if elapsed
                        else 0
                    )

                    percent = (
                        added /
                        EXPECTED_RECORDS *
                        100
                    )

                    print(
                        f"Processed: {processed:,} / "
                        f"{EXPECTED_RECORDS:,} "
                        f"({percent:.2f}%) | "
                        f"Indexed: {added:,} | "
                        f"Rate: {rate:,.0f} records/sec",
                        flush=True
                    )

                    last_report = now

        # ----------------------------------------------------
        # Final partial batch
        # ----------------------------------------------------

        if text_batch:

            embeddings = model.encode(
                text_batch,
                batch_size=MODEL_BATCH_SIZE,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )

            embeddings = np.asarray(
                embeddings,
                dtype="float32"
            )

            index.add(
                embeddings
            )

            metadata.extend(
                metadata_batch
            )

            added += len(text_batch)

            del embeddings

            gc.collect()

    # --------------------------------------------------------
    # Verify
    # --------------------------------------------------------

    print(flush=True)

    print(
        "=" * 75,
        flush=True
    )

    print(
        "INDEX BUILD FINISHED",
        flush=True
    )

    print(
        "=" * 75,
        flush=True
    )

    print(
        f"CSV records processed : {processed:,}",
        flush=True
    )

    print(
        f"FAISS vectors         : {index.ntotal:,}",
        flush=True
    )

    print(
        f"Metadata records      : {len(metadata):,}",
        flush=True
    )

    if processed != EXPECTED_RECORDS:

        print(
            "WARNING: CSV count differs "
            "from expected count.",
            flush=True
        )

    if index.ntotal != len(metadata):

        print(
            "ERROR: FAISS/metadata count mismatch.",
            flush=True
        )

        sys.exit(1)

    # --------------------------------------------------------
    # Save FAISS temporary file
    # --------------------------------------------------------

    print(
        "Writing FAISS index...",
        flush=True
    )

    faiss.write_index(
        index,
        str(TEMP_FAISS_FILE)
    )

    # --------------------------------------------------------
    # Save metadata
    # --------------------------------------------------------

    print(
        "Writing metadata...",
        flush=True
    )

    with TEMP_METADATA_FILE.open(
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            metadata,
            f,
            ensure_ascii=False,
            separators=(",", ":")
        )

    # --------------------------------------------------------
    # Replace old files
    # --------------------------------------------------------

    print(
        "Replacing old index files...",
        flush=True
    )

    if FAISS_FILE.exists():
        FAISS_FILE.unlink()

    if METADATA_FILE.exists():
        METADATA_FILE.unlink()

    TEMP_FAISS_FILE.replace(
        FAISS_FILE
    )

    TEMP_METADATA_FILE.replace(
        METADATA_FILE
    )

    # --------------------------------------------------------
    # Final statistics
    # --------------------------------------------------------

    elapsed = (
        time.time() - start_time
    )

    print(flush=True)

    print(
        "=" * 75,
        flush=True
    )

    print(
        "FAISS INDEX READY",
        flush=True
    )

    print(
        "=" * 75,
        flush=True
    )

    print(
        f"Vectors    : {index.ntotal:,}",
        flush=True
    )

    print(
        f"Metadata   : {len(metadata):,}",
        flush=True
    )

    print(
        f"Dimension  : {dimension}",
        flush=True
    )

    print(
        f"Time       : {elapsed / 60:,.1f} minutes",
        flush=True
    )

    if elapsed:

        print(
            f"Rate       : "
            f"{processed / elapsed:,.0f} records/sec",
            flush=True
        )

    print()

    print(
        f"FAISS     : {FAISS_FILE}",
        flush=True
    )

    print(
        f"Metadata  : {METADATA_FILE}",
        flush=True
    )

    print(
        "=" * 75,
        flush=True
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    build_index()