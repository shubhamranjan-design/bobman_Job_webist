"""POST /login, GET /me"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import Company
from auth import verify_password, create_token, get_current_company

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.email == body.email.lower()).first()
    if not company or not verify_password(body.password, company.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(company.id, company.email)
    return {
        "token": token,
        "company": {
            "id": company.id,
            "email": company.email,
            "name": company.name,
            "credits_remaining": company.credits_remaining,
        },
    }


@router.get("/me")
def me(company: Company = Depends(get_current_company)):
    return {
        "id": company.id,
        "email": company.email,
        "name": company.name,
        "credits_remaining": company.credits_remaining,
    }
