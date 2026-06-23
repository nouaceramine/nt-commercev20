"""
Supervisor entry point. Re-exports the FastAPI app from main.py
so existing supervisor config (server:app) keeps working.
"""
from main import app  # noqa: F401
