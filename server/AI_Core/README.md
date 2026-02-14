# FinWise AI Core

FastAPI-based AI orchestration layer for FinWise.

## Runtime

- Python: **3.11**
- API server: FastAPI + Uvicorn
- Workflow engine: LangGraph

## Local Run

```bash
python -m venv .venv
. .venv/bin/activate  # On Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn api_service:app --host 0.0.0.0 --port 8001
```

## Quality Checks

```bash
ruff check tests
pytest -q
```