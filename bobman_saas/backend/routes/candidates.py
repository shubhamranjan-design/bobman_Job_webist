"""GET /candidates/{id}?role={code}"""
import json
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db, supabase_query
from models import Company, Unlock
from auth import get_current_company
from llm import generate_pitch
from routes.roles import _profile_threshold_ok

router = APIRouter()


def _ranked_candidate_ids_for_role(role_code: str) -> list[str]:
    """Return ranked list of candidate UUIDs for a role (Interested → MatchNoInt → 80+NoMatch)."""
    def q(sb):
        return sb.table("users").select(
            "id, profile_completion_per, created_at, jobs_interested_count, best_match_score"
        ).eq("data_team_tag", "us_data").eq("team_role_code", role_code).execute()
    res = supabase_query(q)
    users = res.data or []
    if not users:
        return []
    ids = [u["id"] for u in users]
    match_ids = set()
    for i in range(0, len(ids), 200):
        batch = ids[i:i + 200]
        def qm(sb):
            return sb.table("candidate_jd_matches").select("candidate_id").in_("candidate_id", batch).execute()
        try:
            r2 = supabase_query(qm)
            for m in (r2.data or []):
                match_ids.add(m.get("candidate_id"))
        except Exception:
            pass

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
    return [u["id"] for u in (interested + match_no_int + no_match_80)]


def _safe_extract_strengths(val: Any) -> list:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(s) for s in val if s]
    if isinstance(val, str):
        # Try JSON parse
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(s) for s in parsed if s]
        except Exception:
            pass
        return [val] if val.strip() else []
    return [str(val)]


def _safe_json(val: Any) -> Any:
    """Parse JSON if string, else return as-is. Returns None on failure."""
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


def _parse_cumulative_summary(raw: Any) -> dict | None:
    """cumulative_summary may be: dict, JSON string, or DOUBLE-encoded JSON string,
    and may be TRUNCATED. Returns best-effort dict or None."""
    if raw is None:
        return None
    val = raw
    # Up to 2 levels of JSON unwrapping
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
    # Try common repairs for truncated JSON
    for fix in ['"', '"]', '"]}', '"}', ']}', '}', '"]}}', '}}']:
        try:
            obj = json.loads(val + fix)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
    # Last resort: strip back to last well-formed boundary
    truncated = val
    while truncated:
        last = max(truncated.rfind(']'), truncated.rfind('}'))
        if last < 0:
            break
        try:
            obj = json.loads(truncated[:last + 1] + '}')
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
        truncated = truncated[:last]
    return None


def _build_profile(user: dict) -> dict:
    """Extract a clean, structured profile from user fields. Only positives surfaced."""
    cv = _safe_json(user.get("generated_cv_text")) or {}
    wa = _safe_json(user.get("whatsapp_data_collected")) or {}
    cum = _parse_cumulative_summary(user.get("cumulative_summary")) or {}

    pi = cv.get("personal_info") if isinstance(cv, dict) else None
    pi = pi or {}

    cur_role = cv.get("current_role") if isinstance(cv, dict) else None
    cur_role = cur_role or {}

    skills = cv.get("skills") if isinstance(cv, dict) else None
    technical_skills = []
    if isinstance(skills, dict):
        technical_skills = skills.get("technical_skills") or skills.get("hard_skills") or []
    elif isinstance(skills, list):
        technical_skills = skills

    work_history = []
    we = cv.get("work_experience") if isinstance(cv, dict) else None
    if isinstance(we, list):
        for w in we[:6]:
            if isinstance(w, dict):
                work_history.append({
                    "company": w.get("company"),
                    "role": w.get("role") or w.get("title"),
                    "duration": w.get("duration"),
                    "responsibilities": (w.get("responsibilities") or [])[:4]
                        if isinstance(w.get("responsibilities"), list) else [],
                })

    education = []
    edu = cv.get("education") if isinstance(cv, dict) else None
    if isinstance(edu, list):
        for e in edu[:4]:
            if isinstance(e, dict):
                education.append({
                    "degree": e.get("degree"),
                    "institution": e.get("institution"),
                    "year": e.get("year"),
                    "field_of_study": e.get("field_of_study"),
                })

    achievements = cv.get("achievements_and_projects") if isinstance(cv, dict) else None
    if isinstance(achievements, str):
        achievements = [achievements]
    elif not isinstance(achievements, list):
        achievements = []

    # Compensation
    comp = cv.get("compensation_and_availability") if isinstance(cv, dict) else None
    comp = comp or {}
    notice_period = wa.get("notice_period") or comp.get("notice_period") or comp.get("notice")
    current_ctc = wa.get("current_ctc") or comp.get("current_ctc") or comp.get("current_compensation")
    expected_ctc = wa.get("expected_ctc") or comp.get("expected_ctc") or comp.get("expected_compensation")

    # Career preferences
    pref = cv.get("career_preferences") if isinstance(cv, dict) else None
    pref = pref or {}

    # Highlights from cumulative summary — positive items only
    highlights = []
    key_info = cum.get("key_information_gathered") if isinstance(cum, dict) else None
    if isinstance(key_info, list):
        # Filter out concerns/red-flags
        for item in key_info[:8]:
            s = str(item)
            low = s.lower()
            if any(k in low for k in ["concern", "red flag", "issue", "lacks", "weak", "missing", "not aware"]):
                continue
            highlights.append(s)

    return {
        "professional_summary": cv.get("professional_summary") if isinstance(cv, dict) else None,
        "personal_info": {
            "current_location": pi.get("current_location") or pi.get("location"),
            "open_to_relocation": pi.get("open_to_relocation"),
            "languages": pi.get("languages"),
        },
        "current_role": {
            "title": cur_role.get("title"),
            "company": cur_role.get("company"),
            "duration": cur_role.get("duration"),
        } if cur_role else None,
        "compensation": {
            "current_ctc": current_ctc,
            "expected_ctc": expected_ctc,
            "notice_period": notice_period,
        },
        "career_preferences": pref if pref else None,
        "work_history": work_history,
        "education": education,
        "skills": technical_skills[:25] if technical_skills else [],
        "achievements": achievements[:6],
        "highlights": highlights,
    }


