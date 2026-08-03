"""One-time CSV import for the Grants Management System.

Reads a CSV shaped like the LA County Parks "Active Grants / Master Log"
export and inserts rows into the `grants` table (and, where a Notes value
is present, a first `grant_notes` entry attributed to the System Import
user created by scripts/seed_admin.py).

Generic by design: point it at any correctly-shaped CSV. Run it once per
source file (e.g. once for the active-grants export, once for the older/
closed-grants export) -- rows from each file become their own grant
records, since the same project can legitimately have multiple grants
(different grantors/funding sources) attached to it.

Usage:
    python scripts/import_grants.py path/to/file.csv
"""
import argparse
import csv
import re
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.models import Grant, GrantNote, User  # noqa: E402

SYSTEM_IMPORT_EMAIL = "system-import@parks.lacounty.gov"

# Rows whose PROJECT NAME cell exactly matches one of these (case-insensitive,
# after stripping) are summary/footer rows in the source spreadsheet, not
# grant records, and are skipped.
SKIP_EXACT = {
    "total open grants",
    "close out phase",
    "withdrawing",
    "new",
    "new pending projects",
}
# Prefixes that mark a footer/annotation row regardless of exact wording.
SKIP_PREFIXES = (
    "alert:",
    "total ",
    "project completed per",
)

COLUMN_ALIASES = {
    "project_name": ["PROJECT NAME"],
    "grantor": ["GRANTOR"],
    "funding_source": ["FUNDING SOURCE/ GRANT PROGRAM", "FUNDING SOURCE/GRANT PROGRAM", "FUNDING SOURCE"],
    "grant_officer": ["Grant Officer"],
    "scope": ["Scope"],
    "current_exp_date": ["CURRENT GRANT EXP DATE"],
    "orig_exp_date": ["ORIG GRANT EXP DATE"],
    "amended_exp_date": ["AMENDED EXP DATE"],
    "grant_amt": ["GRANT AMT"],
    "grants_manager": ["Grants Manager"],
    "program_manager": ["Program Manager", "Project Manager"],
    "district": ["SD"],
    "notes": ["Notes"],
    "sharepoint_link": ["SharePoint Folder Link"],
}


def _build_header_map(fieldnames: list[str]) -> dict[str, str]:
    """Map our internal field names -> the actual CSV column name present."""
    header_map = {}
    normalized_fieldnames = {fn.strip(): fn for fn in fieldnames if fn}
    for internal_name, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized_fieldnames:
                header_map[internal_name] = normalized_fieldnames[alias]
                break
    return header_map


def _get(row: dict, header_map: dict, key: str) -> str:
    col = header_map.get(key)
    if col is None:
        return ""
    return (row.get(col) or "").strip()


def _is_placeholder_row(project_name: str) -> bool:
    if not project_name:
        return True
    stripped = project_name.strip()
    if not stripped:
        return True
    if re.fullmatch(r"#+", stripped):
        return True
    lowered = stripped.lower()
    if lowered in SKIP_EXACT:
        return True
    if any(lowered.startswith(prefix) for prefix in SKIP_PREFIXES):
        return True
    return False


def _parse_date(value: str):
    value = value.strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%m/%d/%Y").date()
    except ValueError:
        return None


def _parse_amount(value: str) -> Decimal | None:
    value = value.strip()
    if not value:
        return None
    cleaned = value.replace("$", "").replace(",", "").strip()
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _parse_district(value: str) -> int | None:
    value = value.strip()
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()

    if not args.csv_path.exists():
        print(f"File not found: {args.csv_path}", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        system_user = db.scalar(select(User).where(User.email == SYSTEM_IMPORT_EMAIL))
        if system_user is None:
            print(
                "System Import user not found. Run scripts/seed_admin.py first "
                "(it creates the System Import user used to attribute imported notes).",
                file=sys.stderr,
            )
            sys.exit(1)

        rows_read = 0
        rows_imported = 0
        skip_reasons: dict[str, int] = {}

        with open(args.csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            header_map = _build_header_map(reader.fieldnames or [])

            missing_required = [k for k in ("project_name",) if k not in header_map]
            if missing_required:
                print(f"CSV is missing required column(s): {missing_required}", file=sys.stderr)
                sys.exit(1)

            for row in reader:
                rows_read += 1

                if not any((v or "").strip() for v in row.values()):
                    skip_reasons["fully blank row"] = skip_reasons.get("fully blank row", 0) + 1
                    continue

                project_name = _get(row, header_map, "project_name")
                if _is_placeholder_row(project_name):
                    reason = "blank project name" if not project_name.strip() else f"footer/summary row ({project_name.strip()!r})"
                    skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                    continue

                grant = Grant(
                    project_name=project_name,
                    grantor=_get(row, header_map, "grantor") or None,
                    funding_source=_get(row, header_map, "funding_source") or None,
                    grant_officer=_get(row, header_map, "grant_officer") or None,
                    scope=_get(row, header_map, "scope") or None,
                    current_exp_date=_parse_date(_get(row, header_map, "current_exp_date")),
                    orig_exp_date=_parse_date(_get(row, header_map, "orig_exp_date")),
                    amended_exp_date=_parse_date(_get(row, header_map, "amended_exp_date")),
                    grant_amount=_parse_amount(_get(row, header_map, "grant_amt")),
                    grants_manager=_get(row, header_map, "grants_manager") or None,
                    program_manager=_get(row, header_map, "program_manager") or None,
                    district=_parse_district(_get(row, header_map, "district")),
                    sharepoint_link=_get(row, header_map, "sharepoint_link") or None,
                    withdrawn=False,
                )
                db.add(grant)
                db.flush()

                notes_value = _get(row, header_map, "notes")
                if notes_value:
                    db.add(GrantNote(grant_id=grant.id, user_id=system_user.id, note_text=notes_value))

                rows_imported += 1

        db.commit()

        print(f"\nImport complete for {args.csv_path.name}")
        print(f"  Rows read:     {rows_read}")
        print(f"  Rows imported: {rows_imported}")
        rows_skipped = sum(skip_reasons.values())
        print(f"  Rows skipped:  {rows_skipped}")
        for reason, count in sorted(skip_reasons.items(), key=lambda kv: -kv[1]):
            print(f"    - {reason}: {count}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
