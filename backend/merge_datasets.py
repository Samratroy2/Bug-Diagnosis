import csv
import sys
from pathlib import Path
from collections import defaultdict

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parent.parent

MOZILLA_FILE = ROOT / "data" / "defects.csv"
ECLIPSE_FILE = ROOT / "data" / "eclipse" / "eclipse_normalized.csv"
APACHE_FILE = ROOT / "data" / "apache" / "apache_normalized.csv"

OUTPUT_FILE = ROOT / "data" / "defects_merged.csv"

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


def read_csv_records(path):
    """Stream records from a CSV file."""
    with path.open(
        "r",
        encoding="utf-8",
        newline=""
    ) as f:
        reader = csv.DictReader(f)

        for row in reader:
            yield row


def record_key(row):
    """
    Dataset-aware identity.

    Same bug ID can legitimately exist in different projects.
    """
    return (
        row.get("project", "").strip().lower(),
        row.get("bug_id", "").strip()
    )


def main():

    print("=" * 75)
    print("BUGAI DATASET MERGE")
    print("=" * 75)

    input_files = [
        ("Mozilla / Existing", MOZILLA_FILE),
        ("Eclipse", ECLIPSE_FILE),
        ("Apache", APACHE_FILE),
    ]

    for name, path in input_files:
        if not path.exists():
            print(f"ERROR: Missing {name} file:")
            print(path)
            sys.exit(1)

    # ---------------------------------------------------------
    # First pass: collect identities
    # ---------------------------------------------------------

    seen = set()

    dataset_counts = defaultdict(int)
    duplicate_counts = defaultdict(int)
    cross_dataset_collisions = []

    print()
    print("Scanning datasets...")
    print()

    for dataset_name, path in input_files:

        print(f"Scanning {dataset_name}:")
        print(f"  {path}")

        count = 0

        for row in read_csv_records(path):

            count += 1

            key = record_key(row)

            if key in seen:
                duplicate_counts[dataset_name] += 1

                if len(cross_dataset_collisions) < 20:
                    cross_dataset_collisions.append(
                        (dataset_name, key)
                    )
            else:
                seen.add(key)

        dataset_counts[dataset_name] = count

        print(f"  Records: {count:,}")
        print()

    # ---------------------------------------------------------
    # Summary of identity check
    # ---------------------------------------------------------

    total_input = sum(dataset_counts.values())
    total_duplicates = sum(duplicate_counts.values())

    print("=" * 75)
    print("IDENTITY CHECK")
    print("=" * 75)

    for name in dataset_counts:
        print(
            f"{name:25} "
            f"{dataset_counts[name]:>12,} records"
        )

    print()
    print(f"Total input records     : {total_input:,}")
    print(f"Duplicate identities    : {total_duplicates:,}")
    print(f"Unique identities       : {len(seen):,}")

    if cross_dataset_collisions:
        print()
        print(
            "WARNING: Existing duplicate identities found."
        )

        print("First collisions:")

        for dataset_name, key in cross_dataset_collisions:
            print(
                f"  {dataset_name}: "
                f"project={key[0]!r}, bug_id={key[1]!r}"
            )

    else:
        print()
        print(
            "No duplicate (project, bug_id) identities found."
        )

    # ---------------------------------------------------------
    # Create merged file
    # ---------------------------------------------------------

    print()
    print("=" * 75)
    print("CREATING MERGED DATASET")
    print("=" * 75)

    temporary_file = OUTPUT_FILE.with_suffix(".tmp.csv")

    written = 0
    skipped_duplicates = 0

    # We keep identities in memory, but NOT all records.
    written_keys = set()

    with temporary_file.open(
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

        for dataset_name, path in input_files:

            print()
            print(f"Writing {dataset_name}...")

            dataset_written = 0

            for row in read_csv_records(path):

                key = record_key(row)

                if key in written_keys:
                    skipped_duplicates += 1
                    continue

                writer.writerow({
                    column: row.get(column, "")
                    for column in COLUMNS
                })

                written_keys.add(key)

                written += 1
                dataset_written += 1

                if dataset_written % 100_000 == 0:
                    print(
                        f"  Written: "
                        f"{dataset_written:,}"
                    )

            print(
                f"  Dataset written: "
                f"{dataset_written:,}"
            )

    # ---------------------------------------------------------
    # Replace temporary file
    # ---------------------------------------------------------

    if OUTPUT_FILE.exists():
        OUTPUT_FILE.unlink()

    temporary_file.replace(OUTPUT_FILE)

    # ---------------------------------------------------------
    # Final summary
    # ---------------------------------------------------------

    print()
    print("=" * 75)
    print("MERGE COMPLETE")
    print("=" * 75)

    print(
        f"Input records       : {total_input:,}"
    )

    print(
        f"Duplicates skipped  : {skipped_duplicates:,}"
    )

    print(
        f"Records written     : {written:,}"
    )

    print()
    print("Output:")
    print(OUTPUT_FILE)

    print("=" * 75)


if __name__ == "__main__":
    main()