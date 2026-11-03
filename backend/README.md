# Practice Project Backend

FastAPI + SQLAlchemy 2 + Alembic + SQLite. Serves the Next.js app in `../frontend`
and the standalone meeting recorder at `/recorder/`.

## First-time setup

```bash
# from the project root
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Optional `backend/.env` (all have defaults; relative paths resolve against `backend/`):

```
DATABASE_URL=sqlite:///./app.db
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
UPLOADS_DIR=storage/uploads
MEETINGS_DIR=storage/meetings
```

## Run

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

On startup the server applies migrations (`alembic upgrade head`) and, if the
database is completely empty, loads the sample data. Open http://localhost:8000/docs.

Then in another terminal:

```bash
cd frontend
npm install        # first time only
npm run dev        # http://localhost:3000 (reads NEXT_PUBLIC_API_URL from .env.local)
```

## Common tasks

| Task | Command (from `backend/`) |
|---|---|
| Run tests (uses a temp DB, never touches app.db) | `python -m pytest -q` |
| Reset DB to sample data | `python -m scripts.seed --reset` (or Settings page → Restore sample data) |
| New migration after changing models | `alembic revision --autogenerate -m "describe change"` then `alembic upgrade head` |

Sample data lives in `scripts/seed_data.json` (exported from `frontend/lib/mock-data.ts`).

## API

| Method | Path | |
|---|---|---|
| GET | `/api/projects?status=&q=` | list, filter by status / search |
| POST | `/api/projects` | create (`NewProjectInput`) |
| GET / PATCH / DELETE | `/api/projects/{id}` | PATCH accepts only editable fields |
| GET | `/api/projects/{id}/activities` `/sources` `/requirements` `/approvals` `/meetings` | list related resources |
| POST | `/api/projects/{id}/sources` | multipart upload (max 50 MB) |
| GET | `/api/projects/{id}/sources/{sourceId}/download` | download uploaded source file |
| GET | `/api/projects/{id}/sources/{sourceId}/preview` | preview text (.txt, .md) source inline |
| DELETE | `/api/projects/{id}/sources/{sourceId}` | remove source row and physical file |
| GET | `/api/team` | list team members |
| POST | `/api/admin/reset-sample-data` | wipe + reseed (demo only) |
| GET | `/api/meetings` `/api/meetings/unassigned` `/api/meetings/{id}` | list/fetch meetings |
| PATCH | `/api/meetings/{id}` | update title / attach to project |
| POST | `/api/meetings/sync-storage` | import unassigned meetings from storage |
| GET/POST | `/api/meetings/status` `/latest` `/start` `/stop`, `/api/devices` | 409 if already recording |
| GET/POST | `/api/projects/{id}/requirements?type=&priority=&status=&q=` | list (filters) / create — codes REQ-001… never repeat |
| GET/PATCH/DELETE | `/api/projects/{id}/requirements/{reqId}` | |
| POST | `/api/projects/{id}/requirements/{reqId}/validate` `/approve` | status workflow |
| POST | `/api/projects/{id}/requirements/bulk` | save the AI suggestions the user accepted |
| GET | `/api/projects/{id}/analysis` | Business Analysis overview: state, gaps, stakeholders, process maps |
| PUT | `/api/projects/{id}/analysis/state` | save current state / future state / objectives (partial) |
| POST / PATCH / DELETE | `/api/projects/{id}/analysis/gaps[/{gapId}]` | gap analysis — codes GAP-001… never repeat; `requirementIds` must belong to the project |
| POST | `/api/projects/{id}/analysis/gaps/bulk` | save the AI-suggested gaps the user accepted |
| POST / PATCH / DELETE | `/api/projects/{id}/analysis/stakeholders[/{id}]` | influence / interest (high·medium·low), attitude |
| POST / PATCH / DELETE | `/api/projects/{id}/analysis/processes[/{id}]` | as-is / to-be process maps with ordered steps |
| POST | `/api/projects/{id}/analysis/suggest` | AI draft of state + gaps from requirements and meetings (not saved) |
| GET | `/api/ai/status` | `{enabled, provider, model}` — frontend disables AI buttons when off |
| POST | `/api/projects/{id}/sources/{sourceId}/extract-requirements` | AI suggestions (not saved) |
| POST | `/api/meetings/{id}/extract-requirements` | AI suggestions from a transcript (not saved) |
| POST | `/api/meetings/{id}/summarize` | AI decisions / action items / open questions (saved on the meeting) |

### Enabling AI

Add to `backend/.env`, then `pip install` that provider's SDK (`openai`, `anthropic` or `google-generativeai`):

```
LLM_PROVIDER=anthropic        # or openai / google
LLM_API_KEY=your-key
LLM_MODEL=                    # optional; defaults per provider
```

Text over 150,000 characters is rejected (413) rather than silently cut. Tests always run with AI off.

## Layout

- `app/` — `main.py`, `config.py`, `database.py`, `models/`, `schemas/`, `routers/`, `services/`
- `app/workers/meeting_bot.py` — recorder + faster-whisper transcription (run as a subprocess)
- `app/static/recorder/` — standalone recorder UI
- `storage/uploads/<projectId>/`, `storage/meetings/` — files on disk
- `alembic/` — migrations · `scripts/seed.py` — sample data · `tests/`
