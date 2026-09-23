import csv
import sys
from pathlib import Path

from bson import BSON, InvalidBSON


ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = ROOT / "data" / "apache" / "issues.bson"
OUTPUT_FILE = ROOT / "data" / "apache" / "apache_normalized.csv"

PROGRESS_EVERY = 10_000


def safe_text(value):
    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    return str(value).strip()


def component_names(components):
    if not isinstance(components, list):
        return ""

    names = []

    for component in components:
        if isinstance(component, dict):
            name = safe_text(component.get("name"))
            if name:
                names.append(name)

    return "; ".join(names)


def read_bson_documents(path):
    """
    Stream BSON documents from a MongoDB BSON dump.

    Each document starts with a 4-byte little-endian document size.
    """
    with path.open("rb") as f:
        while True:
            header = f.read(4)

            if not header:
                break

            if len(header) != 4:
                raise ValueError("Incomplete BSON document header at end of file.")

            size = int.from_bytes(header, "little", signed=False)

            # BSON documents must be at least 5 bytes.
            if size < 5:
                raise ValueError(f"Invalid BSON document size: {size}")

            body = f.read(size - 4)

            if len(body) != size - 4:
                raise ValueError(
                    f"Incomplete BSON document: expected {size - 4} bytes, "
                    f"got {len(body)}"
                )

            yield BSON(header + body).decode()


def convert():

    if not INPUT_FILE.exists():
        print(f"ERROR: Input file not found:")
        print(INPUT_FILE)
        sys.exit(1)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    columns = [
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

    processed = 0
    written = 0
    failed = 0

    print("=" * 70)
    print("Apache JIRA BSON → BugAI CSV Converter")
    print("=" * 70)
    print(f"Input : {INPUT_FILE}")
    print(f"Output: {OUTPUT_FILE}")
    print()
    print("Streaming mode enabled.")
    print("The complete 8+ GB BSON file will NOT be loaded into RAM.")
    print()

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8",
        newline="",
    ) as output:

        writer = csv.DictWriter(
            output,
            fieldnames=columns,
            quoting=csv.QUOTE_MINIMAL,
        )

        writer.writeheader()

        for doc in read_bson_documents(INPUT_FILE):

            processed += 1

            try:
                issue_key = safe_text(
                    doc.get("key")
                    or doc.get("id")
                    or doc.get("_id")
                )

                project = safe_text(
                    doc.get("projectname")
                )

                title = safe_text(
                    doc.get("summary")
                )

                description = safe_text(
                    doc.get("description")
                )

                # If Apache does not provide a description,
                # use the summary as searchable text.
                if not description:
                    description = title

                priority_obj = doc.get("priority")

                if isinstance(priority_obj, dict):
                    priority = safe_text(
                        priority_obj.get("name")
                    )
                else:
                    priority = safe_text(priority_obj)

                status_obj = doc.get("status")

                if isinstance(status_obj, dict):
                    status = safe_text(
                        status_obj.get("name")
                    )
                else:
                    status = safe_text(status_obj)

                components = component_names(
                    doc.get("components")
                )

                row = {
                    "bug_id": issue_key,
                    "project": project,
                    "title": title,
                    "description": description,
                    "stack_trace": "",
                    "resolution": status,
                    "severity": "",
                    "priority": priority,
                    "affected_component": components,
                    "source_file": "apache/issues.bson",
                    "split": "rag",
                }

                # Skip documents without a usable issue ID.
                if not issue_key:
                    failed += 1
                    continue

                writer.writerow(row)
                written += 1

            except Exception as exc:
                failed += 1

                if failed <= 10:
                    print(
                        f"WARNING: Could not process document "
                        f"{processed}: {exc}"
                    )

            if processed % PROGRESS_EVERY == 0:
                print(
                    f"Processed: {processed:,} | "
                    f"Written: {written:,} | "
                    f"Skipped/failed: {failed:,}",
                    flush=True,
                )

    print()
    print("=" * 70)
    print("CONVERSION COMPLETE")
    print("=" * 70)
    print(f"Documents processed : {processed:,}")
    print(f"Records written     : {written:,}")
    print(f"Skipped/failed      : {failed:,}")
    print(f"Output file         : {OUTPUT_FILE}")
    print("=" * 70)


if __name__ == "__main__":
    convert()