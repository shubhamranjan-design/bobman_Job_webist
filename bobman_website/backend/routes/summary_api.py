"""
Summary API - Optimized with caching and cohort analysis
Returns recruiter/pod-wise summary with daily/weekly breakdowns
"""

from fastapi import APIRouter, Query
from typing import Optional, Dict, Any, Set, List
from collections import defaultdict
from datetime import datetime, timedelta
import re
import gc
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from database import get_supabase, supabase_query, create_supabase, _is_connection_error

logger = logging.getLogger(__name__)

router = APIRouter()

BATCH_SIZE = 1000
USER_BATCH_SIZE = 500

_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 300


def get_cached(key: str) -> Optional[Dict]:
    if key in _cache:
        entry = _cache[key]
        if time.time() - entry["timestamp"] < CACHE_TTL:
            return entry["data"]
        else:
            del _cache[key]
    return None


def set_cache(key: str, data: Dict):
    if len(_cache) > 10:
        oldest_key = min(_cache.keys(), key=lambda k: _cache[k]["timestamp"])
        del _cache[oldest_key]
    _cache[key] = {"data": data, "timestamp": time.time()}


def normalize_email(email: str) -> str:
    if not email:
        return None
    normalized = email.lower().strip()
    normalized = re.sub(r'@gmail\.com$', '@awign.com', normalized)
    return normalized


def parse_date(date_str: str) -> str:
    """Extract YYYY-MM-DD from datetime string."""
    if not date_str:
        return "Unknown"
    try:
        if 'T' in date_str:
            return date_str.split('T')[0]
        return date_str[:10]
    except:
        return "Unknown"


def get_week_key(date_str: str) -> str:
    """Get week identifier (YYYY-WNN) from date string."""
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return f"{dt.year}-W{dt.isocalendar()[1]:02d}"
    except:
        return "Unknown"


