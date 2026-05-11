"""
User Lookup API - Search and retrieve all data for a specific user
"""

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import re
import json
import httpx
from database import get_supabase, supabase_query

router = APIRouter()

# Profile qualification threshold: >80 for users created <= 2026-02-10, >=80 for after
_PROFILE_CUTOFF_DATE = "2026-02-10T23:59:59"
def _profile_threshold_ok(profile_val, created_at):
    """Check if profile_completion_per crosses the date-conditional threshold."""
    if profile_val is None:
        return False
    return profile_val > 80 if (created_at or "") <= _PROFILE_CUTOFF_DATE else profile_val >= 80

# ElevenLabs API configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


def normalize_phone(phone: str) -> List[str]:
    """
    Generate all possible phone number formats to search.
    Input could be: +917601099934, 917601099934, 7601099934, etc.
    Returns list of formats to try.
    """
    # Remove all non-digit characters except +
    cleaned = re.sub(r'[^\d+]', '', phone.strip())

    # Extract just the digits
    digits_only = re.sub(r'\D', '', cleaned)

    formats = set()

    # If starts with +91, we have the full number
    if cleaned.startswith('+91'):
        base = digits_only[2:]  # Remove 91
        formats.add(f'+91{base}')
        formats.add(f'91{base}')
        formats.add(base)
    # If starts with 91 (no +)
    elif digits_only.startswith('91') and len(digits_only) > 10:
        base = digits_only[2:]
        formats.add(f'+91{base}')
        formats.add(f'91{base}')
        formats.add(base)
    # Just the 10 digit number
    elif len(digits_only) == 10:
        formats.add(f'+91{digits_only}')
        formats.add(f'91{digits_only}')
        formats.add(digits_only)
    else:
        # Try as-is
        formats.add(cleaned)
        formats.add(digits_only)

    return list(formats)


