"""AES-256-GCM encryption for digital codes (gift cards, topup codes)."""
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_KEY_HEX = os.environ.get("CODE_ENCRYPTION_KEY", "")


def _key() -> bytes:
    if not _KEY_HEX or len(_KEY_HEX) != 64:
        raise RuntimeError("CODE_ENCRYPTION_KEY غير مضبوط (64 hex)")
    return bytes.fromhex(_KEY_HEX)


def encrypt_code(code: str) -> dict:
    aes = AESGCM(_key())
    iv = os.urandom(16)
    ct = aes.encrypt(iv, code.encode("utf-8"), None)
    return {"encrypted": ct[:-16].hex(), "tag": ct[-16:].hex(), "iv": iv.hex()}


def decrypt_code(encrypted: str, iv: str, tag: str) -> str:
    aes = AESGCM(_key())
    ct = bytes.fromhex(encrypted) + bytes.fromhex(tag)
    return aes.decrypt(bytes.fromhex(iv), ct, None).decode("utf-8")