def get_timestamp_hour(ts_str: str) -> Optional[int]:
    """Extract hour (IST) from ISO timestamp string."""
    if not ts_str:
        return None
    try:
        # Parse the timestamp
        ts_str = ts_str.replace('Z', '+00:00')
        if '.' in ts_str and '+' in ts_str:
            parts = ts_str.split('+')
            main_part = parts[0]
            tz_part = parts[1] if len(parts) > 1 else '00:00'
            if '.' in main_part:
                dt_part, micro_part = main_part.split('.')
                micro_part = micro_part[:6]
                main_part = f"{dt_part}.{micro_part}"
            ts_str = f"{main_part}+{tz_part}"
        dt = datetime.fromisoformat(ts_str)
        unix_ts = dt.timestamp()
        # Convert to IST (UTC+5:30)
        IST_OFFSET = 5.5 * 3600
        ist_time = unix_ts + IST_OFFSET
        return int((ist_time % 86400) // 3600)
    except:
        return None


def fetch_users_paginated(start_dt: str, end_dt: str, filters: Dict[str, List[str]] = None) -> List[dict]:
    supabase = get_supabase()
    all_data = []
    offset = 0
    fields = "id,phone_number,recruiter_email,team_manager_email,data_team_tag,call_cv_text,linkedin_cv_text,file_cv_text,profile_completion_per,jobs_interested_count,created_at,cv_generated_at,matching_started_at,last_recruiter_email_sent_at"

    while True:
        query = supabase.table("users").select(fields).gte("created_at", start_dt).lte("created_at", end_dt)

        # Apply filters if provided
        if filters:
            if filters.get("team_manager_email"):
                query = query.in_("team_manager_email", filters["team_manager_email"])
            if filters.get("recruiter_email"):
                query = query.in_("recruiter_email", filters["recruiter_email"])
            if filters.get("data_team_tag"):
                query = query.in_("data_team_tag", filters["data_team_tag"])

        response = query.order("id").range(offset, offset + BATCH_SIZE - 1).execute()
        batch = response.data
        if not batch:
            break
        all_data.extend(batch)
        if len(batch) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
        if offset % 2000 == 0:
            gc.collect()
    return all_data


def _query_with_retry(sb, fn, retries=2):
    """Execute query with retry on connection errors, using a given client."""
    for attempt in range(retries + 1):
        try:
            return fn(sb)
        except Exception as e:
            if _is_connection_error(e) and attempt < retries:
                logger.warning(f"Connection error (attempt {attempt + 1}): {type(e).__name__}")
                sb = create_supabase()
                time.sleep(0.3)
                continue
            raise


def fetch_call_stats_for_users(user_ids: Set[str], phone_numbers: Set[str]) -> Dict[str, Dict]:
    if not user_ids and not phone_numbers:
        return {}
    sb = create_supabase()
    user_stats: Dict[str, Dict] = defaultdict(lambda: {"total": 0, "duration": 0, "first_call_unix": None, "first_call_hour": None})
    user_ids_list = list(user_ids)

    CONV_BATCH_SIZE = 200

    for i in range(0, len(user_ids_list), CONV_BATCH_SIZE):
        batch_ids = user_ids_list[i:i + CONV_BATCH_SIZE]
        offset = 0
        while True:
            response = _query_with_retry(sb, lambda s, _b=batch_ids, _o=offset: s.table("conversations").select("user_id,call_duration_secs,start_time_unix_secs").in_("user_id", _b).order("id").range(_o, _o + BATCH_SIZE - 1).execute())
            if not response.data:
                break
            for call in response.data:
                uid = call.get("user_id")
                if uid:
                    user_stats[uid]["total"] += 1
                    user_stats[uid]["duration"] += call.get("call_duration_secs") or 0
                    # Track earliest call time for this user
                    call_time = call.get("start_time_unix_secs")
                    if call_time:
                        if user_stats[uid]["first_call_unix"] is None or call_time < user_stats[uid]["first_call_unix"]:
                            user_stats[uid]["first_call_unix"] = call_time
            if len(response.data) < BATCH_SIZE:
                break
            offset += BATCH_SIZE
            del response

    # Convert Unix timestamps to hour (IST = UTC+5:30)
    IST_OFFSET = 5.5 * 3600  # 5 hours 30 minutes in seconds
    for uid, stats in user_stats.items():
        if stats["first_call_unix"]:
            # Convert to IST and extract hour
            ist_time = stats["first_call_unix"] + IST_OFFSET
            stats["first_call_hour"] = int((ist_time % 86400) // 3600)  # Hour of day (0-23)
        else:
            stats["first_call_hour"] = None

    gc.collect()
    return dict(user_stats)


def fetch_wa_combined(user_ids: Set[str]):
    """Fetch WhatsApp stats and inbound users in a single pass."""
    if not user_ids:
        return set(), {}
    sb = create_supabase()
    inbound_users = set()
    wa_stats: Dict[str, Dict] = defaultdict(lambda: {"total": 0, "inbound": 0, "outbound": 0})
    user_ids_list = list(user_ids)

    WA_BATCH_SIZE = 200

    for i in range(0, len(user_ids_list), WA_BATCH_SIZE):
        batch_ids = user_ids_list[i:i + WA_BATCH_SIZE]
        offset = 0
        while True:
            response = _query_with_retry(sb, lambda s, _b=batch_ids, _o=offset: s.table("whatsapp_conversations").select("user_id,direction").in_("user_id", _b).order("id").range(_o, _o + BATCH_SIZE - 1).execute())
            if not response.data:
                break
            for msg in response.data:
                uid = msg.get("user_id")
                if uid:
                    direction = msg.get("direction", "").lower()
                    wa_stats[uid]["total"] += 1
                    if direction == "inbound":
                        wa_stats[uid]["inbound"] += 1
                        inbound_users.add(uid)
                    else:
                        wa_stats[uid]["outbound"] += 1
            if len(response.data) < BATCH_SIZE:
                break
            offset += BATCH_SIZE
            del response
    gc.collect()
    return inbound_users, dict(wa_stats)


def fetch_matched_users(user_ids: Set[str]) -> Set[str]:
    if not user_ids:
        return set()
    sb = create_supabase()
    matched_users = set()
    user_ids_list = list(user_ids)

    MATCH_BATCH_SIZE = 200

    for i in range(0, len(user_ids_list), MATCH_BATCH_SIZE):
        batch_ids = user_ids_list[i:i + MATCH_BATCH_SIZE]
        offset = 0
        while True:
            response = _query_with_retry(sb, lambda s, _b=batch_ids, _o=offset: s.table("candidate_jd_matches").select("candidate_id").in_("candidate_id", _b).order("id").range(_o, _o + BATCH_SIZE - 1).execute())
            if not response.data:
                break
            for match in response.data:
                if match.get("candidate_id"):
                    matched_users.add(match["candidate_id"])
            if len(response.data) < BATCH_SIZE:
                break
            offset += BATCH_SIZE
            del response
    gc.collect()
    return matched_users


def init_stats():
    # Duration bucket suffixes
    dur_suffixes = ["no_answer", "lt_1min", "1_2min", "2_4min", "4_10min", "gte_10min"]
    # TAT bucket suffixes (time from user creation to first call)
    tat_suffixes = ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "no_call"]
    # TAT milestone bucket suffixes (time from first call to milestone)
    tat_milestone_suffixes = ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "not_reached"]

    stats = {
        "users": 0,
        "call_attempted": 0,
        "call_connected": 0,
        "call_connected_users": 0,
        "call_gt_4min": 0,
        "profiling_calling": 0,
        "profiling_linkedin_cv": 0,
        "profile_80plus": 0,
        "matching_job_found": 0,
        "interest_shown": 0,
        "users_with_inbound": 0,
        "profile_80_no_match": 0,
        "match_no_interest": 0,
        "total_qualified_leads": 0,
        "total_call_duration": 0,
        # WA totals
        "wa_total_msgs": 0,
        "wa_inbound_msgs": 0,
        "wa_outbound_msgs": 0,
    }

    # Add per-bucket metrics (duration)
    for suffix in dur_suffixes:
        # Basic bucket counts
        stats[f"dur_{suffix}"] = 0
        stats[f"calls_{suffix}"] = 0
        # WA Fail (no WA response)
        stats[f"wa_fail_{suffix}"] = 0
        # WA Reconnected breakdown (users with any WA)
        stats[f"wa_reconn_{suffix}"] = 0
        stats[f"wa_reconn_inb_{suffix}"] = 0
        stats[f"wa_reconn_cv_{suffix}"] = 0
        stats[f"wa_reconn_mat_{suffix}"] = 0
        stats[f"wa_reconn_int_{suffix}"] = 0
        # WA Connected breakdown (users with inbound WA)
        stats[f"wa_conn_{suffix}"] = 0
        stats[f"wa_conn_inb_{suffix}"] = 0
        stats[f"wa_conn_cv_{suffix}"] = 0
        stats[f"wa_conn_mat_{suffix}"] = 0
        stats[f"wa_conn_int_{suffix}"] = 0

    # Add per-bucket metrics (TAT - turnaround time from user creation to first call)
    for suffix in tat_suffixes:
        stats[f"tat_{suffix}"] = 0
        stats[f"tat_{suffix}_conn"] = 0
        stats[f"tat_{suffix}_4min"] = 0
        stats[f"tat_{suffix}_80plus"] = 0
        stats[f"tat_{suffix}_cv"] = 0
        stats[f"tat_{suffix}_match"] = 0
        stats[f"tat_{suffix}_interest"] = 0

    # Add TAT milestone metrics (time from first call to each milestone)
    # TAT to CV generated
    for suffix in tat_milestone_suffixes:
        stats[f"tat_to_cv_{suffix}"] = 0
    # TAT to matching started
    for suffix in tat_milestone_suffixes:
        stats[f"tat_to_match_{suffix}"] = 0
    # TAT to interest shown (recruiter email sent)
    for suffix in tat_milestone_suffixes:
        stats[f"tat_to_interest_{suffix}"] = 0

    return stats


