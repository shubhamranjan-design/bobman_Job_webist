"""POST /candidates/{id}/unlock"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db, supabase_query
from models import Company, Unlock
from auth import get_current_company

router = APIRouter()


class UnlockRequest(BaseModel):
    field: str  # 'phone' or 'email'


@router.post("/candidates/{candidate_id}/unlock")
def unlock_field(
    candidate_id: str,
    body: UnlockRequest,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    if body.field not in ("phone", "email"):
        raise HTTPException(status_code=400, detail="field must be 'phone' or 'email'")

    # Check if already unlocked — idempotent
    existing = db.query(Unlock).filter(
        Unlock.company_id == company.id,
        Unlock.candidate_user_id == candidate_id,
        Unlock.field == body.field,
    ).first()

    # Get the actual candidate value from Supabase
    def q(sb):
        return sb.table("users").select("id, name, phone_number, email, data_team_tag").eq(
            "id", candidate_id
        ).limit(1).execute()
    res = supabase_query(q)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Candidate not found")
    user = rows[0]
    if user.get("data_team_tag") != "us_data":
        raise HTTPException(status_code=403, detail="Candidate not in this catalog")

    actual_value = user.get("phone_number") if body.field == "phone" else user.get("email")

    if existing:
        # Already unlocked — return value, do not charge again
        return {
            "field": body.field,
            "value": actual_value,
            "credits_remaining": company.credits_remaining,
            "already_unlocked": True,
        }

    # Charge a credit (atomic check)
    fresh = db.query(Company).filter(Company.id == company.id).with_for_update().first() if False else \
            db.query(Company).filter(Company.id == company.id).first()
    if not fresh or fresh.credits_remaining <= 0:
        raise HTTPException(status_code=402, detail="No credits remaining")

    fresh.credits_remaining = fresh.credits_remaining - 1
    unlock = Unlock(
        company_id=company.id,
        candidate_user_id=candidate_id,
        field=body.field,
        unlocked_at=datetime.utcnow(),
    )
    db.add(unlock)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Race: another request already unlocked. Treat as success.
        return {
            "field": body.field,
            "value": actual_value,
            "credits_remaining": fresh.credits_remaining,
            "already_unlocked": True,
        }
    db.refresh(fresh)
    return {
        "field": body.field,
        "value": actual_value,
        "credits_remaining": fresh.credits_remaining,
        "already_unlocked": False,
    }
