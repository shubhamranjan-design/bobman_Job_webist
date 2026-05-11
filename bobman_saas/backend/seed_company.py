"""CLI to create a company account locally.

Usage:
    ./venv/bin/python seed_company.py "Demo Robotics Inc" demo@robotics.ai password123 [credits]
"""
import sys
from datetime import datetime
from database import engine, SessionLocal, Base
from models import Company
from auth import hash_password


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    name = sys.argv[1]
    email = sys.argv[2].lower()
    password = sys.argv[3]
    credits = int(sys.argv[4]) if len(sys.argv) > 4 else 10

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(Company).filter(Company.email == email).first()
        if existing:
            print(f"ERROR: Company with email {email} already exists (id={existing.id}).")
            sys.exit(2)
        c = Company(
            email=email,
            password_hash=hash_password(password),
            name=name,
            credits_remaining=credits,
            created_at=datetime.utcnow(),
        )
        db.add(c)
        db.commit()
        db.refresh(c)
        print(f"Created company id={c.id}: {c.name} <{c.email}> with {c.credits_remaining} credits.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
