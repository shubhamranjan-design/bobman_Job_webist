"""Public anonymized candidate catalog.

Each row is a (candidate, role) match pair. A single candidate matched against
multiple roles produces multiple rows with distinct masked IDs.
"""
import json
import time
import logging
from collections import defaultdict
from typing import Optional
from fastapi import APIRouter, Query

from database import supabase_query
from utils.masking import mask_id, parse_masked_id, mask_name, name_initials
from llm import match_roles_to_query

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory cache (5 min TTL)
_CACHE: dict = {"data": None, "ts": 0.0}
_TTL = 300


def _fetch_all_us_data_users():
    def q(sb):
        out = []
        offset = 0
        while True:
            r = sb.table("users").select(
                "id, name, profile_completion_per, created_at, jobs_interested_count, "
                "best_match_score, successful_calls, team_role_code, "
                "generated_cv_text, cumulative_summary"
            ).eq("data_team_tag", "us_data").range(offset, offset + 999).execute()
            rows = r.data or []
            out.extend(rows)
            if len(rows) < 1000:
                break
            offset += 1000
        return out
    return supabase_query(q)


def _fetch_jd_lookup():
    """role_code -> {role_name}. De-duped by role_code (keep most recently updated)."""
    def q(sb):
        return sb.table("jd_data").select("id, role_code, role_name, status, updated_at").eq(
            "data_team_tag", "us_data"
        ).execute()
    res = supabase_query(q)
    rows = res.data or []
    role_to_name: dict[str, dict] = {}
    jd_to_role: dict[str, str] = {}
    for r in rows:
        rc = r.get("role_code")
        rn = r.get("role_name")
        if not rc:
            continue
        jd_to_role[r["id"]] = rc
        existing = role_to_name.get(rc)
        if not existing or (r.get("updated_at") or "") > (existing.get("updated_at") or ""):
            role_to_name[rc] = {"role_name": rn, "updated_at": r.get("updated_at")}
    return role_to_name, jd_to_role


def _fetch_all_matches(jd_ids: list[str]) -> list[dict]:
    out = []
    for i in range(0, len(jd_ids), 50):
        batch = jd_ids[i:i + 50]
        def q(sb):
            return sb.table("candidate_jd_matches").select(
                "candidate_id, jd_id, matching_score"
            ).in_("jd_id", batch).execute()
        try:
            r = supabase_query(q)
            out.extend(r.data or [])
        except Exception as e:
            logger.warning(f"match fetch batch failed: {e}")
    return out


def _safe_parse_json(val):
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return None
    return None


def _parse_cumulative_safely(raw):
    """cumulative_summary is sometimes double-encoded + truncated. Best-effort parse."""
    if not raw:
        return None
    val = raw
    for _ in range(2):
        if isinstance(val, str):
            try:
                val = json.loads(val)
                continue
            except Exception:
                break
        else:
            break
    if isinstance(val, dict):
        return val
    if not isinstance(val, str):
        return None
    for fix in ['"', '"]', '"]}', '"}', ']}', '}', '"]}}', '}}']:
        try:
            obj = json.loads(val + fix)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
    return None


def _experience_years(u: dict) -> int:
    """Best-effort experience extraction from cumulative_summary first, then CV."""
    cs = _parse_cumulative_safely(u.get("cumulative_summary"))
    if isinstance(cs, dict):
        try:
            yrs = int(cs.get("experience_years") or 0)
            if yrs > 0:
                return yrs
        except Exception:
            pass
    # fallback: rough count from work_experience array length × 2
    cv = _safe_parse_json(u.get("generated_cv_text")) or {}
    we = cv.get("work_experience") if isinstance(cv, dict) else None
    if isinstance(we, list) and we:
        return min(len(we) * 2, 25)
    return 0


