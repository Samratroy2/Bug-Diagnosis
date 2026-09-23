"""
BugAI Dataset Importer
======================

Imports Mozilla / Apache / Eclipse CSV datasets into BugAI's
normalized historical knowledge base.

IMPORTANT:
-----------
RAG / Historical Knowledge Base:
    - normal/full CSV files
    - fix.csv
    - historical defect CSV files
    - sample_data.csv

NOT added to RAG:
    - *_train.csv
    - *_test.csv

Validation:
    - *_test.csv files can be collected into m2_validation.csv
      when they contain severity / priority / component labels.

Usage:
    python backend/import_datasets.py --all

    python backend/import_datasets.py data/mozilla --project Mozilla

    python backend/import_datasets.py data/eclipse/sample_data.csv --project Eclipse

After importing:
    POST /api/knowledge-base/index

The importer does NOT build the FAISS index itself.
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path


# ============================================================
# CSV FIELD SIZE FIX
# ============================================================

# Public bug datasets can contain very large descriptions,
# comments, logs or patches. Python's csv module normally
# limits a field to 131072 characters.
#
# Increase the limit so large bug records can be read safely.

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
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

DATA = ROOT / "data"

OUT = DATA / "defects.csv"

VALIDATION_OUT = DATA / "m2_validation.csv"

MANIFEST_OUT = DATA / "dataset_manifest.json"


# ============================================================
# NORMALIZED SCHEMA
# ============================================================

SCHEMA = [
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
# COLUMN ALIASES
# ============================================================

ALIASES = {

    "bug_id": [
        "bug_id",
        "bug id",
        "id",
        "issue_id",
        "issue id",
        "issue_key",
        "issue key",
        "key",
        "bug",
        "bug number",
        "bug_number",
        "ticket",
        "ticket_id",
    ],

    "title": [
        "title",
        "summary",
        "bug_title",
        "issue_title",
        "subject",
        "name",
    ],

    "description": [
        "description",
        "details",
        "bug_description",
        "body",
        "comment",
        "comments",
        "report",
        "text",
        "long_description",
        "long description",
    ],

    "stack_trace": [
        "stack_trace",
        "stacktrace",
        "stack trace",
        "traceback",
        "error_log",
        "error log",
        "logs",
        "log",
        "error",
        "exception",
        "stack",
        "stderr",
    ],

    "resolution": [
        "resolution",
        "fix",
        "solution",
        "fixed_by",
        "fixed by",
        "resolution_description",
        "resolution description",
        "patch",
        "commit",
        "fix_description",
        "fix description",
    ],

    "severity": [
        "severity",
        "sev",
        "bug_severity",
        "bug severity",
        "severity_level",
        "severity level",
        "sev_label",
        "severity_label",
    ],

    "priority": [
        "priority",
        "prio",
        "bug_priority",
        "bug priority",
        "priority_level",
        "priority level",
    ],

    "affected_component": [
        "affected_component",
        "affected component",
        "component",
        "component_name",
        "component name",
        "module",
        "product",
        "package",
        "subcomponent",
        "sub_component",
    ],
}


# ============================================================
# TEXT UTILITIES
# ============================================================

def normalize_name(value):
    """
    Convert column names into a normalized representation.

    Example:
        "Bug ID" -> "bug_id"
        "Issue-Key" -> "issue_key"
    """

    return re.sub(
        r"[^a-z0-9]+",
        "_",
        str(value).strip().lower()
    ).strip("_")


def clean(value):
    """
    Normalize whitespace while preserving the actual content.
    """

    if value is None:
        return ""

    return re.sub(
        r"\s+",
        " ",
        str(value)
    ).strip()


def choose(row, candidates):
    """
    Find the first non-empty value matching one of the aliases.
    """

    normalized = {
        normalize_name(k): v
        for k, v in row.items()
    }

    for candidate in candidates:

        key = normalize_name(candidate)

        if key not in normalized:
            continue

        value = clean(normalized[key])

        if value:
            return value

    return ""


# ============================================================
# SPLIT DETECTION
# ============================================================

def infer_split(path):
    """
    Detect train/test/full based on filename.
    """

    name = path.stem.lower()

    if name.endswith("_train") or "_train" in name:
        return "train"

    if name.endswith("_test") or "_test" in name:
        return "test"

    return "full"


# ============================================================
# RAG INCLUSION
# ============================================================

def is_rag_file(path):
    """
    Decide whether a CSV should enter the historical RAG KB.

    Training and testing datasets are deliberately excluded.
    """

    split = infer_split(path)

    if split in {"train", "test"}:
        return False

    return True


# ============================================================
# PROJECT DETECTION
# ============================================================

def infer_project(path):
    """
    Infer project from folder name.
    """

    parts = {
        p.lower()
        for p in path.parts
    }

    for name, project in (
        ("mozilla", "Mozilla"),
        ("apache", "Apache"),
        ("eclipse", "Eclipse"),
    ):

        if name in parts:
            return project

    return "Custom Project"


# ============================================================
# CSV DISCOVERY
# ============================================================

def discover_csvs(target):
    """
    Recursively find CSV files.
    """

    target = Path(target)

    if target.is_file():

        if target.suffix.lower() == ".csv":
            return [target]

        return []

    if target.is_dir():

        return sorted(
            p
            for p in target.rglob("*.csv")
            if p.is_file()
        )

    return []


# ============================================================
# CSV READER
# ============================================================

def read_csv(path):
    """
    Read CSV using UTF-8 first and Latin-1 fallback.

    Large CSV fields are supported because csv.field_size_limit()
    is increased at module startup.
    """

    try:

        with path.open(
            "r",
            encoding="utf-8-sig",
            newline=""
        ) as f:

            reader = csv.DictReader(f)

            return list(reader)

    except UnicodeDecodeError:

        with path.open(
            "r",
            encoding="latin-1",
            newline=""
        ) as f:

            reader = csv.DictReader(f)

            return list(reader)


# ============================================================
# COLUMN MAPPING INFORMATION
# ============================================================

def get_mapped_columns(path):
    """
    Return the actual source columns that map to our normalized
    fields.
    """

    rows = read_csv(path)

    if not rows:
        return {}

    source_columns = list(rows[0].keys())

    normalized_columns = [
        normalize_name(c)
        for c in source_columns
        if c is not None
    ]

    mapped = {}

    for field, aliases in ALIASES.items():

        alias_keys = {
            normalize_name(alias)
            for alias in aliases
        }

        mapped[field] = next(
            (
                column
                for column in normalized_columns
                if column in alias_keys
            ),
            None
        )

    return mapped


# ============================================================
# NORMALIZE ROWS
# ============================================================

def normalize_rows(path, project):
    """
    Convert source CSV rows into BugAI's normalized schema.
    """

    rows = read_csv(path)

    output = []

    split = infer_split(path)

    for number, row in enumerate(rows, start=1):

        bug_id = choose(
            row,
            ALIASES["bug_id"]
        )

        if not bug_id:

            bug_id = (
                f"{project[:3].upper()}-"
                f"{path.stem.upper()}-"
                f"{number:06d}"
            )

        output.append({

            "bug_id":
                bug_id,

            "project":
                project,

            "title":
                choose(
                    row,
                    ALIASES["title"]
                )
                or "Imported defect",

            "description":
                choose(
                    row,
                    ALIASES["description"]
                ),

            "stack_trace":
                choose(
                    row,
                    ALIASES["stack_trace"]
                ),

            "resolution":
                choose(
                    row,
                    ALIASES["resolution"]
                ),

            "severity":
                choose(
                    row,
                    ALIASES["severity"]
                ),

            "priority":
                choose(
                    row,
                    ALIASES["priority"]
                ),

            "affected_component":
                choose(
                    row,
                    ALIASES["affected_component"]
                ),

            "source_file":
                str(
                    path.relative_to(ROOT)
                ).replace("\\", "/"),

            "split":
                split,
        })

    return output


# ============================================================
# WRITE CSV
# ============================================================

def write_csv(path, rows):

    with path.open(
        "w",
        encoding="utf-8",
        newline=""
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=SCHEMA,
            extrasaction="ignore"
        )

        writer.writeheader()

        writer.writerows(rows)


# ============================================================
# MAIN
# ============================================================

def main():

    parser = argparse.ArgumentParser(
        description="Import BugAI Mozilla / Apache / Eclipse datasets"
    )

    parser.add_argument(
        "target",
        nargs="?",
        help="CSV file or directory"
    )

    parser.add_argument(
        "--project",
        choices=[
            "Mozilla",
            "Apache",
            "Eclipse"
        ],
        help="Project name for a custom target"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Scan data/mozilla, data/apache and data/eclipse"
    )

    args = parser.parse_args()


    # ========================================================
    # DETERMINE TARGETS
    # ========================================================

    targets = []

    if args.all:

        targets = [

            (DATA / name, project)

            for name, project in (
                ("mozilla", "Mozilla"),
                ("apache", "Apache"),
                ("eclipse", "Eclipse"),
            )

            if (DATA / name).exists()
        ]

    elif args.target:

        path = Path(args.target)

        if not path.is_absolute():

            path = ROOT / path

        targets = [
            (
                path,
                args.project or infer_project(path)
            )
        ]

    else:

        parser.error(
            "Provide a CSV/directory or use --all"
        )


    # ========================================================
    # STORAGE
    # ========================================================

    rag_rows = []

    validation_rows = []

    manifest = []

    total_files = 0

    rag_files = 0

    skipped_files = 0


    # ========================================================
    # PROCESS FILES
    # ========================================================

    for target, project in targets:

        print()
        print(
            f"Scanning {project}: {target}"
        )

        files = discover_csvs(target)

        if not files:

            print(
                f"WARNING: No CSV files found: {target}"
            )

            continue


        for path in files:

            total_files += 1

            try:

                rows = normalize_rows(
                    path,
                    project
                )

                mapped_columns = get_mapped_columns(
                    path
                )

            except Exception as exc:

                print()
                print(
                    f"[ERROR] Could not read:"
                )

                print(
                    f"        {path.relative_to(ROOT)}"
                )

                print(
                    f"        {type(exc).__name__}: {exc}"
                )

                print(
                    "        File skipped."
                )

                manifest.append({

                    "file":
                        str(
                            path.relative_to(ROOT)
                        ).replace("\\", "/"),

                    "project":
                        project,

                    "split":
                        infer_split(path),

                    "rows":
                        0,

                    "used_for_rag":
                        False,

                    "status":
                        "error",

                    "error":
                        str(exc),

                    "mapped_columns":
                        {},
                })

                continue


            split = infer_split(path)

            rag_enabled = is_rag_file(path)


            # =================================================
            # MANIFEST
            # =================================================

            manifest.append({

                "file":
                    str(
                        path.relative_to(ROOT)
                    ).replace("\\", "/"),

                "project":
                    project,

                "split":
                    split,

                "rows":
                    len(rows),

                "used_for_rag":
                    rag_enabled,

                "status":
                    "ok",

                "mapped_columns":
                    mapped_columns,
            })


            # =================================================
            # RAG DATA
            # =================================================

            if rag_enabled:

                rag_rows.extend(rows)

                rag_files += 1

                print(
                    f"[RAG]       "
                    f"{project:<8} "
                    f"{str(path.relative_to(ROOT)):<55} "
                    f"{len(rows):>8} rows"
                )


            # =================================================
            # TEST DATA
            # =================================================

            else:

                skipped_files += 1

                print(
                    f"[SKIP RAG] "
                    f"{project:<8} "
                    f"{str(path.relative_to(ROOT)):<55} "
                    f"{len(rows):>8} rows "
                    f"({split})"
                )

                # Test data is kept separately for validation.
                if split == "test":

                    for row in rows:

                        has_label = any(
                            row.get(field)
                            for field in (
                                "severity",
                                "priority",
                                "affected_component"
                            )
                        )

                        if has_label:

                            validation_rows.append(row)


    # ========================================================
    # DEDUPLICATE RAG RECORDS
    # ========================================================

    dedup = {}

    for row in rag_rows:

        key = (
            row.get("project", ""),
            row.get("source_file", ""),
            row.get("bug_id", "")
        )

        dedup[key] = row

    rag_rows = list(
        dedup.values()
    )


    # ========================================================
    # DEDUPLICATE VALIDATION RECORDS
    # ========================================================

    validation_dedup = {}

    for row in validation_rows:

        key = (
            row.get("project", ""),
            row.get("source_file", ""),
            row.get("bug_id", "")
        )

        validation_dedup[key] = row

    validation_rows = list(
        validation_dedup.values()
    )


    # ========================================================
    # WRITE RAG KNOWLEDGE BASE
    # ========================================================

    write_csv(
        OUT,
        rag_rows
    )


    # ========================================================
    # WRITE VALIDATION DATA
    # ========================================================

    write_csv(
        VALIDATION_OUT,
        validation_rows
    )


    # ========================================================
    # MANIFEST SUMMARY
    # ========================================================

    project_counts = {}

    source_counts = {}

    for row in rag_rows:

        project = row.get(
            "project",
            "Unknown"
        )

        source = row.get(
            "source_file",
            "Unknown"
        )

        project_counts[project] = (
            project_counts.get(project, 0) + 1
        )

        source_counts[source] = (
            source_counts.get(source, 0) + 1
        )


    manifest_data = {

        "files":
            manifest,

        "summary": {

            "total_files_scanned":
                total_files,

            "rag_files":
                rag_files,

            "training_testing_files_skipped_from_rag":
                skipped_files,

            "total_normalized_rag_records":
                len(rag_rows),

            "validation_records":
                len(validation_rows),

            "records_by_project":
                project_counts,

            "records_by_source":
                source_counts,
        },

        "knowledge_base":
            str(
                OUT.relative_to(ROOT)
            ).replace("\\", "/"),

        "validation_file":
            str(
                VALIDATION_OUT.relative_to(ROOT)
            ).replace("\\", "/"),
    }


    MANIFEST_OUT.write_text(

        json.dumps(
            manifest_data,
            indent=2,
            ensure_ascii=False
        ),

        encoding="utf-8"
    )


    # ========================================================
    # FINAL SUMMARY
    # ========================================================

    print()
    print("=" * 75)
    print("BUGAI DATASET IMPORT COMPLETE")
    print("=" * 75)

    print(
        f"Files scanned              : {total_files}"
    )

    print(
        f"Files used for RAG         : {rag_files}"
    )

    print(
        f"Train/Test files skipped   : {skipped_files}"
    )

    print(
        f"Normalized RAG records     : {len(rag_rows)}"
    )

    print(
        f"M2 validation records      : {len(validation_rows)}"
    )

    print()
    print("Records by project:")

    for project, count in sorted(
        project_counts.items()
    ):

        print(
            f"  {project:<12}: {count}"
        )

    print()
    print(
        f"Knowledge base             : {OUT}"
    )

    print(
        f"Validation file            : {VALIDATION_OUT}"
    )

    print(
        f"Manifest                   : {MANIFEST_OUT}"
    )

    print()
    print(
        "IMPORTANT:"
    )

    print(
        "The FAISS index must now be rebuilt."
    )

    print(
        "Start Flask and call:"
    )

    print(
        "POST /api/knowledge-base/index"
    )

    print("=" * 75)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()