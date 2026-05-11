from fastapi import APIRouter, Query
from typing import Optional, List, Set, Dict, Any
from datetime import datetime, date, timedelta
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from database import get_supabase, supabase_query

router = APIRouter()

BATCH_SIZE = 1000


def parse_date_to_day(date_str: str) -> str:
    """Parse ISO datetime string to YYYY-MM-DD, handling timezone correctly."""
    if not date_str:
        return "Unknown"
    # Parse the date and extract just the date part (UTC)
    try:
        # Handle various datetime formats
        if 'T' in date_str:
            dt_part = date_str.split('T')[0]
            return dt_part
        return date_str[:10]
    except:
        return "Unknown"


def get_date_range(start_date: Optional[str], end_date: Optional[str]):
    """Get date range, defaulting to today if not specified."""
    today = date.today().isoformat()
    start = start_date or today
    end = end_date or today
    return f"{start}T00:00:00", f"{end}T23:59:59"


def fetch_all_records(table_name: str, date_field: str, start_dt: str, end_dt: str) -> List[dict]:
    """Fetch all records with batching to overcome 1000 row limit."""
    all_data = []
    offset = 0

    while True:
        response = supabase_query(lambda sb, _t=table_name, _df=date_field, _s=start_dt, _e=end_dt, _o=offset: (
            sb.table(_t).select("*").gte(_df, _s).lte(_df, _e).range(_o, _o + BATCH_SIZE - 1).execute()
            if _df and _s and _e else
            sb.table(_t).select("*").range(_o, _o + BATCH_SIZE - 1).execute()
        ))
        batch = response.data

        if not batch:
            break

        all_data.extend(batch)

        if len(batch) < BATCH_SIZE:
            break

        offset += BATCH_SIZE

    return all_data


def fetch_all_records_no_filter(table_name: str) -> List[dict]:
    """Fetch all records without date filter."""
    all_data = []
    offset = 0

    while True:
        response = supabase_query(lambda sb, _t=table_name, _o=offset: sb.table(_t).select("*").range(_o, _o + BATCH_SIZE - 1).execute())
        batch = response.data

        if not batch:
            break

        all_data.extend(batch)

        if len(batch) < BATCH_SIZE:
            break

        offset += BATCH_SIZE

    return all_data


def fetch_records_by_user_ids(table_name: str, user_id_field: str, user_ids: Set[str]) -> List[dict]:
    """Fetch all records for specific user IDs with batching."""
    if not user_ids:
        return []

    all_data = []
    user_ids_list = list(user_ids)

    user_batch_size = 200
    for i in range(0, len(user_ids_list), user_batch_size):
        batch_user_ids = user_ids_list[i:i + user_batch_size]
        offset = 0

        while True:
            response = supabase_query(lambda sb, _t=table_name, _f=user_id_field, _b=batch_user_ids, _o=offset: sb.table(_t).select("*").in_(_f, _b).range(_o, _o + BATCH_SIZE - 1).execute())
            batch = response.data

            if not batch:
                break

            all_data.extend(batch)

            if len(batch) < BATCH_SIZE:
                break

            offset += BATCH_SIZE

    return all_data


def fetch_records_by_phone_numbers(table_name: str, phone_field: str, phone_numbers: Set[str]) -> List[dict]:
    """Fetch all records for specific phone numbers with batching."""
    if not phone_numbers:
        return []

    all_data = []
    phone_list = list(phone_numbers)

    phone_batch_size = 200
    for i in range(0, len(phone_list), phone_batch_size):
        batch_phones = phone_list[i:i + phone_batch_size]
        offset = 0

        while True:
            response = supabase_query(lambda sb, _t=table_name, _f=phone_field, _b=batch_phones, _o=offset: sb.table(_t).select("*").in_(_f, _b).range(_o, _o + BATCH_SIZE - 1).execute())
            batch = response.data

            if not batch:
                break

            all_data.extend(batch)

            if len(batch) < BATCH_SIZE:
                break

            offset += BATCH_SIZE

    return all_data


