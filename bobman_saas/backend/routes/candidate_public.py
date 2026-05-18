"""Public, anonymized candidate detail + audio proxy.

Routes:
- GET  /api/candidate/{masked_id}                    — full anonymized profile
- GET  /api/candidate/{masked_id}/audio/{conv_id}    — streams ElevenLabs audio
"""
import os
import json
import httpx
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db, supabase_query
from llm import generate_pitch
from utils.masking import mask_id, scrub_pii, scrub_pii_list, parse_masked_id, scrub_role_codes, mask_name, name_initials
from routes.catalog import find_uuid_by_masked, get_role_for_masked, get_all_roles_for_candidate
from routes.candidates import (
    _build_profile,
    _build_ai_summary,
    _safe_extract_strengths,
)

router = APIRouter()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


def _safe_json(val: Any):
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


@router.get("/candidate/{masked_id}")
def public_candidate_detail(masked_id: str, db: Session = Depends(get_db)):
    uuid = find_uuid_by_masked(masked_id)
    if not uuid:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Fetch full user row
    def q_user(sb):
        return sb.table("users").select(
            "id, name, profile_completion_per, jobs_interested_count, "
            "best_match_score, total_call_duration_secs, successful_calls, team_role_code, "
            "data_team_tag, current_stage, created_at, "
            "generated_cv_text, whatsapp_data_collected, cumulative_summary"
        ).eq("id", uuid).limit(1).execute()
    res = supabase_query(q_user)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Candidate not found")
    u = rows[0]
    if u.get("data_team_tag") != "us_data":
        raise HTTPException(status_code=403, detail="Candidate not in catalog")
    full_name = u.get("name")  # used only for PII scrub, NEVER returned

    # Determine which role this masked_id is scoped to
    role_meta = get_role_for_masked(masked_id) or {}
    target_role = role_meta.get("role_code")

    # Top match — prefer one for the target role, else best across any role
    def q_match(sb):
        return sb.table("top_matches_dashboard").select("*").eq(
            "candidate_id", uuid
        ).order("matching_score", desc=True).limit(20).execute()
    top_match = None
    try:
        rm = supabase_query(q_match)
        matches = rm.data or []
        if target_role:
            for m in matches:
                if (m.get("role_code") or "") == target_role:
                    top_match = m
                    break
        if top_match is None and matches:
            top_match = matches[0]
    except Exception:
        pass

    # Best successful call (longest > 30s)
    def q_call(sb):
        return sb.table("conversations").select(
            "id, elevenlabs_conversation_id, call_duration_secs, "
            "transcript_summary, outcome, sentiment, key_topics, call_successful, created_at"
        ).eq("user_id", uuid).eq("call_successful", "success").gt(
            "call_duration_secs", 30
        ).order("call_duration_secs", desc=True).limit(1).execute()
    best_call = None
    try:
        rc = supabase_query(q_call)
        rows = rc.data or []
        if rows:
            best_call = rows[0]
    except Exception:
        pass

    # Pitch (uses masked id + role NAME in prompt) — scoped to target role
    role_for_pitch = target_role or (top_match.get("role_code") if top_match else None) or u.get("team_role_code") or "the role"
    role_name_for_pitch = role_meta.get("role_name") or (top_match.get("role_name") if top_match else None)
    pitch_text, _ = generate_pitch(
        db, uuid, role_for_pitch,
        masked_id=masked_id, full_name=full_name, role_name=role_name_for_pitch,
    )
    pitch_text = scrub_pii(pitch_text, full_name)
    pitch_text = scrub_role_codes(pitch_text, role_name_for_pitch)

    profile = _build_profile(u)
    ai_summary = _build_ai_summary(u)

    # PII scrub on AI summary text fields
    if ai_summary:
        ai_summary["key_information"] = scrub_pii_list(ai_summary.get("key_information"), full_name)
        ai_summary["strengths"] = scrub_pii_list(ai_summary.get("strengths"), full_name)
        ai_summary["key_quotes"] = scrub_pii_list(ai_summary.get("key_quotes"), full_name)
        if ai_summary.get("qualification") and ai_summary["qualification"].get("reasoning"):
            ai_summary["qualification"]["reasoning"] = scrub_pii_list(
                ai_summary["qualification"]["reasoning"], full_name
            )

    # PII scrub on professional summary + match reasoning + call summary
    profile["professional_summary"] = scrub_pii(profile.get("professional_summary"), full_name)
    if profile.get("highlights"):
        profile["highlights"] = scrub_pii_list(profile["highlights"], full_name)

    match_strengths = scrub_pii_list(_safe_extract_strengths(top_match.get("key_strengths")) if top_match else [], full_name)

    # All other roles this candidate matches (for cross-role navigation)
    other_roles = [
        r for r in get_all_roles_for_candidate(uuid)
        if r.get("masked_id") != masked_id
    ]

    return {
        "masked_id": masked_id,
        "masked_name": mask_name(full_name),
        "initials": name_initials(full_name),
        "headline": (profile.get("current_role") or {}).get("title") or "Robotics engineer",
        "role_code": target_role,
        "role_name": role_meta.get("role_name"),
        "match_score": role_meta.get("match_score") or (top_match.get("matching_score") if top_match else None),
        "other_roles": other_roles,
        "successful_calls": u.get("successful_calls") or 0,
        "total_call_duration_secs": u.get("total_call_duration_secs") or 0,
        "pitch": pitch_text,
        "ai_summary": ai_summary,
        "profile": profile,
        "match": {
            "key_strengths": match_strengths,
            "role_name": top_match.get("role_name") if top_match else None,
            "matching_score": top_match.get("matching_score") if top_match else None,
        } if top_match else None,
        "best_call": {
            "id": best_call.get("id"),
            "elevenlabs_conversation_id": best_call.get("elevenlabs_conversation_id"),
            "duration_secs": best_call.get("call_duration_secs"),
        } if best_call else None,
    }


@router.get("/candidate/{masked_id}/audio/{conversation_id}")
async def public_candidate_audio(masked_id: str, conversation_id: str):
    uuid = find_uuid_by_masked(masked_id)
    if not uuid:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Verify conversation belongs to this candidate
    def q(sb):
        return sb.table("conversations").select("id, user_id").eq(
            "elevenlabs_conversation_id", conversation_id
        ).limit(1).execute()
    res = supabase_query(q)
    rows = res.data or []
    if not rows or rows[0].get("user_id") != uuid:
        raise HTTPException(status_code=404, detail="Conversation not found for this candidate")

    url = f"{ELEVENLABS_API_BASE}/convai/conversations/{conversation_id}/audio"
    headers = {"xi-api-key": ELEVENLABS_API_KEY}

    async def stream():
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("GET", url, headers=headers) as r:
                if r.status_code >= 400:
                    raise HTTPException(status_code=r.status_code, detail="Failed to fetch audio")
                async for chunk in r.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream(), media_type="audio/mpeg")
