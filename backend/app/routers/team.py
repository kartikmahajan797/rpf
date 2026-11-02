from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import TeamMember
from ..schemas.team import TeamMemberRead

router = APIRouter(prefix="/api")


@router.get("/team", response_model=list[TeamMemberRead])
def list_team(db: Session = Depends(get_db)):
    return db.query(TeamMember).order_by(TeamMember.name).all()