def calculate_user_metrics(user, user_call_stats, inbound_users, matched_users, wa_stats=None):
    uid = user.get("id")
    cs = user_call_stats.get(uid, {"total": 0, "duration": 0, "first_call_unix": None})
    ws = (wa_stats or {}).get(uid, {"total": 0, "inbound": 0, "outbound": 0})
    has_inbound = uid in inbound_users
    has_match = uid in matched_users
    has_cv = bool(user.get("linkedin_cv_text") or user.get("file_cv_text"))
    profile_pct = user.get("profile_completion_per") or 0
    is_profile_80 = profile_pct >= 80
    has_interest = (user.get("jobs_interested_count") or 0) > 0

    # Calculate individual qualified lead components
    # 80%+ profile but not matched and not interested
    is_80_no_match = 1 if (is_profile_80 and not has_match and not has_interest) else 0
    # Job matched/shared but no interest shown
    is_match_no_interest = 1 if (has_match and not has_interest) else 0
    is_interested = 1 if has_interest else 0

    # Duration and calls
    duration = cs["duration"]
    calls = cs["total"]

    # WA stats
    has_wa = ws["total"] > 0
    has_wa_inbound = ws["inbound"] > 0

    # Determine duration bucket suffix
    if duration == 0:
        suffix = "no_answer"
    elif duration < 60:
        suffix = "lt_1min"
    elif duration < 120:
        suffix = "1_2min"
    elif duration < 240:
        suffix = "2_4min"
    elif duration < 600:
        suffix = "4_10min"
    else:
        suffix = "gte_10min"

    # Calculate TAT (turnaround time from user creation to first call)
    tat_suffix = "no_call"
    first_call_unix = cs.get("first_call_unix")
    user_created_at = user.get("created_at")

    # Helper to parse ISO timestamp to unix
    def parse_iso_to_unix(ts_str):
        if not ts_str:
            return None
        try:
            from datetime import datetime
            # Handle various ISO formats
            ts_str = ts_str.replace('Z', '+00:00')
            if '.' in ts_str and '+' in ts_str:
                # Truncate microseconds if too long
                parts = ts_str.split('+')
                main_part = parts[0]
                tz_part = parts[1] if len(parts) > 1 else '00:00'
                if '.' in main_part:
                    dt_part, micro_part = main_part.split('.')
                    micro_part = micro_part[:6]  # Keep only 6 digits
                    main_part = f"{dt_part}.{micro_part}"
                ts_str = f"{main_part}+{tz_part}"
            dt = datetime.fromisoformat(ts_str)
            return dt.timestamp()
        except:
            return None

    # Helper to get TAT bucket suffix from hours
    def get_tat_bucket(hours):
        if hours < 1:
            return "lt_1hr"
        elif hours < 3:
            return "1_3hr"
        elif hours < 6:
            return "3_6hr"
        elif hours < 12:
            return "6_12hr"
        elif hours < 24:
            return "12_24hr"
        else:
            return "gt_24hr"

    # TAT from user creation to first call
    if first_call_unix and user_created_at:
        created_unix = parse_iso_to_unix(user_created_at)
        if created_unix:
            tat_seconds = first_call_unix - created_unix
            tat_hours = tat_seconds / 3600
            tat_suffix = get_tat_bucket(tat_hours) if tat_hours >= 0 else "no_call"

    # TAT from first call (or created_at as fallback) to milestones
    tat_to_cv_suffix = "not_reached"
    tat_to_match_suffix = "not_reached"
    tat_to_interest_suffix = "not_reached"

    # Use first_call_unix if available, otherwise fall back to created_at
    base_unix = first_call_unix
    if not base_unix:
        base_unix = parse_iso_to_unix(user.get("created_at"))

    if base_unix:
        # TAT to CV generated (only if CV content exists)
        cv_generated_at = user.get("cv_generated_at")
        if cv_generated_at and has_cv:  # has_cv checks linkedin_cv_text or file_cv_text
            cv_unix = parse_iso_to_unix(cv_generated_at)
            if cv_unix:
                cv_hours = (cv_unix - base_unix) / 3600
                if cv_hours >= 0:
                    tat_to_cv_suffix = get_tat_bucket(cv_hours)

        # TAT to matching started
        matching_started_at = user.get("matching_started_at")
        if matching_started_at:
            match_unix = parse_iso_to_unix(matching_started_at)
            if match_unix:
                match_hours = (match_unix - base_unix) / 3600
                if match_hours >= 0:
                    tat_to_match_suffix = get_tat_bucket(match_hours)

        # TAT to interest shown (recruiter email sent)
        interest_at = user.get("last_recruiter_email_sent_at")
        if interest_at:
            interest_unix = parse_iso_to_unix(interest_at)
            if interest_unix:
                interest_hours = (interest_unix - base_unix) / 3600
                if interest_hours >= 0:
                    tat_to_interest_suffix = get_tat_bucket(interest_hours)

    # Build metrics dict
    metrics = {
        "users": 1,
        "call_attempted": calls,
        "call_connected": 1 if duration > 0 else 0,
        "call_connected_users": 1 if duration > 0 else 0,
        "call_gt_4min": 1 if duration >= 240 else 0,
        "profiling_calling": 1 if user.get("call_cv_text") else 0,
        "profiling_linkedin_cv": 1 if has_cv else 0,
        "profile_80plus": 1 if is_profile_80 else 0,
        "matching_job_found": 1 if has_match else 0,
        "interest_shown": is_interested,
        "users_with_inbound": 1 if has_inbound else 0,
        "profile_80_no_match": is_80_no_match,
        "match_no_interest": is_match_no_interest,
        "total_qualified_leads": is_80_no_match + is_match_no_interest + is_interested,
        "total_call_duration": duration,
        # WA totals
        "wa_total_msgs": ws["total"],
        "wa_inbound_msgs": ws["inbound"],
        "wa_outbound_msgs": ws["outbound"],
    }

    # Initialize all bucket metrics to 0
    for s in ["no_answer", "lt_1min", "1_2min", "2_4min", "4_10min", "gte_10min"]:
        metrics[f"dur_{s}"] = 0
        metrics[f"calls_{s}"] = 0
        metrics[f"wa_fail_{s}"] = 0
        metrics[f"wa_reconn_{s}"] = 0
        metrics[f"wa_reconn_inb_{s}"] = 0
        metrics[f"wa_reconn_cv_{s}"] = 0
        metrics[f"wa_reconn_mat_{s}"] = 0
        metrics[f"wa_reconn_int_{s}"] = 0
        metrics[f"wa_conn_{s}"] = 0
        metrics[f"wa_conn_inb_{s}"] = 0
        metrics[f"wa_conn_cv_{s}"] = 0
        metrics[f"wa_conn_mat_{s}"] = 0
        metrics[f"wa_conn_int_{s}"] = 0

    # Set values for the user's duration bucket
    metrics[f"dur_{suffix}"] = 1
    metrics[f"calls_{suffix}"] = calls

    # WA Fail = no WA messages received
    if not has_wa:
        metrics[f"wa_fail_{suffix}"] = 1

    # WA Reconnected = received any WA messages
    if has_wa:
        metrics[f"wa_reconn_{suffix}"] = 1
        if has_wa_inbound:
            metrics[f"wa_reconn_inb_{suffix}"] = 1
        if has_cv:
            metrics[f"wa_reconn_cv_{suffix}"] = 1
        if has_match:
            metrics[f"wa_reconn_mat_{suffix}"] = 1
        if has_interest:
            metrics[f"wa_reconn_int_{suffix}"] = 1

    # WA Connected = received inbound WA (user replied)
    if has_wa_inbound:
        metrics[f"wa_conn_{suffix}"] = 1
        metrics[f"wa_conn_inb_{suffix}"] = 1  # Always 1 if connected
        if has_cv:
            metrics[f"wa_conn_cv_{suffix}"] = 1
        if has_match:
            metrics[f"wa_conn_mat_{suffix}"] = 1
        if has_interest:
            metrics[f"wa_conn_int_{suffix}"] = 1

    # Initialize all TAT bucket metrics to 0
    for s in ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "no_call"]:
        metrics[f"tat_{s}"] = 0
        metrics[f"tat_{s}_conn"] = 0
        metrics[f"tat_{s}_4min"] = 0
        metrics[f"tat_{s}_80plus"] = 0
        metrics[f"tat_{s}_cv"] = 0
        metrics[f"tat_{s}_match"] = 0
        metrics[f"tat_{s}_interest"] = 0

    # Initialize TAT milestone metrics to 0
    for s in ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "not_reached"]:
        metrics[f"tat_to_cv_{s}"] = 0
        metrics[f"tat_to_match_{s}"] = 0
        metrics[f"tat_to_interest_{s}"] = 0

    # Set values for the user's TAT bucket (creation to first call)
    metrics[f"tat_{tat_suffix}"] = 1
    if duration > 0:
        metrics[f"tat_{tat_suffix}_conn"] = 1
    if duration >= 240:
        metrics[f"tat_{tat_suffix}_4min"] = 1
    if is_profile_80:
        metrics[f"tat_{tat_suffix}_80plus"] = 1
    if has_cv:
        metrics[f"tat_{tat_suffix}_cv"] = 1
    if has_match:
        metrics[f"tat_{tat_suffix}_match"] = 1
    if has_interest:
        metrics[f"tat_{tat_suffix}_interest"] = 1

    # Set values for TAT milestone buckets (first call to milestone)
    metrics[f"tat_to_cv_{tat_to_cv_suffix}"] = 1
    metrics[f"tat_to_match_{tat_to_match_suffix}"] = 1
    metrics[f"tat_to_interest_{tat_to_interest_suffix}"] = 1

    return metrics


