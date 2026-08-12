"""Field-level encryption at rest (p34, gap 5).

MongoDB Community has no native storage encryption, so sensitive DB fields
(API keys, WooCommerce consumer secrets, payment gateway credentials) are
encrypted at the application layer with Fernet (AES-128-CBC + HMAC-SHA256).

Format:  enc:v1:<fernet-token>
- Legacy plaintext values pass through decrypt_field() untouched, so existing
  data keeps working and gets encrypted on its next write.
- FIELD_ENCRYPTION_KEY must be set in the environment (fail-fast, like the
  JWT resolver): the backend refuses to boot without it.
"""
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

PREFIX = "enc:v1:"

_raw_key = os.environ.get("FIELD_ENCRYPTION_KEY", "").strip()
if not _raw_key:
    raise RuntimeError(
        "FIELD_ENCRYPTION_KEY is not set — refusing to boot. "
        "Generate one: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )
_fernet = Fernet(_raw_key.encode())


def encrypt_field(value):
    """Encrypt a sensitive string for storage. Idempotent; empty stays empty."""
    if not value or not isinstance(value, str):
        return value
    if value.startswith(PREFIX):
        return value
    return PREFIX + _fernet.encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_field(value):
    """Decrypt a stored value. Plaintext (legacy) passes through unchanged."""
    if not value or not isinstance(value, str):
        return value
    if not value.startswith(PREFIX):
        return value
    try:
        return _fernet.decrypt(value[len(PREFIX):].encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.error("field decryption failed — wrong FIELD_ENCRYPTION_KEY?")
        return None


def is_encrypted(value) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)
