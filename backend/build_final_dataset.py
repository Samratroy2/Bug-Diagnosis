import csv
import sys
from pathlib import Path

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parent.parent

OLD_DEFECTS = ROOT / "data" / "defects.csv"
ECLIPSE_FILE = ROOT / "data" / "eclipse" / "eclipse_normalized.csv"
APACHE_FILE = ROOT / "data" / "apache" / "apache_normalized.csv"

OUTPUT_FILE = ROOT / "data" / "defects_final.csv"

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

# This was an old 100-row Eclipse sample already present
# inside the original defects.csv.
SAMPLE_SOURCE = "data/eclipse/sample_data.csv"


def read_csv(path):
    with path.open(
        "r",
        encoding="utf-8",
        newline=""
    ) as f:
        reader = csv.DictReader(f)

        for row in reader:
            yield row


def main():

    print("=" * 75)
    print("BUILDING FINAL BUGAI DATASET")
    print("=" * 75)

    output_tmp = OUTPUT_FILE.with_suffix(".tmp.csv")

    counts = {
        "old_mozilla": 0,
        "old_eclipse_sample_removed": 0,
        "eclipse": 0,
        "apache": 0,
        "total_written": 0,
    }

    with output_tmp.open(
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

        # --------------------------------------------------
        # 1. Existing defects.csv
        # --------------------------------------------------

        print()
        print("Processing existing defects.csv...")

        for row in read_csv(OLD_DEFECTS):

            source = row.get("source_file", "").strip()

            # Remove the old 100-row Eclipse sample.
            if source == SAMPLE_SOURCE:
                counts["old_eclipse_sample_removed"] += 1
                continue

            writer.writerow({
                column: row.get(column, "")
                for column in COLUMNS
            })

            counts["old_mozilla"] += 1
            counts["total_written"] += 1

        print(
            f"  Existing records kept: "
            f"{counts['old_mozilla']:,}"
        )

        print(
            f"  Eclipse sample removed: "
            f"{counts['old_eclipse_sample_removed']:,}"
        )

        # --------------------------------------------------
        # 2. Full Eclipse dataset
        # --------------------------------------------------

        print()
        print("Adding full Eclipse dataset...")

        for row in read_csv(ECLIPSE_FILE):

            writer.writerow({
                column: row.get(column, "")
                for column in COLUMNS
            })

            counts["eclipse"] += 1
            counts["total_written"] += 1

            if counts["eclipse"] % 10_000 == 0:
                print(
                    f"  Eclipse written: "
                    f"{counts['eclipse']:,}"
                )

        print(
            f"  Eclipse total: "
            f"{counts['eclipse']:,}"
        )

        # --------------------------------------------------
        # 3. Apache dataset
        # --------------------------------------------------

        print()
        print("Adding Apache dataset...")

        for row in read_csv(APACHE_FILE):

            writer.writerow({
                column: row.get(column, "")
                for column in COLUMNS
            })

            counts["apache"] += 1
            counts["total_written"] += 1

            if counts["apache"] % 100_000 == 0:
                print(
                    f"  Apache written: "
                    f"{counts['apache']:,}"
                )

        print(
            f"  Apache total: "
            f"{counts['apache']:,}"
        )

    # ------------------------------------------------------
    # Replace temporary output
    # ------------------------------------------------------

    if OUTPUT_FILE.exists():
        OUTPUT_FILE.unlink()

    output_tmp.replace(OUTPUT_FILE)

    print()
    print("=" * 75)
    print("FINAL DATASET COMPLETE")
    print("=" * 75)

    print(
        f"Existing records kept       : "
        f"{counts['old_mozilla']:,}"
    )

    print(
        f"Eclipse sample removed      : "
        f"{counts['old_eclipse_sample_removed']:,}"
    )

    print(
        f"Full Eclipse records added  : "
        f"{counts['eclipse']:,}"
    )

    print(
        f"Apache records added        : "
        f"{counts['apache']:,}"
    )

    print("-" * 75)

    print(
        f"FINAL RECORDS               : "
        f"{counts['total_written']:,}"
    )

    print()
    print("Output:")
    print(OUTPUT_FILE)

    print("=" * 75)


if __name__ == "__main__":
    main()