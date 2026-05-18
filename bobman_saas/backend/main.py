"""Bobman SaaS API entry point."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routes.auth_routes import router as auth_router
from routes.admin import router as admin_router
from routes.roles import router as roles_router
from routes.candidates import router as candidates_router
from routes.unlock import router as unlock_router
from routes.audio import router as audio_router
from routes.catalog import router as catalog_router
from routes.candidate_public import router as candidate_public_router
from routes.inquiries import router as inquiries_router

# Create tables on first run
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bobman SaaS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "service": "bobman-saas-api"}


@app.get("/health")
def health():
    return {"status": "ok"}


# All routes are mounted under /api so the public URL is /home/api/*
app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(admin_router, prefix="/api", tags=["admin"])
app.include_router(roles_router, prefix="/api", tags=["roles"])
app.include_router(candidates_router, prefix="/api", tags=["candidates"])
app.include_router(unlock_router, prefix="/api", tags=["unlock"])
app.include_router(audio_router, prefix="/api", tags=["audio"])
# New public (no-auth) catalog endpoints
app.include_router(catalog_router, prefix="/api", tags=["catalog"])
app.include_router(candidate_public_router, prefix="/api", tags=["candidate_public"])
app.include_router(inquiries_router, prefix="/api", tags=["inquiries"])
