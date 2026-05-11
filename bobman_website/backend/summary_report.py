#!/usr/bin/env python3
"""
Summary Report Generator
Generates recruiter-wise and pod-wise summary for specified date ranges.
"""

import os
import sys
import re
from collections import defaultdict
from typing import Dict, Any, Set, List
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 1000


def normalize_email(email: str) -> str:
    """Normalize email: lowercase, strip spaces, treat gmail.com as awign.com"""
    if not email:
        return None
    # Lowercase and strip spaces
    normalized = email.lower().strip()
    # Replace gmail.com with awign.com for consistency
    normalized = re.sub(r'@gmail\.com$', '@awign.com', normalized)
    return normalized


def fetch_all_records(table_name: str, date_field: str, start_dt: str, end_dt: str) -> List[dict]:
    """Fetch all records with batching."""
    all_data = []
    offset = 0

    while True:
        query = supabase.table(table_name).select("*")
        if date_field and start_dt and end_dt:
            query = query.gte(date_field, start_dt).lte(date_field, end_dt)

        response = query.range(offset, offset + BATCH_SIZE - 1).execute()
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
    user_batch_size = 100

    for i in range(0, len(user_ids_list), user_batch_size):
        batch_user_ids = user_ids_list[i:i + user_batch_size]
        offset = 0

        while True:
            response = supabase.table(table_name).select("*").in_(user_id_field, batch_user_ids).range(offset, offset + BATCH_SIZE - 1).execute()
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
    phone_batch_size = 100

    for i in range(0, len(phone_list), phone_batch_size):
        batch_phones = phone_list[i:i + phone_batch_size]
        offset = 0

        while True:
            response = supabase.table(table_name).select("*").in_(phone_field, batch_phones).range(offset, offset + BATCH_SIZE - 1).execute()
            batch = response.data

            if not batch:
                break

            all_data.extend(batch)

            if len(batch) < BATCH_SIZE:
                break

            offset += BATCH_SIZE

    return all_data


