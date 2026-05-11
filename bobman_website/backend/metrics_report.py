"""
Monthly Metrics Report by Data Tag
Groups: Core+Naukri, awign_core, staffing
Date range: 21st Nov 2025 onwards, grouped by user created_at month
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from database import get_supabase
from collections import defaultdict
from datetime import datetime

supabase = get_supabase()

START_DATE = "2025-11-21T00:00:00"
BATCH = 1000

SUBMITTED_STATUSES = [
    'Selected by Client (Other Vendor)', 'Client Interview Rejected', 'Client Interviewed',
    'Submitted to client', 'Client Sharable but Role on Hold', 'Selected by Client',
    'Role Closed No Feedback', 'Role Paused No Feedback',
    'Submitted to Hiring Manager', 'Hiring Manager Select', 'Hiring Manager Reject',
    'Round 1 Scheduled', 'Round 1 Reject', 'Round 2 Scheduled', 'Round 2 Reject',
    'Round 3 Scheduled', 'Round 3 Reject', 'Final Select',
]

PROFILE_CUTOFF = "2026-02-10T23:59:59"

def profile_80(pct, created_at):
    if pct is None: return False
    return pct > 80 if (created_at or "") <= PROFILE_CUTOFF else pct >= 80

def tag_group(tag):
    t = (tag or "").lower().strip()
    if t in ("core", "naukri"): return "Core + Naukri"
    if t == "awign_core": return "awign_core"
    if t == "staffing": return "staffing"
    return None  # skip others

def month_key(dt_str):
    if not dt_str: return None
    return dt_str[:7]  # "YYYY-MM"

def fetch_all(table, select, filters=None):
    """Fetch all rows from a table with pagination."""
    all_rows = []
    offset = 0
    while True:
        q = supabase.table(table).select(select)
        if filters:
            for method, args in filters:
                q = getattr(q, method)(*args)
        q = q.range(offset, offset + BATCH - 1)
        resp = q.execute()
        rows = resp.data or []
        all_rows.extend(rows)
        if len(rows) < BATCH:
            break
        offset += BATCH
    return all_rows

print("Fetching users...")
users = fetch_all("users",
    "id, created_at, data_team_tag, call_cv_text, linkedin_cv_text, file_cv_text, "
    "profile_completion_per, jobs_interested_count, best_match_score, "
    "recruiter_feedback_status",
    filters=[("gte", ("created_at", START_DATE))]
)
print(f"  Got {len(users)} users")

# Build user lookup
user_map = {}  # id -> user
user_ids = []
for u in users:
    grp = tag_group(u.get("data_team_tag"))
    if grp is None:
        continue
    u["_group"] = grp
    u["_month"] = month_key(u.get("created_at"))
    user_map[u["id"]] = u
    user_ids.append(u["id"])

print(f"  Filtered to {len(user_ids)} users in target groups")

# Fetch conversations for call data
print("Fetching conversations...")
all_convos = []
for i in range(0, len(user_ids), 500):
    batch = user_ids[i:i+500]
    rows = fetch_all("conversations",
        "user_id, call_duration_secs",
        filters=[("in_", ("user_id", batch))]
    )
    all_convos.extend(rows)
print(f"  Got {len(all_convos)} conversation records")

# Aggregate call data per user
user_call_data = defaultdict(lambda: {"total_calls": 0, "total_duration": 0, "connected": False})
for c in all_convos:
    uid = c.get("user_id")
    if uid not in user_map:
        continue
    dur = c.get("call_duration_secs") or 0
    user_call_data[uid]["total_calls"] += 1
    user_call_data[uid]["total_duration"] += dur
    if dur > 0:
        user_call_data[uid]["connected"] = True

# Fetch candidate_jd_matches
print("Fetching candidate_jd_matches...")
match_user_ids = set()
for i in range(0, len(user_ids), 500):
    batch = user_ids[i:i+500]
    rows = fetch_all("candidate_jd_matches",
        "candidate_id",
        filters=[("in_", ("candidate_id", batch))]
    )
    for r in rows:
        match_user_ids.add(r["candidate_id"])
print(f"  Got {len(match_user_ids)} users with matches")

# Fetch WhatsApp conversations
print("Fetching whatsapp_conversations...")
all_wa = []
for i in range(0, len(user_ids), 500):
    batch = user_ids[i:i+500]
    rows = fetch_all("whatsapp_conversations",
        "user_id, direction, status",
        filters=[("in_", ("user_id", batch))]
    )
    all_wa.extend(rows)
print(f"  Got {len(all_wa)} WA messages")

# Aggregate WA data per user
WA_FAIL = {"failed", "error", "undelivered"}
user_wa_data = defaultdict(lambda: {"total": 0, "outbound": 0, "inbound": 0})
for m in all_wa:
    uid = m.get("user_id")
    if uid not in user_map:
        continue
    status = (m.get("status") or "").lower()
    if status in WA_FAIL:
        continue
    d = (m.get("direction") or "").lower()
    user_wa_data[uid]["total"] += 1
    if d == "outbound":
        user_wa_data[uid]["outbound"] += 1
    elif d == "inbound":
        user_wa_data[uid]["inbound"] += 1

# Now compute metrics per (group, month)
print("\nComputing metrics...")

# Structure: metrics[group][month] = {...}
metrics = defaultdict(lambda: defaultdict(lambda: {
    "users": 0,
    "call_attempted": 0,
    "call_connected": 0,
    "call_4min": 0,
    "profile_calling": 0,
    "profile_cv_linkedin": 0,
    "profile_80": 0,
    "matching_found": 0,
    "no_match_80": 0,
    "match_no_interest": 0,
    "interested": 0,
    "qualified": 0,
    "submitted": 0,
    "total_call_duration_secs": 0,
    "wa_total": 0,
    "wa_outbound": 0,
    "wa_inbound": 0,
    "wa_engaged_users": 0,
    # for averages
    "_connected_users_duration": 0,
    "_connected_user_count": 0,
    "_engaged_user_wa_total": 0,
    "_engaged_user_count": 0,
}))

for uid, u in user_map.items():
    grp = u["_group"]
    mo = u["_month"]
    if not mo:
        continue
    # Precompute flags once per user
    cd = user_call_data.get(uid)
    is_80 = profile_80(u.get("profile_completion_per"), u.get("created_at"))
    has_match = uid in match_user_ids
    is_interested = (u.get("jobs_interested_count") or 0) > 0
    is_qualified = (is_80 and not has_match and not is_interested) or (has_match and not is_interested) or is_interested
    wa = user_wa_data.get(uid)

    # Update both the group bucket and the Overall bucket
    for target in [grp, "Overall"]:
        m = metrics[target][mo]
        m["users"] += 1

        if cd:
            m["call_attempted"] += cd["total_calls"]
            if cd["connected"]:
                m["call_connected"] += 1
                m["_connected_user_count"] += 1
                m["_connected_users_duration"] += cd["total_duration"]
            if cd["total_duration"] >= 240:
                m["call_4min"] += 1
            m["total_call_duration_secs"] += cd["total_duration"]

        if u.get("call_cv_text"):
            m["profile_calling"] += 1
        if u.get("linkedin_cv_text") or u.get("file_cv_text"):
            m["profile_cv_linkedin"] += 1

        if is_80:
            m["profile_80"] += 1
        if has_match:
            m["matching_found"] += 1
        if is_80 and not has_match and not is_interested:
            m["no_match_80"] += 1
        if has_match and not is_interested:
            m["match_no_interest"] += 1
        if is_interested:
            m["interested"] += 1
        if is_qualified:
            m["qualified"] += 1

        if (u.get("recruiter_feedback_status") or "") in SUBMITTED_STATUSES:
            m["submitted"] += 1

        if wa:
            m["wa_total"] += wa["total"]
            m["wa_outbound"] += wa["outbound"]
            m["wa_inbound"] += wa["inbound"]
            if wa["inbound"] >= 1:
                m["wa_engaged_users"] += 1
                m["_engaged_user_count"] += 1
                m["_engaged_user_wa_total"] += wa["total"]

# Print results
def fmt_duration(secs):
    h = secs // 3600
    mi = (secs % 3600) // 60
    s = secs % 60
    if h > 0:
        return f"{h}h {mi}m"
    return f"{mi}m {s}s"

def safe_div(a, b, decimals=1):
    if b == 0: return "0"
    return f"{a/b:.{decimals}f}"

groups = ["Core + Naukri", "awign_core", "staffing", "Overall"]
all_months = sorted(set(mo for grp in metrics.values() for mo in grp.keys()))

for grp in groups:
    print(f"\n{'='*120}")
    print(f"  DATA TAG: {grp}")
    print(f"{'='*120}")

    if not all_months:
        print("  No data")
        continue

    # Header
    col_w = 14
    header = f"{'Metric':<40}"
    for mo in all_months:
        header += f"{mo:>{col_w}}"
    # Add total column
    header += f"{'TOTAL':>{col_w}}"
    print(header)
    print("-" * len(header))

    def print_row(label, getter, is_fmt=False):
        row = f"{label:<40}"
        total = 0
        for mo in all_months:
            val = getter(metrics[grp][mo])
            if isinstance(val, float):
                row += f"{val:>{col_w}.1f}"
                total += val
            elif isinstance(val, str):
                row += f"{val:>{col_w}}"
                total = None  # can't sum strings
            else:
                row += f"{val:>{col_w},}"
                total += val
        # Total column
        if total is not None:
            if isinstance(total, float):
                row += f"{total:>{col_w}.1f}"
            else:
                row += f"{total:>{col_w},}"
        else:
            row += f"{'-':>{col_w}}"
        print(row)

    def print_row_str(label, getter):
        row = f"{label:<40}"
        for mo in all_months:
            val = getter(metrics[grp][mo])
            row += f"{val:>{col_w}}"
        row += f"{'-':>{col_w}}"
        print(row)

    # Count metrics
    print_row("No of Users", lambda m: m["users"])
    print_row("Call Attempted", lambda m: m["call_attempted"])
    print_row("Call Connected (Users)", lambda m: m["call_connected"])
    print_row("Call >= 4 mins", lambda m: m["call_4min"])
    print_row("Profile Done (Calling)", lambda m: m["profile_calling"])
    print_row("Profile Done (CV/LinkedIn)", lambda m: m["profile_cv_linkedin"])
    print_row("Profile >= 80%", lambda m: m["profile_80"])
    print_row("Matching Job Found", lambda m: m["matching_found"])
    print_row("80+ No Match", lambda m: m["no_match_80"])
    print_row("Match No Interest", lambda m: m["match_no_interest"])
    print_row("Interested", lambda m: m["interested"])
    print_row("Qualified", lambda m: m["qualified"])
    print_row("Total WA Messages", lambda m: m["wa_total"])
    print_row("WA Outbound", lambda m: m["wa_outbound"])
    print_row("WA Inbound", lambda m: m["wa_inbound"])
    print_row("WA Engaged (>=1 Inb)", lambda m: m["wa_engaged_users"])
    print_row("Submitted to Client", lambda m: m["submitted"])
    print()

    # Duration metrics
    print_row("Total Call Duration (Mins)", lambda m: round(m["total_call_duration_secs"] / 60, 1))
    print_row_str("Total Call Duration", lambda m: fmt_duration(m["total_call_duration_secs"]))
    print_row_str("Avg Duration/Connected User", lambda m: fmt_duration(int(m["_connected_users_duration"] / m["_connected_user_count"])) if m["_connected_user_count"] > 0 else "0")
    print_row_str("Avg Duration/User", lambda m: fmt_duration(int(m["total_call_duration_secs"] / m["users"])) if m["users"] > 0 else "0")
    print_row_str("Avg WA Msg/Engaged User", lambda m: safe_div(m["_engaged_user_wa_total"], m["_engaged_user_count"]))
    print_row_str("Avg WA Msg/User", lambda m: safe_div(m["wa_total"], m["users"]))
    print_row_str("Avg WA Out/User", lambda m: safe_div(m["wa_outbound"], m["users"]))
    print_row_str("Avg WA In/User", lambda m: safe_div(m["wa_inbound"], m["users"]))

print(f"\n\nReport generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
