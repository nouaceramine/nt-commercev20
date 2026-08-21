"""Field-level encryption (p226) — AES-256-GCM for NEW sensitive fields only.

Report §7 rule: «شفّر الهوية والأسرار، اترك الأرقام التشغيلية مفهرسة» —
encrypt identity/secrets, NEVER indexed operational fields, and never migrate
live business data. Currently applied to:
  • tenant bridge_secret (settings doc)
  • saas_tenants.self_bridge_api_key

Key: env FIELD_ENCRYPTION_KEY — 64-hex (32B), base64(32B), or any passphrase
(hashed with SHA-256). Format: "v1." + urlsafe_b64(nonce‖ciphertext‖tag).
decrypt_field passes non-prefixed values through untouched (back-compat).
"""
import base64
import hashlib
import logging
import os

logger = logging.getLogger("crypto_fields")

_PREFIX = "v1."
_key = None          # None = not tried, False = unavailable, bytes = ready
_warned = False


def _load_key():
    raw = os.environ.get("FIELD_ENCRYPTION_KEY", "").strip()
    if not raw:
        return None
    try:
        if len(raw) == 64:
            return bytes.fromhex(raw)
    except ValueError:
        pass
    try:
        k = base64.b64decode(raw)
        if len(k) == 32:
            return k
    except Exception:  # noqa: BLE001
        pass
    return hashlib.sha256(raw.encode()).digest()


def is_crypto_available() -> bool:
    global _key
    if _key is None:
        _key = _load_key() or False
    return _key is not False


def key_fingerprint() -> str:
    """First 12 hex of sha256(key) — for ops verification, never the key itself."""
    if not is_crypto_available():
        return ""
    return hashlib.sha256(_key).hexdigest()[:12]


def encrypt_field(plain):
    """Encrypt a secret for at-rest storage. When the key is unavailable the
    value is stored unchanged (logged once) — availability is reported via the
    security status endpoint so ops notices immediately."""
    global _warned
    if plain is None:
        return plain
    if not isinstance(plain, str):
        plain = str(plain)
    if not plain or plain.startswith(_PREFIX):
        return plain
    if not is_crypto_available():
        if not _warned:
            logger.warning("FIELD_ENCRYPTION_KEY not set — storing secret unencrypted")
            _warned = True
        return plain
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    ct = AESGCM(_key).encrypt(nonce, plain.encode(), None)
    return _PREFIX + base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_field(value):
    """Decrypt a stored secret; plaintext values pass through (back-compat)."""
    if not value or not isinstance(value, str) or not value.startswith(_PREFIX):
        return value
    if not is_crypto_available():
        raise RuntimeError("encrypted field present but FIELD_ENCRYPTION_KEY is missing")
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = base64.urlsafe_b64decode(value[len(_PREFIX):].encode())
    return AESGCM(_key).decrypt(raw[:12], raw[12:], None).decode()