def generate_summary(start_date: str, end_date: str, label: str):
    """Generate summary for a date range."""
    start_dt = f"{start_date}T00:00:00"
    end_dt = f"{end_date}T23:59:59"

    print(f"\n{'='*80}")
    print(f"SUMMARY FOR: {label}")
    print(f"Date Range: {start_date} to {end_date}")
    print(f"{'='*80}")

    # Fetch users
    print("Fetching users...")
    users_data = fetch_all_records("users", "created_at", start_dt, end_dt)
    print(f"Found {len(users_data)} users")

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

    # Fetch calls
    print("Fetching calls...")
    calls_by_user = fetch_records_by_user_ids("conversations", "user_id", user_ids)
    calls_by_phone = fetch_records_by_phone_numbers("conversations", "external_number", phone_numbers | phone_numbers_clean)

    calls_ids_seen = set()
    calls_data = []
    for call in calls_by_user + calls_by_phone:
        if call.get("id") not in calls_ids_seen:
            calls_ids_seen.add(call.get("id"))
            calls_data.append(call)
    print(f"Found {len(calls_data)} calls")

    # Fetch WhatsApp messages
    print("Fetching WhatsApp messages...")
    wa_by_user = fetch_records_by_user_ids("whatsapp_conversations", "user_id", user_ids)
    wa_by_phone = fetch_records_by_phone_numbers("whatsapp_conversations", "phone_number", phone_numbers | phone_numbers_clean)

    wa_ids_seen = set()
    whatsapp_data = []
    for msg in wa_by_user + wa_by_phone:
        if msg.get("id") not in wa_ids_seen:
            wa_ids_seen.add(msg.get("id"))
            whatsapp_data.append(msg)
    print(f"Found {len(whatsapp_data)} WhatsApp messages")

    # Fetch matches
    print("Fetching matches...")
    matches_data = fetch_records_by_user_ids("candidate_jd_matches", "candidate_id", user_ids)
    print(f"Found {len(matches_data)} matches")

    # Build user-level stats
    user_call_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"total": 0, "duration": 0, "successful": 0})
    for call in calls_data:
        uid = call.get("user_id")
        if uid:
            user_call_stats[uid]["total"] += 1
            user_call_stats[uid]["duration"] += call.get("call_duration_secs") or 0
            if call.get("status") == "done":
                user_call_stats[uid]["successful"] += 1

    # Build user WhatsApp stats (track inbound messages)
    user_wa_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"has_inbound": False})
    for msg in whatsapp_data:
        uid = msg.get("user_id")
        if uid:
            if msg.get("direction") == "inbound":
                user_wa_stats[uid]["has_inbound"] = True

    user_match_counts: Dict[str, int] = defaultdict(int)
    for match in matches_data:
        cid = match.get("candidate_id")
        if cid:
            user_match_counts[cid] += 1

    # Initialize stats structures
    def init_stats():
        return {
            "users": 0,
            "call_attempted": 0,
            "call_connected": 0,
            "call_connected_users": 0,
            "call_gt_4min": 0,
            "profiling_calling": 0,
            "profiling_linkedin_cv": 0,
            "profile_70plus": 0,
            "matching_job_found": 0,
            "interest_shown": 0,
            "users_with_inbound": 0,
        }

    # Overall stats
    overall_stats = init_stats()

    # Recruiter-wise stats
    recruiter_stats: Dict[str, Dict[str, Any]] = defaultdict(init_stats)

    # Pod-wise (Team Manager) stats
    pod_stats: Dict[str, Dict[str, Any]] = defaultdict(init_stats)

    # Process each user
    for user in users_data:
        uid = user.get("id")
        # Normalize email addresses
        rec_key = normalize_email(user.get("recruiter_email")) or "(Not Assigned)"
        pod_key = normalize_email(user.get("team_manager_email")) or "(Not Assigned)"

        cs = user_call_stats.get(uid, {"total": 0, "duration": 0, "successful": 0})
        ws = user_wa_stats.get(uid, {"has_inbound": False})

        # Calculate metrics for this user
        metrics = {
            "users": 1,
            "call_attempted": cs["total"],
            "call_connected": 1 if cs["duration"] > 0 else 0,
            "call_connected_users": 1 if cs["duration"] > 0 else 0,
            "call_gt_4min": 1 if cs["duration"] >= 240 else 0,
            "profiling_calling": 1 if user.get("call_cv_text") else 0,
            "profiling_linkedin_cv": 1 if (user.get("linkedin_cv_text") or user.get("file_cv_text")) else 0,
            "profile_70plus": 1 if (user.get("profile_completion_per") or 0) >= 70 else 0,
            "matching_job_found": 1 if user_match_counts.get(uid, 0) > 0 else 0,
            "interest_shown": 1 if (user.get("jobs_interested_count") or 0) > 0 else 0,
            "users_with_inbound": 1 if ws["has_inbound"] else 0,
        }

        # Update stats
        for key, value in metrics.items():
            overall_stats[key] += value
            recruiter_stats[rec_key][key] += value
            pod_stats[pod_key][key] += value

    # Print results
    def print_stats(name: str, stats: dict):
        print(f"\n{name}:")
        print(f"  No of Users:                    {stats['users']}")
        print(f"  Call Attempted:                 {stats['call_attempted']}")
        print(f"  Call Connected:                 {stats['call_connected']}")
        print(f"  Call Connected (users):         {stats['call_connected_users']}")
        print(f"  Call > 4mins:                   {stats['call_gt_4min']}")
        print(f"  Profiling Done (Calling):       {stats['profiling_calling']}")
        print(f"  Profiling Done (LinkedIn/CV):   {stats['profiling_linkedin_cv']}")
        print(f"  Profile Completion > 70%:       {stats['profile_70plus']}")
        print(f"  Matching Job Found:             {stats['matching_job_found']}")
        print(f"  Interest Shown:                 {stats['interest_shown']}")
        print(f"  Users with Inbound Message:     {stats['users_with_inbound']}")

    # Overall
    print_stats("OVERALL TOTALS", overall_stats)

    # Recruiter-wise
    print(f"\n{'-'*80}")
    print("RECRUITER-WISE BREAKDOWN")
    print(f"{'-'*80}")
    for rec_name in sorted(recruiter_stats.keys(), key=lambda x: -recruiter_stats[x]["users"]):
        print_stats(rec_name, recruiter_stats[rec_name])

    # Pod-wise
    print(f"\n{'-'*80}")
    print("POD-WISE (TEAM MANAGER) BREAKDOWN")
    print(f"{'-'*80}")
    for pod_name in sorted(pod_stats.keys(), key=lambda x: -pod_stats[x]["users"]):
        print_stats(pod_name, pod_stats[pod_name])

    return overall_stats, recruiter_stats, pod_stats


if __name__ == "__main__":
    # Date range 1: 27th Jan 2026 to 2nd Feb 2026
    generate_summary("2026-01-27", "2026-02-02", "27th Jan 2026 to 2nd Feb 2026")

    # Date range 2: 1st Jan 2026 to 26th Jan 2026 (before 27th Jan, greater than 1st Jan)
    generate_summary("2026-01-01", "2026-01-26", "1st Jan 2026 to 26th Jan 2026")