def add_metrics(target: Dict, metrics: Dict):
    for key, value in metrics.items():
        target[key] += value


def generate_summary_data_with_cohorts(start_date: str, end_date: str, filters: Dict[str, List[str]] = None) -> Dict[str, Any]:
    """Generate summary with daily/weekly cohorts and pod/recruiter breakdowns."""
    # Include filters in cache key
    filter_key = ""
    if filters:
        filter_key = "_" + "_".join(f"{k}:{','.join(sorted(v))}" for k, v in sorted(filters.items()) if v)
    cache_key = f"cohort_{start_date}_{end_date}{filter_key}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    start_dt = f"{start_date}T00:00:00"
    end_dt = f"{end_date}T23:59:59"

    users_data = fetch_users_paginated(start_dt, end_dt, filters)

    user_ids: Set[str] = set()
    phone_numbers: Set[str] = set()
    for user in users_data:
        if user.get("id"):
            user_ids.add(user["id"])
        if user.get("phone_number"):
            phone_numbers.add(user["phone_number"])

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=3) as executor:
        fut_calls = executor.submit(fetch_call_stats_for_users, user_ids, phone_numbers)
        fut_wa_combined = executor.submit(fetch_wa_combined, user_ids)
        fut_matched = executor.submit(fetch_matched_users, user_ids)
        user_call_stats = fut_calls.result()
        inbound_users, wa_stats = fut_wa_combined.result()
        matched_users = fut_matched.result()
    logger.info(f"Parallel fetch for {len(user_ids)} users took {time.time()-t0:.1f}s")
    gc.collect()

    # Initialize all aggregation structures
    overall_stats = init_stats()
    recruiter_stats: Dict[str, Dict] = defaultdict(init_stats)
    pod_stats: Dict[str, Dict] = defaultdict(init_stats)

    # Daily breakdowns
    daily_stats: Dict[str, Dict] = defaultdict(init_stats)
    daily_recruiter: Dict[str, Dict[str, Dict]] = defaultdict(lambda: defaultdict(init_stats))
    daily_pod: Dict[str, Dict[str, Dict]] = defaultdict(lambda: defaultdict(init_stats))

    # Weekly breakdowns
    weekly_stats: Dict[str, Dict] = defaultdict(init_stats)
    weekly_recruiter: Dict[str, Dict[str, Dict]] = defaultdict(lambda: defaultdict(init_stats))
    weekly_pod: Dict[str, Dict[str, Dict]] = defaultdict(lambda: defaultdict(init_stats))

    # Hourly breakdowns (by first call hour)
    hourly_stats: Dict[int, Dict] = defaultdict(init_stats)
    hourly_daily: Dict[str, Dict[int, Dict]] = defaultdict(lambda: defaultdict(init_stats))

    # Hourly breakdowns by different timestamps
    hourly_daily_connected: Dict[str, Dict[int, Dict]] = defaultdict(lambda: defaultdict(init_stats))
    hourly_daily_cv: Dict[str, Dict[int, Dict]] = defaultdict(lambda: defaultdict(init_stats))
    hourly_daily_match: Dict[str, Dict[int, Dict]] = defaultdict(lambda: defaultdict(init_stats))
    hourly_daily_interest: Dict[str, Dict[int, Dict]] = defaultdict(lambda: defaultdict(init_stats))

    # Process each user
    for user in users_data:
        rec_key = normalize_email(user.get("recruiter_email")) or "(Not Assigned)"
        pod_key = normalize_email(user.get("team_manager_email")) or "(Not Assigned)"
        day_key = parse_date(user.get("created_at"))
        week_key = get_week_key(user.get("created_at"))

        metrics = calculate_user_metrics(user, user_call_stats, inbound_users, matched_users, wa_stats)

        # Get first call hour for this user
        uid = user.get("id")
        first_call_hour = user_call_stats.get(uid, {}).get("first_call_hour")

        # Overall
        add_metrics(overall_stats, metrics)
        add_metrics(recruiter_stats[rec_key], metrics)
        add_metrics(pod_stats[pod_key], metrics)

        # Daily
        add_metrics(daily_stats[day_key], metrics)
        add_metrics(daily_recruiter[day_key][rec_key], metrics)
        add_metrics(daily_pod[day_key][pod_key], metrics)

        # Weekly
        add_metrics(weekly_stats[week_key], metrics)
        add_metrics(weekly_recruiter[week_key][rec_key], metrics)
        add_metrics(weekly_pod[week_key][pod_key], metrics)

        # Hourly (only if we have call time)
        if first_call_hour is not None:
            add_metrics(hourly_stats[first_call_hour], metrics)
            add_metrics(hourly_daily[day_key][first_call_hour], metrics)

            # Also track for connected users (only if call was connected)
            cs = user_call_stats.get(uid, {})
            if cs.get("duration", 0) > 0:
                add_metrics(hourly_daily_connected[day_key][first_call_hour], metrics)

        # Hourly by CV generated timestamp (only if CV content exists)
        has_cv_content = bool(user.get("linkedin_cv_text") or user.get("file_cv_text"))
        cv_hour = get_timestamp_hour(user.get("cv_generated_at"))
        if cv_hour is not None and has_cv_content:
            cv_day = parse_date(user.get("cv_generated_at"))
            add_metrics(hourly_daily_cv[cv_day][cv_hour], metrics)

        # Hourly by matching started timestamp
        match_hour = get_timestamp_hour(user.get("matching_started_at"))
        if match_hour is not None:
            match_day = parse_date(user.get("matching_started_at"))
            add_metrics(hourly_daily_match[match_day][match_hour], metrics)

        # Hourly by interest shown timestamp
        interest_hour = get_timestamp_hour(user.get("last_recruiter_email_sent_at"))
        if interest_hour is not None:
            interest_day = parse_date(user.get("last_recruiter_email_sent_at"))
            add_metrics(hourly_daily_interest[interest_day][interest_hour], metrics)

    # Convert to list formats
    recruiter_list = [{"name": k, **v} for k, v in sorted(recruiter_stats.items(), key=lambda x: -x[1]["users"])]
    pod_list = [{"name": k, **v} for k, v in sorted(pod_stats.items(), key=lambda x: -x[1]["users"])]

    # Daily list
    daily_list = [{"date": k, **v} for k, v in sorted(daily_stats.items(), reverse=True)]

    # Weekly list
    weekly_list = [{"week": k, **v} for k, v in sorted(weekly_stats.items(), reverse=True)]

    # Daily by recruiter (flattened)
    daily_recruiter_list = []
    for day, recruiters in daily_recruiter.items():
        for rec, stats in recruiters.items():
            daily_recruiter_list.append({"date": day, "recruiter": rec, **stats})
    daily_recruiter_list.sort(key=lambda x: (x["date"], -x["users"]), reverse=True)

    # Daily by pod (flattened)
    daily_pod_list = []
    for day, pods in daily_pod.items():
        for pod, stats in pods.items():
            daily_pod_list.append({"date": day, "pod": pod, **stats})
    daily_pod_list.sort(key=lambda x: (x["date"], -x["users"]), reverse=True)

    # Weekly by recruiter
    weekly_recruiter_list = []
    for week, recruiters in weekly_recruiter.items():
        for rec, stats in recruiters.items():
            weekly_recruiter_list.append({"week": week, "recruiter": rec, **stats})
    weekly_recruiter_list.sort(key=lambda x: (x["week"], -x["users"]), reverse=True)

    # Weekly by pod
    weekly_pod_list = []
    for week, pods in weekly_pod.items():
        for pod, stats in pods.items():
            weekly_pod_list.append({"week": week, "pod": pod, **stats})
    weekly_pod_list.sort(key=lambda x: (x["week"], -x["users"]), reverse=True)

    # Hourly breakdown (sorted by hour)
    hourly_list = [{"hour": h, **stats} for h, stats in sorted(hourly_stats.items())]

    # Hourly by day (flattened)
    hourly_daily_list = []
    for day, hours in hourly_daily.items():
        for hour, stats in hours.items():
            hourly_daily_list.append({"date": day, "hour": hour, **stats})
    hourly_daily_list.sort(key=lambda x: (x["date"], x["hour"]), reverse=True)

    # Hourly by different timestamps
    def convert_hourly_daily(data):
        result = []
        for day, hours in data.items():
            for hour, stats in hours.items():
                result.append({"date": day, "hour": hour, **stats})
        result.sort(key=lambda x: (x["date"], x["hour"]), reverse=True)
        return result

    hourly_daily_connected_list = convert_hourly_daily(hourly_daily_connected)
    hourly_daily_cv_list = convert_hourly_daily(hourly_daily_cv)
    hourly_daily_match_list = convert_hourly_daily(hourly_daily_match)
    hourly_daily_interest_list = convert_hourly_daily(hourly_daily_interest)

    # TAT breakdown (sorted by bucket order)
    tat_order = ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "no_call"]
    tat_labels = {"lt_1hr": "< 1 hour", "1_3hr": "1-3 hours", "3_6hr": "3-6 hours",
                  "6_12hr": "6-12 hours", "12_24hr": "12-24 hours", "gt_24hr": "> 24 hours", "no_call": "No Call"}
    tat_list = []
    for suffix in tat_order:
        tat_list.append({
            "bucket": suffix,
            "label": tat_labels[suffix],
            "users": overall_stats.get(f"tat_{suffix}", 0),
            "connected": overall_stats.get(f"tat_{suffix}_conn", 0),
            "gte_4min": overall_stats.get(f"tat_{suffix}_4min", 0),
            "profile_80plus": overall_stats.get(f"tat_{suffix}_80plus", 0),
            "has_cv": overall_stats.get(f"tat_{suffix}_cv", 0),
            "matched": overall_stats.get(f"tat_{suffix}_match", 0),
            "interested": overall_stats.get(f"tat_{suffix}_interest", 0),
        })

    # TAT Milestone data (time from first call to each milestone)
    tat_milestone_order = ["lt_1hr", "1_3hr", "3_6hr", "6_12hr", "12_24hr", "gt_24hr", "not_reached"]
    tat_milestone_labels = {"lt_1hr": "< 1 hour", "1_3hr": "1-3 hours", "3_6hr": "3-6 hours",
                           "6_12hr": "6-12 hours", "12_24hr": "12-24 hours", "gt_24hr": "> 24 hours", "not_reached": "Not Reached"}
    tat_milestones = {
        "to_cv": [],
        "to_match": [],
        "to_interest": []
    }
    for suffix in tat_milestone_order:
        tat_milestones["to_cv"].append({
            "bucket": suffix,
            "label": tat_milestone_labels[suffix],
            "count": overall_stats.get(f"tat_to_cv_{suffix}", 0)
        })
        tat_milestones["to_match"].append({
            "bucket": suffix,
            "label": tat_milestone_labels[suffix],
            "count": overall_stats.get(f"tat_to_match_{suffix}", 0)
        })
        tat_milestones["to_interest"].append({
            "bucket": suffix,
            "label": tat_milestone_labels[suffix],
            "count": overall_stats.get(f"tat_to_interest_{suffix}", 0)
        })

    del users_data, user_call_stats, inbound_users, matched_users, wa_stats
    gc.collect()

    result = {
        "date_range": {"start": start_date, "end": end_date},
        "overall": overall_stats,
        "recruiters": recruiter_list,
        "pods": pod_list,
        "daily": daily_list,
        "weekly": weekly_list,
        "daily_by_recruiter": daily_recruiter_list,
        "daily_by_pod": daily_pod_list,
        "weekly_by_recruiter": weekly_recruiter_list,
        "weekly_by_pod": weekly_pod_list,
        "hourly": hourly_list,
        "hourly_by_day": hourly_daily_list,
        "hourly_by_day_connected": hourly_daily_connected_list,
        "hourly_by_day_cv": hourly_daily_cv_list,
        "hourly_by_day_match": hourly_daily_match_list,
        "hourly_by_day_interest": hourly_daily_interest_list,
        "tat": tat_list,
        "tat_milestones": tat_milestones,
    }

    set_cache(cache_key, result)
    return result


