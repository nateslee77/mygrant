"""Reconcile the `grants` table against an updated Active Grants / Master Log
workbook (sheets "ACTIVE GRANTS" and "Closed", same column layout as the
original CSV import). Matches existing grants to spreadsheet rows by the
composite key (project_name, grantor, funding_source) -- project_name alone
is not unique (the same park can have several grants from different
grantors/funding sources).

For each composite key:
  - In the sheet but not the DB  -> create a new grant (audit: created_grant)
  - In the DB but not the sheet  -> delete the grant, preserving notes via
    the same snapshot the app's own delete endpoint writes, so it's
    restorable from the Admin Change Log (audit: deleted_grant)
  - In both, 1:1                -> update any changed fields (audit:
    updated_grant), notes are left untouched
  - Ambiguous (either side has >1 grant under the same composite key)
    -> skipped entirely and reported, never auto-modified

The "SharePoint Folder Link" column in this workbook is NOT a real URL (it's
descriptive folder-name text) -- sharepoint_link is never touched by this
script.

Usage:
    python scripts/sync_grants_from_master_log.py path/to/file.xlsx            # dry run, writes a report
    python scripts/sync_grants_from_master_log.py path/to/file.xlsx --apply    # apply changes
"""
import argparse
import json
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import openpyxl  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.models import Grant, GrantNote, User  # noqa: E402
from app.services.audit import write_audit_log  # noqa: E402

SHEETS = ["ACTIVE GRANTS", "Closed"]
SYSTEM_IMPORT_EMAIL = "system-import@parks.lacounty.gov"

SKIP_EXACT = {"total open grants", "close out phase", "withdrawing", "new", "new pending projects"}
SKIP_PREFIXES = ("alert:", "total ", "project completed per")

UPDATABLE_FIELDS = [
    "project_name",
    "grantor",
    "funding_source",
    "grant_officer",
    "scope",
    "current_exp_date",
    "orig_exp_date",
    "amended_exp_date",
    "grant_amount",
    "grants_manager",
    "program_manager",
    "district",
]


def norm(value) -> str:
    return str(value or "").strip().lower()


def is_placeholder(name) -> bool:
    if not name:
        return True
    s = str(name).strip()
    if not s:
        return True
    if re.fullmatch(r"#+", s):
        return True
    lowered = s.lower()
    if lowered in SKIP_EXACT:
        return True
    return any(lowered.startswith(p) for p in SKIP_PREFIXES)


