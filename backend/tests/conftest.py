import os
import tempfile
from pathlib import Path

import pytest

# Must run before `app` is imported: point every path at a throwaway folder
# so tests never touch backend/app.db or backend/storage.
_TMP = Path(tempfile.mkdtemp(prefix="practice-api-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["UPLOADS_DIR"] = str(_TMP / "uploads")
os.environ["MEETINGS_DIR"] = str(_TMP / "meetings")
# Never call a real AI provider from tests, even if backend/.env has a key.
os.environ["LLM_PROVIDER"] = ""
os.environ["LLM_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    # Entering the context runs the lifespan: migrations + sample-data seed.
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def tmp_root() -> Path:
    return _TMP
