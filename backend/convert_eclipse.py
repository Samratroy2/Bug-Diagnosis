import csv
import sys
from pathlib import Path

import pandas as pd


# ---------------------------------------------------------
# Paths
# ---------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent

INPUT_FILE = ROOT / "data" / "eclipse" / "eclipse_bug_reports.xlsx"
OUTPUT_FILE = ROOT / "data" / "eclipse" / "eclipse_normalized.csv"

SOURCE_FILE = "eclipse_bug_reports.xlsx"

# Normalized schema used by BugAI
COLUMNS = [
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


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def safe_text(value):
    """Convert a value to clean text."""
    if pd.isna(value):
        return ""

    return str(value).strip()


def normalize():
    print("=" * 70)
    print("ECLIPSE DATASET NORMALIZATION")
    print("=" * 70)

    if not INPUT_FILE.exists():
        print(f"ERROR: Input file not found:")
        print(INPUT_FILE)
        sys.exit(1)

    print(f"Input : {INPUT_FILE}")
    print(f"Output: {OUTPUT_FILE}")
    print()

    # -----------------------------------------------------
    # Read Excel
    # -----------------------------------------------------

    print("Reading Excel file...")

    df = pd.read_excel(
        INPUT_FILE,
        engine="openpyxl"
    )

    print(f"Rows loaded: {len(df):,}")
    print(f"Columns: {list(df.columns)}")
    print()

    # -----------------------------------------------------
    # Validate required columns
    # -----------------------------------------------------

    required_columns = [
        "Project",
        "Bug ID",
        "Severity Label",
        "Resolution Status",
        "Short Description",
    ]

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        print("ERROR: Missing required columns:")
        for column in missing:
            print(f"  - {column}")
        sys.exit(1)

    # -----------------------------------------------------
    # Prepare output
    # -----------------------------------------------------

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    csv.field_size_limit(sys.maxsize)

    written = 0
    skipped = 0
    duplicate_ids = 0

    seen_ids = set()

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8",
        newline=""
    ) as output:

        writer = csv.DictWriter(
            output,
            fieldnames=COLUMNS,
            quoting=csv.QUOTE_MINIMAL
        )

        writer.writeheader()

        # -------------------------------------------------
        # Convert rows
        # -------------------------------------------------

        for index, row in df.iterrows():

            bug_id = safe_text(row["Bug ID"])

            if not bug_id:
                skipped += 1
                continue

            # Track duplicate Bug IDs
            if bug_id in seen_ids:
                duplicate_ids += 1

            seen_ids.add(bug_id)

            project = safe_text(row["Project"])
            severity = safe_text(row["Severity Label"])
            resolution = safe_text(row["Resolution Status"])
            title = safe_text(row["Short Description"])

            # This Eclipse dataset does not contain a
            # separate long description, so use the title
            # as the fallback description.
            description = title

            output_row = {
                "bug_id": bug_id,
                "project": project,
                "title": title,
                "description": description,
                "stack_trace": "",
                "resolution": resolution,
                "severity": severity,
                "priority": "",
                "affected_component": "",
                "source_file": SOURCE_FILE,
                "split": "rag",
            }

            writer.writerow(output_row)

            written += 1

            if written % 10_000 == 0:
                print(
                    f"Processed: {written:,} rows"
                )

    # -----------------------------------------------------
    # Summary
    # -----------------------------------------------------

    print()
    print("=" * 70)
    print("ECLIPSE NORMALIZATION COMPLETE")
    print("=" * 70)

    print(f"Rows loaded       : {len(df):,}")
    print(f"Records written   : {written:,}")
    print(f"Skipped rows      : {skipped:,}")
    print(f"Duplicate IDs     : {duplicate_ids:,}")
    print(f"Unique Bug IDs    : {len(seen_ids):,}")
    print()
    print(f"Output file:")
    print(OUTPUT_FILE)
    print("=" * 70)


if __name__ == "__main__":
    normalize()