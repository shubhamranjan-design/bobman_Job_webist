"""OpenRouter integration: AI role search + candidate pitch generation."""
import os
import json
import time
import logging
import httpx
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import supabase_query
from models import CandidatePitch

load_dotenv()
logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-haiku")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# In-memory cache for role search: query -> (timestamp, [role_codes])
_search_cache: dict[str, tuple[float, list[str]]] = {}
_SEARCH_TTL = 3600  # 1 hour


def _call_openrouter(prompt: str, system: str = "", max_tokens: int = 600) -> str:
    """Call OpenRouter chat completions. Returns the assistant message text."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://api.bobmanconnect.com/home",
        "X-Title": "Bobman SaaS",
    }
    body = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    with httpx.Client(timeout=30) as c:
        r = c.post(OPENROUTER_URL, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"].strip()


# ---- AI Role Search ----

def _fetch_active_roles() -> list[dict]:
    """Fetch all active US roles from jd_data."""
    def q(sb):
        return sb.table("jd_data").select(
            "id, role_code, role_name, brief_context, status"
        ).eq("data_team_tag", "us_data").execute()
    res = supabase_query(q)
    rows = res.data or []
    # Keep only active-ish statuses (be permissive — schema unclear)
    active_statuses = {"active", "live", "open", None, ""}
    filtered = [r for r in rows if (r.get("status") or "").lower() in active_statuses or r.get("status") is None]
    # Deduplicate by role_code (keep first)
    seen = set()
    out = []
    for r in filtered:
        rc = r.get("role_code")
        if not rc or rc in seen:
            continue
        seen.add(rc)
        out.append(r)
    return out


def match_roles_to_query(query: str) -> list[str]:
    """Map a free-text query to relevant role_codes via OpenRouter. Cached."""
    qkey = (query or "").strip().lower()
    if not qkey:
        return []
    # Cache check
    if qkey in _search_cache:
        ts, codes = _search_cache[qkey]
        if time.time() - ts < _SEARCH_TTL:
            return codes

    roles = _fetch_active_roles()
    if not roles:
        return []

    # Substring fallback (used if LLM fails)
    def substring_match() -> list[str]:
        tokens = [t for t in qkey.split() if len(t) > 2]
        scored = []
        for r in roles:
            text = ((r.get("role_name") or "") + " " + (r.get("brief_context") or "")).lower()
            score = sum(1 for t in tokens if t in text)
            if score > 0:
                scored.append((score, r["role_code"]))
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:5]]

    if not OPENROUTER_API_KEY:
        return substring_match()

    role_lines = "\n".join(
        f"- {r['role_code']}: {r.get('role_name') or ''} | Brief: {(r.get('brief_context') or '')[:200]}"
        for r in roles
    )
    prompt = f"""You are a recruitment role-matcher. Given a user search query and a list of available roles, return a JSON array of the most relevant role_codes ranked by relevance, max 5 results. If no role is even loosely relevant, return an empty array.

Query: "{query}"

Available roles:
{role_lines}

