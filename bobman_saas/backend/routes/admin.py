"""Admin endpoints — token-protected."""
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import Company
from auth import hash_password, verify_admin_token

router = APIRouter()


class CreateCompanyRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    credits: int | None = None


@router.post("/admin/companies")
def create_company(
    body: CreateCompanyRequest,
    x_admin_token: str | None = Header(None, alias="X-Admin-Token"),
    db: Session = Depends(get_db),
):
    if not verify_admin_token(x_admin_token):
        raise HTTPException(status_code=403, detail="Invalid admin token")

    existing = db.query(Company).filter(Company.email == body.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Company with this email already exists")

    default_credits = int(os.getenv("DEFAULT_FREE_CREDITS", "10"))
    company = Company(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        name=body.name,
        credits_remaining=body.credits if body.credits is not None else default_credits,
        created_at=datetime.utcnow(),
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return {
        "id": company.id,
        "email": company.email,
        "name": company.name,
        "credits_remaining": company.credits_remaining,
    }