def cell_str(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def cell_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def cell_amount(value) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    return None


def cell_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def parse_workbook(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    records = []
    for sheet_name in SHEETS:
        ws = wb[sheet_name]
        for row in ws.iter_rows(min_row=2):
            project_name = cell_str(row[0].value)
            if is_placeholder(project_name):
                continue
            records.append(
                {
                    "project_name": project_name,
                    "grantor": cell_str(row[1].value),
                    "funding_source": cell_str(row[2].value),
                    "grant_officer": cell_str(row[3].value),
                    "scope": cell_str(row[4].value),
                    "current_exp_date": cell_date(row[5].value),
                    "orig_exp_date": cell_date(row[6].value),
                    "amended_exp_date": cell_date(row[7].value),
                    "grant_amount": cell_amount(row[8].value),
                    "grants_manager": cell_str(row[9].value),
                    "program_manager": cell_str(row[10].value),
                    "district": cell_int(row[11].value),
                    "notes": cell_str(row[12].value),
                    "_sheet": sheet_name,
                }
            )
    return records


def composite_key(record) -> tuple:
    return (norm(record["project_name"]), norm(record["grantor"]), norm(record["funding_source"]))


def group_by_key(records, key_fn):
    groups: dict[tuple, list] = {}
    for r in records:
        groups.setdefault(key_fn(r), []).append(r)
    return groups


def grant_to_dict(grant: Grant) -> dict:
    return {field: getattr(grant, field) for field in UPDATABLE_FIELDS}


def jsonable(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if isinstance(v, (date, datetime)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = str(v)
        else:
            out[k] = v
    return out


def diff_fields(before: dict, after: dict) -> dict:
    changed = {}
    for key in UPDATABLE_FIELDS:
        b, a = before.get(key), after.get(key)
        if isinstance(b, Decimal) or isinstance(a, Decimal):
            b = Decimal(str(b)) if b is not None else None
            a = Decimal(str(a)) if a is not None else None
        if b != a:
            changed[key] = a
    return changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx_path", type=Path)
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run/report only)")
    parser.add_argument("--report", type=Path, default=None, help="Where to write the JSON report")
    args = parser.parse_args()

    if not args.xlsx_path.exists():
        print(f"File not found: {args.xlsx_path}", file=sys.stderr)
        sys.exit(1)

    new_records = parse_workbook(args.xlsx_path)
    new_groups = group_by_key(new_records, composite_key)

    db = SessionLocal()
    try:
        existing_grants = db.scalars(select(Grant)).all()
        existing_groups = group_by_key(existing_grants, lambda g: composite_key(grant_to_dict(g)))

        all_keys = set(new_groups) | set(existing_groups)

        to_add = []
        to_remove = []
        to_update = []
        ambiguous = []

        for key in all_keys:
            new_list = new_groups.get(key, [])
            existing_list = existing_groups.get(key, [])

            if len(new_list) <= 1 and len(existing_list) <= 1:
                if new_list and not existing_list:
                    to_add.append(new_list[0])
                elif existing_list and not new_list:
                    to_remove.append(existing_list[0])
                elif new_list and existing_list:
                    changed = diff_fields(grant_to_dict(existing_list[0]), new_list[0])
                    if changed:
                        to_update.append((existing_list[0], new_list[0], changed))
            else:
                ambiguous.append(
                    {
                        "key": key,
                        "existing_count": len(existing_list),
                        "new_count": len(new_list),
                        "existing_ids": [str(g.id) for g in existing_list],
                    }
                )

        report = {
            "to_add": [{"project_name": r["project_name"], "grantor": r["grantor"], "funding_source": r["funding_source"]} for r in to_add],
            "to_remove": [
                {"id": str(g.id), "project_name": g.project_name, "grantor": g.grantor, "funding_source": g.funding_source}
                for g in to_remove
            ],
            "to_update": [
                {
                    "id": str(g.id),
                    "project_name": g.project_name,
                    "grantor": g.grantor,
                    "funding_source": g.funding_source,
                    "changed_fields": jsonable(changed),
                }
                for g, _new, changed in to_update
            ],
            "ambiguous": [{**a, "key": list(a["key"])} for a in ambiguous],
            "counts": {
                "to_add": len(to_add),
                "to_remove": len(to_remove),
                "to_update": len(to_update),
                "ambiguous_groups": len(ambiguous),
                "existing_total": len(existing_grants),
                "new_total": len(new_records),
            },
        }

        report_path = args.report or (Path(__file__).parent / "sync_grants_report.json")
        report_path.write_text(json.dumps(report, indent=2, default=str))

        print(f"Existing grants in DB: {len(existing_grants)}")
        print(f"Rows in workbook:      {len(new_records)}")
        print(f"To add:                {len(to_add)}")
        print(f"To remove:             {len(to_remove)}")
        print(f"To update:             {len(to_update)}")
        print(f"Ambiguous (skipped):   {len(ambiguous)} composite-key groups")
        print(f"\nFull report written to {report_path}")

        if not args.apply:
            print("\nDry run only -- no changes applied. Re-run with --apply to apply.")
            return

        system_user = db.scalar(select(User).where(User.email == SYSTEM_IMPORT_EMAIL))

        for record in to_add:
            grant = Grant(
                project_name=record["project_name"],
                grantor=record["grantor"],
                funding_source=record["funding_source"],
                grant_officer=record["grant_officer"],
                scope=record["scope"],
                current_exp_date=record["current_exp_date"],
                orig_exp_date=record["orig_exp_date"],
                amended_exp_date=record["amended_exp_date"],
                grant_amount=record["grant_amount"],
                grants_manager=record["grants_manager"],
                program_manager=record["program_manager"],
                district=record["district"],
                withdrawn=False,
            )
            db.add(grant)
            db.flush()
            if record["notes"] and system_user:
                db.add(GrantNote(grant_id=grant.id, user_id=system_user.id, author_name=system_user.name, note_text=record["notes"]))
            write_audit_log(
                db,
                user_id=system_user.id if system_user else None,
                user_name=system_user.name if system_user else "System Import",
                action="created_grant",
                table_name="grants",
                record_id=grant.id,
                detail={"after": jsonable({f: record[f] for f in UPDATABLE_FIELDS}), "source": "master_log_sync"},
            )

        for grant, _new, changed in to_update:
            before = {k: getattr(grant, k) for k in changed}
            for key, value in changed.items():
                setattr(grant, key, value)
            write_audit_log(
                db,
                user_id=system_user.id if system_user else None,
                user_name=system_user.name if system_user else "System Import",
                action="updated_grant",
                table_name="grants",
                record_id=grant.id,
                detail={"before": jsonable(before), "after": jsonable(changed), "source": "master_log_sync"},
            )

        for grant in to_remove:
            from app.schemas.grant import GrantBase

            snapshot = GrantBase.model_validate(grant, from_attributes=True).model_dump(mode="json")
            snapshot["created_at"] = grant.created_at.isoformat()
            notes = db.scalars(select(GrantNote).where(GrantNote.grant_id == grant.id)).all()
            notes_snapshot = [
                {
                    "id": str(n.id),
                    "user_id": str(n.user_id) if n.user_id else None,
                    "author_name": n.author_name,
                    "note_text": n.note_text,
                    "created_at": n.created_at.isoformat(),
                }
                for n in notes
            ]
            write_audit_log(
                db,
                user_id=system_user.id if system_user else None,
                user_name=system_user.name if system_user else "System Import",
                action="deleted_grant",
                table_name="grants",
                record_id=grant.id,
                detail={
                    "project_name": grant.project_name,
                    "snapshot": snapshot,
                    "notes_snapshot": notes_snapshot,
                    "source": "master_log_sync",
                },
            )
            db.delete(grant)

        db.commit()
        print(f"\nApplied: {len(to_add)} added, {len(to_update)} updated, {len(to_remove)} removed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
