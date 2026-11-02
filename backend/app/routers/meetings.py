from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Meeting, Project
from ..schemas.meeting import MeetingRead, MeetingStartRequest, MeetingStatusResponse, MeetingUpdate
from ..services.meeting_service import (
    AlreadyRecording,
    attach_meeting_to_project,
    list_devices,
    meeting_status,
    read_latest_transcript,
    start_meeting,
    stop_meeting,
    sync_unassigned_meetings,
)

router = APIRouter(prefix="/api", tags=["meetings"])


@router.get("/devices")
def get_devices():
    return list_devices()


@router.get("/meetings/latest")
def latest_meeting():
    transcript_text, transcript_path = read_latest_transcript()
    return {"transcript": transcript_text, "transcriptPath": transcript_path}


@router.get("/meetings/status", response_model=MeetingStatusResponse)
def meeting_state():
    return meeting_status()


@router.post("/meetings/start")
def start_meeting_route(payload: MeetingStartRequest, db: Session = Depends(get_db)):
    if payload.project_id:
        if db.get(Project, payload.project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

    try:
        return start_meeting(payload.model_dump(by_alias=True))
    except AlreadyRecording:
        raise HTTPException(status_code=409, detail={"status": "already_recording"})


@router.post("/meetings/stop")
def stop_meeting_route(db: Session = Depends(get_db)):
    return stop_meeting(db)


@router.get("/meetings/unassigned", response_model=list[MeetingRead])
def get_unassigned_meetings(db: Session = Depends(get_db)):
    sync_unassigned_meetings(db)
    return db.query(Meeting).filter(Meeting.project_id.is_(None)).order_by(Meeting.started_at.desc()).all()


@router.post("/meetings/sync-storage", response_model=list[MeetingRead])
def sync_storage_meetings(db: Session = Depends(get_db)):
    return sync_unassigned_meetings(db)


@router.get("/meetings", response_model=list[MeetingRead])
def list_meetings(
    project_id: str | None = Query(None, alias="projectId"),
    unassigned: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Meeting)
    if unassigned is True:
        query = query.filter(Meeting.project_id.is_(None))
    elif project_id:
        if db.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        query = query.filter(Meeting.project_id == project_id)
    return query.order_by(Meeting.started_at.desc()).all()


@router.get("/meetings/{meeting_id}", response_model=MeetingRead)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.patch("/meetings/{meeting_id}", response_model=MeetingRead)
def patch_meeting(meeting_id: str, payload: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if payload.project_id:
        try:
            meeting = attach_meeting_to_project(db, meeting_id, payload.project_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    if payload.title is not None:
        meeting.title = payload.title.strip()
        db.commit()
        db.refresh(meeting)

    return meeting


# Legacy /api/meeting/* paths are used by the recorder page at /recorder/.
@router.get("/meeting/latest")
def legacy_latest_meeting():
    return latest_meeting()


@router.get("/meeting/status")
def legacy_meeting_state():
    return meeting_state()


@router.post("/meeting/start")
def legacy_start_meeting(payload: dict, db: Session = Depends(get_db)):
    req = MeetingStartRequest(**payload)
    return start_meeting_route(req, db)


@router.post("/meeting/stop")
def legacy_stop_meeting(db: Session = Depends(get_db)):
    return stop_meeting_route(db)