@router.get("/summary/filters")
def get_filter_options(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    team_manager_email: str = Query(None, description="Comma-separated list of team manager emails"),
    recruiter_email: str = Query(None, description="Comma-separated list of recruiter emails"),
    data_team_tag: str = Query(None, description="Comma-separated list of data team tags")
):
    """Get unique values for filter fields. Each filter shows options based on OTHER filters only."""
    # Parse current filter selections
    selected_pods = [e.strip() for e in team_manager_email.split(",") if e.strip()] if team_manager_email else []
    selected_recs = [e.strip() for e in recruiter_email.split(",") if e.strip()] if recruiter_email else []
    selected_tags = [t.strip() for t in data_team_tag.split(",") if t.strip()] if data_team_tag else []

    # Create cache key including filters
    filter_key = f"{','.join(sorted(selected_pods))}_{','.join(sorted(selected_recs))}_{','.join(sorted(selected_tags))}"
    cache_key = f"filters_{start_date}_{end_date}_{filter_key}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    supabase = get_supabase()
    start_dt = f"{start_date}T00:00:00"
    end_dt = f"{end_date}T23:59:59"

    # Helper to fetch distinct values with specific filters
    def fetch_options(field: str, filter_pods: list = None, filter_recs: list = None, filter_tags: list = None) -> set:
        values = set()
        offset = 0
        while True:
            query = supabase.table("users").select(field).gte("created_at", start_dt).lte("created_at", end_dt)
            if filter_pods:
                query = query.in_("team_manager_email", filter_pods)
            if filter_recs:
                query = query.in_("recruiter_email", filter_recs)
            if filter_tags:
                query = query.in_("data_team_tag", filter_tags)
            response = query.order("id").range(offset, offset + BATCH_SIZE - 1).execute()
            if not response.data:
                break
            for row in response.data:
                if row.get(field):
                    values.add(row[field])
            if len(response.data) < BATCH_SIZE:
                break
            offset += BATCH_SIZE
        return values

    # Pod options: Always show ALL pods (no filter on itself)
    team_managers = fetch_options("team_manager_email")

    # Recruiter options: Filter by selected pods only (not by itself or tags)
    recruiters = fetch_options("recruiter_email", filter_pods=selected_pods if selected_pods else None)

    # Data tag options: Filter by selected pods and recruiters (not by itself)
    data_tags = fetch_options("data_team_tag",
                              filter_pods=selected_pods if selected_pods else None,
                              filter_recs=selected_recs if selected_recs else None)

    result = {
        "team_manager_email": sorted(list(team_managers)),
        "recruiter_email": sorted(list(recruiters)),
        "data_team_tag": sorted(list(data_tags))
    }
    set_cache(cache_key, result)
    return result


