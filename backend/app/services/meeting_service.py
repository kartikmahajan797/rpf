from __future__ import annotations

import re
import subprocess
import sys
import time
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Activity, Meeting, Project, SourceDocument

ROOT = Path(__file__).resolve().parents[2]
BOT_PATH = ROOT / "app" / "workers" / "meeting_bot.py"
ACTIVE_PROCESS: subprocess.Popen[str] | None = None
ACTIVE_PROJECT_ID: str | None = None
ACTIVE_TITLE: str | None = None
ACTIVE_STARTED_AT: str | None = None
ACTIVE_T0: float = 0.0

CURRENT_USER_ID = "u1"


class AlreadyRecording(Exception):
    pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def safe_filename(name: str | None) -> str:
    base = Path(name or "").name
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base).strip(" .")
    return base or "meeting.txt"


def get_latest_meeting_dir() -> Path | None:
    meetings_dir = settings.meetings_dir
    if not meetings_dir.exists():
        return None
    meetings = sorted([p for p in meetings_dir.glob("meeting_*") if p.is_dir()], key=lambda p: p.name)
    return meetings[-1] if meetings else None


def read_latest_transcript() -> tuple[str, str | None]:
    folder = get_latest_meeting_dir()
    if folder is None:
        return "", None
    transcript = folder / "transcript.txt"
    if not transcript.exists():
        return "", str(transcript)
    return transcript.read_text(encoding="utf-8"), str(transcript)


def get_wav_duration(path: Path) -> int:
    try:
        with wave.open(str(path), "rb") as w:
            frames = w.getnframes()
            rate = w.getframerate()
            if rate > 0:
                return int(frames / rate)
    except Exception:
        pass
    return 0


def sync_unassigned_meetings(db: Session) -> list[Meeting]:
    """Scan settings.meetings_dir for meeting_* folders not yet in the DB and create Meeting rows."""
    meetings_dir = settings.meetings_dir
    if not meetings_dir.exists():
        return []

    created: list[Meeting] = []
    folders = sorted([p for p in meetings_dir.glob("meeting_*") if p.is_dir()], key=lambda p: p.name)
    for folder in folders:
        folder_id = folder.name
        existing = db.get(Meeting, folder_id)
        if existing is not None:
            continue

        # Try to parse timestamp from folder name meeting_YYYY-MM-DD_HH-MM-SS
        match = re.match(r"meeting_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})", folder.name)
        if match:
            date_part, time_part = match.groups()
            started_at = f"{date_part}T{time_part.replace('-', ':')}Z"
            display_title = f"Meeting {date_part} {time_part.replace('-', ':')[:5]}"
        else:
            started_at = utc_now_iso()
            display_title = folder.name

        transcript_text = ""
        transcript_path = folder / "transcript.txt"
        if transcript_path.exists():
            try:
                transcript_text = transcript_path.read_text(encoding="utf-8")
            except Exception:
                pass

        audio_files = sorted(folder.glob("*.wav"))
        audio_paths = [str(a.relative_to(settings.meetings_dir.parent)) if settings.meetings_dir.parent in a.parents else str(a) for a in audio_files]

        max_duration = 0
        for af in audio_files:
            d = get_wav_duration(af)
            if d > max_duration:
                max_duration = d

        meeting = Meeting(
            id=folder_id,
            project_id=None,
            title=display_title,
            started_at=started_at,
            duration_sec=max_duration,
            transcript=transcript_text,
            audio_paths=audio_paths,
            status="completed",
        )
        db.add(meeting)
        created.append(meeting)

    if created:
        db.commit()
        for m in created:
            db.refresh(m)
    return created


