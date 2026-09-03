# BugAI — Milestone 1 Complete Prototype

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