@router.get("/summary")
def get_summary(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    team_manager_email: str = Query(None, description="Comma-separated list of team manager emails"),
    recruiter_email: str = Query(None, description="Comma-separated list of recruiter emails"),
    data_team_tag: str = Query(None, description="Comma-separated list of data team tags")
):
    """Get recruiter and pod-wise summary with cohort data."""
    # Parse filters
    filters = {}
    if team_manager_email:
        filters["team_manager_email"] = [e.strip() for e in team_manager_email.split(",") if e.strip()]
    if recruiter_email:
        filters["recruiter_email"] = [e.strip() for e in recruiter_email.split(",") if e.strip()]
    if data_team_tag:
        filters["data_team_tag"] = [t.strip() for t in data_team_tag.split(",") if t.strip()]

    result = generate_summary_data_with_cohorts(start_date, end_date, filters if filters else None)
    gc.collect()
    return result


@router.get("/summary/compare")
def get_summary_comparison(
    period1_start: str = Query(...),
    period1_end: str = Query(...),
    period2_start: str = Query(...),
    period2_end: str = Query(...),
    team_manager_email: str = Query(None, description="Comma-separated list of team manager emails"),
    recruiter_email: str = Query(None, description="Comma-separated list of recruiter emails"),
    data_team_tag: str = Query(None, description="Comma-separated list of data team tags")
):
    """Compare two date periods with full cohort data."""
    # Parse filters
    filters = {}
    if team_manager_email:
        filters["team_manager_email"] = [e.strip() for e in team_manager_email.split(",") if e.strip()]
    if recruiter_email:
        filters["recruiter_email"] = [e.strip() for e in recruiter_email.split(",") if e.strip()]
    if data_team_tag:
        filters["data_team_tag"] = [t.strip() for t in data_team_tag.split(",") if t.strip()]

    period1 = generate_summary_data_with_cohorts(period1_start, period1_end, filters if filters else None)
    period2 = generate_summary_data_with_cohorts(period2_start, period2_end, filters if filters else None)
    gc.collect()

    return {
        "period1": {"label": f"{period1_start} to {period1_end}", "data": period1},
        "period2": {"label": f"{period2_start} to {period2_end}", "data": period2}
    }