def _build_catalog() -> list[dict]:
    """Build the full per-(candidate,role) catalog and cache it."""
    users = _fetch_all_us_data_users()
    user_by_id = {u["id"]: u for u in users}
    role_to_meta, jd_to_role = _fetch_jd_lookup()
    jd_ids = list(jd_to_role.keys())
    matches = _fetch_all_matches(jd_ids)

    # Per (candidate, role) take the MAX score across multiple JDs with same role
    per_pair: dict[tuple[str, str], float] = {}
    for m in matches:
        cid = m["candidate_id"]
        role = jd_to_role.get(m["jd_id"])
        if not role:
            continue
        s = m.get("matching_score") or 0
        key = (cid, role)
        if s > per_pair.get(key, -1):
            per_pair[key] = s

    out = []
    for (cid, role), score in per_pair.items():
        u = user_by_id.get(cid)
        if not u:
            continue
        cv = _safe_parse_json(u.get("generated_cv_text")) or {}
        pi = cv.get("personal_info") or {}
        cur_role = cv.get("current_role") or {}
        skills_obj = cv.get("skills") or {}
        if isinstance(skills_obj, dict):
            tech = skills_obj.get("technical_skills") or skills_obj.get("hard_skills") or []
        elif isinstance(skills_obj, list):
            tech = skills_obj
        else:
            tech = []
        all_skills = [str(s) for s in tech if s]

        title = cur_role.get("title") or "Robotics engineer"
        role_meta = role_to_meta.get(role) or {}
        full_name = u.get("name")  # used only for masking helpers — never returned raw
        out.append({
            "masked_id": mask_id(cid, role),
            "masked_name": mask_name(full_name),
            "initials": name_initials(full_name),
            "candidate_id": cid,
            "role_code": role,
            "role_name": role_meta.get("role_name") or role,
            "match_score": round(score, 2) if score >= 0 else None,
            "headline": title,
            "location_city": pi.get("current_location") or pi.get("location") or "",
            "all_skills": all_skills,
            "top_skills": all_skills[:3],
            "skills_count": len(all_skills),
            "experience_years": _experience_years(u),
            "successful_calls": u.get("successful_calls") or 0,
            "profile_completion_per": u.get("profile_completion_per") or 0,
            "created_at": u.get("created_at"),
        })

    # Default sort: best score desc
    out.sort(key=lambda r: (r.get("match_score") or 0, r.get("profile_completion_per") or 0), reverse=True)
    return out


def _get_cached_catalog() -> list[dict]:
    now = time.time()
    if _CACHE["data"] and (now - _CACHE["ts"]) < _TTL:
        return _CACHE["data"]
    data = _build_catalog()
    _CACHE["data"] = data
    _CACHE["ts"] = now
    return data


@router.get("/catalog")
def get_catalog(
    role_code: Optional[str] = Query(None),
    min_experience: int = Query(0, ge=0, le=40),
    q: Optional[str] = Query(None),
    sort: str = Query("score_desc"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    items = _get_cached_catalog()

    if role_code:
        items = [c for c in items if c.get("role_code") == role_code]

    if min_experience > 0:
        items = [c for c in items if (c.get("experience_years") or 0) >= min_experience]

    if q and q.strip():
        codes = match_roles_to_query(q.strip())
        if codes:
            items = [c for c in items if c.get("role_code") in codes]
        else:
            terms = [t.lower() for t in q.split() if len(t) > 1]
            def hit(c):
                hay = (c.get("headline") or "").lower() + " " + " ".join(c.get("all_skills") or []).lower()
                return any(t in hay for t in terms)
            items = [c for c in items if hit(c)]

    if sort == "experience_desc":
        items = sorted(items, key=lambda c: (c.get("experience_years") or 0), reverse=True)
    elif sort == "recent":
        items = sorted(items, key=lambda c: c.get("created_at") or "", reverse=True)
    # default: already score_desc

    total = len(items)
    page = items[offset:offset + limit]
    # Strip internal candidate_id from response (not used by frontend)
    public = []
    for c in page:
        d = {k: v for k, v in c.items() if k != "candidate_id"}
        public.append(d)
    return {"items": public, "total": total, "offset": offset, "limit": limit}


@router.get("/roles_public")
def list_roles_public():
    """Public role list for the filter dropdown — no auth required.
    Returns role_code + role_name only (no client info)."""
    role_to_meta, _ = _fetch_jd_lookup()
    roles = [{"role_code": rc, "role_name": (m or {}).get("role_name") or rc}
             for rc, m in role_to_meta.items()]
    roles.sort(key=lambda r: r["role_code"])
    return {"roles": roles}


def find_uuid_by_masked(masked_id: str) -> Optional[str]:
    """Resolve masked ID -> full UUID. Ignores role suffix."""
    items = _get_cached_catalog()
    short, _ = parse_masked_id(masked_id)
    if not short:
        return None
    for c in items:
        if c["candidate_id"].replace("-", "")[:6].upper() == short:
            return c["candidate_id"]
    return None


def get_role_for_masked(masked_id: str) -> Optional[dict]:
    """Returns {role_code, role_name, match_score} for the masked_id, or None."""
    items = _get_cached_catalog()
    target = masked_id.upper().strip()
    for c in items:
        if c["masked_id"].upper() == target:
            return {
                "role_code": c["role_code"],
                "role_name": c["role_name"],
                "match_score": c["match_score"],
            }
    return None


def get_all_roles_for_candidate(candidate_uuid: str) -> list[dict]:
    """All (role_code, role_name, match_score, masked_id) entries for a given candidate UUID."""
    items = _get_cached_catalog()
    out = []
    for c in items:
        if c["candidate_id"] == candidate_uuid:
            out.append({
                "masked_id": c["masked_id"],
                "role_code": c["role_code"],
                "role_name": c["role_name"],
                "match_score": c["match_score"],
            })
    return sorted(out, key=lambda x: (x["match_score"] or 0), reverse=True)
