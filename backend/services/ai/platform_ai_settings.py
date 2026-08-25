"""p296: platform AI settings from DB (super admin UI) with env fallback.

Effective config = main_db.ai_platform_settings (id="global"; api_key stored
AES-256-GCM-encrypted via services.crypto_fields) overriding the backend/.env
vars AI_INTEGRATIONS_OPENAI_*. A short-TTL process cache keeps the SYNC getters
(llm_configured/get_api_key) truthful without a Mongo round-trip per call;
refresh_effective() is awaited at the start of every LLM call path, and the
settings PUT invalidates the cache immediately.
"""
import os
import time

_CACHE = {"api_key": None, "base_url": None, "model": None, "ts": 0.0, "loaded": False}
_TTL = 30.0


def current() -> dict:
    """Effective AI config: DB cache first, env fallback. Safe for sync callers."""
    return {
        "api_key": _CACHE["api_key"] or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or None,
        "base_url": _CACHE["base_url"] or os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") or None,
        "model": _CACHE["model"] or os.environ.get("AI_INTEGRATIONS_OPENAI_MODEL") or "gpt-4o-mini",
        "from_db": bool(_CACHE["api_key"] or _CACHE["base_url"] or _CACHE["model"]),
    }


async def refresh_effective(main_db, force: bool = False) -> dict:
    """Reload the DB overrides into the process cache (TTL-guarded)."""
    now = time.time()
    if not force and _CACHE["loaded"] and now - _CACHE["ts"] < _TTL:
        return current()
    doc = None
    try:
        doc = await main_db.ai_platform_settings.find_one({"id": "global"}, {"_id": 0})
    except Exception:
        doc = None
    api_key = None
    if doc and doc.get("api_key"):
        from services.crypto_fields import decrypt_field
        try:
            api_key = decrypt_field(doc["api_key"]) or None
        except Exception:
            api_key = None
    _CACHE.update({
        "api_key": api_key,
        "base_url": ((doc or {}).get("base_url") or None),
        "model": ((doc or {}).get("model") or None),
        "ts": now, "loaded": True,
    })
    return current()


def invalidate_cache() -> None:
    _CACHE.update({"loaded": False, "ts": 0.0})
