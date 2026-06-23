"""
Yalidine Shipping Integration Routes
Yalidine is an Algerian shipping/delivery company.
Requires YALIDINE_API_ID and YALIDINE_API_TOKEN.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import logging
import httpx

logger = logging.getLogger(__name__)


def create_yalidine_integration_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/integrations/yalidine", tags=["yalidine-shipping"])

    YALIDINE_API_URL = "https://api.yalidine.app/v1"

    class YalidineSettingsUpdate(BaseModel):
        api_id: Optional[str] = None
        api_token: Optional[str] = None
        default_sender_wilaya: Optional[str] = "16"
        enabled: bool = True

    class CreateParcelRequest(BaseModel):
        firstname: str
        familyname: str
        phone: str
        address: str
        commune_name: str
        wilaya_name: Optional[str] = None
        is_stopdesk: bool = False
        has_exchange: bool = False
        product_list: str = ""
        price: float = 0
        do_insurance: bool = False

    class TrackParcelRequest(BaseModel):
        tracking_id: str

    async def _get_config(tenant_id: str = None) -> dict:
        config = await db.yalidine_settings.find_one(
            {"tenant_id": tenant_id} if tenant_id else {}, {"_id": 0}
        )
        if not config:
            config = {
                "api_id": os.environ.get("YALIDINE_API_ID", ""),
                "api_token": os.environ.get("YALIDINE_API_TOKEN", ""),
                "default_sender_wilaya": "16",
                "enabled": bool(os.environ.get("YALIDINE_API_ID")),
            }
        return config

    def _headers(config) -> dict:
        return {
            "X-API-ID": config.get("api_id", ""),
            "X-API-TOKEN": config.get("api_token", ""),
            "Content-Type": "application/json"
        }

    @router.get("/status")
    async def get_yalidine_status(admin: dict = Depends(get_tenant_admin)):
        config = await _get_config(admin.get("tenant_id"))
        return {
            "configured": bool(config.get("api_id") and config.get("api_token")),
            "enabled": config.get("enabled", False),
            "provider": "yalidine",
            "default_sender_wilaya": config.get("default_sender_wilaya", "16")
        }

    @router.put("/settings")
    async def update_settings(settings: YalidineSettingsUpdate, admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id")
        update = {
            "tenant_id": tenant_id,
            "default_sender_wilaya": settings.default_sender_wilaya,
            "enabled": settings.enabled,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if settings.api_id:
            update["api_id"] = settings.api_id
        if settings.api_token:
            update["api_token"] = settings.api_token
        await db.yalidine_settings.update_one(
            {"tenant_id": tenant_id}, {"$set": update}, upsert=True
        )
        return {"success": True, "message": "تم تحديث إعدادات Yalidine"}

    @router.get("/wilayas")
    async def get_wilayas(admin: dict = Depends(get_tenant_admin)):
        config = await _get_config(admin.get("tenant_id"))
        if not config.get("api_id"):
            return [{"id": str(i), "name": w} for i, w in enumerate([
                "أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار",
                "البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر",
                "الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة",
                "قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض",
                "إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي",
                "خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت",
                "غرداية","غليزان","المنيعة","عين صالح","عين قزام","توقرت","جانت",
                "المغير","المنيعة","أولاد جلال","بني عباس","تيميمون","تقرت","الدبداب",
            ], 1)]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{YALIDINE_API_URL}/wilayas/", headers=_headers(config))
                if resp.status_code == 200:
                    return resp.json()
                return {"error": resp.text}
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/communes/{wilaya_id}")
    async def get_communes(wilaya_id: str, admin: dict = Depends(get_tenant_admin)):
        config = await _get_config(admin.get("tenant_id"))
        if not config.get("api_id"):
            raise HTTPException(status_code=400, detail="Yalidine غير مُعد. أضف مفتاح API في الإعدادات.")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{YALIDINE_API_URL}/communes/?wilaya_id={wilaya_id}", headers=_headers(config))
                if resp.status_code == 200:
                    return resp.json()
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/delivery-fees")
    async def get_delivery_fees(admin: dict = Depends(get_tenant_admin)):
        config = await _get_config(admin.get("tenant_id"))
        if not config.get("api_id"):
            raise HTTPException(status_code=400, detail="Yalidine غير مُعد")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{YALIDINE_API_URL}/deliveryfees/", headers=_headers(config))
                if resp.status_code == 200:
                    return resp.json()
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/parcels")
    async def create_parcel(parcel: CreateParcelRequest, admin: dict = Depends(get_tenant_admin)):
        config = await _get_config(admin.get("tenant_id"))
        if not config.get("api_id"):
            raise HTTPException(status_code=400, detail="Yalidine غير مُعد")
        payload = {
            "order_id": str(uuid.uuid4())[:8],
            "firstname": parcel.firstname,
            "familyname": parcel.familyname,
            "contact_phone": parcel.phone,
            "address": parcel.address,
            "commune_name": parcel.commune_name,
            "is_stopdesk": parcel.is_stopdesk,
            "has_exchange": parcel.has_exchange,
            "product_list": parcel.product_list,
            "price": parcel.price,
            "do_insurance": parcel.do_insurance,
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(f"{YALIDINE_API_URL}/parcels/", json=[payload], headers=_headers(config))
                data = resp.json() if resp.status_code in (200, 201) else None
                tracking_id = ""
                if data and isinstance(data, list) and data:
                    tracking_id = data[0].get("tracking", "")
                await db.yalidine_parcels.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": admin.get("tenant_id"),
                    "tracking_id": tracking_id,
                    "customer_name": f"{parcel.firstname} {parcel.familyname}",
                    "phone": parcel.phone,
                    "address": parcel.address,
                    "commune": parcel.commune_name,
                    "price": parcel.price,
                    "status": "created",
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                if resp.status_code in (200, 201):
                    return {"success": True, "tracking_id": tracking_id, "data": data}
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/parcels/{tracking_id}")
    async def track_parcel(tracking_id: str, admin: dict = Depends(get_tenant_admin)):
        config = await _get_config(admin.get("tenant_id"))
        if not config.get("api_id"):
            local = await db.yalidine_parcels.find_one({"tracking_id": tracking_id}, {"_id": 0})
            if local:
                return local
            raise HTTPException(status_code=400, detail="Yalidine غير مُعد")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{YALIDINE_API_URL}/parcels/{tracking_id}", headers=_headers(config))
                if resp.status_code == 200:
                    return resp.json()
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/parcels")
    async def list_parcels(page: int = 1, limit: int = 20, admin: dict = Depends(get_tenant_admin)):
        skip = (page - 1) * limit
        parcels = await db.yalidine_parcels.find(
            {"tenant_id": admin.get("tenant_id")}, {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await db.yalidine_parcels.count_documents({"tenant_id": admin.get("tenant_id")})
        return {"parcels": parcels, "total": total, "page": page}

    return router
