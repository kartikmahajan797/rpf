from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from scripts.seed import seed_db

from ..database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset-sample-data")
def reset_sample_data(db: Session = Depends(get_db)) -> dict[str, int]:
    """Wipe every project/team row and reload the sample data. Dev/demo use only."""
    return seed_db(db, reset=True)