def safe_json_parse(val):
    """Safely parse JSON string or return as-is."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except:
            return val
    return val


@router.get("/user/search")
def search_user(
    q: str = Query(..., description="Search query - can be name, email, phone, whatsapp, or user_id"),
    page: int = Query(1, ge=1, description="Page number for paginated results"),
    page_size: int = Query(10, ge=1, le=50, description="Number of results per page")
):
    """
    Search for a user by various identifiers and return all related data.
    Supports partial name matching with pagination.
    """
    supabase = get_supabase()
    query = q.strip()

    if not query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    user = None
    search_method = None

    # Try to find user by different methods

    # 1. Try as UUID (user_id)
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if re.match(uuid_pattern, query.lower()):
        result = supabase.table("users").select("*").eq("id", query).execute()
        if result.data:
            user = result.data[0]
            search_method = "user_id"

    # 2. Try as email (partial match)
    if not user and '@' in query:
        result = supabase.table("users").select("*").ilike("email", f"%{query}%").limit(1).execute()
        if result.data:
            user = result.data[0]
            search_method = "email"

    # 3. Try as phone number (with format normalization)
    if not user and any(c.isdigit() for c in query):
        phone_formats = normalize_phone(query)
        for fmt in phone_formats:
            # Try phone_number field
            result = supabase.table("users").select("*").eq("phone_number", fmt).execute()
            if result.data:
                user = result.data[0]
                search_method = "phone_number"
                break
            # Try whatsapp_number field
            result = supabase.table("users").select("*").eq("whatsapp_number", fmt).execute()
            if result.data:
                user = result.data[0]
                search_method = "whatsapp_number"
                break

    # 4. Try as name - exact match only
    # Note: ilike/like queries cause Cloudflare timeouts on large datasets due to missing indexes
    # For partial name search, users should use phone number or email
    if not user:
        try:
            # Exact match (case-sensitive)
            result = supabase.table("users").select("*").eq("name", query).execute()
            if result.data:
                if len(result.data) == 1:
                    user = result.data[0]
                    search_method = "name_exact"
                else:
                    # Multiple users with same exact name
                    return {
                        "found": False,
                        "multiple_matches": True,
                        "matches": [
                            {
                                "id": u["id"],
                                "name": u.get("name"),
                                "email": u.get("email"),
                                "phone_number": u.get("phone_number"),
                                "whatsapp_number": u.get("whatsapp_number"),
                                "status": u.get("status"),
                                "created_at": u.get("created_at")
                            }
                            for u in result.data
                        ],
                        "pagination": {
                            "current_page": 1,
                            "page_size": len(result.data),
                            "has_next": False,
                            "has_prev": False
                        },
                        "message": f"Found {len(result.data)} users with exact name '{query}'. Please select one."
                    }
        except Exception as e:
            print(f"Error in name search: {e}")

    if not user:
        return {
            "found": False,
            "message": f"No user found for '{query}'. For name search, enter the exact full name (e.g., 'Venkata Raja'). Or search by phone number (7601099934), email, or user ID for best results."
        }

    user_id = user["id"]
    phone = user.get("phone_number", "")
    whatsapp = user.get("whatsapp_number", "")

    # Fetch all related data

    # 1. Conversations (calls)
    conversations = []
    try:
        conv_result = supabase.table("conversations").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        conversations = conv_result.data or []
    except Exception as e:
        print(f"Error fetching conversations: {e}")

    # 2. WhatsApp messages
    whatsapp_messages = []
    try:
        # Try by user_id first
        wa_result = supabase.table("whatsapp_conversations").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        whatsapp_messages = wa_result.data or []

        # If no results, try by phone formats
        if not whatsapp_messages and (phone or whatsapp):
            phone_to_try = whatsapp or phone
            phone_formats = normalize_phone(phone_to_try)
            for fmt in phone_formats:
                # Remove + for whatsapp table
                clean_fmt = fmt.replace('+', '')
                wa_result = supabase.table("whatsapp_conversations").select("*").eq("phone_number", clean_fmt).order("created_at", desc=True).execute()
                if wa_result.data:
                    whatsapp_messages = wa_result.data
                    break
    except Exception as e:
        print(f"Error fetching whatsapp messages: {e}")

    # 3. Job matches
    job_matches = []
    try:
        # Try by candidate_id (user_id)
        match_result = supabase.table("top_matches_dashboard").select("*").eq("candidate_id", user_id).order("matching_score", desc=True).execute()
        job_matches = match_result.data or []

        # If no results, try by phone
        if not job_matches and phone:
            phone_formats = normalize_phone(phone)
            for fmt in phone_formats:
                clean_fmt = fmt.replace('+', '')
                match_result = supabase.table("top_matches_dashboard").select("*").eq("phone_number", clean_fmt).order("matching_score", desc=True).execute()
                if match_result.data:
                    job_matches = match_result.data
                    break
    except Exception as e:
        print(f"Error fetching job matches: {e}")

    # 4. Interested jobs (from user's interest_confirmed_jd_ids)
    interested_jobs = []
    try:
        interest_ids = user.get("interest_confirmed_jd_ids")
        if interest_ids:
            # Parse if string
            if isinstance(interest_ids, str):
                try:
                    interest_ids = json.loads(interest_ids)
                except:
                    interest_ids = []

            if interest_ids:
                jd_result = supabase.table("jd_data").select("*").in_("id", interest_ids).execute()
                interested_jobs = jd_result.data or []
    except Exception as e:
        print(f"Error fetching interested jobs: {e}")

    # Format the response

    # Process conversations for cleaner output
    formatted_conversations = []
    for conv in conversations:
        formatted_conversations.append({
            "id": conv.get("id"),
            "elevenlabs_conversation_id": conv.get("elevenlabs_conversation_id"),
            "date": conv.get("created_at"),
            "duration_secs": conv.get("call_duration_secs"),
            "status": conv.get("status"),
            "call_successful": conv.get("call_successful"),
            "call_stage": conv.get("call_stage"),
            "termination_reason": conv.get("termination_reason"),
            "transcript_text": conv.get("transcript_text"),
            "transcript_summary": conv.get("transcript_summary"),
            "call_summary_title": conv.get("call_summary_title"),
            "outcome": conv.get("outcome"),
            "phone_direction": conv.get("phone_direction"),
            "external_number": conv.get("external_number"),
            "full_transcript": safe_json_parse(conv.get("full_transcript"))
        })

    # Process WhatsApp messages
    formatted_whatsapp = []
    for msg in whatsapp_messages:
        formatted_whatsapp.append({
            "id": msg.get("id"),
            "date": msg.get("created_at"),
            "direction": msg.get("direction"),
            "sender": msg.get("sender"),
            "message_text": msg.get("message_text"),
            "status": msg.get("status"),
            "message_type": msg.get("message_type"),
            "related_jd_id": msg.get("related_jd_id")
        })

    # Process job matches
    formatted_matches = []
    for match in job_matches:
        formatted_matches.append({
            "jd_id": match.get("jd_id"),
            "role_name": match.get("role_name"),
            "role_code": match.get("role_code"),
            "location": match.get("location"),
            "matching_score": match.get("matching_score"),
            "status": match.get("status"),
            "match_reasoning": match.get("match_reasoning"),
            "key_strengths": match.get("key_strengths"),
            "potential_concerns": match.get("potential_concerns"),
            "vendor_rate_per_month": match.get("vendor_rate_per_month"),
            "experience_range": match.get("experience_range"),
            "matched_at": match.get("matched_at"),
            "rank": match.get("rank_for_candidate")
        })

    # Process interested jobs
    formatted_interested = []
    for jd in interested_jobs:
        formatted_interested.append({
            "id": jd.get("id"),
            "role_name": jd.get("role_name"),
            "role_code": jd.get("role_code"),
            "location": jd.get("location"),
            "experience_range": jd.get("experience_range"),
            "vendor_rate_per_month": jd.get("vendor_rate_per_month"),
            "brief_context": jd.get("brief_context"),
            "status": jd.get("status")
        })

    # Build user profile summary
    user_profile = {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone_number": user.get("phone_number"),
        "whatsapp_number": user.get("whatsapp_number"),
        "status": user.get("status"),
        "current_stage": user.get("current_stage"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),

        # Profile data
        "profile_completion_per": user.get("profile_completion_per"),
        "linkedin_url": user.get("linkedin_url"),
        "cv_file_url": user.get("cv_file_url"),

        # Call stats
        "total_calls": user.get("total_calls"),
        "successful_calls": user.get("successful_calls"),
        "total_call_duration_secs": user.get("total_call_duration_secs"),
        "last_call_at": user.get("last_call_at"),

        # Matching stats
        "matching_status": user.get("matching_status"),
        "jds_evaluated_count": user.get("jds_evaluated_count"),
        "cumulative_matches_count": user.get("cumulative_matches_count"),
        "best_match_score": user.get("best_match_score"),
        "matching_started_at": user.get("matching_started_at"),
        "matching_completed_at": user.get("matching_completed_at"),

        # Job interest stats
        "jobs_presented_count": user.get("jobs_presented_count"),
        "jobs_interested_count": user.get("jobs_interested_count"),
        "interest_confirmed_jd_ids": safe_json_parse(user.get("interest_confirmed_jd_ids")),

        # WhatsApp stats
        "whatsapp_message_count": user.get("whatsapp_message_count"),
        "whatsapp_last_inbound_at": user.get("whatsapp_last_inbound_at"),
        "whatsapp_last_outbound_at": user.get("whatsapp_last_outbound_at"),

        # CV data
        "cv_generated_at": user.get("cv_generated_at"),
        "cv_source": user.get("cv_source"),
        "generated_cv_text": safe_json_parse(user.get("generated_cv_text")),
        "cumulative_summary": safe_json_parse(user.get("cumulative_summary")),

        # Recruiter info
        "recruiter_email": user.get("recruiter_email"),
        "team_manager_email": user.get("team_manager_email"),
        "data_team_tag": user.get("data_team_tag"),
        "recruiter_feedback_status": user.get("recruiter_feedback_status"),
        "recruiter_comments": user.get("recruiter_comments"),

        # Referral info
        "referral_code": user.get("referral_code"),
        "referred_by_code": user.get("referred_by_code"),
        "referral_invite_sent": user.get("referral_invite_sent"),

        # Team / system role
        "team_role_code": user.get("team_role_code"),
        "last_recruiter_email_sent_at": user.get("last_recruiter_email_sent_at"),
    }

    # Extract key metrics from generated_cv_text
    key_metrics = {}
    cv_data = safe_json_parse(user.get("generated_cv_text"))
    if cv_data and isinstance(cv_data, dict):
        # Personal info
        personal = cv_data.get("personal_info", {})
        key_metrics["location"] = personal.get("current_location")
        key_metrics["relocation"] = personal.get("open_to_relocation")

        # Current role
        current_role = cv_data.get("current_role", {})
        key_metrics["role"] = current_role.get("title")
        key_metrics["company"] = current_role.get("company")

        # Compensation
        comp = cv_data.get("compensation_and_availability", {})
        key_metrics["current_ctc"] = comp.get("current_ctc")
        key_metrics["expected_ctc"] = comp.get("expected_ctc")
        key_metrics["notice_period"] = comp.get("notice_period")
        key_metrics["earliest_join_date"] = comp.get("earliest_join_date")

        # Experience
        key_metrics["experience_years"] = cv_data.get("call_metadata", {}).get("experience_years")

        # Career preferences
        prefs = cv_data.get("career_preferences", {})
        key_metrics["work_environment"] = prefs.get("work_environment")
        key_metrics["leadership_preference"] = prefs.get("leadership_preference")

    # Referral status
    key_metrics["referral_code"] = user.get("referral_code")
    key_metrics["referred_by_code"] = user.get("referred_by_code")  # Actual referral code if user was referred

    # Fetch screening data for this user
    screening_sessions = []
    screening_skills = []
    screening_results_raw = []
    try:
        ss_resp = supabase.table("screening_sessions").select(
            "id, jd_id, screening_status, screening_type, screening_outcome, "
            "overall_score, call_duration_secs, total_questions_asked, "
            "candidate_engagement, next_action, ai_summary, recruiter_notes, "
            "created_at, completed_at, session_number, "
            "call_completeness_json, deal_breakers_hit, non_negotiable_passed"
        ).eq("candidate_id", user["id"]).order("created_at", desc=True).execute()
        raw_sessions = ss_resp.data or []

        # Get JD names for sessions
        jd_ids = list(set(s["jd_id"] for s in raw_sessions if s.get("jd_id")))
        jd_map = {}
        if jd_ids:
            jd_resp = supabase.table("jd_data").select("id, role_name, role_code").in_("id", jd_ids).execute()
            for jd in (jd_resp.data or []):
                jd_map[jd["id"]] = jd

        # Get skill assessments for all sessions
        session_ids = [s["id"] for s in raw_sessions]
        if session_ids:
            sk_resp = supabase.table("screening_skill_assessments").select(
                "session_id, skill_name, skill_source, importance, "
                "proficiency_level, deep_dive_score, ai_assessment, "
                "candidate_claimed_experience, questions_asked, candidate_answers, assessment_type, "
                "is_present_in_cv, is_required_by_jd, jd_experience_required"
            ).in_("session_id", session_ids).execute()
            screening_skills = sk_resp.data or []

        # Get screening results for all sessions
        screening_results_raw = []
        if session_ids:
            sr_resp = supabase.table("screening_results").select(
                "session_id, category, score, passed, ai_assessment, "
                "candidate_response, negotiation_attempted, negotiation_outcome, "
                "negotiated_value, was_discussed, jd_requirement"
            ).in_("session_id", session_ids).execute()
            screening_results_raw = sr_resp.data or []

        # Build sessions with JD info
        for s in raw_sessions:
            jd = jd_map.get(s.get("jd_id"), {})
            completeness = s.get("call_completeness_json") or {}
            screening_sessions.append({
                "id": s["id"],
                "role_name": jd.get("role_name", "Unknown"),
                "role_code": jd.get("role_code", ""),
                "screening_status": s["screening_status"],
                "screening_outcome": s["screening_outcome"],
                "overall_score": s.get("overall_score"),
                "call_duration_secs": s.get("call_duration_secs"),
                "total_questions_asked": s.get("total_questions_asked"),
                "candidate_engagement": s.get("candidate_engagement"),
                "next_action": s.get("next_action"),
                "ai_summary": s.get("ai_summary"),
                "recruiter_notes": s.get("recruiter_notes"),
                "non_negotiable_passed": s.get("non_negotiable_passed"),
                "completion_percentage": completeness.get("completion_percentage", 0) if isinstance(completeness, dict) else 0,
                "parts_completed": completeness.get("parts_completed", []) if isinstance(completeness, dict) else [],
                "parts_missing": completeness.get("parts_missing", []) if isinstance(completeness, dict) else [],
                "deal_breakers_hit": s.get("deal_breakers_hit") or [],
                "session_number": s.get("session_number"),
                "created_at": s.get("created_at"),
                "completed_at": s.get("completed_at"),
            })
    except Exception as e:
        import traceback
        print(f"Error fetching screening data: {e}")
        traceback.print_exc()

    # Compute system_role_code for the single user
    system_role_code = None
    try:
        interested_count = user.get("jobs_interested_count") or 0
        best_score = user.get("best_match_score")
        has_screening_passed = any(s.get("screening_outcome") == "passed" for s in screening_sessions)

        if has_screening_passed or interested_count > 0:
            # Interested: all role codes from interest_confirmed_jd_ids
            codes = [jd.get("role_code") for jd in interested_jobs if jd.get("role_code")]
            system_role_code = ", ".join(codes) if codes else None
        elif best_score and best_score > 0 and interested_count == 0:
            # Match No Interest: top 3 role codes by matching score
            sorted_matches = sorted(formatted_matches, key=lambda x: x.get("matching_score") or 0, reverse=True)
            codes = []
            for m in sorted_matches[:3]:
                if m.get("role_code") and m["role_code"] not in codes:
                    codes.append(m["role_code"])
            system_role_code = ", ".join(codes) if codes else None
    except Exception:
        pass
    user_profile["system_role_code"] = system_role_code

    # Compute qualification_timestamp = min of all stage timestamps, fallback created_at
    # Also store individual stage timestamps for the detailed view
    qualification_timestamp = None
    qual_stage_interested_ts = None
    qual_stage_match_ts = None
    qual_stage_profile_ts = None
    try:
        created = user.get("created_at") or ""
        candidates = []
        # Stage 1: Interested / Screening Passed
        if user.get("last_recruiter_email_sent_at"):
            qual_stage_interested_ts = user["last_recruiter_email_sent_at"]
            candidates.append(qual_stage_interested_ts)
        # Stage 2: Match No Interest
        if user.get("matching_started_at"):
            qual_stage_match_ts = user["matching_started_at"]
            candidates.append(qual_stage_match_ts)
        # Stage 3: 80+ No Match — first audit_log where profile crossed threshold
        try:
            audit_resp = supabase.table("audit_log").select(
                "changed_at, changed_fields, new_data"
            ).eq("table_name", "users").eq("row_id", user["id"]).order("changed_at").execute()
            for entry in (audit_resp.data or []):
                if "profile_completion_per" in (entry.get("changed_fields") or []):
                    nd = entry.get("new_data") or {}
                    pval = nd.get("profile_completion_per")
                    if pval is not None and _profile_threshold_ok(pval, created):
                        qual_stage_profile_ts = entry["changed_at"]
                        candidates.append(qual_stage_profile_ts)
                        break
        except Exception:
            pass
        qualification_timestamp = min(candidates) if candidates else created
    except Exception:
        pass
    user_profile["qualification_timestamp"] = qualification_timestamp
    user_profile["qual_stage_interested_ts"] = qual_stage_interested_ts
    user_profile["qual_stage_match_ts"] = qual_stage_match_ts
    user_profile["qual_stage_profile_ts"] = qual_stage_profile_ts

    return {
        "found": True,
        "search_method": search_method,
        "user": user_profile,
        "key_metrics": key_metrics,
        "conversations": formatted_conversations,
        "conversations_count": len(formatted_conversations),
        "whatsapp_messages": formatted_whatsapp,
        "whatsapp_count": len(formatted_whatsapp),
        "job_matches": formatted_matches,
        "matches_count": len(formatted_matches),
        "interested_jobs": formatted_interested,
        "interested_count": len(formatted_interested),
        "screening_sessions": screening_sessions,
        "screening_count": len(screening_sessions),
        "screening_skills": screening_skills,
        "screening_results": screening_results_raw
    }


def _fetch_all_distinct(table: str, column: str) -> list:
    """Paginate through all rows to collect distinct non-empty values for a column."""
    values = set()
    page = 0
    batch = 1000
    while True:
        result = supabase_query(lambda sb, _t=table, _c=column, _p=page, _b=batch: sb.table(_t).select(_c).neq(_c, "").order("id").range(_p * _b, (_p + 1) * _b - 1).execute())
        if not result.data:
            break
        for row in result.data:
            v = row.get(column)
            if v:
                values.add(v)
        if len(result.data) < batch:
            break
        page += 1
    return sorted(values)


import time as _time
from concurrent.futures import ThreadPoolExecutor as _TPE

_filter_options_cache = {"data": None, "ts": 0}
_FILTER_OPTIONS_TTL = 300  # 5 min cache


@router.get("/users/filter-options")
def get_filter_options():
    """
    Get all available filter options for dropdowns.
    Fetches distinct values dynamically from the users table.
    """
    # Return cached if fresh
    if _filter_options_cache["data"] and (_time.time() - _filter_options_cache["ts"]) < _FILTER_OPTIONS_TTL:
        return _filter_options_cache["data"]

    try:
        # Fetch all 3 columns in parallel
        with _TPE(max_workers=3) as ex:
            f_rec = ex.submit(_fetch_all_distinct, "users", "recruiter_email")
            f_tm = ex.submit(_fetch_all_distinct, "users", "team_manager_email")
            f_dt = ex.submit(_fetch_all_distinct, "users", "data_team_tag")
            recruiters = f_rec.result()
            team_managers = f_tm.result()
            data_tags = f_dt.result()

        # Static feedback statuses list
        feedback_statuses = [
            "Null",
            "Follow Up Pending",
            "Not answering",
            "Calling Attempts Exhausted",
            "Not interested",
            "High Notice",
            "High Expectations",
            "Long Gap",
            "Less Experience",
            "Skills Mismatch",
            "Internal Recruiter Screen Rejected",
            "Selected by Client (Other Vendor)",
            "Client Interview Rejected",
            "Client Interviewed",
            "Role Closed No Feedback",
            "Role Paused No Feedback",
            "Submitted to client",
            "Client Sharable but Role on Hold",
            "Selected by Client",
            "Hold",
            "Internal Testing",
            "Submitted to Hiring Manager",
            "Hiring Manager Select",
            "Hiring Manager Reject",
            "Round 1 Scheduled",
            "Round 1 Reject",
            "Round 2 Scheduled",
            "Round 2 Reject",
            "Round 3 Scheduled",
            "Round 3 Reject",
            "Final Select",
        ]

        # User stages
        user_stages = [
            "Interested",
            "Match No Interest",
            "80+ No Match",
            "Total Qualified",
            "Screening Passed"
        ]

        result = {
            "recruiters": recruiters,
            "team_managers": team_managers,
            "data_tags": data_tags,
            "feedback_statuses": feedback_statuses,
            "user_stages": user_stages
        }
        _filter_options_cache["data"] = result
        _filter_options_cache["ts"] = _time.time()
        return result

    except Exception as e:
        print(f"Error fetching filter options: {e}")
        raise HTTPException(status_code=500, detail="Error fetching filter options")


@router.get("/users/list")
def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Results per page"),
    recruiter_email: Optional[str] = Query(None, description="Filter by recruiter email (comma-separated for multiple)"),
    team_manager_email: Optional[str] = Query(None, description="Filter by team manager email (comma-separated)"),
    data_team_tag: Optional[str] = Query(None, description="Filter by data team tag (comma-separated)"),
    user_stage: Optional[str] = Query(None, description="Filter by user stage"),
    feedback_status: Optional[str] = Query(None, description="Filter by recruiter feedback status (comma-separated)"),
    date_from: Optional[str] = Query(None, description="Filter by created_at from date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter by created_at to date (YYYY-MM-DD)"),
    sort_by: Optional[str] = Query("created_at", description="Sort field"),
    sort_dir: Optional[str] = Query("desc", description="Sort direction (asc/desc)"),
    qualification_filter: Optional[str] = Query(None, description="Filter by qualification timestamp: 'before_cutoff' or 'after_cutoff'")
):
    """
    Get a paginated list of users with filters.
    Returns user info with call duration and profile completion.
    """
    supabase = get_supabase()

    try:
        offset = (page - 1) * page_size
        fetch_limit = page_size + 1

        # Valid sort fields
        valid_sort_fields = ["created_at", "name", "total_call_duration_secs", "profile_completion_per", "screening_score", "qualification_timestamp"]
        sort_field = sort_by if sort_by in valid_sort_fields else "created_at"
        sort_desc = sort_dir != "asc"
        is_screening_sort = sort_field == "screening_score"
        is_qual_ts_sort = sort_field == "qualification_timestamp"

        query = supabase.table("users").select(
            "id, name, email, phone_number, whatsapp_number, total_call_duration_secs, profile_completion_per, recruiter_email, team_manager_email, data_team_tag, recruiter_feedback_status, recruiter_comments, current_stage, best_match_score, jobs_interested_count, interest_confirmed_jd_ids, team_role_code, matching_started_at, last_recruiter_email_sent_at, created_at",
            count="exact"
        )
        # Use .order() with nullsfirst=False so non-null values appear first in DESC
        # For screening_score/qualification_timestamp sort, we'll re-sort after fetching
        if not is_screening_sort and not is_qual_ts_sort:
            query = query.order(sort_field, desc=sort_desc, nullsfirst=False)
        else:
            query = query.order("created_at", desc=True)

        # Apply filters
        if recruiter_email:
            emails = [e.strip() for e in recruiter_email.split(",") if e.strip()]
            if len(emails) == 1:
                query = query.eq("recruiter_email", emails[0])
            elif len(emails) > 1:
                query = query.in_("recruiter_email", emails)

        if team_manager_email:
            managers = [m.strip() for m in team_manager_email.split(",") if m.strip()]
            if len(managers) == 1:
                query = query.eq("team_manager_email", managers[0])
            elif len(managers) > 1:
                query = query.in_("team_manager_email", managers)

        if data_team_tag:
            tags = [t.strip() for t in data_team_tag.split(",") if t.strip()]
            if len(tags) == 1:
                query = query.eq("data_team_tag", tags[0])
            elif len(tags) > 1:
                query = query.in_("data_team_tag", tags)

        if feedback_status:
            statuses = [s.strip() for s in feedback_status.split(",") if s.strip()]
            has_null = "Null" in statuses
            non_null_statuses = [s for s in statuses if s != "Null"]

            if has_null and not non_null_statuses:
                # Only Null selected — match both SQL NULL and empty string
                query = query.or_("recruiter_feedback_status.is.null,recruiter_feedback_status.eq.")
            elif has_null and non_null_statuses:
                # Null + other statuses: use OR to combine is.null + empty string with in.()
                or_parts = ["recruiter_feedback_status.is.null", "recruiter_feedback_status.eq."]
                if len(non_null_statuses) == 1:
                    or_parts.append(f"recruiter_feedback_status.eq.{non_null_statuses[0]}")
                else:
                    or_parts.append(f"recruiter_feedback_status.in.({','.join(non_null_statuses)})")
                query = query.or_(",".join(or_parts))
            else:
                if len(statuses) == 1:
                    query = query.eq("recruiter_feedback_status", statuses[0])
                elif len(statuses) > 1:
                    query = query.in_("recruiter_feedback_status", statuses)

        # User stage filters (supports multiple comma-separated stages with OR logic)
        # Pre-fetch screening passed candidate IDs if needed (for "Screening Passed" or "Total Qualified")
        screening_passed_ids = None
        if user_stage and ("Screening Passed" in user_stage or "Total Qualified" in user_stage):
            try:
                sp_resp = supabase.table("screening_sessions").select("candidate_id").eq("screening_outcome", "passed").execute()
                screening_passed_ids = list(set(s["candidate_id"] for s in (sp_resp.data or [])))
            except Exception as spe:
                print(f"Error fetching screening passed IDs: {spe}")
                screening_passed_ids = []

        if user_stage:
            stages = [s.strip() for s in user_stage.split(",") if s.strip()]
            if len(stages) == 1:
                # Single stage - use direct conditions
                stage = stages[0]
                if stage == "Interested":
                    query = query.gt("jobs_interested_count", 0)
                elif stage == "Match No Interest":
                    query = query.gt("best_match_score", 0).eq("jobs_interested_count", 0)
                elif stage == "80+ No Match":
                    # Relax DB filter; date-based profile threshold applied in memory
                    query = query.is_("best_match_score", "null")
                elif stage == "Total Qualified":
                    # Fetch broadly; exact 3-stage union applied in memory
                    pass
                elif stage == "Screening Passed":
                    if screening_passed_ids:
                        query = query.in_("id", screening_passed_ids)
                    else:
                        query = query.eq("id", "00000000-0000-0000-0000-000000000000")
            elif len(stages) > 1:
                # Multiple stages - build OR condition
                or_conditions = []
                for stage in stages:
                    if stage == "Interested":
                        or_conditions.append("jobs_interested_count.gt.0")
                    elif stage == "Match No Interest":
                        or_conditions.append("and(best_match_score.gt.0,jobs_interested_count.eq.0)")
                    elif stage == "80+ No Match":
                        # Relaxed: just best_match_score is null; profile threshold in memory
                        or_conditions.append("best_match_score.is.null")
                    elif stage == "Total Qualified":
                        # Fetch all; exact 3-stage union applied in memory
                        or_conditions.clear()
                        break
                    elif stage == "Screening Passed":
                        if screening_passed_ids:
                            or_conditions.append(f"id.in.({','.join(screening_passed_ids)})")
                if or_conditions:
                    query = query.or_(",".join(or_conditions))

        # Date range filters
        if date_from:
            query = query.gte("created_at", f"{date_from}T00:00:00")
        if date_to:
            query = query.lte("created_at", f"{date_to}T23:59:59")

        # When qualification_filter, screening_sort, or date-conditional stage filter is active, we need all rows first
        _stages_needing_mem_filter = {"80+ No Match", "Total Qualified"}
        _active_stages = set(s.strip() for s in (user_stage or "").split(",") if s.strip())
        needs_stage_mem_filter = bool(_active_stages & _stages_needing_mem_filter)
        needs_full_fetch = is_screening_sort or is_qual_ts_sort or bool(qualification_filter) or needs_stage_mem_filter

        if needs_full_fetch:
            all_result = query.execute()
            all_data = all_result.data or []

            if not all_data:
                return {"users": [], "pagination": {"current_page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}}

            # --- In-memory stage filter for date-conditional profile threshold ---
            # >80 for created_at <= 2026-02-10, >=80 for after
            if needs_stage_mem_filter:
                _PROFILE_CUTOFF = "2026-02-10T23:59:59"
                def _prof_ok(r):
                    p = r.get("profile_completion_per") or 0
                    c = r.get("created_at") or ""
                    return p > 80 if c <= _PROFILE_CUTOFF else p >= 80

                if "Total Qualified" in _active_stages and len(_active_stages) == 1:
                    # Union of 3 stages
                    all_data = [
                        r for r in all_data
                        if (r.get("jobs_interested_count") or 0) > 0
                        or ((r.get("best_match_score") or 0) > 0 and (r.get("jobs_interested_count") or 0) == 0)
                        or (_prof_ok(r) and not r.get("best_match_score"))
                    ]
                elif "80+ No Match" in _active_stages:
                    # Filter for profile threshold (DB already filtered best_match_score is null)
                    all_data = [r for r in all_data if _prof_ok(r)]
                # For multi-stage with Total Qualified mixed in, apply broad filter
                elif "Total Qualified" in _active_stages:
                    all_data = [
                        r for r in all_data
                        if (r.get("jobs_interested_count") or 0) > 0
                        or ((r.get("best_match_score") or 0) > 0 and (r.get("jobs_interested_count") or 0) == 0)
                        or (_prof_ok(r) and not r.get("best_match_score"))
                        or (r.get("best_match_score") is not None)  # other stages already filtered by DB
                    ]

            # --- Qualification filter (applied before pagination) ---
            if qualification_filter:
                from datetime import datetime, timezone as tz, timedelta
                ist = tz(timedelta(hours=5, minutes=30))
                now_ist = datetime.now(ist)
                if qualification_filter in ("yesterday_before_cutoff", "yesterday_after_cutoff"):
                    cutoff_date = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")
                else:
                    cutoff_date = now_ist.strftime("%Y-%m-%d")
                # 7 PM IST = 1:30 PM UTC; use UTC format to match DB timestamps
                cutoff_str = cutoff_date + "T13:30:00+00:00"

                # Compute qual timestamp for ALL fetched users
                # We need screening data to determine stage
                all_user_ids_full = [u["id"] for u in all_data]
                pre_screening_map = {}
                try:
                    from collections import defaultdict
                    for i in range(0, len(all_user_ids_full), 500):
                        batch_ids = all_user_ids_full[i:i+500]
                        ss_resp = supabase.table("screening_sessions").select(
                            "candidate_id, screening_outcome"
                        ).in_("candidate_id", batch_ids).execute()
                        for ss in (ss_resp.data or []):
                            cid = ss["candidate_id"]
                            if ss.get("screening_outcome") == "passed":
                                pre_screening_map[cid] = "passed"
                except Exception:
                    pass

                # Compute qual timestamp = min of all stage timestamps, fallback created_at
                pre_qual_ts = {}
                pre_candidates = {}  # uid -> list of timestamps
                pre_created = {}     # uid -> created_at
                all_ids_for_audit = [u["id"] for u in all_data]
                for u in all_data:
                    uid = u["id"]
                    created = u.get("created_at") or ""
                    pre_created[uid] = created
                    cands = []
                    if u.get("last_recruiter_email_sent_at"):
                        cands.append(u["last_recruiter_email_sent_at"])
                    if u.get("matching_started_at"):
                        cands.append(u["matching_started_at"])
                    pre_candidates[uid] = cands

                # Stage 3: batch audit_log for all users — first profile crossing threshold
                if all_ids_for_audit:
                    seen_audit = set()
                    try:
                        for i in range(0, len(all_ids_for_audit), 100):
                            batch = all_ids_for_audit[i:i+100]
                            audit_resp = supabase.table("audit_log").select(
                                "row_id, changed_at, changed_fields, new_data"
                            ).eq("table_name", "users").in_("row_id", batch).order("changed_at").execute()
                            for entry in (audit_resp.data or []):
                                rid = entry.get("row_id")
                                if rid in seen_audit:
                                    continue
                                if "profile_completion_per" in (entry.get("changed_fields") or []):
                                    nd = entry.get("new_data") or {}
                                    pval = nd.get("profile_completion_per")
                                    if pval is not None and _profile_threshold_ok(pval, pre_created.get(rid, "")):
                                        pre_candidates.setdefault(rid, []).append(entry["changed_at"])
                                        seen_audit.add(rid)
                    except Exception:
                        pass

                # Build final map
                for uid in all_ids_for_audit:
                    cands = pre_candidates.get(uid, [])
                    pre_qual_ts[uid] = min(cands) if cands else pre_created.get(uid, "")

                # Filter users by qualification timestamp
                filtered_data = []
                for u in all_data:
                    ts = pre_qual_ts.get(u["id"])
                    if not ts:
                        if qualification_filter in ("before_cutoff", "yesterday_before_cutoff"):
                            filtered_data.append(u)
                        continue
                    if qualification_filter in ("before_cutoff", "yesterday_before_cutoff") and ts <= cutoff_str:
                        filtered_data.append(u)
                    elif qualification_filter in ("after_cutoff", "yesterday_after_cutoff") and ts > cutoff_str:
                        filtered_data.append(u)
                all_data = filtered_data

            # --- Screening score sort (applied after qual filter) ---
            if is_screening_sort and all_data:
                all_user_ids = [u["id"] for u in all_data]
                from collections import defaultdict
                screening_scores = {}
                try:
                    for i in range(0, len(all_user_ids), 500):
                        batch_ids = all_user_ids[i:i+500]
                        ss_resp = supabase.table("screening_sessions").select(
                            "candidate_id, overall_score, created_at"
                        ).in_("candidate_id", batch_ids).execute()
                        sessions_by_user = defaultdict(list)
                        for ss in (ss_resp.data or []):
                            sessions_by_user[ss["candidate_id"]].append(ss)
                        for uid, sessions in sessions_by_user.items():
                            sessions.sort(key=lambda x: x.get("created_at") or "", reverse=True)
                            screening_scores[uid] = sessions[0].get("overall_score")
                except Exception as spe:
                    print(f"Error fetching screening scores for sort: {spe}")

                def score_key(u):
                    s = screening_scores.get(u["id"])
                    return (0 if s is None else 1, s or 0)
                all_data.sort(key=score_key, reverse=sort_desc)

            # --- Qualification timestamp sort ---
            if is_qual_ts_sort and all_data:
                # Compute qual timestamps for all matching users using same logic as detail
                qt_map = {}
                try:
                    all_uids = [u["id"] for u in all_data]
                    user_cands = {}
                    user_created_map = {}
                    for u in all_data:
                        uid = u["id"]
                        created = u.get("created_at") or ""
                        user_created_map[uid] = created
                        cands = []
                        if u.get("last_recruiter_email_sent_at"):
                            cands.append(u["last_recruiter_email_sent_at"])
                        if u.get("matching_started_at"):
                            cands.append(u["matching_started_at"])
                        user_cands[uid] = cands

                    seen = set()
                    for i in range(0, len(all_uids), 200):
                        batch = all_uids[i:i+200]
                        audit_resp = supabase.table("audit_log").select(
                            "row_id, changed_at, changed_fields, new_data"
                        ).eq("table_name", "users").in_("row_id", batch).order("changed_at").execute()
                        for entry in (audit_resp.data or []):
                            rid = entry.get("row_id")
                            if rid in seen:
                                continue
                            if "profile_completion_per" in (entry.get("changed_fields") or []):
                                nd = entry.get("new_data") or {}
                                pval = nd.get("profile_completion_per")
                                if pval is not None and _profile_threshold_ok(pval, user_created_map.get(rid, "")):
                                    user_cands.setdefault(rid, []).append(entry["changed_at"])
                                    seen.add(rid)

                    for uid in all_uids:
                        cands = user_cands.get(uid, [])
                        qt_map[uid] = min(cands) if cands else user_created_map.get(uid, "")
                except Exception as qte:
                    print(f"Error computing qual timestamps for sort: {qte}")

                def qt_key(u):
                    ts = qt_map.get(u["id"], "")
                    return (0 if not ts else 1, ts)
                all_data.sort(key=qt_key, reverse=sort_desc)

            # Paginate the full dataset
            total_count = len(all_data)
            total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
            users = all_data[offset:offset + page_size]
            has_more = (offset + page_size) < total_count
        else:
            result = query.range(offset, offset + fetch_limit - 1).execute()
            total_count = result.count if result.count else 0

            if result.data:
                has_more = len(result.data) > page_size
                users = result.data[:page_size]
                total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
            else:
                return {"users": [], "pagination": {"current_page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}}

        if users:
            # Fetch screening session data for this page of users
            user_ids = [u["id"] for u in users]
            screening_map = {}  # user_id -> screening summary
            try:
                ss_resp = supabase.table("screening_sessions").select(
                    "candidate_id, screening_status, screening_outcome, overall_score, "
                    "call_duration_secs, session_number, deal_breakers_hit, "
                    "call_completeness_json, created_at"
                ).in_("candidate_id", user_ids).execute()
                # Group by candidate_id - take the latest session per user
                from collections import defaultdict
                sessions_by_user = defaultdict(list)
                for ss in (ss_resp.data or []):
                    sessions_by_user[ss["candidate_id"]].append(ss)
                for uid, sessions in sessions_by_user.items():
                    sessions.sort(key=lambda x: x.get("created_at") or "", reverse=True)
                    latest = sessions[0]
                    completeness = latest.get("call_completeness_json") or {}
                    screening_map[uid] = {
                        "screening_status": latest.get("screening_status"),
                        "screening_outcome": latest.get("screening_outcome"),
                        "overall_score": latest.get("overall_score"),
                        "screening_duration_secs": latest.get("call_duration_secs"),
                        "screening_session_count": len(sessions),
                        "deal_breakers_hit": latest.get("deal_breakers_hit") or [],
                        "completion_percentage": completeness.get("completion_percentage", 0) if isinstance(completeness, dict) else 0,
                        "screening_date": latest.get("created_at"),
                    }
            except Exception as se:
                print(f"Error fetching screening data for user list: {se}")

            # Compute system_role_code for each user based on stage
            system_role_code_map = {}
            try:
                # Collect all interested JD IDs across all users
                all_interested_jd_ids = set()
                # Collect user IDs that need top match role codes
                match_no_interest_user_ids = []
                for u in users:
                    interested_count = u.get("jobs_interested_count") or 0
                    best_score = u.get("best_match_score")
                    profile = u.get("profile_completion_per") or 0
                    # Determine stage
                    scr = screening_map.get(u["id"], {})
                    if scr.get("screening_outcome") == "passed" or interested_count > 0:
                        # Interested (or screening passed with interest)
                        ids_raw = u.get("interest_confirmed_jd_ids")
                        if ids_raw:
                            if isinstance(ids_raw, str):
                                try:
                                    ids_raw = json.loads(ids_raw)
                                except:
                                    ids_raw = []
                            if isinstance(ids_raw, list):
                                all_interested_jd_ids.update(ids_raw)
                    elif best_score and best_score > 0 and interested_count == 0:
                        match_no_interest_user_ids.append(u["id"])

                # Fetch role_codes for interested JD IDs
                jd_role_map = {}  # jd_id -> role_code
                if all_interested_jd_ids:
                    jd_ids_list = list(all_interested_jd_ids)
                    for i in range(0, len(jd_ids_list), 100):
                        batch = jd_ids_list[i:i+100]
                        jd_resp = supabase.table("jd_data").select("id, role_code").in_("id", batch).execute()
                        for jd in (jd_resp.data or []):
                            if jd.get("role_code"):
                                jd_role_map[jd["id"]] = jd["role_code"]

                # Fetch top 3 role_codes for match-no-interest users
                match_role_map = {}  # user_id -> [role_codes]
                if match_no_interest_user_ids:
                    for i in range(0, len(match_no_interest_user_ids), 100):
                        batch = match_no_interest_user_ids[i:i+100]
                        tm_resp = supabase.table("top_matches_dashboard").select(
                            "candidate_id, role_code, matching_score"
                        ).in_("candidate_id", batch).order("matching_score", desc=True).execute()
                        from collections import defaultdict
                        by_user = defaultdict(list)
                        for m in (tm_resp.data or []):
                            by_user[m["candidate_id"]].append(m)
                        for uid, matches in by_user.items():
                            matches.sort(key=lambda x: x.get("matching_score") or 0, reverse=True)
                            codes = []
                            for m in matches[:3]:
                                if m.get("role_code") and m["role_code"] not in codes:
                                    codes.append(m["role_code"])
                            match_role_map[uid] = codes

                # Build system_role_code for each user
                for u in users:
                    uid = u["id"]
                    interested_count = u.get("jobs_interested_count") or 0
                    best_score = u.get("best_match_score")
                    profile = u.get("profile_completion_per") or 0
                    scr = screening_map.get(uid, {})

                    if scr.get("screening_outcome") == "passed" or interested_count > 0:
                        # Interested: all interested role codes comma-separated
                        ids_raw = u.get("interest_confirmed_jd_ids")
                        if ids_raw:
                            if isinstance(ids_raw, str):
                                try:
                                    ids_raw = json.loads(ids_raw)
                                except:
                                    ids_raw = []
                            if isinstance(ids_raw, list):
                                codes = [jd_role_map[jid] for jid in ids_raw if jid in jd_role_map]
                                system_role_code_map[uid] = ", ".join(codes) if codes else None
                            else:
                                system_role_code_map[uid] = None
                        else:
                            system_role_code_map[uid] = None
                    elif best_score and best_score > 0 and interested_count == 0:
                        # Match No Interest: top 3 role codes
                        codes = match_role_map.get(uid, [])
                        system_role_code_map[uid] = ", ".join(codes) if codes else None
                    else:
                        # 80+ No Match or other: null
                        system_role_code_map[uid] = None
            except Exception as src_err:
                print(f"Error computing system_role_code: {src_err}")

            # Compute qualification_timestamp = min of all stage timestamps, fallback created_at
            qualification_ts_map = {}
            try:
                # Collect per-user candidate timestamps from stages 1 & 2
                user_candidates = {}  # uid -> list of timestamps
                user_created = {}     # uid -> created_at
                all_user_ids = [u["id"] for u in users]
                for u in users:
                    uid = u["id"]
                    created = u.get("created_at") or ""
                    user_created[uid] = created
                    cands = []
                    if u.get("last_recruiter_email_sent_at"):
                        cands.append(u["last_recruiter_email_sent_at"])
                    if u.get("matching_started_at"):
                        cands.append(u["matching_started_at"])
                    user_candidates[uid] = cands

                # Stage 3: batch audit_log for ALL users — find first profile crossing threshold
                if all_user_ids:
                    seen = set()
                    for i in range(0, len(all_user_ids), 100):
                        batch = all_user_ids[i:i+100]
                        audit_resp = supabase.table("audit_log").select(
                            "row_id, changed_at, changed_fields, new_data"
                        ).eq("table_name", "users").in_("row_id", batch).order("changed_at").execute()
                        for entry in (audit_resp.data or []):
                            rid = entry.get("row_id")
                            if rid in seen:
                                continue
                            if "profile_completion_per" in (entry.get("changed_fields") or []):
                                nd = entry.get("new_data") or {}
                                pval = nd.get("profile_completion_per")
                                if pval is not None and _profile_threshold_ok(pval, user_created.get(rid, "")):
                                    user_candidates.setdefault(rid, []).append(entry["changed_at"])
                                    seen.add(rid)

                # Build final map: min of candidates or fallback created_at
                for uid in all_user_ids:
                    cands = user_candidates.get(uid, [])
                    qualification_ts_map[uid] = min(cands) if cands else user_created.get(uid, "")
            except Exception as qt_err:
                print(f"Error computing qualification_timestamp: {qt_err}")

            return {
                "users": [
                    {
                        "id": u["id"],
                        "name": u.get("name"),
                        "email": u.get("email"),
                        "phone_number": u.get("phone_number"),
                        "whatsapp_number": u.get("whatsapp_number"),
                        "total_call_duration": u.get("total_call_duration_secs") or 0,
                        "profile_completion": u.get("profile_completion_per") or 0,
                        "recruiter_email": u.get("recruiter_email"),
                        "team_manager_email": u.get("team_manager_email"),
                        "data_team_tag": u.get("data_team_tag"),
                        "feedback_status": u.get("recruiter_feedback_status"),
                        "recruiter_comments": u.get("recruiter_comments"),
                        "best_match_score": u.get("best_match_score"),
                        "jobs_interested_count": u.get("jobs_interested_count") or 0,
                        "team_role_code": u.get("team_role_code"),
                        "system_role_code": system_role_code_map.get(u["id"]),
                        "qualification_timestamp": qualification_ts_map.get(u["id"]),
                        "created_at": u.get("created_at"),
                        **screening_map.get(u["id"], {})
                    }
                    for u in users
                ],
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_count": total_count,
                    "total_pages": total_pages,
                    "has_next": has_more,
                    "has_prev": page > 1
                }
            }

        return {"users": [], "pagination": {"current_page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}}

    except Exception as e:
        print(f"Error fetching users list: {e}")
        raise HTTPException(status_code=500, detail="Error fetching users list")


@router.get("/users/by-role")
def get_users_by_role(
    role_query: str = Query(..., description="Role name or role code to search"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """
    Get users who have matched or shown interest in a specific role.
    """
    supabase = get_supabase()

    try:
        offset = (page - 1) * page_size
        fetch_limit = page_size + 1

        # Search for JD by role_name or role_code (try exact match first, then partial)
        jd_result = supabase.table("jd_data").select("id, role_name, role_code").eq("role_code", role_query).execute()

        if not jd_result.data:
            # Try partial match on role_name
            jd_result = supabase.table("jd_data").select("id, role_name, role_code").eq("role_name", role_query).execute()

        if not jd_result.data:
            return {
                "found": False,
                "message": f"No role found matching '{role_query}'. Please enter exact role code (e.g., SK15) or role name.",
                "matched_users": [],
                "interested_users": []
            }

        jd_ids = [jd["id"] for jd in jd_result.data]
        roles_found = [{"id": jd["id"], "name": jd.get("role_name"), "code": jd.get("role_code")} for jd in jd_result.data]

        # Get matched users from top_matches_dashboard
        matched_result = supabase.table("top_matches_dashboard").select(
            "candidate_id, candidate_name, phone_number, jd_id, role_name, role_code, matching_score"
        ).in_("jd_id", jd_ids).order("matching_score", desc=True).range(offset, offset + fetch_limit - 1).execute()

        matched_users = []
        matched_user_ids = []
        if matched_result.data:
            has_more_matched = len(matched_result.data) > page_size
            for m in matched_result.data[:page_size]:
                matched_users.append({
                    "user_id": m.get("candidate_id"),
                    "name": m.get("candidate_name"),
                    "phone_number": m.get("phone_number"),
                    "role_name": m.get("role_name"),
                    "role_code": m.get("role_code"),
                    "matching_score": m.get("matching_score"),
                    "type": "matched"
                })
                if m.get("candidate_id"):
                    matched_user_ids.append(m.get("candidate_id"))

        # Fetch additional user data (created_at, feedback_status) for matched users
        if matched_user_ids:
            user_details = supabase.table("users").select(
                "id, created_at, recruiter_feedback_status"
            ).in_("id", matched_user_ids).execute()

            user_details_map = {u["id"]: u for u in (user_details.data or [])}
            for mu in matched_users:
                user_data = user_details_map.get(mu["user_id"], {})
                mu["created_at"] = user_data.get("created_at")
                mu["feedback_status"] = user_data.get("recruiter_feedback_status")

        # Get interested users - interest_confirmed_jd_ids is stored as JSON string
        # Fetch users with jobs_interested_count > 0 and filter in Python
        interested_users = []
        try:
            # Fetch all interested users (those with jobs_interested_count > 0)
            int_result = supabase.table("users").select(
                "id, name, phone_number, email, profile_completion_per, interest_confirmed_jd_ids, created_at, recruiter_feedback_status"
            ).gt("jobs_interested_count", 0).limit(1000).execute()

            if int_result.data:
                for u in int_result.data:
                    jd_ids_str = u.get("interest_confirmed_jd_ids")
                    if jd_ids_str:
                        # Parse JSON string to list
                        try:
                            user_jd_ids = json.loads(jd_ids_str) if isinstance(jd_ids_str, str) else jd_ids_str
                        except:
                            continue

                        # Check if any of the searched JD IDs are in user's interested list
                        if any(jd_id in user_jd_ids for jd_id in jd_ids):
                            interested_users.append({
                                "user_id": u.get("id"),
                                "name": u.get("name"),
                                "phone_number": u.get("phone_number"),
                                "email": u.get("email"),
                                "profile_completion": u.get("profile_completion_per"),
                                "created_at": u.get("created_at"),
                                "feedback_status": u.get("recruiter_feedback_status"),
                                "type": "interested"
                            })
        except Exception as ie:
            print(f"Error fetching interested users: {ie}")

        return {
            "found": True,
            "roles": roles_found,
            "matched_users": matched_users,
            "matched_count": len(matched_users),
            "interested_users": interested_users,
            "interested_count": len(interested_users),
            "pagination": {
                "current_page": page,
                "page_size": page_size,
                "has_next": len(matched_result.data) > page_size if matched_result.data else False,
                "has_prev": page > 1
            }
        }

    except Exception as e:
        print(f"Error fetching users by role: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching users by role: {str(e)}")


class FeedbackUpdateRequest(BaseModel):
    feedback_status: Optional[str] = None
    recruiter_comments: Optional[str] = None


@router.patch("/users/{user_id}/feedback")
def update_feedback_status(user_id: str, body: FeedbackUpdateRequest):
    """
    Update recruiter_feedback_status and optionally recruiter_comments for a user.
    """
    supabase = get_supabase()

    try:
        # Verify user exists
        check = supabase.table("users").select("id").eq("id", user_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="User not found")

        update_data = {"recruiter_feedback_status": body.feedback_status}
        if body.recruiter_comments is not None:
            update_data["recruiter_comments"] = body.recruiter_comments

        result = supabase.table("users").update(update_data).eq("id", user_id).execute()

        return {
            "success": True,
            "user_id": user_id,
            "feedback_status": body.feedback_status,
            "recruiter_comments": body.recruiter_comments
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating feedback status: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating feedback: {str(e)}")


class CommentsUpdateRequest(BaseModel):
    recruiter_comments: Optional[str] = None


@router.patch("/users/{user_id}/comments")
def update_recruiter_comments(user_id: str, body: CommentsUpdateRequest):
    """Update recruiter_comments for a user. Pass null to clear."""
    supabase = get_supabase()
    try:
        check = supabase.table("users").select("id").eq("id", user_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="User not found")
        supabase.table("users").update({"recruiter_comments": body.recruiter_comments}).eq("id", user_id).execute()
        return {"success": True, "user_id": user_id, "recruiter_comments": body.recruiter_comments}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating comments: {str(e)}")


@router.get("/recruiter-summary")
def recruiter_summary(
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    user_stage: Optional[str] = Query("Total Qualified", description="User stage filter"),
    data_team_tag: Optional[str] = Query(None, description="Filter by data team tag (comma-separated)"),
    team_manager_email: Optional[str] = Query(None, description="Filter by team manager / pod (comma-separated)"),
    recruiter_email: Optional[str] = Query(None, description="Filter by recruiter email (comma-separated)"),
    qualification_filter: Optional[str] = Query(None, description="Filter by qualification timestamp: before_cutoff, after_cutoff, yesterday_before_cutoff, yesterday_after_cutoff"),
):
    """
    Pivot table: rows = (pod_name, recruiter_email), columns = recruiter_feedback_status.
    Total Qualified = Interested + Match No Interest + 80+ No Match (union of 3 stages).
    """
    from collections import defaultdict

    # Canonical status order
    STATUS_ORDER = [
        "Null", "Follow Up Pending", "Not answering", "Calling Attempts Exhausted",
        "Not interested", "High Notice", "High Expectations", "Long Gap",
        "Less Experience", "Skills Mismatch", "Internal Recruiter Screen Rejected",
        "Submitted to client", "Selected by Client (Other Vendor)",
        "Client Interview Rejected", "Client Interviewed",
        "Client Sharable but Role on Hold", "Selected by Client",
        "Role Closed No Feedback", "Role Paused No Feedback",
        "Hold", "Internal Testing",
    ]

    # Pre-parse filter lists
    _tags = [t.strip() for t in data_team_tag.split(",") if t.strip()] if data_team_tag else None
    _managers = [m.strip() for m in team_manager_email.split(",") if m.strip()] if team_manager_email else None
    _recs = [r.strip() for r in recruiter_email.split(",") if r.strip()] if recruiter_email else None

    try:
        # Fetch all users with the needed columns, paginated
        fields = "id, recruiter_email, team_manager_email, data_team_tag, recruiter_feedback_status, profile_completion_per, best_match_score, jobs_interested_count, created_at, last_recruiter_email_sent_at, matching_started_at"
        all_rows = []
        page = 0
        batch = 1000

        def _fetch_users_page(sb, _page=0):
            q = sb.table("users").select(fields).order("id")
            if date_from:
                q = q.gte("created_at", f"{date_from}T00:00:00")
            if date_to:
                q = q.lte("created_at", f"{date_to}T23:59:59")
            if _tags:
                q = q.in_("data_team_tag", _tags) if len(_tags) > 1 else q.eq("data_team_tag", _tags[0])
            if _managers:
                q = q.in_("team_manager_email", _managers) if len(_managers) > 1 else q.eq("team_manager_email", _managers[0])
            if _recs:
                q = q.in_("recruiter_email", _recs) if len(_recs) > 1 else q.eq("recruiter_email", _recs[0])
            if user_stage == "Interested":
                q = q.gt("jobs_interested_count", 0)
            elif user_stage == "Match No Interest":
                q = q.gt("best_match_score", 0).eq("jobs_interested_count", 0)
            elif user_stage == "80+ No Match":
                q = q.is_("best_match_score", "null")
            return q.range(_page * batch, (_page + 1) * batch - 1).execute()

        while True:
            result = supabase_query(lambda sb, _p=page: _fetch_users_page(sb, _p))
            if not result.data:
                break
            all_rows.extend(result.data)
            if len(result.data) < batch:
                break
            page += 1

        # For Total Qualified: filter in memory as union of 3 stages
        # Interested: jobs_interested_count > 0
        # Match No Interest: best_match_score > 0 AND jobs_interested_count == 0
        # 80+ No Match: profile >= threshold AND best_match_score is null
        #   threshold: >80 for users created <= 2026-02-10, >=80 for users created after
        PROFILE_CUTOFF_DATE = "2026-02-10T23:59:59"
        def _is_profile_qualified(r):
            profile = r.get("profile_completion_per") or 0
            created = r.get("created_at") or ""
            if created <= PROFILE_CUTOFF_DATE:
                return profile > 80
            return profile >= 80

        if user_stage == "80+ No Match":
            all_rows = [r for r in all_rows if _is_profile_qualified(r)]

        if user_stage == "Total Qualified":
            all_rows = [
                r for r in all_rows
                if (r.get("jobs_interested_count") or 0) > 0  # Interested
                or ((r.get("best_match_score") or 0) > 0 and (r.get("jobs_interested_count") or 0) == 0)  # Match No Interest
                or (_is_profile_qualified(r) and not r.get("best_match_score"))  # 80+ No Match
            ]

        # --- Qualification timestamp filter ---
        if qualification_filter:
            from datetime import datetime, timezone as tz, timedelta
            ist = tz(timedelta(hours=5, minutes=30))
            now_ist = datetime.now(ist)
            if qualification_filter in ("yesterday_before_cutoff", "yesterday_after_cutoff"):
                cutoff_date = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")
            else:
                cutoff_date = now_ist.strftime("%Y-%m-%d")
            # 7 PM IST = 1:30 PM UTC; use UTC format to match DB timestamps
            cutoff_str = cutoff_date + "T13:30:00+00:00"

            # Compute qual timestamp = min of all stage timestamps per user
            q_candidates = {}
            q_created = {}
            all_uids = [r["id"] for r in all_rows]
            for r in all_rows:
                uid = r["id"]
                created = r.get("created_at") or ""
                q_created[uid] = created
                cands = []
                if r.get("last_recruiter_email_sent_at"):
                    cands.append(r["last_recruiter_email_sent_at"])
                if r.get("matching_started_at"):
                    cands.append(r["matching_started_at"])
                q_candidates[uid] = cands

            # Stage 3: batch audit_log — first profile crossing threshold
            if all_uids:
                seen_audit = set()
                try:
                    for i in range(0, len(all_uids), 200):
                        batch_ids = all_uids[i:i+200]
                        audit_resp = supabase_query(lambda sb, _b=batch_ids: sb.table("audit_log").select(
                            "row_id, changed_at, changed_fields, new_data"
                        ).eq("table_name", "users").in_("row_id", _b).order("changed_at").execute())
                        for entry in (audit_resp.data or []):
                            rid = entry.get("row_id")
                            if rid in seen_audit:
                                continue
                            if "profile_completion_per" in (entry.get("changed_fields") or []):
                                nd = entry.get("new_data") or {}
                                pval = nd.get("profile_completion_per")
                                if pval is not None and _profile_threshold_ok(pval, q_created.get(rid, "")):
                                    q_candidates.setdefault(rid, []).append(entry["changed_at"])
                                    seen_audit.add(rid)
                except Exception:
                    pass

            # Build qual timestamp map and filter
            filtered_rows = []
            for r in all_rows:
                uid = r["id"]
                cands = q_candidates.get(uid, [])
                ts = min(cands) if cands else q_created.get(uid, "")
                if not ts:
                    if qualification_filter in ("before_cutoff", "yesterday_before_cutoff"):
                        filtered_rows.append(r)
                    continue
                if qualification_filter in ("before_cutoff", "yesterday_before_cutoff") and ts <= cutoff_str:
                    filtered_rows.append(r)
                elif qualification_filter in ("after_cutoff", "yesterday_after_cutoff") and ts > cutoff_str:
                    filtered_rows.append(r)
            all_rows = filtered_rows

        # Build lookup: recruiter_email -> set of team_manager short names
        recruiter_pods = defaultdict(set)
        # Build pivot: (recruiter_email) -> { status: count }
        pivot = defaultdict(lambda: defaultdict(int))
        seen_statuses = set()

        for row in all_rows:
            rec = row.get("recruiter_email") or ""
            tm = row.get("team_manager_email") or ""
            status = row.get("recruiter_feedback_status") or "Null"

            if not rec:
                rec = "(unassigned)"

            if tm:
                short = tm.split("@")[0]
                recruiter_pods[rec].add(short)

            pivot[rec][status] += 1
            seen_statuses.add(status)

        # Use canonical order, only include statuses that exist in data
        sorted_statuses = [s for s in STATUS_ORDER if s in seen_statuses]
        # Add any statuses in data but not in canonical order (append at end)
        for s in sorted(seen_statuses):
            if s not in sorted_statuses:
                sorted_statuses.append(s)

        # Build rows
        rows = []
        for rec in sorted(pivot.keys()):
            pod_names = sorted(recruiter_pods.get(rec, set()))
            pod_str = ",".join(pod_names) if pod_names else ""
            rec_short = rec.split("@")[0] if rec != "(unassigned)" else "(unassigned)"
            counts = {}
            row_total = 0
            for st in sorted_statuses:
                c = pivot[rec].get(st, 0)
                counts[st] = c
                row_total += c
            rows.append({
                "pod_name": pod_str,
                "recruiter_email": rec_short,
                "recruiter_email_full": rec,
                "counts": counts,
                "total": row_total,
            })

        # Column totals
        col_totals = {}
        grand_total = 0
        for st in sorted_statuses:
            col_totals[st] = sum(r["counts"].get(st, 0) for r in rows)
            grand_total += col_totals[st]

        return {
            "statuses": sorted_statuses,
            "rows": rows,
            "col_totals": col_totals,
            "grand_total": grand_total,
        }

    except Exception as e:
        print(f"Error in recruiter-summary: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error generating recruiter summary")


@router.get("/conversation/audio/{conversation_id}")
async def get_conversation_audio(conversation_id: str):
    """
    Get audio recording for an ElevenLabs conversation.
    Streams the audio file directly from ElevenLabs API.
    """
    try:
        async with httpx.AsyncClient() as client:
            # ElevenLabs Conversational AI audio endpoint
            url = f"{ELEVENLABS_API_BASE}/convai/conversations/{conversation_id}/audio"
            headers = {"xi-api-key": ELEVENLABS_API_KEY}

            response = await client.get(url, headers=headers, timeout=30.0)

            if response.status_code == 200:
                return StreamingResponse(
                    iter([response.content]),
                    media_type="audio/mpeg",
                    headers={
                        "Content-Disposition": f"inline; filename={conversation_id}.mp3"
                    }
                )
            elif response.status_code == 404:
                raise HTTPException(status_code=404, detail="Audio not found for this conversation")
            else:
                raise HTTPException(status_code=response.status_code, detail=f"ElevenLabs API error: {response.text}")

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout fetching audio from ElevenLabs")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching audio: {str(e)}")