@router.get("/users")
def get_users(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """Get users filtered by created_at date range."""
    start_dt, end_dt = get_date_range(start_date, end_date)
    data = fetch_all_records("users", "created_at", start_dt, end_dt)
    return {"data": data, "count": len(data)}


@router.get("/whatsapp")
def get_whatsapp(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get WhatsApp conversations filtered by created_at."""
    start_dt, end_dt = get_date_range(start_date, end_date)
    data = fetch_all_records("whatsapp_conversations", "created_at", start_dt, end_dt)
    return {"data": data, "count": len(data)}


@router.get("/calls")
def get_calls(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get call conversations filtered by created_at."""
    start_dt, end_dt = get_date_range(start_date, end_date)
    data = fetch_all_records("conversations", "created_at", start_dt, end_dt)
    return {"data": data, "count": len(data)}


@router.get("/matches")
def get_matches(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get candidate-JD matches filtered by matched_at."""
    start_dt, end_dt = get_date_range(start_date, end_date)
    data = fetch_all_records("candidate_jd_matches", "matched_at", start_dt, end_dt)
    return {"data": data, "count": len(data)}


@router.get("/jds")
def get_jds():
    """Get all job descriptions (no date filter)."""
    data = fetch_all_records_no_filter("jd_data")
    return {"data": data, "count": len(data)}


@router.get("/emails")
def get_emails(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get recruiter emails filtered by created_at."""
    start_dt, end_dt = get_date_range(start_date, end_date)
    data = fetch_all_records("recruiter_emails", "created_at", start_dt, end_dt)
    return {"data": data, "count": len(data)}


@router.get("/dashboard")
def get_dashboard_data(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """
    Get all dashboard data in a single request.

    IMPORTANT: Filters users by created_at date range, then fetches ALL related data
    for those users (regardless of other tables' created_at).
    """
    start_dt, end_dt = get_date_range(start_date, end_date)

    # Step 1: Get users filtered by created_at
    users_data = fetch_all_records("users", "created_at", start_dt, end_dt)

    # Extract user IDs and phone numbers for related queries
    user_ids: Set[str] = set()
    phone_numbers: Set[str] = set()
    phone_numbers_clean: Set[str] = set()

    for user in users_data:
        if user.get("id"):
            user_ids.add(user["id"])
        if user.get("phone_number"):
            phone = user["phone_number"]
            phone_numbers.add(phone)
            # Also add cleaned version without +
            phone_numbers_clean.add(phone.replace("+", ""))

    # Step 2: Fetch ALL related data for those users (no date filter on these)
    # WhatsApp - by user_id or phone_number
    whatsapp_by_user = fetch_records_by_user_ids("whatsapp_conversations", "user_id", user_ids)
    whatsapp_by_phone = fetch_records_by_phone_numbers("whatsapp_conversations", "phone_number", phone_numbers | phone_numbers_clean)

    # Deduplicate WhatsApp data
    whatsapp_ids_seen = set()
    whatsapp_data = []
    for msg in whatsapp_by_user + whatsapp_by_phone:
        if msg.get("id") not in whatsapp_ids_seen:
            whatsapp_ids_seen.add(msg.get("id"))
            whatsapp_data.append(msg)

    # Calls - by user_id or external_number
    calls_by_user = fetch_records_by_user_ids("conversations", "user_id", user_ids)
    calls_by_phone = fetch_records_by_phone_numbers("conversations", "external_number", phone_numbers | phone_numbers_clean)

    # Deduplicate Calls data
    calls_ids_seen = set()
    calls_data = []
    for call in calls_by_user + calls_by_phone:
        if call.get("id") not in calls_ids_seen:
            calls_ids_seen.add(call.get("id"))
            calls_data.append(call)

    # Matches - by candidate_id (which is user_id)
    matches_data = fetch_records_by_user_ids("candidate_jd_matches", "candidate_id", user_ids)

    # Emails - by user_id
    emails_data = fetch_records_by_user_ids("recruiter_emails", "user_id", user_ids)

    # JDs - no filter needed
    jds_data = fetch_all_records_no_filter("jd_data")

    # Calculate various metrics
    total_users = len(users_data)

    # WA connected: users who have successful whatsapp messages
    wa_user_ids = set()
    wa_failed_user_ids = set()
    for msg in whatsapp_data:
        user_id = msg.get("user_id")
        status = (msg.get("status") or "").lower()
        if user_id:
            if status not in ["failed", "error", "undelivered"]:
                wa_user_ids.add(user_id)
            else:
                wa_failed_user_ids.add(user_id)

    wa_connected = len(wa_user_ids)
    wa_failed = len(wa_failed_user_ids - wa_user_ids)

    # Call stats
    total_calls = len(calls_data)
    successful_calls = len([c for c in calls_data if c.get("status") == "done"])
    total_call_duration = sum(c.get("call_duration_secs") or 0 for c in calls_data)

    # CV stats
    cvs_uploaded = len([u for u in users_data if u.get("linkedin_cv_text") or u.get("file_cv_text") or u.get("cv_file_url")])

    # Interested users
    interested_users = len([u for u in users_data if (u.get("jobs_interested_count") or 0) > 0])

    # Matches and emails
    total_matches = len(matches_data)
    emails_sent = len(emails_data)

    # Active JDs
    active_jds = len([j for j in jds_data if (j.get("status") or "").lower() == "active"])

    # Get unique statuses for filters
    statuses = list(set(u.get("status") for u in users_data if u.get("status")))

    # Get unique recruiter_feedback_status values
    feedback_statuses = list(set(u.get("recruiter_feedback_status") for u in users_data if u.get("recruiter_feedback_status")))
    recruiters = sorted(list(set(u.get("recruiter_email") for u in users_data if u.get("recruiter_email"))))
    team_managers = sorted(list(set(u.get("team_manager_email") for u in users_data if u.get("team_manager_email"))))

    return {
        "users": users_data,
        "whatsapp": whatsapp_data,
        "calls": calls_data,
        "matches": matches_data,
        "jds": jds_data,
        "emails": emails_data,
        "stats": {
            "total_users": total_users,
            "wa_connected": wa_connected,
            "wa_failed": wa_failed,
            "total_calls": total_calls,
            "successful_calls": successful_calls,
            "total_call_duration": total_call_duration,
            "cvs_uploaded": cvs_uploaded,
            "interested_users": interested_users,
            "total_matches": total_matches,
            "emails_sent": emails_sent,
            "active_jds": active_jds
        },
        "filters": {
            "statuses": statuses,
            "feedback_statuses": feedback_statuses,
            "recruiters": recruiters,
            "team_managers": team_managers
        },
        "date_params": {
            "start_date": start_date or date.today().isoformat(),
            "end_date": end_date or date.today().isoformat()
        }
    }


@router.get("/dashboard/summary")
def get_dashboard_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """
    Get dashboard summary with pre-computed daily stats.
    Loads all related data for accurate metrics.
    """
    start_dt, end_dt = get_date_range(start_date, end_date)

    # Fetch users filtered by created_at
    users_data = fetch_all_records("users", "created_at", start_dt, end_dt)

    # Extract user IDs and phone numbers
    user_ids: Set[str] = set()
    phone_numbers: Set[str] = set()
    phone_numbers_clean: Set[str] = set()

    for user in users_data:
        if user.get("id"):
            user_ids.add(user["id"])
        if user.get("phone_number"):
            phone = user["phone_number"]
            phone_numbers.add(phone)
            phone_numbers_clean.add(phone.replace("+", ""))

    # Fetch related data
    whatsapp_by_user = fetch_records_by_user_ids("whatsapp_conversations", "user_id", user_ids)
    whatsapp_by_phone = fetch_records_by_phone_numbers("whatsapp_conversations", "phone_number", phone_numbers | phone_numbers_clean)

    # Deduplicate WhatsApp
    whatsapp_ids_seen = set()
    whatsapp_data = []
    for msg in whatsapp_by_user + whatsapp_by_phone:
        if msg.get("id") not in whatsapp_ids_seen:
            whatsapp_ids_seen.add(msg.get("id"))
            whatsapp_data.append(msg)

    # Calls
    calls_by_user = fetch_records_by_user_ids("conversations", "user_id", user_ids)
    calls_by_phone = fetch_records_by_phone_numbers("conversations", "external_number", phone_numbers | phone_numbers_clean)

    calls_ids_seen = set()
    calls_data = []
    for call in calls_by_user + calls_by_phone:
        if call.get("id") not in calls_ids_seen:
            calls_ids_seen.add(call.get("id"))
            calls_data.append(call)

    # Matches
    matches_data = fetch_records_by_user_ids("candidate_jd_matches", "candidate_id", user_ids)

    # JDs
    jds_data = fetch_all_records_no_filter("jd_data")
    active_jds = len([j for j in jds_data if (j.get("status") or "").lower() == "active"])

    # Build user metrics maps
    user_call_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"total": 0, "duration": 0, "successful": 0})
    for call in calls_data:
        uid = call.get("user_id")
        if uid:
            user_call_stats[uid]["total"] += 1
            user_call_stats[uid]["duration"] += call.get("call_duration_secs") or 0
            if call.get("status") == "done":
                user_call_stats[uid]["successful"] += 1

    user_wa_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"total": 0, "outbound": 0, "inbound": 0, "has_failed": False, "has_success": False})
    for msg in whatsapp_data:
        uid = msg.get("user_id")
        if uid:
            user_wa_stats[uid]["total"] += 1
            if msg.get("direction") == "outbound":
                user_wa_stats[uid]["outbound"] += 1
            if msg.get("direction") == "inbound":
                user_wa_stats[uid]["inbound"] += 1
            status = (msg.get("status") or "").lower()
            if status in ["failed", "error", "undelivered"]:
                user_wa_stats[uid]["has_failed"] = True
            else:
                user_wa_stats[uid]["has_success"] = True

    user_match_counts: Dict[str, int] = defaultdict(int)
    for match in matches_data:
        cid = match.get("candidate_id")
        if cid:
            user_match_counts[cid] += 1

    # Compute daily metrics
    daily_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "users": 0,
        "calls": 0,
        "total_duration": 0,
        "connected_users": 0,
        "users_gte_4min": 0,
        "total_wa": 0,
        "wa_out": 0,
        "wa_in": 0,
        "wa_engaged_users": 0,
        "users_with_inbound": 0,
        "matches_users": 0,
        "interested": 0,
        "with_cv": 0,
        "profile_70plus": 0,
        "wa_failed": 0,
        "wa_reconnected": 0,
        "wa_connected": 0,
    })

    status_breakdown: Dict[str, int] = defaultdict(int)
    feedback_breakdown: Dict[str, int] = defaultdict(int)

    # Group breakdowns for Team Manager and Recruiter
    def init_group_stats():
        return {
            "users": 0,
            "calls": 0,
            "total_duration": 0,
            "connected_users": 0,
            "users_gte_4min": 0,
            "total_wa": 0,
            "wa_out": 0,
            "wa_in": 0,
            "wa_engaged_users": 0,
            "users_with_inbound": 0,
            "matches_users": 0,
            "interested": 0,
            "with_cv": 0,
            "profile_70plus": 0,
            "wa_failed": 0,
            "wa_reconnected": 0,
            "wa_connected": 0,
        }

    team_manager_stats: Dict[str, Dict[str, Any]] = defaultdict(init_group_stats)
    recruiter_stats: Dict[str, Dict[str, Any]] = defaultdict(init_group_stats)

    # Daily breakdown per Team Manager and Recruiter (date|group -> stats)
    def init_daily_group_stats():
        return defaultdict(init_group_stats)

    team_manager_daily: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(init_daily_group_stats)
    recruiter_daily: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(init_daily_group_stats)

    for user in users_data:
        uid = user.get("id")
        day = parse_date_to_day(user.get("created_at"))
        d = daily_stats[day]

        d["users"] += 1

        # Call stats
        cs = user_call_stats.get(uid, {"total": 0, "duration": 0, "successful": 0})
        d["calls"] += cs["total"]
        d["total_duration"] += cs["duration"]
        if cs["duration"] > 0:
            d["connected_users"] += 1
        if cs["duration"] >= 240:
            d["users_gte_4min"] += 1

        # WA stats
        ws = user_wa_stats.get(uid, {"total": 0, "outbound": 0, "inbound": 0, "has_failed": False, "has_success": False})
        d["total_wa"] += ws["total"]
        d["wa_out"] += ws["outbound"]
        d["wa_in"] += ws["inbound"]
        if ws["inbound"] > 0:
            d["wa_engaged_users"] += 1
            d["users_with_inbound"] += 1

        if ws["has_failed"] and not ws["has_success"]:
            d["wa_failed"] += 1
        elif ws["has_failed"] and ws["has_success"]:
            d["wa_reconnected"] += 1
        elif ws["has_success"]:
            d["wa_connected"] += 1

        # Match stats
        if user_match_counts.get(uid, 0) > 0:
            d["matches_users"] += 1

        # User attributes
        if user.get("linkedin_cv_text") or user.get("file_cv_text") or user.get("cv_file_url"):
            d["with_cv"] += 1
        if (user.get("profile_completion_per") or 0) >= 70:
            d["profile_70plus"] += 1
        if (user.get("jobs_interested_count") or 0) > 0:
            d["interested"] += 1

        # Status breakdowns
        status_breakdown[user.get("status") or "(Not Set)"] += 1
        feedback_breakdown[user.get("recruiter_feedback_status") or "(Not Set)"] += 1

        # Team Manager and Recruiter group stats
        tm_key = user.get("team_manager_email") or "(Not Assigned)"
        rec_key = user.get("recruiter_email") or "(Not Assigned)"

        # Helper to update group stats
        def update_group_stats(g):
            g["users"] += 1
            g["calls"] += cs["total"]
            g["total_duration"] += cs["duration"]
            if cs["duration"] > 0:
                g["connected_users"] += 1
            if cs["duration"] >= 240:
                g["users_gte_4min"] += 1
            g["total_wa"] += ws["total"]
            g["wa_out"] += ws["outbound"]
            g["wa_in"] += ws["inbound"]
            if ws["inbound"] > 0:
                g["wa_engaged_users"] += 1
                g["users_with_inbound"] += 1
            if ws["has_failed"] and not ws["has_success"]:
                g["wa_failed"] += 1
            elif ws["has_failed"] and ws["has_success"]:
                g["wa_reconnected"] += 1
            elif ws["has_success"]:
                g["wa_connected"] += 1
            if user_match_counts.get(uid, 0) > 0:
                g["matches_users"] += 1
            if user.get("linkedin_cv_text") or user.get("file_cv_text") or user.get("cv_file_url"):
                g["with_cv"] += 1
            if (user.get("profile_completion_per") or 0) >= 70:
                g["profile_70plus"] += 1
            if (user.get("jobs_interested_count") or 0) > 0:
                g["interested"] += 1

        # Update overall group stats
        update_group_stats(team_manager_stats[tm_key])
        update_group_stats(recruiter_stats[rec_key])

        # Update daily group stats
        update_group_stats(team_manager_daily[tm_key][day])
        update_group_stats(recruiter_daily[rec_key][day])

    # Convert to list and sort by date descending
    daily_list = []
    for day, stats in daily_stats.items():
        stats["date"] = day
        daily_list.append(stats)
    daily_list.sort(key=lambda x: x["date"], reverse=True)

    # Compute totals
    totals = {
        "users": len(users_data),
        "calls": len(calls_data),
        "total_duration": sum(c.get("call_duration_secs") or 0 for c in calls_data),
        "successful_calls": len([c for c in calls_data if c.get("status") == "done"]),
        "total_wa": len(whatsapp_data),
        "total_matches": len(matches_data),
        "active_jds": active_jds,
        "wa_connected": len([uid for uid, ws in user_wa_stats.items() if ws["has_success"] and not ws["has_failed"]]),
        "wa_failed": len([uid for uid, ws in user_wa_stats.items() if ws["has_failed"] and not ws["has_success"]]),
        "users_with_inbound": len([uid for uid, ws in user_wa_stats.items() if ws["inbound"] > 0]),
        "cvs_uploaded": len([u for u in users_data if u.get("linkedin_cv_text") or u.get("file_cv_text") or u.get("cv_file_url")]),
        "interested_users": len([u for u in users_data if (u.get("jobs_interested_count") or 0) > 0]),
    }

    # Get unique statuses for filter dropdown
    statuses = list(set(u.get("status") for u in users_data if u.get("status")))
    feedback_statuses = list(set(u.get("recruiter_feedback_status") for u in users_data if u.get("recruiter_feedback_status")))
    recruiters = sorted(list(set(u.get("recruiter_email") for u in users_data if u.get("recruiter_email"))))
    team_managers = sorted(list(set(u.get("team_manager_email") for u in users_data if u.get("team_manager_email"))))

    # Convert group stats to lists
    tm_breakdown = [{"name": k, **v} for k, v in sorted(team_manager_stats.items(), key=lambda x: -x[1]["users"])]
    rec_breakdown = [{"name": k, **v} for k, v in sorted(recruiter_stats.items(), key=lambda x: -x[1]["users"])]

    # Convert daily group stats to flat list
    # Format: [{name: "tm@email.com", date: "2024-01-15", users: 5, ...}, ...]
    tm_daily_list = []
    for tm_name, dates in team_manager_daily.items():
        for date_str, stats in dates.items():
            tm_daily_list.append({"name": tm_name, "date": date_str, **stats})
    tm_daily_list.sort(key=lambda x: (x["date"], -x["users"]), reverse=True)

    rec_daily_list = []
    for rec_name, dates in recruiter_daily.items():
        for date_str, stats in dates.items():
            rec_daily_list.append({"name": rec_name, "date": date_str, **stats})
    rec_daily_list.sort(key=lambda x: (x["date"], -x["users"]), reverse=True)

    return {
        "daily": daily_list,
        "totals": totals,
        "status_breakdown": [{"status": k, "count": v} for k, v in sorted(status_breakdown.items(), key=lambda x: -x[1])],
        "feedback_breakdown": [{"status": k, "count": v} for k, v in sorted(feedback_breakdown.items(), key=lambda x: -x[1])],
        "team_manager_breakdown": tm_breakdown,
        "recruiter_breakdown": rec_breakdown,
        "team_manager_daily": tm_daily_list,
        "recruiter_daily": rec_daily_list,
        "filters": {
            "statuses": statuses,
            "feedback_statuses": feedback_statuses,
            "recruiters": recruiters,
            "team_managers": team_managers
        },
        "date_params": {
            "start_date": start_date or date.today().isoformat(),
            "end_date": end_date or date.today().isoformat()
        }
    }


