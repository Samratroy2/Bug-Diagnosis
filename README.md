# BugAI — Intelligent Bug Diagnosis Platform

## Milestone 3 implemented

This version extends the Milestone 2 pipeline with four complete M3 modules:

1. **Root Cause Agent** — retrieves semantically relevant historical defects and produces structured root-cause hypotheses, confidence, reasoning, and supporting evidence.
2. **Duplicate Detection Agent** — classifies historical matches as `Duplicate`, `Related`, or `New / Unmatched` using configurable semantic thresholds.
3. **Remediation Agent** — generates evidence-backed remediation recommendations from historical resolutions, plus clearly labelled best-practice/agent-reasoning recommendations.
4. **Structured Findings Display** — presents Triage, Log Analysis, Root Cause, Duplicate Detection, Remediation, and retrieved evidence in one diagnosis report.

## Pipeline

`Bug Submission → Triage → Log Analysis → Historical RAG Retrieval → Root Cause → Duplicate Detection → Remediation → Findings Display`

## Run

From the project root:

```powershell
python -m pip install -r backend/requirements.txt
python backend/app.py
```

Then open:

`http://127.0.0.1:5000/`

Do not open the HTML with `file://`; the Flask server serves the shared sidebar and API.

## Knowledge base

`data/defects.csv` is the normalized six-record demo corpus retained from the supplied project's existing vector-store metadata. The existing FAISS index and metadata are preserved under `backend/vector_store/`.

To rebuild the index after changing `data/defects.csv`, call:

```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:5000/api/knowledge-base/index
```

## M3 API

### Analyze

`POST /api/analyze`

Returns:

- `triage`
- `log_analysis`
- `root_cause`
- `duplicate_detection`
- `remediation`
- `retrieval`
- `bug_context`

### M3 validation

`GET /api/validation/milestone3`

The validation suite covers:

- known duplicate
- related issue
- unrelated/new issue

Configured thresholds:

- Duplicate: `>= 0.82`
- Related: `>= 0.65`
- Below related threshold: `New / Unmatched`

## Important interpretation rule

Historical records are displayed as **retrieved evidence**. Root-cause hypotheses and best-practice remediation are labelled as agent-generated reasoning. A low-confidence result is reported as **Insufficient Evidence** rather than being presented as a confirmed diagnosis.
