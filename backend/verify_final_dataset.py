import csv
import sys
import os
from collections import Counter

csv.field_size_limit(sys.maxsize)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(ROOT, "data", "defects_final.csv")

EXPECTED_TOTAL = 1_311_079

sources = Counter()
projects = Counter()
records = 0

print("=" * 70)
print("FINAL DATASET VERIFICATION")
print("=" * 70)

with open(
    FILE,
    "r",
    encoding="utf-8",
    newline=""
) as f:

    reader = csv.DictReader(f)

    expected_columns = [
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

    print("Columns:")
    print(reader.fieldnames)
    print()

    if reader.fieldnames != expected_columns:
        print("ERROR: Schema mismatch!")
        sys.exit(1)

    for row in reader:
        records += 1
        sources[row["source_file"]] += 1
        projects[row["project"]] += 1

print("Record count:", f"{records:,}")
print()

print("Expected:", f"{EXPECTED_TOTAL:,}")

if records == EXPECTED_TOTAL:
    print("COUNT CHECK: PASS")
else:
    print("COUNT CHECK: FAIL")

print()
print("Records by source:")
for source, count in sources.items():
    print(f"  {source}: {count:,}")

print()
print("Top 20 projects:")

for project, count in projects.most_common(20):
    print(f"  {project}: {count:,}")

print()
print(
    "File size:",
    f"{os.path.getsize(FILE) / (1024 * 1024):,.2f} MB"
)

print()
print("=" * 70)
print("VERIFICATION COMPLETE")
print("=" * 70)