"""Role list, role detail, candidates for a role, AI role search."""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from collections import Counter

from database import get_db, supabase_query
from models import Company, RoleView
from auth import get_current_company
from llm import match_roles_to_query

router = APIRouter()

# --- Helpers ---

def _profile_threshold_ok(pval, created):
    """Same logic as existing dashboard."""
    if pval is None:
        return False
    cutoff = "2026-02-10T23:59:59"
    return pval > 80 if (created or "") <= cutoff else pval >= 80


def _fetch_jd_rows():
    """All active US JDs, deduped by role_code."""
    def q(sb):
        return sb.table("jd_data").select(
            "id, role_code, role_name, location, experience_range, vendor_rate_per_month, "
            "no_of_positions, no_of_positions_available_to_match, working_hours, time_zone, "
            "contract_duration, brief_context, jd_text, status, payroll, created_at, updated_at"
        ).eq("data_team_tag", "us_data").execute()
    res = supabase_query(q)
    rows = res.data or []
    rows = [r for r in rows if (r.get("status") or "").lower() == "active"]
    # Deduplicate by role_code (keep newest by updated_at)
    by_code = {}
    for r in rows:
        rc = r.get("role_code")
        if not rc:
            continue
        if rc not in by_code or (r.get("updated_at") or "") > (by_code[rc].get("updated_at") or ""):
            by_code[rc] = r
    return list(by_code.values())


def _candidate_count_per_role() -> dict[str, int]:
    """Count of us_data users per team_role_code."""
    def q(sb):
        # Page through all
        all_rows = []
        offset = 0
        PAGE = 1000
        while True:
            r = sb.table("users").select("team_role_code").eq(
                "data_team_tag", "us_data"
            ).range(offset, offset + PAGE - 1).execute()
            rows = r.data or []
            all_rows.extend(rows)
            if len(rows) < PAGE:
                break
            offset += PAGE
        return all_rows
    rows = supabase_query(q)
    return dict(Counter([r.get("team_role_code") for r in rows if r.get("team_role_code")]))


def _public_role_dict(jd: dict, candidate_count: int) -> dict:
    return {
        "role_code": jd.get("role_code"),
        "role_name": jd.get("role_name"),
        "location": jd.get("location"),
        "experience_range": jd.get("experience_range"),
        "vendor_rate_per_month": jd.get("vendor_rate_per_month"),
        "no_of_positions": jd.get("no_of_positions"),
        "no_of_positions_available_to_match": jd.get("no_of_positions_available_to_match"),
        "working_hours": jd.get("working_hours"),
        "time_zone": jd.get("time_zone"),
        "contract_duration": jd.get("contract_duration"),
        "brief_context": jd.get("brief_context"),
        "candidate_count": candidate_count,
    }


def _full_role_dict(jd: dict, candidate_count: int) -> dict:
    base = _public_role_dict(jd, candidate_count)
    base["jd_text"] = jd.get("jd_text")
    base["payroll"] = jd.get("payroll")
    return base


# --- Endpoints ---

@router.get("/roles")
def list_roles(_: Company = Depends(get_current_company)):
    jds = _fetch_jd_rows()
    counts = _candidate_count_per_role()
    out = [_public_role_dict(jd, counts.get(jd.get("role_code"), 0)) for jd in jds]
    out.sort(key=lambda r: r.get("role_code") or "")
    return {"roles": out}


@router.get("/roles/search")
def search_roles(
    q: str = Query(..., min_length=1),
    _: Company = Depends(get_current_company),
):
    """AI fuzzy search over role name + brief context."""
    codes = match_roles_to_query(q)
    if not codes:
        return {"roles": [], "query": q}
    jds = _fetch_jd_rows()
    by_code = {jd.get("role_code"): jd for jd in jds}
    counts = _candidate_count_per_role()
    out = []
    for c in codes:
        jd = by_code.get(c)
        if jd:
            out.append(_public_role_dict(jd, counts.get(c, 0)))
    return {"roles": out, "query": q}


@router.get("/roles/{code}")
def get_role(
    code: str,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    jds = _fetch_jd_rows()
    jd = next((r for r in jds if r.get("role_code") == code), None)
    if not jd:
        raise HTTPException(status_code=404, detail="Role not found")
    counts = _candidate_count_per_role()
    # Track view
    db.add(RoleView(company_id=company.id, role_code=code, viewed_at=datetime.utcnow()))
    db.commit()
    return {"role": _full_role_dict(jd, counts.get(code, 0))}


@router.get("/roles/{code}/candidates")
def list_candidates_for_role(
    code: str,
    limit: int = Query(20, ge=1, le=100),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Top N candidates: Interested first, then Match No Interest, then 80+ No Match.
    No internal stage labels are leaked to the response.
    """
    # Fetch all us_data users for this role_code
    def q(sb):
        return sb.table("users").select(
            "id, name, profile_completion_per, created_at, jobs_interested_count, "
            "best_match_score, total_call_duration_secs, team_role_code"
        ).eq("data_team_tag", "us_data").eq("team_role_code", code).execute()
    res = supabase_query(q)
    users = res.data or []
    if not users:
        return {"role_code": code, "candidates": []}

    # Find which have matches
    user_ids = [u["id"] for u in users]
    match_ids = set()
    for i in range(0, len(user_ids), 200):
        batch = user_ids[i:i + 200]
        def qm(sb):
            return sb.table("candidate_jd_matches").select("candidate_id").in_("candidate_id", batch).execute()
        try:
            r2 = supabase_query(qm)
            for m in (r2.data or []):
                match_ids.add(m.get("candidate_id"))
        except Exception:
            pass

    # Categorize and sort
    interested, match_no_int, no_match_80 = [], [], []
    for u in users:
        is_int = (u.get("jobs_interested_count") or 0) > 0
        has_match = u["id"] in match_ids
        is_80 = _profile_threshold_ok(u.get("profile_completion_per"), u.get("created_at"))
        if is_int:
            interested.append(u)
        elif has_match:
            match_no_int.append(u)
        elif is_80:
            no_match_80.append(u)

    def score(u):
        return (u.get("best_match_score") or 0, u.get("profile_completion_per") or 0)
    for lst in (interested, match_no_int, no_match_80):
        lst.sort(key=score, reverse=True)

    # Pick up to `limit` candidates, prioritizing tiers (no tier label leaked)
    selected = []
    candidate_ids_in_order = []
    for tier_name, lst in [("interested", interested), ("match_no_interest", match_no_int), ("no_match_80", no_match_80)]:
        for u in lst:
            if len(selected) >= limit:
                break
            selected.append({
                "id": u["id"],
                "name": u.get("name"),
                "_tier": tier_name,  # internal only, frontend should ignore
            })
            candidate_ids_in_order.append(u["id"])
        if len(selected) >= limit:
            break

    # Track view
    db.add(RoleView(company_id=company.id, role_code=code, viewed_at=datetime.utcnow()))
    db.commit()

    # Return slim list — only id + name. Frontend adds badges/labels itself.
    public = [{"id": c["id"], "name": c["name"]} for c in selected]
    return {
        "role_code": code,
        "total_candidates": len(interested) + len(match_no_int) + len(no_match_80),
        "candidates": public,
    }