def start_meeting(payload: dict[str, Any]) -> dict[str, Any]:
    global ACTIVE_PROCESS, ACTIVE_PROJECT_ID, ACTIVE_TITLE, ACTIVE_STARTED_AT, ACTIVE_T0

    model = payload.get("model", "base")
    mic_device = payload.get("micDevice") or payload.get("mic_device")
    system_device = payload.get("systemDevice") or payload.get("system_device")
    duration = payload.get("duration")
    language = payload.get("language")
    prompt = payload.get("prompt")

    if ACTIVE_PROCESS is not None and ACTIVE_PROCESS.poll() is None:
        raise AlreadyRecording()

    ACTIVE_PROJECT_ID = payload.get("projectId") or payload.get("project_id")
    ACTIVE_TITLE = payload.get("title")
    ACTIVE_STARTED_AT = utc_now_iso()
    ACTIVE_T0 = time.time()

    meetings_dir = settings.meetings_dir
    meetings_dir.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(BOT_PATH), "--model", str(model), "--out", str(meetings_dir)]
    if mic_device not in (None, ""):
        cmd.extend(["--mic-device", str(mic_device)])
    if system_device not in (None, ""):
        cmd.extend(["--system-device", str(system_device)])
    if language:
        cmd.extend(["--language", str(language)])
    else:
        cmd.append("--multilingual")
    if prompt:
        cmd.extend(["--prompt", str(prompt)])
    if duration is not None:
        cmd.extend(["--duration", str(duration)])
    else:
        cmd.append("--no-input")

    ACTIVE_PROCESS = subprocess.Popen(cmd, cwd=str(ROOT))
    return {
        "status": "recording_started",
        "projectId": ACTIVE_PROJECT_ID,
        "title": ACTIVE_TITLE,
    }


