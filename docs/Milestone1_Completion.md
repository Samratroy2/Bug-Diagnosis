# Milestone 1 Completion Checklist

## 1. Study and analysis
- Defect analysis workflow represented in `Workflow/`.
- Bug report structure documented in the workflow page.
- RAG architecture represented in `Architecture/`.
- Semantic similarity demonstrated in `Semantic-Similarity/`.

## 2. Architecture design
- Five-agent design:
  1. Triage Agent
  2. Log Analysis Agent
  3. Root Cause Agent
  4. Duplicate Detection Agent
  5. Remediation Agent
- Orchestration flow documented.
- Historical-defect data model documented.
- RAG pipeline documented.

## 3. Bug Submission Module
- Title, project, severity and description.
- Stack trace/error logs.
- TXT, LOG, JSON and CSV upload.
- 10 MB client-side file-size limit.
- Backend analysis endpoint.

## 4. Historical Defect Knowledge Base
- Normalized CSV schema.
- Cleaning/normalization.
- Chunking with overlap.
- Sentence-transformer embedding generation.
- FAISS vector indexing.
- Top-K semantic retrieval.
- Project filtering.
- Kaggle CSV normalization utility: `backend/import_kaggle.py`.

## Validation
Run:
```bash
pip install -r backend/requirements.txt
python backend/app.py
```
Then open:
`http://127.0.0.1:5000/Dashboard/dashboard.html`

Build the index once from the Knowledge Base page. Then test Semantic Similarity and Bug Submission.

## Important dataset statement
The included `data/defects.csv` is a small seed corpus for reproducible testing. It is not claimed to be the full Kaggle corpus. For a submission requiring the actual public Mozilla/Apache/Eclipse Kaggle datasets, import the approved downloaded CSV exports with `backend/import_kaggle.py`, then rebuild the index.
