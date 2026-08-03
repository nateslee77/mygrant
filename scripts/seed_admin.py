"""One-time script to seed the first admin user and the System Import user
(used to attribute notes carried over from the CSV import). Safe to re-run:
it skips users that already exist.

Usage:
    python scripts/seed_admin.py --email you@parks.lacounty.gov --name "Your Name" --password "at-least-8-chars"
"""
import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.models import User  # noqa: E402

SYSTEM_IMPORT_EMAIL = "system-import@parks.lacounty.gov"


def get_or_create_system_import_user(db) -> User:
    existing = db.scalar(select(User).where(User.email == SYSTEM_IMPORT_EMAIL))
    if existing:
        return existing
    user = User(
        email=SYSTEM_IMPORT_EMAIL,
        name="System Import",
        password_hash=None,
        role="admin",
        status="deactivated",
    )
    db.add(user)
    db.flush()
    print(f"Created System Import user ({SYSTEM_IMPORT_EMAIL})")
    return user


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    if len(args.password) < 8:
        print("Password must be at least 8 characters", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        get_or_create_system_import_user(db)

        existing_admin = db.scalar(select(User).where(User.email == args.email.lower()))
        if existing_admin:
            print(f"User {args.email} already exists (role={existing_admin.role}, status={existing_admin.status}); skipping.")
        else:
            admin = User(
                email=args.email.lower(),
                name=args.name,
                password_hash=hash_password(args.password),
                role="admin",
                status="active",
            )
            db.add(admin)
            print(f"Created admin user {args.email}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