def stop_meeting(db: Session | None = None) -> dict[str, Any]:
    global ACTIVE_PROCESS, ACTIVE_PROJECT_ID, ACTIVE_TITLE, ACTIVE_STARTED_AT, ACTIVE_T0
    transcript_text, transcript_path = read_latest_transcript()

    duration_sec = max(0, int(time.time() - ACTIVE_T0)) if ACTIVE_T0 > 0 else 0

    if ACTIVE_PROCESS is not None:
        try:
            ACTIVE_PROCESS.terminate()
            ACTIVE_PROCESS.wait(timeout=600)
        except subprocess.TimeoutExpired:
            ACTIVE_PROCESS.kill()
            ACTIVE_PROCESS.wait()
        finally:
            ACTIVE_PROCESS = None

    for _ in range(30):
        transcript_text, transcript_path = read_latest_transcript()
        if transcript_text:
            break
        time.sleep(0.5)

    meeting_id = None
    if db is not None:
        folder = get_latest_meeting_dir()
        folder_id = folder.name if folder else f"meeting_{datetime.now():%Y-%m-%d_%H-%M-%S}"
        audio_files = sorted(folder.glob("*.wav")) if folder else []
        audio_paths = [str(a.relative_to(settings.meetings_dir.parent)) if settings.meetings_dir.parent in a.parents else str(a) for a in audio_files]
        if not duration_sec and audio_files:
            for af in audio_files:
                d = get_wav_duration(af)
                if d > duration_sec:
                    duration_sec = d

        now = utc_now_iso()
        meeting_title = ACTIVE_TITLE or f"Meeting {datetime.now():%Y-%m-%d %H:%M}"
        meeting = Meeting(
            id=f"m-{uuid.uuid4().hex[:8]}",
            project_id=ACTIVE_PROJECT_ID,
            title=meeting_title,
            started_at=ACTIVE_STARTED_AT or now,
            duration_sec=duration_sec,
            transcript=transcript_text or "",
            audio_paths=audio_paths,
            status="completed",
        )
        db.add(meeting)
        meeting_id = meeting.id

        if ACTIVE_PROJECT_ID:
            project = db.get(Project, ACTIVE_PROJECT_ID)
            if project is not None:
                source_id = f"s-{uuid.uuid4().hex[:8]}"
                source_filename = safe_filename(f"{meeting_title}_transcript.txt")
                project_dir = settings.uploads_dir / ACTIVE_PROJECT_ID
                project_dir.mkdir(parents=True, exist_ok=True)
                (project_dir / f"{source_id}_{source_filename}").write_text(transcript_text or "", encoding="utf-8")

                source = SourceDocument(
                    id=source_id,
                    project_id=ACTIVE_PROJECT_ID,
                    name=source_filename,
                    type="transcript",
                    size_kb=max(1, len((transcript_text or "").encode("utf-8")) // 1024),
                    uploaded_by=CURRENT_USER_ID,
                    uploaded_at=now,
                )
                db.add(source)
                db.add(Activity(
                    id=f"a-{uuid.uuid4().hex[:8]}",
                    project_id=ACTIVE_PROJECT_ID,
                    actor_id=CURRENT_USER_ID,
                    kind="upload",
                    message=f"saved transcript from {meeting_title}",
                    timestamp=now,
                ))
                project.counts["sources"] = project.counts.get("sources", 0) + 1
                project.updated_at = now

        db.commit()

    res = {
        "status": "recording_stopped",
        "transcript": transcript_text,
        "transcriptPath": transcript_path,
        "meetingId": meeting_id,
    }

    ACTIVE_PROJECT_ID = None
    ACTIVE_TITLE = None
    ACTIVE_STARTED_AT = None
    ACTIVE_T0 = 0.0

    return res


def attach_meeting_to_project(db: Session, meeting_id: str, project_id: str) -> Meeting:
    project = db.get(Project, project_id)
    if project is None:
        raise ValueError("Project not found")

    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise ValueError("Meeting not found")

    old_project_id = meeting.project_id
    meeting.project_id = project_id
    now = utc_now_iso()

    # If meeting had no project before and has transcript, create SourceDocument of type transcript
    if not old_project_id and meeting.transcript:
        source_id = f"s-{uuid.uuid4().hex[:8]}"
        source_filename = safe_filename(f"{meeting.title}_transcript.txt")
        project_dir = settings.uploads_dir / project_id
        project_dir.mkdir(parents=True, exist_ok=True)
        (project_dir / f"{source_id}_{source_filename}").write_text(meeting.transcript, encoding="utf-8")

        source = SourceDocument(
            id=source_id,
            project_id=project_id,
            name=source_filename,
            type="transcript",
            size_kb=max(1, len(meeting.transcript.encode("utf-8")) // 1024),
            uploaded_by=CURRENT_USER_ID,
            uploaded_at=now,
        )
        db.add(source)
        db.add(Activity(
            id=f"a-{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            actor_id=CURRENT_USER_ID,
            kind="upload",
            message=f"attached meeting transcript: {meeting.title}",
            timestamp=now,
        ))
        project.counts["sources"] = project.counts.get("sources", 0) + 1
        project.updated_at = now

    db.commit()
    db.refresh(meeting)
    return meeting


def meeting_status() -> dict[str, Any]:
    recording = ACTIVE_PROCESS is not None and ACTIVE_PROCESS.poll() is None
    return {
        "recording": recording,
        "projectId": ACTIVE_PROJECT_ID if recording else None,
        "title": ACTIVE_TITLE if recording else None,
        "startedAt": ACTIVE_STARTED_AT if recording else None,
    }


def list_devices() -> dict[str, Any]:
    try:
        import sounddevice as sd

        devices = [
            {"index": i, "name": d["name"]}
            for i, d in enumerate(sd.query_devices())
            if d.get("max_input_channels", 0) > 0
        ]
        default_in = sd.default.device[0] if hasattr(sd, "default") and sd.default.device else 0
        return {"inputs": devices, "defaultInput": default_in if isinstance(default_in, int) else 0}
    except Exception:
        # Fallback if audio hardware is absent or sounddevice fails
        return {"inputs": [{"index": 0, "name": "Default Microphone"}], "defaultInput": 0}
