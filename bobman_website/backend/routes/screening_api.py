"""
Screening API - Summary of Peter's AI screening calls
Returns screening session data, outcome vs feedback analysis, role breakdowns, and skill stats
"""

from fastapi import APIRouter, Query
from typing import Optional, Dict, Any, List
from collections import defaultdict
from datetime import datetime
import time
from database import get_supabase, supabase_query

router = APIRouter()

BATCH_SIZE = 1000

_screening_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 300


def get_cached(key: str) -> Optional[Dict]:
    if key in _screening_cache:
        entry = _screening_cache[key]
        if time.time() - entry["timestamp"] < CACHE_TTL:
            return entry["data"]
        else:
            del _screening_cache[key]
    return None


def set_cache(key: str, data: Dict):
    if len(_screening_cache) > 10:
        oldest_key = min(_screening_cache.keys(), key=lambda k: _screening_cache[k]["timestamp"])
        del _screening_cache[oldest_key]
    _screening_cache[key] = {"data": data, "timestamp": time.time()}


@router.get("/screening-summary")
def screening_summary(
    start_date: str = Query(...),
    end_date: str = Query(...),
    recruiter_email: Optional[str] = Query(None),
    team_manager_email: Optional[str] = Query(None),
    data_team_tag: Optional[str] = Query(None),
):
    cache_key = f"screening:{start_date}:{end_date}:{recruiter_email}:{team_manager_email}:{data_team_tag}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    sb = get_supabase()

    # Step 1: Get users in date range (filter by users.created_at)
    start_dt = f"{start_date}T00:00:00"
    end_dt = f"{end_date}T23:59:59"

    rec_emails = [e.strip() for e in recruiter_email.split(",") if e.strip()] if recruiter_email else None
    tm_emails = [e.strip() for e in team_manager_email.split(",") if e.strip()] if team_manager_email else None
    dt_tags = [t.strip() for t in data_team_tag.split(",") if t.strip()] if data_team_tag else None

    def _fetch_users(s):
        q = s.table("users").select(
            "id, name, phone_number, recruiter_email, team_manager_email, recruiter_feedback_status"
        ).gte("created_at", start_dt).lte("created_at", end_dt)
        if rec_emails:
            q = q.in_("recruiter_email", rec_emails)
        if tm_emails:
            q = q.in_("team_manager_email", tm_emails)
        if dt_tags:
            q = q.in_("data_team_tag", dt_tags)
        return q.execute()

    users_resp = supabase_query(_fetch_users)
    users_data = users_resp.data or []

    if not users_data:
        empty = {
            "summary": {
                "total_sessions": 0, "unique_candidates": 0,
                "completed": 0, "partial": 0, "failed": 0, "pending": 0,
                "avg_score": 0, "avg_duration_secs": 0, "pass_rate": 0,
                "outcomes": {}
            },
            "sessions": [],
            "outcome_vs_feedback": {},
            "by_role": [],
            "skill_stats": []
        }
        set_cache(cache_key, empty)
        return empty

    # Build user lookup
    user_map = {}
    user_ids_set = set()
    for u in users_data:
        user_map[u["id"]] = u
        user_ids_set.add(u["id"])

    # Step 2: Get ALL screening sessions (small table ~128 rows), filter by user_ids in Python
    all_sessions_raw = []
    offset = 0
    while True:
        resp = supabase_query(lambda s, _o=offset: s.table("screening_sessions").select(
            "id, candidate_id, jd_id, screening_status, screening_outcome, "
            "overall_score, call_duration_secs, total_questions_asked, "
            "candidate_engagement, next_action, ai_summary, created_at, "
            "completed_at, session_number, call_completeness_json, deal_breakers_hit"
        ).order("id").range(_o, _o + BATCH_SIZE - 1).execute())
        batch = resp.data or []
        all_sessions_raw.extend(batch)
        if len(batch) < BATCH_SIZE:
            break
        offset += BATCH_SIZE

    # Filter to only users in date range
    all_sessions = [s for s in all_sessions_raw if s.get("candidate_id") in user_ids_set]

    if not all_sessions:
        empty = {
            "summary": {
                "total_sessions": 0, "unique_candidates": 0,
                "completed": 0, "partial": 0, "failed": 0, "pending": 0,
                "avg_score": 0, "avg_duration_secs": 0, "pass_rate": 0,
                "outcomes": {}
            },
            "sessions": [],
            "outcome_vs_feedback": {},
            "by_role": [],
            "skill_stats": []
        }
        set_cache(cache_key, empty)
        return empty

    # Step 3: Get JD data for role names
    jd_ids = list(set(s["jd_id"] for s in all_sessions if s.get("jd_id")))
    jd_map = {}
    if jd_ids:
        for i in range(0, len(jd_ids), BATCH_SIZE):
            batch = jd_ids[i:i + BATCH_SIZE]
            resp = supabase_query(lambda s, _b=batch: s.table("jd_data").select("id, role_name, role_code").in_("id", _b).execute())
            for jd in (resp.data or []):
                jd_map[jd["id"]] = jd

    # Step 4: Get ALL skill assessments, filter by session_ids in Python
    session_ids_set = set(s["id"] for s in all_sessions)
    all_skills_raw = []
    offset = 0
    while True:
        resp = supabase_query(lambda s, _o=offset: s.table("screening_skill_assessments").select(
            "session_id, skill_name, skill_source, importance, deep_dive_score, "
            "proficiency_level, assessment_type, ai_assessment, "
            "candidate_claimed_experience, questions_asked, candidate_answers, "
            "is_present_in_cv, is_required_by_jd, jd_experience_required"
        ).order("id").range(_o, _o + BATCH_SIZE - 1).execute())
        batch = resp.data or []
        all_skills_raw.extend(batch)
        if len(batch) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
    all_skills = [sk for sk in all_skills_raw if sk.get("session_id") in session_ids_set]

    # Step 5: Get ALL screening results (per-category pass/fail), filter by session_ids
    all_results_raw = []
    offset = 0
    while True:
        resp = supabase_query(lambda s, _o=offset: s.table("screening_results").select(
            "session_id, category, passed, ai_assessment, jd_requirement, "
            "candidate_response, negotiation_outcome, is_negotiable, was_discussed"
        ).order("id").range(_o, _o + BATCH_SIZE - 1).execute())
        batch = resp.data or []
        all_results_raw.extend(batch)
        if len(batch) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
    all_results = [r for r in all_results_raw if r.get("session_id") in session_ids_set]

    # Group results by session_id
    results_by_session = defaultdict(list)
    for r in all_results:
        results_by_session[r["session_id"]].append({
            "category": r["category"],
            "passed": r["passed"],
            "ai_assessment": r.get("ai_assessment"),
            "jd_requirement": r.get("jd_requirement"),
            "candidate_response": r.get("candidate_response"),
            "negotiation_outcome": r.get("negotiation_outcome"),
            "is_negotiable": r.get("is_negotiable"),
            "was_discussed": r.get("was_discussed"),
        })

    # Group skill assessments by session_id
    skills_by_session = defaultdict(list)
    for sk in all_skills:
        skills_by_session[sk["session_id"]].append({
            "skill_name": sk["skill_name"],
            "skill_source": sk.get("skill_source"),
            "importance": sk.get("importance"),
            "deep_dive_score": sk.get("deep_dive_score"),
            "proficiency_level": sk.get("proficiency_level"),
            "assessment_type": sk.get("assessment_type"),
            "ai_assessment": sk.get("ai_assessment"),
            "candidate_claimed_experience": sk.get("candidate_claimed_experience"),
            "questions_asked": sk.get("questions_asked"),
            "candidate_answers": sk.get("candidate_answers"),
            "is_present_in_cv": sk.get("is_present_in_cv"),
            "is_required_by_jd": sk.get("is_required_by_jd"),
            "jd_experience_required": sk.get("jd_experience_required"),
        })

    # === Build response ===

    # Summary stats
    statuses = defaultdict(int)
    outcomes = defaultdict(int)
    scores = []
    durations = []
    unique_candidates = set()

    for s in all_sessions:
        status = s["screening_status"] or "unknown"
        outcome = s["screening_outcome"] or "unknown"
        statuses[status] += 1
        outcomes[outcome] += 1
        unique_candidates.add(s["candidate_id"])
        if s.get("overall_score") is not None:
            scores.append(s["overall_score"])
        if s.get("call_duration_secs") is not None and s["call_duration_secs"] > 0:
            durations.append(s["call_duration_secs"])

    summary = {
        "total_sessions": len(all_sessions),
        "unique_candidates": len(unique_candidates),
        "completed": statuses.get("completed", 0),
        "partial": statuses.get("partial_screening_done", 0),
        "failed": statuses.get("failed", 0),
        "pending": statuses.get("pending", 0) + statuses.get("in_progress", 0),
        "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
        "avg_duration_secs": round(sum(durations) / len(durations)) if durations else 0,
        "pass_rate": round(outcomes.get("passed", 0) / len(all_sessions) * 100, 1) if all_sessions else 0,
        "outcomes": dict(outcomes)
    }

    # Sessions list
    sessions_list = []
    for s in all_sessions:
        user = user_map.get(s["candidate_id"], {})
        jd = jd_map.get(s.get("jd_id"), {})
        completeness = s.get("call_completeness_json") or {}
        completion_pct = completeness.get("completion_percentage", 0) if isinstance(completeness, dict) else 0

        # Build failure reasons from screening_results for this session
        session_results = results_by_session.get(s["id"], [])
        failed_categories = [
            r for r in session_results if r["passed"] is False
        ]
        # Completeness details
        parts_missing = completeness.get("parts_missing", []) if isinstance(completeness, dict) else []
        completeness_reason = completeness.get("reason", "") if isinstance(completeness, dict) else ""

        # Get skill assessments for this session
        session_skills = skills_by_session.get(s["id"], [])
        # Sort: critical first, then by score desc
        importance_order = {"critical": 0, "important": 1, "nice_to_have": 2, "": 3}
        session_skills.sort(key=lambda x: (
            importance_order.get(x.get("importance", ""), 3),
            -(x.get("deep_dive_score") or 0)
        ))

        sessions_list.append({
            "id": s["id"],
            "candidate_name": user.get("name", "Unknown"),
            "phone_number": user.get("phone_number"),
            "candidate_id": s["candidate_id"],
            "role_name": jd.get("role_name", "Unknown"),
            "role_code": jd.get("role_code", ""),
            "screening_status": s["screening_status"],
            "screening_outcome": s["screening_outcome"],
            "overall_score": s.get("overall_score"),
            "call_duration_secs": s.get("call_duration_secs"),
            "total_questions_asked": s.get("total_questions_asked"),
            "candidate_engagement": s.get("candidate_engagement"),
            "completion_percentage": completion_pct,
            "next_action": s.get("next_action"),
            "ai_summary": s.get("ai_summary"),
            "recruiter_email": user.get("recruiter_email"),
            "recruiter_feedback_status": user.get("recruiter_feedback_status"),
            "created_at": s.get("created_at"),
            "deal_breakers_hit": s.get("deal_breakers_hit") or [],
            "session_number": s.get("session_number"),
            "screening_results": session_results,
            "failed_categories": failed_categories,
            "parts_missing": parts_missing,
            "completeness_reason": completeness_reason,
            "skill_assessments": session_skills,
        })

    # Sort by created_at desc
    sessions_list.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    # Outcome vs Feedback matrix
    outcome_vs_feedback = defaultdict(lambda: defaultdict(int))
    for s in sessions_list:
        outcome = s["screening_outcome"] or "unknown"
        feedback = s["recruiter_feedback_status"] or "No Feedback"
        outcome_vs_feedback[outcome][feedback] += 1
    # Convert to regular dict
    outcome_vs_feedback = {k: dict(v) for k, v in outcome_vs_feedback.items()}

    # By Role breakdown
    role_stats = defaultdict(lambda: {
        "sessions": 0, "completed": 0, "passed": 0, "failed": 0,
        "scores": [], "role_name": "", "role_code": ""
    })
    for s in all_sessions:
        jd = jd_map.get(s.get("jd_id"), {})
        role_key = s.get("jd_id") or "unknown"
        r = role_stats[role_key]
        r["role_name"] = jd.get("role_name", "Unknown")
        r["role_code"] = jd.get("role_code", "")
        r["sessions"] += 1
        if s["screening_status"] == "completed":
            r["completed"] += 1
        if s.get("screening_outcome") == "passed":
            r["passed"] += 1
        elif s.get("screening_outcome") == "failed":
            r["failed"] += 1
        if s.get("overall_score") is not None:
            r["scores"].append(s["overall_score"])

    by_role = []
    for role_key, r in role_stats.items():
        by_role.append({
            "role_name": r["role_name"],
            "role_code": r["role_code"],
            "sessions": r["sessions"],
            "completed": r["completed"],
            "passed": r["passed"],
            "failed": r["failed"],
            "avg_score": round(sum(r["scores"]) / len(r["scores"]), 1) if r["scores"] else 0
        })
    by_role.sort(key=lambda x: x["sessions"], reverse=True)

    # Skill stats
    skill_agg = defaultdict(lambda: {
        "scores": [], "importance": "", "count": 0,
        "proficiency": defaultdict(int)
    })
    for sk in all_skills:
        name = sk["skill_name"]
        agg = skill_agg[name]
        agg["count"] += 1
        agg["importance"] = sk.get("importance") or ""
        if sk.get("deep_dive_score") is not None:
            agg["scores"].append(sk["deep_dive_score"])
        level = sk.get("proficiency_level") or "unknown"
        agg["proficiency"][level] += 1

    skill_stats = []
    for name, agg in skill_agg.items():
        skill_stats.append({
            "skill_name": name,
            "importance": agg["importance"],
            "avg_score": round(sum(agg["scores"]) / len(agg["scores"]), 1) if agg["scores"] else 0,
            "count": agg["count"],
            "advanced_count": agg["proficiency"].get("advanced", 0) + agg["proficiency"].get("expert", 0),
            "beginner_count": agg["proficiency"].get("beginner", 0),
            "intermediate_count": agg["proficiency"].get("intermediate", 0),
        })
    skill_stats.sort(key=lambda x: x["count"], reverse=True)

    result = {
        "summary": summary,
        "sessions": sessions_list,
        "outcome_vs_feedback": outcome_vs_feedback,
        "by_role": by_role,
        "skill_stats": skill_stats
    }

    set_cache(cache_key, result)
    return result
