"""Database connections: Supabase (read-only candidate data) + SQLite (SaaS local data)."""
import os
import time
from supabase import create_client, Client
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# ---- Supabase (existing candidate data) ----
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase: Client | None = None


def _is_connection_error(e: Exception) -> bool:
    s = str(e).lower()
    return any(k in s for k in [
        "remoteprotocolerror", "writeerror", "readerror", "connecterror",
        "pooltimeout", "eof occurred", "connection reset", "broken pipe",
    ])


def get_supabase() -> Client:
    """Lazily initialize and return the Supabase client. Reconnects if stale."""
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def supabase_query(fn, retries: int = 2):
    """Run a Supabase query with retry on connection errors."""
    global _supabase
    last = None
    for attempt in range(retries + 1):
        try:
            return fn(get_supabase())
        except Exception as e:
            last = e
            if _is_connection_error(e) and attempt < retries:
                _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                time.sleep(0.3)
                continue
            raise
    raise last  # type: ignore


# ---- SQLite (SaaS local data) ----
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saas.db")
SQLITE_URL = f"sqlite:///{SQLITE_PATH}"

engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency for SQLite session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
