# BugAI — Milestone 2 Complete Prototype

## Project
**Creation of Intelligent Bug Diagnosis Platform with Fix Recommendation Assistance**

This version completes the Milestone 1 prototype with:
1. Defect-analysis workflow study/representation.
2. System architecture, five-agent responsibilities, orchestration and knowledge-base data model.
3. Bug submission with direct text input and TXT/LOG/JSON/CSV upload support.
4. Historical-defect RAG prototype with cleaning, chunking, sentence-transformer embeddings, FAISS vector indexing and semantic retrieval.

## Project Structure
```text
BugAI_Milestone1_Full/
├── sidebar.html
├── sidebar.css
├── sidebar.js
├── Dashboard/
├── Bug-Submission/
├── Workflow/
├── Architecture/
├── Knowledge-Base/
├── Semantic-Similarity/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── vector_store/
└── data/
    └── defects.csv
```

## Run
### 1. Create a virtual environment
```bash
python -m venv .venv
```

### 2. Activate it
Windows:
```bash
.venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r backend/requirements.txt
```

### 4. Start the application
```bash
python backend/app.py
```

Open:
`http://127.0.0.1:5000/Dashboard/dashboard.html`

The first index build downloads/loads the `all-MiniLM-L6-v2` sentence-transformer model. Internet access is required the first time unless the model is already cached.

## RAG flow
```text
Historical CSV
   ↓
Cleaning
   ↓
Chunking
   ↓
Sentence-Transformer Embeddings
   ↓
FAISS Vector Index
   ↓
Top-K Semantic Retrieval
   ↓
Root Cause + Remediation Prototype
```

## Dataset note
`data/defects.csv` is a small seed dataset for demonstrating the required schema and pipeline. For a formal submission that requires the full Mozilla/Apache/Eclipse public datasets from the specified Kaggle sources, download the approved datasets and normalize their columns into this CSV schema before indexing. Do not represent this six-record seed as the complete Kaggle corpus.

## Milestone 1 status
- Workflow study/representation: Complete
- Architecture and agent design: Complete
- Bug submission module: Complete
- Chunking: Complete
- Embedding generation: Complete in backend prototype
- Vector-store indexing: Complete using FAISS
- Semantic similarity retrieval: Complete
- Production-scale dataset ingestion and deployment: Future work


## Milestone 2 — Bug Triage, Log Analysis & Agent Orchestration

Milestone 2 extends the Milestone 1 RAG prototype with two first-level analysis agents and a validation workflow.

### M2.1 Triage Agent
- Classifies severity as Critical / High / Medium / Low.
- Assigns P1 / P2 / P3 / P4 priority.
- Infers the affected component from bug text and technical evidence.
- Returns confidence, diagnostic signals and reasoning in a stable JSON schema.

### M2.2 Log Analysis Agent
- Detects common exception/error types.
- Extracts error messages.
- Parses Java and Python stack traces.
- Extracts file, class, method and line number where available.
- Builds an ordered code-path representation.
- Returns confidence and structured analysis.

### M2.3 Multi-Agent Orchestration
`POST /api/analyze` now automatically runs Triage Agent and Log Analysis Agent, combines their outputs into `bug_context`, and passes that context into the downstream historical retrieval / root-cause / remediation pipeline.

The orchestration response also reports missing-log handling and whether the context is ready for Milestone 3.

### M2.4 Accuracy Validation
Open:
`http://127.0.0.1:5000/Validation/validation.html`

The validation page runs seeded historical defects and varied Java/Python/messy/description-only cases. It reports accuracy for:
- Triage severity
- Triage priority
- Affected component
- Exception type
- Failure file
- Failure line

Individual test cases are shown as PASS or REVIEW so incorrect cases can be inspected.

### Milestone 2 API
- `GET /api/health`
- `POST /api/analyze`
- `GET /api/validation/milestone2`

The original Milestone 1 RAG endpoints remain available.