def fetch_whatsapp_threaded(user_ids: Set[str], phone_numbers: Set[str]) -> List[dict]:
    """Fetch WhatsApp data using threading."""
    whatsapp_ids_seen = set()
    whatsapp_data = []

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_by_user = executor.submit(fetch_records_by_user_ids, "whatsapp_conversations", "user_id", user_ids)
        future_by_phone = executor.submit(fetch_records_by_phone_numbers, "whatsapp_conversations", "phone_number", phone_numbers)

        for msg in future_by_user.result() + future_by_phone.result():
            if msg.get("id") not in whatsapp_ids_seen:
                whatsapp_ids_seen.add(msg.get("id"))
                whatsapp_data.append(msg)

    return whatsapp_data


def fetch_calls_threaded(user_ids: Set[str], phone_numbers: Set[str]) -> List[dict]:
    """Fetch Calls data using threading."""
    calls_ids_seen = set()
    calls_data = []

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_by_user = executor.submit(fetch_records_by_user_ids, "conversations", "user_id", user_ids)
        future_by_phone = executor.submit(fetch_records_by_phone_numbers, "conversations", "external_number", phone_numbers)

        for call in future_by_user.result() + future_by_phone.result():
            if call.get("id") not in calls_ids_seen:
                calls_ids_seen.add(call.get("id"))
                calls_data.append(call)

    return calls_data


