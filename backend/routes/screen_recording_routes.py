# p281: Screen recording (Screen2ipcam) — per-tenant DVR device registry + setup guide.
# Each cashier PC running Screen2ipcam appears as an ONVIF/RTSP camera on the LAN;
# this module only stores the mapping (PC ↔ DVR channel) and serves the setup guide.
# Video stays local (PC → NVR/XVR) and never transits our servers.
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config.database import main_db
from utils.auth import require_tenant

log = logging.getLogger("screen_recording")

router = APIRouter(prefix="/screen-recording", tags=["screen-recording"])


class DeviceIn(BaseModel):
    device_name: str
    pc_ip: Optional[str] = ""
    rtsp_port: Optional[int] = 8554
    stream_name: Optional[str] = "screen"
    dvr_channel: Optional[int] = None
    dvr_ip: Optional[str] = ""
    notes: Optional[str] = ""
    preview_port: Optional[int] = 8889


class DeviceUpdate(BaseModel):
    device_name: Optional[str] = None
    pc_ip: Optional[str] = None
    rtsp_port: Optional[int] = None
    stream_name: Optional[str] = None
    dvr_channel: Optional[int] = None
    dvr_ip: Optional[str] = None
    notes: Optional[str] = None
    preview_port: Optional[int] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public(d: dict) -> dict:
    return {k: v for k, v in d.items() if k != "_id"}


def _rtsp_url(d: dict) -> str:
    ip = d.get("pc_ip") or "<IP-الجهاز>"
    port = d.get("rtsp_port") or 8554
    name = d.get("stream_name") or "screen"
    return f"rtsp://{ip}:{port}/{name}"


def _preview_url(d: dict) -> str:
    ip = d.get("pc_ip") or "<IP>"
    port = d.get("preview_port") or 8889
    name = d.get("stream_name") or "screen"
    return f"http://{ip}:{port}/{name}"


@router.get("/devices")
async def list_devices(user: dict = Depends(require_tenant)):
    tenant_id = user.get("tenant_id") or user.get("id")
    rows = await main_db.screen_recording_devices.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    for r in rows:
        r["rtsp_url"] = _rtsp_url(r)
        r["preview_url"] = _preview_url(r)
    return {"items": rows, "count": len(rows)}