Respond with ONLY a JSON array of role_code strings, e.g. ["US09","US02"]. No prose, no markdown."""

    try:
        resp = _call_openrouter(prompt, max_tokens=200)
        # Strip code fences if present
        resp_clean = resp.strip()
        if resp_clean.startswith("```"):
            resp_clean = resp_clean.split("```")[1]
            if resp_clean.startswith("json"):
                resp_clean = resp_clean[4:]
        resp_clean = resp_clean.strip()
        codes = json.loads(resp_clean)
        if not isinstance(codes, list):
            raise ValueError("not a list")
        # Filter to only valid role_codes we actually have
        valid = {r["role_code"] for r in roles}
        codes = [c for c in codes if c in valid][:5]
        _search_cache[qkey] = (time.time(), codes)
        return codes
    except Exception as e:
        logger.warning(f"LLM search failed: {e} — using substring fallback")
        return substring_match()


# ---- Pitch Generation ----

def _fetch_pitch_inputs(candidate_user_id: str, role_code: str) -> dict:
    """Pull all inputs needed to generate a pitch."""
    out = {"user": None, "match": None, "best_call": None}

    def q_user(sb):
        return sb.table("users").select(
            "id, name, generated_cv_text, cumulative_summary, team_role_code, "
            "total_call_duration_secs, profile_completion_per, jobs_interested_count"
        ).eq("id", candidate_user_id).limit(1).execute()
    res = supabase_query(q_user)
    out["user"] = (res.data or [None])[0]

    # Top match for this candidate (prefer match for a JD whose role_code matches)
    def q_match(sb):
        return sb.table("top_matches_dashboard").select("*").eq(
            "candidate_id", candidate_user_id
        ).order("matching_score", desc=True).limit(10).execute()
    try:
        res = supabase_query(q_match)
        matches = res.data or []
        # Prefer a match for the same role_code, else top-scoring overall
        for m in matches:
            if (m.get("role_code") or "") == role_code:
                out["match"] = m
                break
        if not out["match"] and matches:
            out["match"] = matches[0]
    except Exception as e:
        logger.warning(f"top_matches_dashboard query failed: {e}")

    # Best successful conversation (longest)
    def q_call(sb):
        return sb.table("conversations").select(
            "id, elevenlabs_conversation_id, call_duration_secs, "
            "transcript_summary, outcome, sentiment, key_topics, call_successful"
        ).eq("user_id", candidate_user_id).eq("call_successful", "success").order(
            "call_duration_secs", desc=True
        ).limit(1).execute()
    try:
        res = supabase_query(q_call)
        out["best_call"] = (res.data or [None])[0]
    except Exception as e:
        logger.warning(f"conversations query failed: {e}")

    return out


def _compose_fallback_pitch(inputs: dict) -> str:
    user = inputs.get("user") or {}
    match = inputs.get("match") or {}
    call = inputs.get("best_call") or {}
    parts = []
    name = user.get("name") or "The candidate"
    parts.append(f"{name} is a strong potential fit.")
    score = match.get("matching_score")
    if score:
        parts.append(f"Match score: {score}/100.")
    ks = match.get("key_strengths")
    if ks:
        if isinstance(ks, list):
            parts.append("Key strengths: " + "; ".join(str(s) for s in ks[:3]) + ".")
        else:
            parts.append(f"Key strengths: {str(ks)[:300]}.")
    if match.get("match_reasoning"):
        parts.append(str(match["match_reasoning"])[:400])
    if call.get("transcript_summary"):
        parts.append("From recent call: " + str(call["transcript_summary"])[:400])
    return " ".join(parts)


def generate_pitch(db: Session, candidate_user_id: str, role_code: str) -> tuple[str, Optional[str]]:
    """
    Returns (pitch_text, source_match_jd_id). Caches in candidate_pitches table.
    """
    cached = db.query(CandidatePitch).filter(
        CandidatePitch.candidate_user_id == candidate_user_id,
        CandidatePitch.role_code == role_code,
    ).first()
    if cached:
        return cached.pitch_text, cached.source_match_jd_id

    inputs = _fetch_pitch_inputs(candidate_user_id, role_code)
    user = inputs.get("user") or {}
    match = inputs.get("match") or {}
    call = inputs.get("best_call") or {}
    source_jd_id = match.get("jd_id")

    if not OPENROUTER_API_KEY:
        return _compose_fallback_pitch(inputs), source_jd_id

    # Build prompt
    profile_blurb = ""
    cv = user.get("generated_cv_text")
    if isinstance(cv, dict):
        profile_blurb = json.dumps(cv)[:1500]
    elif isinstance(cv, str):
        profile_blurb = cv[:1500]
    summary = user.get("cumulative_summary")
    if isinstance(summary, dict):
        summary = json.dumps(summary)[:800]
    if isinstance(summary, str):
        summary = summary[:800]

    match_blurb = json.dumps({
        "matching_score": match.get("matching_score"),
        "match_reasoning": match.get("match_reasoning"),
        "key_strengths": match.get("key_strengths"),
        "potential_concerns": match.get("potential_concerns"),
        "role_name": match.get("role_name"),
    }, default=str)[:1500]

    call_blurb = ""
    if call:
        call_blurb = json.dumps({
            "summary": call.get("transcript_summary"),
            "outcome": call.get("outcome"),
            "sentiment": call.get("sentiment"),
            "key_topics": call.get("key_topics"),
            "duration_secs": call.get("call_duration_secs"),
        }, default=str)[:1500]

    prompt = f"""Write a concise 4–6 sentence company-facing pitch explaining why this candidate is a strong fit for the role "{role_code}". Be professional, factual, and confident. Highlight measurable strengths and relevant experience. Do NOT mention phone, email, or any contact details. Do not invent facts not present in the data.

Candidate name: {user.get("name") or "(name withheld)"}
Profile completion: {user.get("profile_completion_per")}%

Profile / CV:
{profile_blurb}

Cumulative summary:
{summary or "(none)"}

Match analysis:
{match_blurb}

Best call summary:
{call_blurb or "(no successful call recorded)"}

Pitch:"""

    try:
        pitch_text = _call_openrouter(prompt, max_tokens=400)
        # Cache it
        cp = CandidatePitch(
            candidate_user_id=candidate_user_id,
            role_code=role_code,
            pitch_text=pitch_text,
            source_match_jd_id=source_jd_id,
            generated_at=datetime.utcnow(),
        )
        db.add(cp)
        db.commit()
        return pitch_text, source_jd_id
    except Exception as e:
        logger.warning(f"OpenRouter pitch failed: {e} — using fallback")
        return _compose_fallback_pitch(inputs), source_jd_id