_NEGATIVE_KEYS = {"experience_gaps", "candidate_concerns", "potential_concerns", "concerns", "red_flags"}


def _to_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, (int, float, bool)):
        return str(val)
    if isinstance(val, list):
        return ", ".join(_to_str(v) for v in val if v)
    if isinstance(val, dict):
        return ", ".join(f"{k}: {_to_str(v)}" for k, v in val.items() if v)
    return str(val)


def _is_negative(text: str) -> bool:
    low = text.lower()
    return any(k in low for k in [
        "concern", "red flag", "issue", "lacks", "weak", "missing", "not aware",
        "no experience", "limited", "deal breaker", "deal-breaker", "gap in",
    ])


def _build_ai_summary(user: dict) -> dict | None:
    """Build a polished AI summary from cumulative_summary. Hides negative items."""
    cum = _parse_cumulative_summary(user.get("cumulative_summary"))
    if not cum:
        return None

    out = {
        "experience_years": cum.get("experience_years"),
        "call_count": cum.get("call_number"),
        "key_information": [],
        "strengths": [],
        "engagement": None,
        "qualification": None,
        "key_quotes": [],
    }

    # Filter positive key info
    ki = cum.get("key_information_gathered")
    if isinstance(ki, list):
        out["key_information"] = [
            _to_str(x) for x in ki[:10]
            if x and not _is_negative(_to_str(x))
        ]

    # Strengths (already positive by definition)
    cs = cum.get("candidate_strengths")
    if isinstance(cs, list):
        out["strengths"] = [_to_str(x) for x in cs[:8] if x]

    # Engagement / sentiment
    eng = cum.get("sentiment_and_engagement")
    if isinstance(eng, dict):
        out["engagement"] = {
            "interest_level": eng.get("interest_level"),
            "communication_style": eng.get("communication_style"),
            "professionalism": eng.get("professionalism"),
        }

    # Qualification (positive recommendations only — keep score, hide if negative)
    qa = cum.get("qualification_assessment")
    if isinstance(qa, dict):
        rec = (qa.get("recommendation") or "").upper()
        if "REJECT" not in rec and "NOT_PROCEED" not in rec and "DROP" not in rec:
            kr = qa.get("key_reasoning")
            reasons = []
            if isinstance(kr, list):
                reasons = [_to_str(x) for x in kr[:4] if x and not _is_negative(_to_str(x))]
            out["qualification"] = {
                "score": qa.get("score"),
                "recommendation": (qa.get("recommendation") or "").replace("_", " ").title() if qa.get("recommendation") else None,
                "reasoning": reasons,
            }

    # Key quotes (filter)
    kq = cum.get("key_quotes_from_candidate")
    if isinstance(kq, list):
        out["key_quotes"] = [_to_str(x) for x in kq[:4] if x and not _is_negative(_to_str(x))]

    # Drop empties for cleaner JSON
    if not any([out["key_information"], out["strengths"], out["engagement"], out["qualification"], out["key_quotes"]]):
        return None
    return out


