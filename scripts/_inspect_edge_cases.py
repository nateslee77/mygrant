import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sync_grants_from_master_log as sync  # noqa: E402

from sqlalchemy import select  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
from app.core.database import SessionLocal  # noqa: E402
from app.models.models import Grant  # noqa: E402

xlsx_path = Path(sys.argv[1])
new_records = sync.parse_workbook(xlsx_path)

dup_ids = [
    "61e9d497-9bdc-4751-9d5f-c975a389244f", "07190389-fc99-4bcd-bc44-7591e9a70c91",  # Veteran's Memorial
    "15aa0534-274e-4e2d-80bb-833e0da677f6", "abbad26e-0d19-4f84-8deb-269608a5b69b",  # Ted Watkins
    "1608712b-40b3-4a28-805a-16a5d1b9d78a", "e259d9cc-be1f-42f1-b520-d01ae42bc376",  # Pepperbrook
    "fef0cdb0-b12d-4bc4-a460-20d0fee8f5fe", "5d883053-11fa-4cdd-bc90-11d278c6bcdb",  # Mona Park Restroom
    "c04763bc-9474-4963-81b9-be22b5e5f823", "74a4520f-cefc-44e3-be69-222db6b04f87",  # Salazar Park Parkwide Mod
    "1d495e8c-5ebf-40f2-8085-d033c03645be", "d5d93c8a-54dd-4bb1-b9fd-3ab8d01ecefc",  # Landscape Recovery Center
]

db = SessionLocal()
grants = db.scalars(select(Grant).where(Grant.id.in_(dup_ids))).all()
print("=== DB duplicate rows ===")
for g in sorted(grants, key=lambda g: g.project_name):
    print(f"{g.id} | {g.project_name!r} | grantor={g.grantor!r} | funding_source={g.funding_source!r} | "
          f"current_exp={g.current_exp_date} | amount={g.grant_amount} | notes_count={len(g.notes)}")

print("\n=== Workbook rows for those project names ===")
names = {"veteran's memorial park restroom renovation", "ted watkins restroom renovation",
         "pepperbrook park restroom renovation project", "mona park restroom renovation",
         "salazar park parkwide modernization", "landscape recovery center - eaton canyon natural area",
         "everett martin park playground safety upgrades project", "acton park water play & cooling strategies"}
for r in new_records:
    if sync.norm(r["project_name"]) in names:
        print(f"{r['project_name']!r} | grantor={r['grantor']!r} | funding_source={r['funding_source']!r} | "
              f"current_exp={r['current_exp_date']} | amount={r['grant_amount']} | sheet={r['_sheet']}")

db.close()
