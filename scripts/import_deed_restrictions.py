"""One-time import for the Deed Restriction Log.

Reads a "Deed Restriction Log" workbook (sheet "Projects", columns:
Project Name, Grantor, Funding Source, Status, File Location, NOTES,
Sharepoint Link) and inserts rows into the `deed_restrictions` table.
The SharePoint link is read from the actual hyperlink target on the
"Sharepoint Link" cell (not its display text), since the log's link
column shows a filename but links to the real SharePoint URL.

Safe to re-run: rows are matched by project_name (case-insensitive) and
updated in place rather than duplicated.

Usage:
    python scripts/import_deed_restrictions.py path/to/file.xlsx
"""
import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import openpyxl  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.models import DeedRestriction  # noqa: E402

SHEET_NAME = "Projects"
VALID_STATUSES = {"Recorded", "Draft"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx_path", type=Path)
    args = parser.parse_args()

    if not args.xlsx_path.exists():
        print(f"File not found: {args.xlsx_path}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(args.xlsx_path, data_only=True)
    ws = wb[SHEET_NAME]

    db = SessionLocal()
    try:
        existing_by_name = {
            item.project_name.strip().lower(): item for item in db.scalars(select(DeedRestriction)).all()
        }

        created = 0
        updated = 0
        skipped = 0

        for row in ws.iter_rows(min_row=2):
            project_name_cell = row[0]
            project_name = (project_name_cell.value or "").strip() if isinstance(project_name_cell.value, str) else project_name_cell.value
            if not project_name:
                continue

            grantor = (row[1].value or "").strip() or None if isinstance(row[1].value, str) else row[1].value
            funding_source = (row[2].value or "").strip() or None if isinstance(row[2].value, str) else row[2].value
            status = (row[3].value or "").strip() if isinstance(row[3].value, str) else row[3].value
            if status not in VALID_STATUSES:
                status = "Draft"
            notes = (row[5].value or "").strip() or None if isinstance(row[5].value, str) else row[5].value
            link_cell = row[6]
            sharepoint_link = link_cell.hyperlink.target if link_cell.hyperlink else (link_cell.value or None)

            existing = existing_by_name.get(project_name.lower())
            if existing:
                existing.grantor = grantor
                existing.funding_source = funding_source
                existing.status = status
                existing.notes = notes
                existing.sharepoint_link = sharepoint_link
                updated += 1
            else:
                db.add(
                    DeedRestriction(
                        project_name=project_name,
                        grantor=grantor,
                        funding_source=funding_source,
                        status=status,
                        notes=notes,
                        sharepoint_link=sharepoint_link,
                    )
                )
                created += 1

        db.commit()

        print(f"Import complete for {args.xlsx_path.name}")
        print(f"  Created: {created}")
        print(f"  Updated: {updated}")
        print(f"  Skipped (blank project name): {skipped}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
