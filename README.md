# LA County Parks — Grants Management System

Internal grants tracking tool for LA County Parks & Recreation, Grants
Administration section. Replaces the spreadsheet + SharePoint workflow with a
small FastAPI + React app backed by Supabase Postgres.

## Stack

- **Backend:** FastAPI (Python 3.12), SQLAlchemy + Alembic, custom JWT auth (no Supabase Auth SDK)
- **Database:** Supabase Postgres, accessed via a direct connection string
- **Email:** Resend REST API (invite emails only)
- **Frontend:** React + Vite + Tailwind CSS, TanStack Query, React Router
- **PDF export:** WeasyPrint

## One-time setup

### 1. Environment variables

Copy `.env.example` to `.env` at the repo root and fill in real values:

```
DATABASE_URL=
JWT_SECRET=
ALLOWED_INVITE_DOMAIN=parks.lacounty.gov
FRONTEND_URL=http://localhost:5173
```

Also copy `frontend/.env.example` to `frontend/.env` (sets `VITE_API_URL`,
defaults to `http://localhost:8000`).

### 2. Backend — install & migrate

**Use Python 3.12**, not 3.14 — several dependencies (notably `pydantic-core`)
don't yet ship prebuilt wheels for 3.14, which forces a from-source Rust build
that is likely to fail on a locked-down machine.

```
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\alembic upgrade head
```

### 3. Seed the first admin user + System Import user

```
.venv\Scripts\python ..\scripts\seed_admin.py --email you@parks.lacounty.gov --name "Your Name" --password "at-least-8-chars"
```

Safe to re-run — skips users that already exist.

### 4. Import the CSV data

Place the source CSV(s) in `data/` (gitignored — this is internal county
data and shouldn't live in the repo). Run the importer once per file:

```
.venv\Scripts\python ..\scripts\import_grants.py ..\data\active_grants.csv
.venv\Scripts\python ..\scripts\import_grants.py ..\data\closed_grants.csv
```

The importer is generic — point it at any CSV shaped like the source export
(`PROJECT NAME, GRANTOR, FUNDING SOURCE/ GRANT PROGRAM, Grant Officer, Scope,
CURRENT GRANT EXP DATE, ORIG GRANT EXP DATE, AMENDED EXP DATE, GRANT AMT,
Grants Manager, Program Manager/Project Manager, SD, Notes, SharePoint Folder
Link`). It skips blank rows and known footer/summary rows (`TOTAL OPEN
GRANTS`, `CLOSE OUT PHASE`, `WITHDRAWING`, `NEW`, `#####` placeholder rows,
etc.) and prints a read/imported/skipped summary with reasons at the end.

Each source file's rows become their own grant records — if the same project
appears in both files (e.g. an older closed-grants log and the current
active-grants log), both rows are imported as separate grants rather than
merged, since a single project can legitimately have several grants attached
to it (different grantors/funding sources). Review the skip summary after
each run.

### 5. Run the backend

```
cd backend
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

### 6. Run the frontend

```
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`.

## Known environment caveat: WeasyPrint on Windows

The PDF snapshot endpoint (`GET /grants/{id}/pdf`) uses WeasyPrint, which
depends on the native GTK3 libraries (Pango/Cairo/GObject) for text layout.
These aren't bundled by pip on Windows and installing them requires the GTK3
runtime installer, which needs administrator rights. This doesn't affect
Linux/Docker deployments (`apt install libpango-1.0-0 libcairo2` is all
that's needed there) — it's a Windows-local-dev-only issue.

To test PDF export locally on Windows, install the GTK3 runtime (requires
admin): download from
https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases
and run the installer normally, then restart your terminal.

## Status computation

Grant status is never stored — it's computed at query/render time:

```
if withdrawn:       "Withdrawn"
elif current_exp_date < today: "Closed"
else:                "Active"
```

`withdrawn` is a manual override, toggled from the Grant Detail page
(admin/editor only).

## Permission matrix

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View dashboard/grants/detail | ✓ | ✓ | ✓ |
| Edit grant fields / SharePoint link | ✓ | ✓ | ✗ |
| Add update-history note | ✓ | ✓ | ✗ |
| Download PDF snapshot | ✓ | ✓ | ✓ |
| Invite/manage users | ✓ | ✗ | ✗ |

Enforced on the backend (403s via `require_editor`/`require_admin`
dependencies) and mirrored in the frontend (buttons/inputs hidden per role).