@router.get("/dashboard/details")
def get_dashboard_details(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    include: str = Query("users", description="Comma-separated: users,whatsapp,calls,matches,jds,emails")
):
    """
    Get detailed data on demand with concurrent fetching.
    Returns FULL raw data without stripping.
    Filters users by created_at, then fetches ALL related data for those users.
    """
    start_dt, end_dt = get_date_range(start_date, end_date)
    include_set = set(include.split(","))

    result: Dict[str, Any] = {}

    # Always need users first to get IDs
    users_data = fetch_all_records("users", "created_at", start_dt, end_dt)

    user_ids: Set[str] = set()
    phone_numbers: Set[str] = set()
    phone_numbers_clean: Set[str] = set()

    for user in users_data:
        if user.get("id"):
            user_ids.add(user["id"])
        if user.get("phone_number"):
            phone = user["phone_number"]
            phone_numbers.add(phone)
            phone_numbers_clean.add(phone.replace("+", ""))

    all_phone_numbers = phone_numbers | phone_numbers_clean

    if "users" in include_set:
        result["users"] = users_data

    # Use ThreadPoolExecutor for concurrent fetching of related data
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {}

        if "whatsapp" in include_set:
            futures["whatsapp"] = executor.submit(fetch_whatsapp_threaded, user_ids, all_phone_numbers)

        if "calls" in include_set:
            futures["calls"] = executor.submit(fetch_calls_threaded, user_ids, all_phone_numbers)

        if "matches" in include_set:
            futures["matches"] = executor.submit(fetch_records_by_user_ids, "candidate_jd_matches", "candidate_id", user_ids)

        if "jds" in include_set:
            futures["jds"] = executor.submit(fetch_all_records_no_filter, "jd_data")

        if "emails" in include_set:
            futures["emails"] = executor.submit(fetch_records_by_user_ids, "recruiter_emails", "user_id", user_ids)

        # Collect results
        for key, future in futures.items():
            result[key] = future.result()

    return result
