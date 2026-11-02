from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Activity, Approval, Meeting, Project, Requirement, SourceDocument
from ..schemas.meeting import MeetingRead
from ..schemas.project import (
    ActivityRead,
    ApprovalRead,
    NewProjectInput,
    ProjectRead,
    ProjectUpdate,
    SourceDocumentRead,
)

router = APIRouter(prefix="/api", tags=["projects"])

CURRENT_USER_ID = "u1"  # No auth yet; matches CURRENT_USER_ID in the frontend.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
DEFAULT_COUNTS = {"sources": 0, "requirements": 0, "userStories": 0, "openReviews": 0}
WORKFLOW_KEYS = [
    "sources", "meetings", "requirements", "analysis", "documents", "user-stories",
    "solution", "estimation", "proposals", "presentations", "handoff", "traceability",
]
SOURCE_TYPE_BY_EXT = {
    ".txt": "transcript", ".vtt": "transcript", ".srt": "transcript",
    ".md": "notes",
    ".csv": "spreadsheet", ".xls": "spreadsheet", ".xlsx": "spreadsheet",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_stages(current_key: str = "sources") -> list[dict[str, str]]:
    idx = WORKFLOW_KEYS.index(current_key) if current_key in WORKFLOW_KEYS else len(WORKFLOW_KEYS)
    return [
        {"key": key, "state": "complete" if i < idx else "current" if i == idx else "upcoming"}
        for i, key in enumerate(WORKFLOW_KEYS)
    ]


def get_project_or_404(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def safe_filename(name: str | None) -> str:
    # Drop any directory parts ("../../x") and odd characters.
    base = Path(name or "").name
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base).strip(" .")
    return base or "upload.bin"


def find_source_file(project_id: str, source_id: str, source_name: str) -> Path | None:
    project_dir = settings.uploads_dir / project_id
    if not project_dir.exists():
        return None

    path1 = project_dir / f"{source_id}_{source_name}"
    if path1.exists():
        return path1

    path2 = project_dir / source_name
    if path2.exists():
        return path2

    matches = list(project_dir.glob(f"{source_id}_*"))
    if matches:
        return matches[0]

    return None


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(
    status: list[str] | None = Query(None),
    q: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Project)
    if status:
        query = query.filter(Project.status.in_(status))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Project.name.ilike(like), Project.description.ilike(like)))
    return query.order_by(Project.created_at.desc()).all()


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: NewProjectInput, db: Session = Depends(get_db)):
    now = utc_now_iso()
    project = Project(
        id=f"p-{uuid.uuid4().hex[:8]}",
        name=payload.name.strip(),
        description=payload.description.strip(),
        client={
            "name": payload.client_name.strip(),
            "industry": payload.industry or "Banking & Financial Services",
            "contactName": "Not set",
            "contactRole": "—",
            "contactEmail": "—",
            "region": "—",
        },
        owner_id=payload.owner_id,
        status=payload.status,
        progress=0,
        created_at=now,
        updated_at=now,
        due_date=None,
        stages=build_stages("sources"),
        counts=DEFAULT_COUNTS.copy(),
    )
    db.add(project)
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project.id,
        actor_id=CURRENT_USER_ID,
        kind="project",
        message="created the project",
        timestamp=now,
    ))
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, db: Session = Depends(get_db)):
    return get_project_or_404(db, project_id)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def patch_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    updates = payload.model_dump(exclude_unset=True)

    client_updates = updates.pop("client", None)
    if client_updates:
        # Stored as camelCase JSON, same shape the frontend uses.
        camel = payload.client.model_dump(exclude_unset=True, by_alias=True)
        project.client.update(camel)
    if "stages" in updates:
        updates["stages"] = [s.model_dump() for s in payload.stages or []]
    for key, value in updates.items():
        setattr(project, key, value)

    project.updated_at = utc_now_iso()
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    db.delete(get_project_or_404(db, project_id))
    db.commit()


@router.get("/projects/{project_id}/activities", response_model=list[ActivityRead])
def get_project_activities(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return db.query(Activity).filter(Activity.project_id == project_id).order_by(Activity.timestamp.desc()).all()


@router.get("/projects/{project_id}/sources", response_model=list[SourceDocumentRead])
def get_project_sources(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return (
        db.query(SourceDocument)
        .filter(SourceDocument.project_id == project_id)
        .order_by(SourceDocument.uploaded_at.desc())
        .all()
    )


@router.get("/projects/{project_id}/approvals", response_model=list[ApprovalRead])
def get_project_approvals(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return db.query(Approval).filter(Approval.project_id == project_id).all()


@router.post(
    "/projects/{project_id}/sources",
    response_model=SourceDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_project_source(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 50 MB")

    display_name = safe_filename(file.filename)
    source_id = f"s-{uuid.uuid4().hex[:8]}"
    # Each project gets its own folder; the id prefix stops same-name uploads overwriting each other.
    project_dir = settings.uploads_dir / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / f"{source_id}_{display_name}").write_bytes(content)

    now = utc_now_iso()
    source = SourceDocument(
        id=source_id,
        project_id=project_id,
        name=display_name,
        type=SOURCE_TYPE_BY_EXT.get(Path(display_name).suffix.lower(), "document"),
        size_kb=max(1, len(content) // 1024),
        uploaded_by=CURRENT_USER_ID,
        uploaded_at=now,
    )
    db.add(source)
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="upload",
        message=f"uploaded {display_name}",
        timestamp=now,
    ))
    project.counts["sources"] = project.counts.get("sources", 0) + 1  # MutableDict tracks this
    project.updated_at = now
    db.commit()
    db.refresh(source)
    return source


@router.get("/projects/{project_id}/sources/{source_id}/download")
def download_project_source(project_id: str, source_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    source = db.get(SourceDocument, source_id)
    if source is None or source.project_id != project_id:
        raise HTTPException(status_code=404, detail="Source document not found")

    file_path = find_source_file(project_id, source.id, source.name)
    if file_path is None or not file_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    return FileResponse(
        path=str(file_path),
        filename=source.name,
        media_type="application/octet-stream",
    )


@router.get("/projects/{project_id}/sources/{source_id}/preview")
def preview_project_source(project_id: str, source_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    source = db.get(SourceDocument, source_id)
    if source is None or source.project_id != project_id:
        raise HTTPException(status_code=404, detail="Source document not found")

    ext = Path(source.name).suffix.lower()
    if ext not in (".txt", ".md", ".vtt", ".srt", ".log", ".json", ".csv"):
        raise HTTPException(status_code=400, detail="Inline preview is only supported for text and markdown files (.txt, .md)")

    file_path = find_source_file(project_id, source.id, source.name)
    if file_path is None or not file_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    content = file_path.read_text(encoding="utf-8", errors="replace")
    return {
        "id": source.id,
        "name": source.name,
        "type": source.type,
        "content": content,
        "sizeKb": source.size_kb,
    }


@router.delete("/projects/{project_id}/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_source(project_id: str, source_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    source = db.get(SourceDocument, source_id)
    if source is None or source.project_id != project_id:
        raise HTTPException(status_code=404, detail="Source document not found")

    file_path = find_source_file(project_id, source.id, source.name)
    if file_path and file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    db.delete(source)
    now = utc_now_iso()
    project.counts["sources"] = max(0, project.counts.get("sources", 1) - 1)
    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="upload",
        message=f"deleted source {source.name}",
        timestamp=now,
    ))
    db.commit()


@router.get("/projects/{project_id}/meetings", response_model=list[MeetingRead])
def get_project_meetings(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return db.query(Meeting).filter(Meeting.project_id == project_id).order_by(Meeting.started_at.desc()).all()

