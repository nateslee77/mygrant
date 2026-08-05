# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal grants tracking tool for the LA County Parks & Recreation Grants
Administration section (active/closed grants, deed restrictions, awarded
grants, periodic status report (PSR) due dates), with role-based access, a
full audit trail, and restore-from-deletion throughout. See `README.md` for
the full feature/module overview and permission matrix.

## Commands

### Backend (`backend/`, Python 3.12 — not 3.14, see README)

```
.venv\Scripts\pip install -r requirements.txt      # install deps
.venv\Scripts\alembic upgrade head                 # run migrations
.venv\Scripts\alembic revision --autogenerate -m "..."   # new migration
.venv\Scripts\uvicorn app.main:app --reload --port 8000  # run dev server
```

There is no backend test suite and no configured linter — don't invent
`pytest`/`ruff` commands.

### Frontend (`frontend/`)

```
npm install
npm run dev       # vite dev server, http://localhost:5173
npm run build
npm run lint       # eslint
```

There is no frontend test suite.

### One-off data-import scripts (`scripts/`)

All idempotent, print a summary of what changed, take a source file path
(kept outside the repo) as an argument: `import_grants.py`,
`import_deed_restrictions.py`, `import_psr_log.py`,
`sync_grants_from_master_log.py` (dry-run unless `--apply`),
`backfill_sharepoint_links.py`.

## Architecture

React + Vite + Tailwind frontend (Vercel) talks JSON/REST to a FastAPI
backend (Docker on Render), which talks to a Supabase-hosted Postgres via
SQLAlchemy directly (not the Supabase client SDK).

**Backend layout** (`backend/app/`):
- `routers/` — one file per resource area (grants, psr, deed_restrictions,
  grant_awards, admin, auth, dashboard, notifications, photo_template),
  registered in `main.py`.
- `models/models.py` — all SQLAlchemy models in one file.
- `schemas/` — Pydantic request/response models, one file per resource area.
- `services/` — cross-cutting logic used by routers: `audit.py`
  (`write_audit_log`), `grant_status.py` (`compute_status`), `pdf.py`
  (WeasyPrint rendering), `photo_template.py` (python-docx generation),
  `notifications.py`.
- `core/` — `deps.py` (auth dependencies), `security.py` (JWT/bcrypt),
  `database.py` (session/engine), `config.py` (Pydantic settings from env).

**Auth** is fully custom (no Supabase Auth SDK): short-lived JWT access
token returned in the response body and sent via `Authorization: Bearer`;
a longer-lived refresh token lives in an httpOnly `SameSite=None; Secure`
cookie (required because frontend and API are on different origins).
`app/core/deps.py` defines `get_current_user` plus role dependencies
`require_admin` / `require_editor` / `require_any_role`, enforced per-route
and mirrored in the frontend by hiding buttons/inputs per role — see the
permission matrix in `README.md`. On the frontend, `frontend/src/lib/api.js`
holds the in-memory access token and an axios response interceptor that
transparently calls `/auth/refresh` on a 401 and retries the original
request once; `AuthContext.jsx` wires this to app-level login state.

**Status is never stored.** `Grant` status is computed at query/render time
in `services/grant_status.py::compute_status` from `withdrawn` →
`status_override` → `current_exp_date` vs. today, in that priority order.
Don't add a `status` column — compute it, or extend `compute_status`.

**Audit trail.** Every create/update/delete that matters calls
`services/audit.py::write_audit_log(...)`, writing an append-only
`AuditLog` row with a `user_name` snapshot (not just `user_id`, which is
nullable/`SET NULL` on user deletion — see `models.py` comments). Deletions
of grants, notes, awards, deed restrictions, and PSR projects must remain
restorable from Admin → Change Log; when adding a new deletable entity,
follow this same snapshot + soft-restore pattern rather than hard-deleting
without a trail.

**PSR (Status Reports)** is the one multi-child model: `PSRProject` has
many `PSRDueDate` (one project can have several due dates) and many
`PSRNote`, both `cascade="all, delete-orphan"`. Grantor `category` and
`grantor` are kept in sync (category implies grantor) per recent commits —
check `psr.py` router/schema before changing one without the other.

**Photo Summary Template** (`services/photo_template.py`) generates a
landscape Word doc from 2–6 uploaded photos via python-docx + Pillow.
Layout is driven by `ROW_LAYOUTS` (photo count → per-row photo counts,
e.g. 5 → `[3, 2]`) and `WIDTH_BY_LAYOUT` (keyed by `(row count, widest row
column count)`); rows are built on a `max_cols * 2`-unit table grid so a
shorter bottom row can be centered by merging offset unit-cells. Photos are
re-encoded through Pillow (EXIF-transposed, center-cropped to a fixed 3:2
ratio) before insertion because python-docx's own image sniffer rejects
many real-world camera JPEGs.

**PDF export** (`services/pdf.py`, WeasyPrint) requires native GTK3 libs
that aren't available by default on Windows dev machines (admin install
required) — the import is lazy so nothing else breaks if it's missing
locally; Docker/Render deploys install the apt packages and are unaffected.

## Environment

Root `.env` (`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_INVITE_DOMAIN`,
`FRONTEND_URL`) and `frontend/.env` (`VITE_API_URL`) — see
`.env.example` files. First admin/System Import user is created via
`scripts/seed_admin.py` (safe to re-run).

## Git

Never add Claude/Anthropic co-author attribution (e.g. `Co-Authored-By:
Claude ...`) to commit messages in this repo. Commit only when explicitly
asked; push only when explicitly asked.
