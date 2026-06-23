"""
System Logs route - captures frontend and backend errors for super-admin visibility.

Endpoints (all under /api):
    POST   /system-logs              public  -> ingest a single log entry from any client
    GET    /system-logs              admin   -> list logs (filters: level, source, search, limit)
    GET    /system-logs/stats        admin   -> counts grouped by level/source
    GET    /system-logs/download     admin   -> stream the current logs as a downloadable JSON file
    POST   /system-logs/analyze      admin   -> AI summary + suggested fixes via Emergent LLM
    DELETE /system-logs              admin   -> clear ALL logs (manual purge)
"""
import os
import io
import json
import uuid
import logging
import traceback
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config.database import main_db
from routes.saas.helpers import get_super_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system-logs", tags=["system-logs"])

# ---- Models ------------------------------------------------------------------

class LogEntryIn(BaseModel):
    level: str = Field(default="error", description="error|warn|info")
    source: str = Field(default="frontend", description="frontend|backend|api")
    type: Optional[str] = Field(default=None, description="js_error|unhandled_rejection|api_error|console_error|exception")
    message: str
    stack: Optional[str] = None
    url: Optional[str] = None
    status_code: Optional[int] = None
    user_email: Optional[str] = None
    metadata: Optional[dict] = None


# ---- Helpers -----------------------------------------------------------------

async def _insert_log(entry: dict) -> str:
    """Insert one log entry into main_db.system_logs and return its id."""
    log_id = entry.get("id") or str(uuid.uuid4())
    doc = {
        "id": log_id,
        "level": entry.get("level", "error"),
        "source": entry.get("source", "backend"),
        "type": entry.get("type"),
        "message": (entry.get("message") or "")[:4000],
        "stack": (entry.get("stack") or "")[:8000] if entry.get("stack") else None,
        "url": entry.get("url"),
        "status_code": entry.get("status_code"),
        "user_email": entry.get("user_email"),
        "metadata": entry.get("metadata") or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await main_db.system_logs.insert_one(doc)
    except Exception as exc:
        # Never raise from the logger itself
        logger.error("system_logs insert failed: %s", exc)
        return ""
    return log_id


async def log_backend_exception(exc: Exception, request: Optional[Request] = None) -> None:
    """Helper for other backend modules to log a captured exception."""
    await _insert_log({
        "level": "error",
        "source": "backend",
        "type": "exception",
        "message": f"{type(exc).__name__}: {exc}",
        "stack": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[:8000],
        "url": str(request.url) if request is not None else None,
        "metadata": {"method": request.method if request is not None else None},
    })


# ---- Routes ------------------------------------------------------------------

@router.post("")
async def ingest_log(entry: LogEntryIn, request: Request) -> dict:
    """Public ingest endpoint. Anyone (incl. unauth visitors) can post an error
    so we capture pre-login crashes too. Rate-limited by reverse proxy."""
    data = entry.model_dump()
    # Pull user email from JWT cookie/header if present (best-effort, no hard requirement)
    try:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer ") and not data.get("user_email"):
            import jwt
            payload = jwt.decode(
                auth[7:],
                os.environ.get("JWT_SECRET_KEY", "nt_commerce_super_secure_jwt_secret_key_2024_v3_hardened"),
                algorithms=["HS256"],
                options={"verify_exp": False},
            )
            data["user_email"] = payload.get("email")
    except Exception:
        pass
    log_id = await _insert_log(data)
    return {"id": log_id, "ok": bool(log_id)}


@router.get("")
async def list_logs(
    level: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    skip: int = Query(0, ge=0),
    admin: dict = Depends(get_super_admin),
) -> dict:
    q: dict = {}
    if level:
        q["level"] = level
    if source:
        q["source"] = source
    if search:
        q["$or"] = [
            {"message": {"$regex": search, "$options": "i"}},
            {"url": {"$regex": search, "$options": "i"}},
            {"type": {"$regex": search, "$options": "i"}},
        ]
    cursor = main_db.system_logs.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await main_db.system_logs.count_documents(q)
    return {"items": items, "total": total, "limit": limit, "skip": skip}


@router.get("/stats")
async def log_stats(admin: dict = Depends(get_super_admin)) -> dict:
    pipeline = [
        {"$group": {
            "_id": {"level": "$level", "source": "$source"},
            "count": {"$sum": 1},
        }},
    ]
    by_level_source = await main_db.system_logs.aggregate(pipeline).to_list(length=100)
    total = await main_db.system_logs.count_documents({})
    last = await main_db.system_logs.find({}, {"_id": 0, "created_at": 1}).sort("created_at", -1).limit(1).to_list(length=1)
    return {
        "total": total,
        "by_level_source": by_level_source,
        "last_at": last[0]["created_at"] if last else None,
    }


@router.get("/download")
async def download_logs(admin: dict = Depends(get_super_admin)) -> StreamingResponse:
    cursor = main_db.system_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(5000)
    items = await cursor.to_list(length=5000)
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "logs": items,
    }
    buf = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    fname = f"system-logs-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"
    return StreamingResponse(
        buf,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/analyze")
async def analyze_logs(admin: dict = Depends(get_super_admin)) -> dict:
    """Send the last 100 error logs to Emergent LLM, get an Arabic summary +
    suggested fixes. Does NOT apply any fix. Read-only AI assist."""
    api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    cursor = main_db.system_logs.find({"level": "error"}, {"_id": 0}).sort("created_at", -1).limit(100)
    items = await cursor.to_list(length=100)
    if not items:
        return {"summary": "لا توجد أخطاء حالياً ✅", "suggestions": [], "count": 0}
    # Build a compact textual report
    lines = []
    for i, it in enumerate(items, 1):
        lines.append(
            f"[{i}] src={it.get('source')} type={it.get('type')} url={it.get('url')} status={it.get('status_code')}"
            f"\n    msg: {(it.get('message') or '')[:300]}"
        )
    report = "\n".join(lines)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = (
            LlmChat(
                api_key=api_key,
                session_id=f"sysloganalysis-{uuid.uuid4()}",
                system_message=(
                    "أنت مهندس برمجيات يساعد في تحليل سجل أخطاء تطبيق ويب (FastAPI + React). "
                    "لخّص الأخطاء الأكثر تكراراً، صنّفها حسب الخطورة، واقترح إصلاحات مبدئية. "
                    "أجب بالعربية بصيغة JSON: {\"summary\": \"...\", \"suggestions\": [{\"title\":\"...\",\"action\":\"...\",\"file\":\"...\"}]}"
                ),
            )
            .with_model("openai", "gpt-4o-mini")
        )
        ai = await chat.send_message(UserMessage(text=f"حلّل سجل الأخطاء التالي:\n{report}"))
        text = ai if isinstance(ai, str) else getattr(ai, "content", str(ai))
        # Try to parse JSON from the AI response
        parsed = None
        try:
            # Some models wrap JSON in ```json blocks
            t = text.strip()
            if "```" in t:
                t = t.split("```")[1]
                if t.lower().startswith("json"):
                    t = t[4:]
            parsed = json.loads(t)
        except Exception:
            parsed = {"summary": text, "suggestions": []}
        parsed["count"] = len(items)
        return parsed
    except Exception as exc:
        logger.error("analyze_logs error: %s", exc)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {exc}")


@router.delete("")
async def clear_logs(admin: dict = Depends(get_super_admin)) -> dict:
    res = await main_db.system_logs.delete_many({})
    return {"deleted": res.deleted_count}
