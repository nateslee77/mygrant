"""One-time migration: move each RPOSD status-report project's AD Number
into its update-notes history (as "AD Number: <value>"), attributed to the
System Import user, so it's visible in the Status Reports table's Notes
column alongside other project activity. Safe to re-run: skips any RPOSD
project that already has an "AD Number:" note.

Usage:
    python scripts/migrate_ad_numbers_to_notes.py
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.models import PSRNote, PSRProject, User  # noqa: E402

SYSTEM_IMPORT_EMAIL = "system-import@parks.lacounty.gov"


def main():
    db = SessionLocal()
    try:
        system_user = db.scalar(select(User).where(User.email == SYSTEM_IMPORT_EMAIL))
        if system_user is None:
            print("System Import user not found; run scripts/seed_admin.py first.", file=sys.stderr)
            sys.exit(1)

        projects = db.scalars(
            select(PSRProject).where(PSRProject.category == "RPOSD", PSRProject.ad_number.isnot(None))
        ).all()

        created = 0
        skipped = 0
        for project in projects:
            already = any((n.note_text or "").startswith("AD Number:") for n in project.notes)
            if already:
                skipped += 1
                continue
            db.add(
                PSRNote(
                    project_id=project.id,
                    user_id=system_user.id,
                    author_name=system_user.name,
                    note_text=f"AD Number: {project.ad_number}",
                )
            )
            created += 1

        db.commit()
        print(f"Notes created: {created}")
        print(f"Already had an AD Number note, skipped: {skipped}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
