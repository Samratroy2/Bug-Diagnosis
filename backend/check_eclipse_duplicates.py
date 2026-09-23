import csv
import sys
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = ROOT / "data" / "eclipse" / "eclipse_normalized.csv"

FIELDS_TO_COMPARE = [
    "project",
    "title",
    "description",
    "resolution",
    "severity",
    "priority",
    "affected_component",
]


def main():
    print("=" * 70)
    print("CHECKING ECLIPSE DUPLICATE RECORDS")
    print("=" * 70)

    groups = defaultdict(list)

    with INPUT_FILE.open(
        "r",
        encoding="utf-8",
        newline=""
    ) as f:
        reader = csv.DictReader(f)

        for row in reader:
            groups[row["bug_id"]].append(row)

    duplicates = [
        rows
        for rows in groups.values()
        if len(rows) > 1
    ]

    print(f"Duplicate groups: {len(duplicates)}")
    print()

    identical_groups = 0
    different_groups = 0

    for rows in duplicates:
        first = rows[0]
        second = rows[1]

        identical = True
        differences = []

        for field in FIELDS_TO_COMPARE:
            if first[field] != second[field]:
                identical = False
                differences.append(
                    (
                        field,
                        first[field],
                        second[field]
                    )
                )

        if identical:
            identical_groups += 1
        else:
            different_groups += 1

        # Show first 10 duplicate groups
        if identical_groups + different_groups <= 10:
            print(f"BUG ID: {first['bug_id']}")
            print(f"IDENTICAL: {identical}")

            if differences:
                for field, value1, value2 in differences:
                    print(f"  {field}:")
                    print(f"    Record 1: {value1[:300]!r}")
                    print(f"    Record 2: {value2[:300]!r}")

            print("-" * 70)

    print()
    print("=" * 70)
    print("DUPLICATE ANALYSIS COMPLETE")
    print("=" * 70)
    print(f"Duplicate groups : {len(duplicates):,}")
    print(f"Identical groups : {identical_groups:,}")
    print(f"Different groups : {different_groups:,}")
    print("=" * 70)


if __name__ == "__main__":
    main()