import os
import logging
import time
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
_last_used: float = time.time()
MAX_IDLE_SECS = 30  # Reconnect if client idle for more than 30 seconds

class _ResilientQueryBuilder:
    """Wraps a Supabase query builder to auto-retry .execute() on connection errors."""
    def __init__(self, builder, client_getter):
        object.__setattr__(self, '_builder', builder)
        object.__setattr__(self, '_client_getter', client_getter)
        object.__setattr__(self, '_chain', [])  # list of (method_name, args, kwargs)

    def __getattr__(self, name):
        if name == 'execute':
            return self._execute_with_retry
        def chained(*args, **kwargs):
            result = getattr(self._builder, name)(*args, **kwargs)
            # If it returns something with .execute, wrap it too
            if hasattr(result, 'execute'):
                wrapper = _ResilientQueryBuilder(result, self._client_getter)
                object.__setattr__(wrapper, '_chain', self._chain + [(name, args, kwargs)])
                return wrapper
            return result
        return chained

    def _execute_with_retry(self, **kwargs):
        global _supabase
        for attempt in range(3):
            try:
                return self._builder.execute(**kwargs)
            except Exception as e:
                if _is_connection_error(e) and attempt < 2:
                    logger.warning(f"Query retry (attempt {attempt + 1}): {type(e).__name__}")
                    _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                    # Rebuild the query chain on fresh client
                    builder = _supabase.table(self._chain[0][1][0]) if self._chain else self._builder
                    for method_name, args, kw in self._chain[1:] if self._chain else []:
                        builder = getattr(builder, method_name)(*args, **kw)
                    object.__setattr__(self, '_builder', builder)
                    time.sleep(0.3)
                    continue
                raise


class _ResilientTable:
    """Wraps supabase.table() to return resilient query builders."""
    def __init__(self, client, table_name):
        self._client = client
        self._table_name = table_name
        self._real = client.table(table_name)

    def __getattr__(self, name):
        def chained(*args, **kwargs):
            result = getattr(self._real, name)(*args, **kwargs)
            if hasattr(result, 'execute'):
                wrapper = _ResilientQueryBuilder(result, lambda: get_supabase())
                object.__setattr__(wrapper, '_chain', [('table', (self._table_name,), {}), (name, args, kwargs)])
                return wrapper
            return result
        return chained


class _ResilientClient:
    """Proxy that makes supabase.table(...) return resilient query builders."""
    def __init__(self, client):
        object.__setattr__(self, '_client', client)

    def table(self, name):
        return _ResilientTable(self._client, name)

    def __getattr__(self, name):
        return getattr(self._client, name)


def get_supabase():
    global _supabase, _last_used
    now = time.time()
    if now - _last_used > MAX_IDLE_SECS:
        logger.info(f"Supabase client idle for {now - _last_used:.0f}s, reconnecting proactively")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    _last_used = now
    return _ResilientClient(_supabase)

def reconnect_supabase() -> Client:
    """Recreate the Supabase client (fresh HTTP connection pool)."""
    global _supabase
    logger.info("Reconnecting Supabase client (stale connection)")
    _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase

def create_supabase() -> Client:
    """Create a fresh Supabase client (for thread-local use)."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def _is_connection_error(e: Exception) -> bool:
    """Check if exception is a retryable connection/transport error."""
    err_str = str(e).lower()
    err_type = type(e).__name__.lower()
    retryable_types = ("remoteprotocolerror", "writeerror", "readerror", "connecterror", "pooltimeout")
    retryable_strings = ("disconnected", "eof occurred", "connection reset", "broken pipe", "timed out", "pool timeout")
    if any(t in err_type for t in retryable_types):
        return True
    if any(s in err_str for s in retryable_strings):
        return True
    return False

def supabase_query(fn, retries=2):
    """Execute a Supabase query with auto-retry on connection errors.

    Usage: supabase_query(lambda s: s.table("users").select("*").execute())
    """
    global _supabase
    for attempt in range(retries + 1):
        try:
            return fn(_supabase)
        except Exception as e:
            if _is_connection_error(e) and attempt < retries:
                logger.warning(f"Supabase connection error (attempt {attempt + 1}): {type(e).__name__}: {e}")
                _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                time.sleep(0.3)
                continue
            raise
