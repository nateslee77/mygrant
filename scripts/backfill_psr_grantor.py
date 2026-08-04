"""One-time backfill: for status report categories whose source sheet never
had a distinct Grantor column (RPOSD, State of California NRA, Conservancy
(RMC,BHUWC), Cooling Amenities and Fairfax), the category itself IS the
grantor. Set grantor = category for those so the Grantor column is
consistently populated instead of showing "-" for most rows ("Other" is
left untouched since it already carries real distinct grantor values like
WCB, HUD, Federal Earmark). Safe to re-run: only touches rows where
grantor is still null.

Usage:
    python scripts/backfill_psr_grantor.py
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.models import PSRProject  # noqa: E402


def main():
    db = SessionLocal()
    try:
        projects = db.scalars(
            select(PSRProject).where(PSRProject.category != "Other", PSRProject.grantor.is_(None))
        ).all()
        for project in projects:
            project.grantor = project.category
        db.commit()
        print(f"Backfilled grantor for {len(projects)} projects")
    finally:
        db.close()


if __name__ == "__main__":
    main()
