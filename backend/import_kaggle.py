"""
Normalize a downloaded public Mozilla/Apache/Eclipse bug CSV into BugAI's schema.

Usage:
    python backend/import_kaggle.py path/to/source.csv Mozilla
    python backend/import_kaggle.py path/to/source.csv Apache
    python backend/import_kaggle.py path/to/source.csv Eclipse

The script does not download datasets or require Kaggle credentials.
It lets you take the approved Kaggle export and normalize it before
running the RAG indexing pipeline.
"""
import csv, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "defects.csv"

ALIASES = {
    "bug_id": ["bug_id","id","issue_id","issue key","bug"],
    "title": ["title","summary","bug_title","issue_title"],
    "description": ["description","details","bug_description","body"],
    "stack_trace": ["stack_trace","stacktrace","error","error_log","logs","log"],
    "resolution": ["resolution","fix","solution","fixed_by","resolution_description"],
}

def normalize_name(x):
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in str(x)).strip("_")

def choose(row, candidates):
    normalized = {normalize_name(k): v for k,v in row.items()}
    for c in candidates:
        if normalize_name(c) in normalized:
            return normalized[normalize_name(c)] or ""
    return ""

def main():
    if len(sys.argv) != 3 or sys.argv[1] in {"-h","--help"}:
        print("Usage: python backend/import_kaggle.py SOURCE.csv Mozilla|Apache|Eclipse")
        return 0 if len(sys.argv) != 3 else 1

    source = Path(sys.argv[1])
    project = sys.argv[2]
    if project not in {"Mozilla","Apache","Eclipse"}:
        raise SystemExit("Project must be Mozilla, Apache or Eclipse.")
    if not source.exists():
        raise SystemExit(f"File not found: {source}")

    with source.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    existing = []
    if OUT.exists():
        with OUT.open("r", encoding="utf-8", newline="") as f:
            existing = list(csv.DictReader(f))

    start = len(existing) + 1
    added = []
    for i, row in enumerate(rows, start=start):
        bug_id = choose(row, ALIASES["bug_id"]) or f"{project[:3].upper()}-{i:05d}"
        added.append({
            "bug_id": str(bug_id),
            "project": project,
            "title": choose(row, ALIASES["title"]) or "Imported defect",
            "description": choose(row, ALIASES["description"]),
            "stack_trace": choose(row, ALIASES["stack_trace"]),
            "resolution": choose(row, ALIASES["resolution"]),
        })

    merged = existing + added
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["bug_id","project","title","description","stack_trace","resolution"])
        writer.writeheader()
        writer.writerows(merged)

    print(f"Imported {len(added)} {project} records into {OUT}")
    print("Rebuild the FAISS index from the Knowledge Base page or POST /api/knowledge-base/index.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
