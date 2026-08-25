"""Unified LLM helper — official OpenAI client ONLY.

Security: NEVER use the `emergentintegrations` PyPI package — it is confirmed
malware (MAL-2026-2702, credential stealer). Every LLM call in this codebase
must go through this module using the official `openai` library.

Configuration (backend/.env):
  AI_INTEGRATIONS_OPENAI_API_KEY   — required to enable LLM features
  AI_INTEGRATIONS_OPENAI_BASE_URL  — optional custom endpoint
  AI_INTEGRATIONS_OPENAI_MODEL     — optional, default gpt-4o-mini
"""
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def get_api_key() -> Optional[str]:
    from services.ai.platform_ai_settings import current  # p296: DB first, env fallback
    return current()["api_key"]


def llm_configured() -> bool:
    return bool(get_api_key())


def _client():
    from openai import AsyncOpenAI
    from services.ai.platform_ai_settings import current  # p296
    cfg = current()
    return AsyncOpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"])


def _model() -> str:
    from services.ai.platform_ai_settings import current  # p296
    return current()["model"]


async def llm_chat(system_message: str, user_prompt: str, max_tokens: int = 2000) -> Optional[str]:
    """Return assistant text, or None when LLM is not configured."""
    if not llm_configured():
        return None
    from config.database import main_db as _mdb  # p224
    from services.ai.usage_meter import check_ai_cap, record_ai_usage  # p224
    from services.ai.platform_ai_settings import refresh_effective  # p296
    await refresh_effective(_mdb)
    await check_ai_cap(_mdb)  # p224
    resp = await _client().chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
    )
    _u = getattr(resp, "usage", None)  # p224
    await record_ai_usage(
        _mdb, model=_model(),
        tokens_in=getattr(_u, "prompt_tokens", 0) or 0,
        tokens_out=getattr(_u, "completion_tokens", 0) or 0,
        feature="llm_chat",
    )
    return (resp.choices[0].message.content or "").strip()


async def llm_vision(system_message: str, user_prompt: str, image_base64: str, max_tokens: int = 2000) -> Optional[str]:
    """Vision call with a base64 image. Returns None when not configured."""
    if not llm_configured():
        return None
    from config.database import main_db as _mdb  # p224
    from services.ai.usage_meter import check_ai_cap, record_ai_usage  # p224
    from services.ai.platform_ai_settings import refresh_effective  # p296
    await refresh_effective(_mdb)
    await check_ai_cap(_mdb)  # p224
    resp = await _client().chat.completions.create(
        model=_model(),
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + image_base64}},
            ]},
        ],
        max_tokens=max_tokens,
    )
    _u = getattr(resp, "usage", None)  # p224
    await record_ai_usage(
        _mdb, model=_model(),
        tokens_in=getattr(_u, "prompt_tokens", 0) or 0,
        tokens_out=getattr(_u, "completion_tokens", 0) or 0,
        feature="llm_vision",
    )
    return (resp.choices[0].message.content or "").strip()
