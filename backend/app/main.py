from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from scripts.seed import seed_db

from .config import BACKEND_DIR, settings
from .database import SessionLocal
from .models import Project, TeamMember
from .routers.admin import router as admin_router
from .routers.analysis import router as analysis_router
from .routers.meetings import router as meetings_router
from .routers.projects import router as projects_router
from .routers.requirements import router as requirements_router
from .routers.team import router as team_router
from .services.meeting_service import sync_unassigned_meetings


def run_migrations() -> None:
    """Bring the schema up to date. Alembic owns the schema; never use create_all."""
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.meetings_dir.mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        # Seed only a brand-new database, so deleting projects in the UI sticks.
        if db.query(Project.id).first() is None and db.query(TeamMember.id).first() is None:
            seed_db(db)
        sync_unassigned_meetings(db)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", docs_url="/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(team_router)
app.include_router(meetings_router)
app.include_router(requirements_router)
app.include_router(analysis_router)
app.include_router(admin_router)

# Standalone meeting-recorder page (the original Flask UI), served at /recorder/
app.mount("/recorder", StaticFiles(directory=BACKEND_DIR / "app" / "static" / "recorder", html=True), name="recorder")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": settings.app_name, "docs": "/docs", "recorder": "/recorder/"}
