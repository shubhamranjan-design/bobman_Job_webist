import logging
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from routes.dashboard import router as dashboard_router
from routes.summary_api import router as summary_router
from routes.user_lookup_api import router as user_lookup_router
from routes.screening_api import router as screening_router
from database import reconnect_supabase

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECS = 120

class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECS)
        except asyncio.TimeoutError:
            logger.warning(f"Request timed out after {REQUEST_TIMEOUT_SECS}s: {request.method} {request.url.path}")
            return JSONResponse(status_code=504, content={"detail": f"Request timed out after {REQUEST_TIMEOUT_SECS}s"})

app = FastAPI(title="Recruiter Dashboard API")

app.add_middleware(TimeoutMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def catch_disconnected_errors(request: Request, exc: Exception):
    """Catch Supabase stale connection errors and return a retryable 503."""
    err_chain = str(exc).lower()
    err_type = type(exc).__name__
    if "remoteprotocolerror" in err_type.lower() or "disconnected" in err_chain or "remoteprotocolerror" in err_chain:
        logger.warning(f"Supabase connection error ({err_type}), reconnecting client for next request")
        reconnect_supabase()
        return JSONResponse(
            status_code=503,
            content={"detail": "Temporary connection issue, please retry"},
            headers={"Retry-After": "1"}
        )
    # Re-raise other exceptions
    raise exc

app.include_router(dashboard_router, prefix="/api")
app.include_router(summary_router, prefix="/api")
app.include_router(user_lookup_router, prefix="/api")
app.include_router(screening_router, prefix="/api")

@app.get("/")
def root():
    return {"status": "ok", "message": "Recruiter Dashboard API"}

@app.get("/health")
def health():
    return {"status": "healthy"}
