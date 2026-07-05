"""Central JWT_SECRET_KEY resolver. Fail-fast, no insecure defaults.

Before Sprint 1, five places read JWT_SECRET_KEY independently, four of them
with a hardcoded fallback string. That fallback was a silent security hole:
if the env var wasn't injected in production, tokens were signed with a
publicly-known key.

This helper enforces:
  • The env var MUST be set
  • The key MUST be at least 32 characters
  • No default value — startup fails loudly if missing

All auth code should now `from utils.jwt_config import SECRET_KEY, ALGORITHM`
instead of reading `os.environ` directly.
"""
from __future__ import annotations

import os

ALGORITHM = "HS256"

_key = os.environ.get("JWT_SECRET_KEY")
if not _key:
    raise RuntimeError(
        "JWT_SECRET_KEY environment variable is required. "
        "Refusing to start with an insecure default. "
        "Set it in backend/.env or the deployment Secrets tab."
    )
if len(_key) < 32:
    raise RuntimeError(
        f"JWT_SECRET_KEY must be at least 32 characters (got {len(_key)}). "
        "Generate a strong key with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

SECRET_KEY: str = _key

__all__ = ["SECRET_KEY", "ALGORITHM"]
