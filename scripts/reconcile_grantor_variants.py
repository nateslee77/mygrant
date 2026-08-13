"""One-off: reclassify master-log sync add/remove pairs that are really the
same grant with a differently-punctuated "State of California ... Natural
Resources Agency" grantor string, so they become in-place updates instead of
delete+recreate. Existing DB grantor text is preserved (not overwritten with
the workbook's inconsistent spelling); other changed fields are still applied.

Usage:
    python scripts/reconcile_grantor_variants.py path/to/file.xlsx            # dry run
    python scripts/reconcile_grantor_variants.py path/to/file.xlsx --apply
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sync_grants_from_master_log as sync  # noqa: E402

from sqlalchemy import select  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
from app.core.database import SessionLocal  # noqa: E402
from app.models.models import Grant, User  # noqa: E402
from app.services.audit import write_audit_log  # noqa: E402


def loose_grantor(g) -> str:
    s = sync.norm(g)
    s = re.sub(r"[-_]", " ", s)
    s = re.sub(r"\bthe\b", " ", s)
    s = re.sub(r"\bnatural\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def loose_key(record_or_dict) -> tuple:
    d = record_or_dict
    return (sync.norm(d["project_name"]), loose_grantor(d["grantor"]), sync.norm(d["funding_source"]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx_path", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    new_records = sync.parse_workbook(args.xlsx_path)
    new_groups = sync.group_by_key(new_records, sync.composite_key)

    db = SessionLocal()
    try:
        existing_grants = db.scalars(select(Grant)).all()
        existing_groups = sync.group_by_key(existing_grants, lambda g: sync.composite_key(sync.grant_to_dict(g)))

        all_keys = set(new_groups) | set(existing_groups)

        # Recompute the plain add/remove sets exactly as sync_grants_from_master_log does.
        plain_to_add, plain_to_remove = [], []
        for key in all_keys:
            new_list = new_groups.get(key, [])
            existing_list = existing_groups.get(key, [])
            if len(new_list) <= 1 and len(existing_list) <= 1:
                if new_list and not existing_list:
                    plain_to_add.append(new_list[0])
                elif existing_list and not new_list:
                    plain_to_remove.append(existing_list[0])

        # Only reclassify pairs where BOTH the grantor contains "california"
        # (limits this to the CA Natural Resources Agency family, not a
        # general-purpose fuzzy matcher) and only match one-to-one.
        add_by_loose = {}
        for r in plain_to_add:
            if "california" not in sync.norm(r["grantor"]):
                continue
            add_by_loose.setdefault(loose_key(r), []).append(r)

        remove_by_loose = {}
        for g in plain_to_remove:
            if "california" not in sync.norm(g.grantor):
                continue
            remove_by_loose.setdefault(loose_key(sync.grant_to_dict(g)), []).append(g)

        reclassified = []  # (grant, new_record, changed_fields)
        still_add, still_remove = list(plain_to_add), list(plain_to_remove)

        for lkey, adds in add_by_loose.items():
            removes = remove_by_loose.get(lkey)
            if not removes or len(adds) != 1 or len(removes) != 1:
                continue
            new_record = adds[0]
            grant = removes[0]
            before = sync.grant_to_dict(grant)
            after = dict(new_record)
            after["grantor"] = grant.grantor  # keep DB's clean spelling
            changed = sync.diff_fields(before, after)
            reclassified.append((grant, after, changed))
            still_add.remove(new_record)
            still_remove.remove(grant)

        print(f"Reclassified (grantor-spelling-only) pairs: {len(reclassified)}")
        for grant, after, changed in reclassified:
            print(f"  - {grant.project_name!r}  [{grant.grantor}]  changed_fields={list(changed.keys())}")

        print(f"\nRemaining genuine to_add:    {len(still_add)}")
        for r in still_add:
            print(f"  + {r['project_name']!r}  grantor={r['grantor']!r}  funding_source={r['funding_source']!r}")

        print(f"\nRemaining genuine to_remove: {len(still_remove)}")
        for g in still_remove:
            print(f"  - {g.project_name!r}  grantor={g.grantor!r}  funding_source={g.funding_source!r}")

        if not args.apply:
            print("\nDry run only -- no changes applied. Re-run with --apply to apply.")
            return

        system_user = db.scalar(select(User).where(User.email == sync.SYSTEM_IMPORT_EMAIL))

        for grant, after, changed in reclassified:
            if not changed:
                continue
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
                detail={
                    "before": sync.jsonable(before),
                    "after": sync.jsonable(changed),
                    "source": "master_log_sync_grantor_reconcile",
                },
            )

        db.commit()
        print(f"\nApplied {len(reclassified)} in-place updates (grantor spelling preserved from DB).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