@router.post("/devices")
async def create_device(body: DeviceIn, user: dict = Depends(require_tenant)):
    name = (body.device_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم الجهاز مطلوب")
    tenant_id = user.get("tenant_id") or user.get("id")
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "device_name": name,
        "pc_ip": (body.pc_ip or "").strip(),
        "rtsp_port": int(body.rtsp_port or 8554),
        "stream_name": (body.stream_name or "screen").strip(),
        "dvr_channel": body.dvr_channel,
        "dvr_ip": (body.dvr_ip or "").strip(),
        "notes": (body.notes or "").strip(),
        "preview_port": int(body.preview_port or 8889),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await main_db.screen_recording_devices.insert_one(doc)
    out = _public(doc)
    out["rtsp_url"] = _rtsp_url(doc)
    out["preview_url"] = _preview_url(doc)
    return {"ok": True, "device": out}


@router.put("/devices/{device_id}")
async def update_device(device_id: str, body: DeviceUpdate, user: dict = Depends(require_tenant)):
    tenant_id = user.get("tenant_id") or user.get("id")
    raw = body.dict(exclude_unset=True)
    updates = {"updated_at": _now()}
    for k, v in raw.items():
        if isinstance(v, str):
            updates[k] = v.strip()
        else:
            updates[k] = v
    res = await main_db.screen_recording_devices.update_one(
        {"id": device_id, "tenant_id": tenant_id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    doc = await main_db.screen_recording_devices.find_one(
        {"id": device_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    doc["rtsp_url"] = _rtsp_url(doc)
    doc["preview_url"] = _preview_url(doc)
    return {"ok": True, "device": doc}


@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(require_tenant)):
    tenant_id = user.get("tenant_id") or user.get("id")
    res = await main_db.screen_recording_devices.delete_one({"id": device_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    return {"ok": True}


@router.get("/setup-info")
async def setup_info(user: dict = Depends(require_tenant)):
    """Static Arabic setup guide for Screen2ipcam + DVR/NVR."""
    return {
        "app_name": "Screen2ipcam",
        "download_sources": [
            {"label": "SourceForge (الموقع الرسمي للمشروع)", "url": "https://sourceforge.net/projects/screen2ipcam/"},
            {"label": "متجر Microsoft", "url": "https://apps.microsoft.com/detail/9pjdgr30l9l1"},
        ],
        "license_note": "تجربة مجانية 14 يوماً، ثم رخصة مدى الحياة 20$ لكل جهاز (دفعة واحدة، بلا اشتراك).",
        "requirements": [
            "جهاز كمبيوتر الكاشير بنظام Windows 7 أو أحدث.",
            "جهاز تسجيل يدعم قنوات IP: NVR أو XVR هجين (DVR تماثلي صرف لا يقبل كاميرات IP).",
            "أن يكون الكمبيوتر وجهاز التسجيل على نفس الشبكة المحلية.",
        ],
        "steps": [
            "حمّل Screen2ipcam وثبّته على جهاز الكاشير (أقل من 5MB، لا يبطئ الجهاز).",
            "افتح لوحة الإعداد واضبط اسم الكاميرا (مثلاً: كاشير 1) والمنفذ (8554 افتراضياً).",
            "فعّل خيار التشغيل كخدمة Windows ليبدأ تلقائياً مع الجهاز.",
            "في جهاز التسجيل: أضف قناة IP جديدة — سيكتشف الجهاز تلقائياً عبر ONVIF، أو أدخل رابط RTSP يدوياً.",
            "سجّل الجهاز هنا في هذه الصفحة واربطه برقم القناة في جهاز التسجيل لتعرف أي قناة تخص أي كاشير.",
        ],
        "live_preview": {
            "title": "المعاينة الحية داخل لوحة التحكم (اختياري)",
            "summary": "لمشاهدة شاشة الكاشير مباشرة من صفحة «تسجيل الشاشة» دون فتح شاشة الـ DVR، ثبّت برنامج MediaMTX المجاني مفتوح المصدر على نفس كمبيوتر الكاشير — يحوّل بث RTSP إلى WebRTC يفهمه المتصفح.",
            "download": "https://github.com/bluenviron/mediamtx/releases",
            "config_sample": "paths:\n  screen:\n    source: rtsp://localhost:8554/screen",
            "steps": [
                "حمّل MediaMTX لنظام Windows من صفحة الإصدارات الرسمية (ملف واحد، بلا تثبيت).",
                "أنشئ ملف mediamtx.yml بجانبه بالمحتوى الموضح (يسحب البث من Screen2ipcam محلياً).",
                "شغّل mediamtx.exe — يصبح البث متاحاً للمتصفح على المنفذ 8889.",
                "من صفحة «تسجيل الشاشة» اضغط زر «معاينة حية» بجانب الجهاز.",
            ],
            "notes": [
                "المعاينة تعمل فقط من جهاز متصل بنفس الشبكة المحلية للمحل — البث لا يمر عبر الإنترنت.",
                "من كمبيوتر الكاشير نفسه تعمل المعاينة المدمجة مباشرة؛ من جهاز آخر استخدم زر «فتح في تبويب» لأن المتصفحات تحمي الصفحات المشفرة من المحتوى المحلي.",
                "MediaMTX مجاني بالكامل ومفتوح المصدر — لا رخصة إضافية.",
            ],
        },
        "rtsp_hint": "rtsp://<IP-الجهاز>:<المنفذ>/<اسم-البث> — مثال: rtsp://192.168.1.50:8554/screen",
    }
