"""GET /candidates/{id}/audio/{conversation_id} — proxy ElevenLabs audio."""
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from database import supabase_query
from models import Company
from auth import get_current_company

router = APIRouter()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


@router.get("/candidates/{candidate_id}/audio/{conversation_id}")
async def stream_audio(
    candidate_id: str,
    conversation_id: str,
    _: Company = Depends(get_current_company),
):
    # Verify the conversation belongs to this candidate (us_data only)
    def q(sb):
        return sb.table("conversations").select("id, user_id").eq(
            "elevenlabs_conversation_id", conversation_id
        ).limit(1).execute()
    res = supabase_query(q)
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if rows[0].get("user_id") != candidate_id:
        raise HTTPException(status_code=403, detail="Conversation does not belong to this candidate")

    # Verify candidate is us_data
    def qu(sb):
        return sb.table("users").select("id, data_team_tag").eq("id", candidate_id).limit(1).execute()
    res2 = supabase_query(qu)
    urows = res2.data or []
    if not urows or urows[0].get("data_team_tag") != "us_data":
        raise HTTPException(status_code=403, detail="Candidate not in this catalog")

    # Proxy ElevenLabs audio stream
    url = f"{ELEVENLABS_API_BASE}/convai/conversations/{conversation_id}/audio"
    headers = {"xi-api-key": ELEVENLABS_API_KEY}

    async def stream():
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("GET", url, headers=headers) as r:
                if r.status_code == 404:
                    raise HTTPException(status_code=404, detail="Audio not found")
                if r.status_code >= 400:
                    raise HTTPException(status_code=r.status_code, detail="Failed to fetch audio")
                async for chunk in r.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream(), media_type="audio/mpeg")
