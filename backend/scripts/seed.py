"""Load the sample data (exported from frontend/lib/mock-data.ts) into the database.

Usage (from backend/):
    python -m scripts.seed           # insert missing sample rows
    python -m scripts.seed --reset   # wipe all data, then insert sample rows
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import Session  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Activity,
    AnalysisGap,
    Approval,
    BusinessAnalysis,
    Meeting,
    ProcessMap,
    Project,
    Requirement,
    SourceDocument,
    Stakeholder,
    TeamMember,
)
from app.services.meeting_service import sync_unassigned_meetings  # noqa: E402

SEED_FILE = Path(__file__).with_name("seed_data.json")


def load_seed_data() -> dict:
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


def clear_db(db: Session) -> None:
    for model in (
        Activity, SourceDocument, Approval, Requirement, Meeting,
        AnalysisGap, Stakeholder, ProcessMap, BusinessAnalysis,
        Project, TeamMember,
    ):
        db.query(model).delete()


def seed_db(db: Session | None = None, reset: bool = False) -> dict[str, int]:
    own_session = db is None
    db = db or SessionLocal()
    try:
        data = load_seed_data()
        if reset:
            clear_db(db)

        def add_missing(model, rows, build):
            for row in rows:
                if db.get(model, row["id"]) is None:
                    db.add(build(row))

        add_missing(TeamMember, data["TEAM"], lambda r: TeamMember(**r))
        add_missing(Project, data["PROJECTS"], lambda r: Project(
            id=r["id"], name=r["name"], description=r["description"], client=r["client"],
            owner_id=r["ownerId"], status=r["status"], progress=r["progress"],
            created_at=r["createdAt"], updated_at=r["updatedAt"], due_date=r.get("dueDate"),
            stages=r["stages"], counts=r["counts"],
        ))
        db.flush()
        add_missing(Activity, data["ACTIVITIES"], lambda r: Activity(
            id=r["id"], project_id=r["projectId"], actor_id=r["actorId"], kind=r["kind"],
            message=r["message"], timestamp=r["timestamp"],
        ))
        add_missing(SourceDocument, data["SOURCES"], lambda r: SourceDocument(
            id=r["id"], project_id=r["projectId"], name=r["name"], type=r["type"],
            size_kb=r["sizeKb"], uploaded_by=r["uploadedBy"], uploaded_at=r["uploadedAt"],
        ))

        # Ensure sample files exist on disk for preview and download
        for s in data["SOURCES"]:
            pdir = settings.uploads_dir / s["projectId"]
            pdir.mkdir(parents=True, exist_ok=True)
            fpath = pdir / f"{s['id']}_{s['name']}"
            if not fpath.exists():
                sample_text = f"# {s['name']}\n\nSample source document content for {s['projectId']}.\nType: {s['type']}\nSize: {s['sizeKb']} KB\n"
                fpath.write_text(sample_text, encoding="utf-8")

        add_missing(Approval, data["APPROVALS"], lambda r: Approval(
            id=r["id"], project_id=r["projectId"], title=r["title"], artifact=r["artifact"],
            requested_by=r["requestedBy"], assignee_id=r["assigneeId"], due_date=r["dueDate"], state=r["state"],
        ))
        add_missing(Requirement, data["REQUIREMENTS"], lambda r: Requirement(
            id=r["id"], project_id=r["projectId"], code=r["code"], title=r["title"],
            type=r["type"], priority=r["priority"], status=r["status"],
        ))
        db.commit()

        # Import unassigned meetings from storage/meetings
        sync_unassigned_meetings(db)

        return {k: len(v) for k, v in data.items()}
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="delete all existing data first")
    args = parser.parse_args()
    counts = seed_db(reset=args.reset)
    print("Seeded:", ", ".join(f"{n} {k.lower()}" for k, n in counts.items()))
