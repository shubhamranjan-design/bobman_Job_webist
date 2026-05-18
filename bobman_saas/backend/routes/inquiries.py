"""Inquiry / Schedule-Interviews submission endpoint."""
import json
import os
import re
from datetime import datetime
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Inquiry

router = APIRouter()

LOG_DIR = Path("/var/log/bobman_saas")
LOG_FILE = LOG_DIR / "inquiries.log"


def _ensure_log_writable() -> Path | None:
    """Try /var/log/bobman_saas first; fall back to local backend dir if not writable."""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        LOG_FILE.touch(exist_ok=True)
        return LOG_FILE
    except PermissionError:
        fallback = Path(os.path.dirname(os.path.abspath(__file__))).parent / "inquiries.log"
        try:
            fallback.touch(exist_ok=True)
            return fallback
        except Exception:
            return None


class InquiryRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    budget: Optional[str] = Field(None, max_length=120)
    role_code: Optional[str] = Field(None, max_length=200)  # accepts free-text role label
    email: EmailStr
    contact: str = Field(..., min_length=4, max_length=40)
    notes: Optional[str] = Field(None, max_length=2000)
    candidate_ids: list[str] = Field(..., min_length=1, max_length=200)


@router.post("/inquiries")
def create_inquiry(
    body: InquiryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    # Accept masked IDs (C-XXXXXX or C-XXXXXX-USXX) or full UUIDs.
    uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
    masked_re = re.compile(r"^C-[0-9A-Fa-f]{6}(?:-US\d{2})?$", re.I)
    cids = [c.strip() for c in body.candidate_ids if c and (uuid_re.match(c.strip()) or masked_re.match(c.strip()))]
    if not cids:
        raise HTTPException(status_code=400, detail="No valid candidate_ids provided")

    user_agent = request.headers.get("user-agent", "")[:300]
    # X-Forwarded-For from nginx; fallback to client.host
    fwd = request.headers.get("x-forwarded-for", "")
    ip = (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")) or ""

    inquiry = Inquiry(
        company_name=body.company_name.strip(),
        budget=(body.budget or "").strip() or None,
        role_code=(body.role_code or "").strip() or None,
        email=body.email.lower(),
        contact=body.contact.strip(),
        notes=(body.notes or "").strip() or None,
        candidate_ids=json.dumps(cids),
        candidate_count=len(cids),
        user_agent=user_agent,
        ip_address=ip,
        created_at=datetime.utcnow(),
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)

    # Log line for ops visibility
    log_path = _ensure_log_writable()
    if log_path:
        try:
            log_line = json.dumps({
                "ts": inquiry.created_at.isoformat() + "Z",
                "id": inquiry.id,
                "company": inquiry.company_name,
                "email": inquiry.email,
                "contact": inquiry.contact,
                "budget": inquiry.budget,
                "role_code": inquiry.role_code,
                "candidate_count": inquiry.candidate_count,
                "candidates": cids,
                "notes": inquiry.notes,
                "ip": inquiry.ip_address,
            })
            with log_path.open("a") as f:
                f.write(log_line + "\n")
        except Exception:
            pass

    return {
        "id": inquiry.id,
        "created_at": inquiry.created_at.isoformat() + "Z",
        "message": "Thanks — our team will reach out within 24 hours.",
    }