@router.get("/candidates/{candidate_id}")
def get_candidate(
    candidate_id: str,
    role: str = Query(..., description="role_code for context"),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    # Fetch user (broad fields for full profile)
    def q_user(sb):
        return sb.table("users").select(
            "id, name, phone_number, email, profile_completion_per, jobs_interested_count, "
            "best_match_score, total_call_duration_secs, successful_calls, team_role_code, "
            "data_team_tag, current_stage, created_at, "
            "linkedin_url, cv_file_url, cv_file_name, "
            "generated_cv_text, whatsapp_data_collected, cumulative_summary"
        ).eq("id", candidate_id).limit(1).execute()
    res = supabase_query(q_user)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Candidate not found")
    u = rows[0]
    if u.get("data_team_tag") != "us_data":
        raise HTTPException(status_code=403, detail="Candidate not in this catalog")

    # Top match (prefer same role_code)
    def q_match(sb):
        return sb.table("top_matches_dashboard").select("*").eq(
            "candidate_id", candidate_id
        ).order("matching_score", desc=True).limit(10).execute()
    top_match = None
    try:
        rm = supabase_query(q_match)
        matches = rm.data or []
        for m in matches:
            if (m.get("role_code") or "") == role:
                top_match = m
                break
        if not top_match and matches:
            top_match = matches[0]
    except Exception:
        pass

    # Best successful conversation (longest with actual audio)
    # Note: call_successful is a string field with values like "success" / "failed"
    def q_call(sb):
        return sb.table("conversations").select(
            "id, elevenlabs_conversation_id, call_duration_secs, "
            "transcript_summary, outcome, sentiment, key_topics, call_successful, created_at"
        ).eq("user_id", candidate_id).eq("call_successful", "success").gt(
            "call_duration_secs", 30  # at least 30s of audio
        ).order(
            "call_duration_secs", desc=True
        ).limit(1).execute()
    best_call = None
    try:
        rc = supabase_query(q_call)
        rows = rc.data or []
        if rows:
            best_call = rows[0]
    except Exception:
        pass

    # Generate / fetch cached pitch
    pitch_text, _ = generate_pitch(db, candidate_id, role)

    # Determine which fields are unlocked for this company
    unlocks = db.query(Unlock).filter(
        Unlock.company_id == company.id,
        Unlock.candidate_user_id == candidate_id,
    ).all()
    unlocked_fields = {u.field for u in unlocks}

    phone_unlocked = "phone" in unlocked_fields
    email_unlocked = "email" in unlocked_fields

    # Navigation: prev/next candidate IDs within this role
    ranked = _ranked_candidate_ids_for_role(role)
    prev_id = next_id = None
    position = total = None
    if candidate_id in ranked:
        idx = ranked.index(candidate_id)
        position = idx + 1
        total = len(ranked)
        if idx > 0:
            prev_id = ranked[idx - 1]
        if idx < len(ranked) - 1:
            next_id = ranked[idx + 1]

    # Build rich profile (positives only)
    profile = _build_profile(u)
    ai_summary = _build_ai_summary(u)

    return {
        "id": u["id"],
        "name": u.get("name"),
        "successful_calls": u.get("successful_calls"),
        "total_call_duration_secs": u.get("total_call_duration_secs"),
        "phone_number": u.get("phone_number") if phone_unlocked else None,
        "email": u.get("email") if email_unlocked else None,
        "phone_unlocked": phone_unlocked,
        "email_unlocked": email_unlocked,
        "linkedin_url": u.get("linkedin_url"),
        "cv_file_url": u.get("cv_file_url"),
        "cv_file_name": u.get("cv_file_name"),
        "pitch": pitch_text,
        "ai_summary": ai_summary,
        "profile": profile,
        "match": {
            "key_strengths": _safe_extract_strengths(top_match.get("key_strengths")) if top_match else [],
            "role_name": top_match.get("role_name") if top_match else None,
        } if top_match else None,
        "best_call": {
            "id": best_call.get("id"),
            "elevenlabs_conversation_id": best_call.get("elevenlabs_conversation_id"),
            "duration_secs": best_call.get("call_duration_secs"),
            "transcript_summary": best_call.get("transcript_summary"),
            "outcome": best_call.get("outcome"),
            "sentiment": best_call.get("sentiment"),
            "key_topics": best_call.get("key_topics"),
        } if best_call else None,
        "credits_remaining": company.credits_remaining,
        "navigation": {
            "position": position,
            "total": total,
            "prev_id": prev_id,
            "next_id": next_id,
        },
    }
