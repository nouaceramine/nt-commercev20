"""
Recharge Sim Routes - Extracted from legacy_inline_routes.py
Includes: bridge task queue, bridge API, Idoom code inventory.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import io
import csv
import os
import logging
import ipaddress
import socket
import httpx
from urllib.parse import urlparse


logger = logging.getLogger(__name__)


def _assert_safe_bridge_url(url: str) -> None:
    """Raise HTTPException 400 if url is a private/internal network target (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="رابط الجسر يجب أن يبدأ بـ http:// أو https://")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="رابط الجسر غير صالح")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="تعذّر التحقق من رابط الجسر — اسم المضيف غير صالح")
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
        raise HTTPException(status_code=400, detail="رابط الجسر يشير إلى عنوان شبكة داخلية غير مسموح")


def create_recharge_sim_routes(db, main_db, require_tenant, get_tenant_admin, RECHARGE_CONFIG, RechargeCreate, RechargeResponse, get_tenant_db=None) -> dict:
    """Create recharge sim routes"""
    from motor.motor_asyncio import AsyncIOMotorDatabase
    router = APIRouter()

    # ---- bridge secret auth ----
    # Bridge clients are external processes (no JWT). They send X-Tenant-ID + X-Bridge-Secret.
    # verify_bridge resolves the correct tenant DB and returns it so handlers don't use the
    # JWT-ContextVar-based proxy (which would fall back to main_db when no JWT is present).
    async def verify_bridge(
        x_bridge_secret: Optional[str] = Header(None, alias="X-Bridge-Secret"),
        x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    ) -> AsyncIOMotorDatabase:
        if not x_tenant_id:
            raise HTTPException(status_code=400, detail="X-Tenant-ID header manquant")
        if get_tenant_db is None:
            raise HTTPException(status_code=500, detail="get_tenant_db non configuré")
        tenant_db = get_tenant_db(x_tenant_id)
        secret_doc = await tenant_db.settings.find_one({"key": "bridge_secret"}, {"_id": 0})
        expected = (secret_doc.get("value", "") if secret_doc else "")
        if not expected or x_bridge_secret != expected:
            raise HTTPException(status_code=403, detail="Bridge secret invalide")
        return tenant_db

    # ============ RECHARGE / USSD ============

    async def _get_effective_config() -> dict:
        """Merge hardcoded RECHARGE_CONFIG with DB overrides (main_db.recharge_operator_config)."""
        if main_db is None:
            return RECHARGE_CONFIG
        effective = {}
        for key, defaults in RECHARGE_CONFIG.items():
            override = await main_db.recharge_operator_config.find_one({"operator": key}, {"_id": 0})
            if override:
                merged = dict(defaults)
                if "commission" in override:
                    merged["commission"] = override["commission"]
                if "amounts" in override and override["amounts"]:
                    merged["amounts"] = override["amounts"]
                effective[key] = merged
            else:
                effective[key] = dict(defaults)
        return effective

    @router.get("/recharge/config")
    async def get_recharge_config(user: dict = Depends(require_tenant)):
        """Get recharge operators configuration (with admin DB overrides)."""
        return await _get_effective_config()

    @router.post("/recharge", response_model=RechargeResponse)
    async def create_recharge(recharge: RechargeCreate, user: dict = Depends(require_tenant)):
        """Record a recharge transaction"""
        recharge_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Get operator config (DB overrides take precedence over hardcoded defaults)
        effective_config = await _get_effective_config()
        operator_config = effective_config.get(recharge.operator)
        if not operator_config:
            raise HTTPException(status_code=400, detail="Invalid operator")

        # --- Resolve recharge mode for this tenant ---
        entity_id_for_mode = user.get("tenant_id") or user.get("id", "")
        tenant_doc = None
        if entity_id_for_mode and main_db is not None:
            tenant_doc = await main_db.saas_tenants.find_one(
                {"id": entity_id_for_mode},
                {"_id": 0, "recharge_mode": 1, "self_bridge_url": 1, "self_bridge_api_key": 1},
            )
        recharge_mode = (tenant_doc.get("recharge_mode", "owner_bridge") if tenant_doc else "owner_bridge")
        self_bridge_url = ""
        self_bridge_api_key = ""
        if recharge_mode == "self_bridge":
            self_bridge_url = (tenant_doc.get("self_bridge_url", "") if tenant_doc else "")
            self_bridge_api_key = (tenant_doc.get("self_bridge_api_key", "") if tenant_doc else "")
            if not self_bridge_url:
                raise HTTPException(
                    status_code=400,
                    detail="الجسر غير مُعدّ — تواصل مع مدير النظام لإعداد رابط الجسر الخاص",
                )

        # Calculate cost and profit
        commission_rate = operator_config.get("commission", 0) / 100
        profit = recharge.amount * commission_rate
        cost = recharge.amount - profit

        # Get customer name
        customer_name = "عميل نقدي"
        if recharge.customer_id:
            customer = await db.customers.find_one({"id": recharge.customer_id}, {"_id": 0, "name": 1})
            if customer:
                customer_name = customer["name"]

        # Generate USSD code
        ussd_template = operator_config["ussd"].get(recharge.recharge_type, "")
        ussd_code = ussd_template.replace("{phone}", recharge.phone_number).replace("{amount}", str(int(recharge.amount)))

        # Generate recharge operation code (RE00001/YY)
        from services.code_generator import generate_code
        recharge_code = await generate_code(db, "recharges", "RE", 5, with_year=True)

        # Debit the platform wallet by the recharge cost — blocks (HTTP 400) if balance is insufficient.
        from services.wallet_service import debit_wallet, credit_wallet
        entity_id = user.get("tenant_id") or user.get("id", "")
        wallet_txn_id = str(uuid.uuid4())  # generate txn id so we can store it on the task
        await debit_wallet(
            main_db, entity_id, cost, "recharge", wallet_txn_id,
            f"شحن {operator_config['name']} - {recharge.phone_number} ({recharge_code})",
            user.get("name", ""),
        )

        bridge_task_id = str(uuid.uuid4())
        txn_record_id = str(uuid.uuid4())
        recharge_doc = {
            "id": recharge_id,
            "code": recharge_code,
            "operator": recharge.operator,
            "operator_name": operator_config["name"],
            "phone_number": recharge.phone_number,
            "amount": recharge.amount,
            "recharge_type": recharge.recharge_type,
            "cost": cost,
            "profit": profit,
            "customer_id": recharge.customer_id or "",
            "customer_name": customer_name,
            "payment_method": recharge.payment_method,
            "status": "pending",
            "ussd_code": ussd_code,
            "bridge_task_id": bridge_task_id,
            "wallet_txn_id": wallet_txn_id,  # stored for reliable refund correlation
            "entity_id": entity_id,           # stored so bridge result handler can refund without extra query
            "notes": recharge.notes or "",
            "created_at": now,
            "created_by": user["name"],
        }

        # --- Compensating saga: rollback ALL side-effects on any failure ---
        recharge_inserted = False
        cashbox_updated = False
        txn_inserted = False
        bridge_task_inserted = False
        try:
            await db.recharges.insert_one(recharge_doc)
            recharge_inserted = True

            # Update cash box (customer paid regardless of bridge outcome)
            await db.cash_boxes.update_one(
                {"id": recharge.payment_method},
                {"$inc": {"balance": recharge.amount}, "$set": {"updated_at": now}}
            )
            cashbox_updated = True

            # Record transaction
            await db.transactions.insert_one({
                "id": txn_record_id,
                "cash_box_id": recharge.payment_method,
                "type": "income",
                "amount": recharge.amount,
                "description": f"شحن {operator_config['name']} - {recharge.phone_number}",
                "reference_type": "recharge",
                "reference_id": recharge_id,
                "created_at": now,
                "created_by": user["name"],
            })
            txn_inserted = True

            # --- Dispatch bridge task based on recharge_mode ---
            bridge_task_doc = {
                "id": bridge_task_id,
                "recharge_id": recharge_id,
                "wallet_txn_id": wallet_txn_id,
                "entity_id": entity_id,
                "operator": recharge.operator,
                "operator_name": operator_config["name"],
                "phone_number": recharge.phone_number,
                "amount": recharge.amount,
                "recharge_type": recharge.recharge_type,
                "ussd_code": ussd_code,
                "status": "pending",
                "dispatched_via": "direct" if recharge_mode == "self_bridge" else "queue",
                "created_at": now,
                "updated_at": now,
                "result_message": "",
            }
            await db.mobile_recharge_tasks.insert_one(bridge_task_doc)
            bridge_task_inserted = True

            if recharge_mode == "self_bridge":
                # SELF_BRIDGE: push task directly to tenant's local bridge HTTP endpoint.
                # The bridge processes the task and reports result via PATCH /bridge/tasks/{id}/result.
                _assert_safe_bridge_url(self_bridge_url)
                dispatch_url = self_bridge_url.rstrip("/") + "/tasks"
                dispatch_payload = {k: v for k, v in bridge_task_doc.items() if k != "_id"}
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        push_resp = await client.post(
                            dispatch_url,
                            json=dispatch_payload,
                            headers={"X-Api-Key": self_bridge_api_key} if self_bridge_api_key else {},
                        )
                    if push_resp.status_code >= 400:
                        raise RuntimeError(f"bridge rejected task: HTTP {push_resp.status_code}")
                except Exception as bridge_exc:
                    # Bridge unreachable — raise so the saga rolls back wallet + DB records
                    raise HTTPException(
                        status_code=503,
                        detail=f"تعذّر إرسال المهمة إلى الجسر المحلي — تحقق من تشغيل الجسر: {bridge_exc}",
                    )
            # OWNER_BRIDGE: task already in DB; platform owner's bridge polls and picks it up.
        except Exception as e:
            logger.exception("Recharge creation saga failed for %s — rolling back", recharge_id)
            # Reverse in reverse order — best-effort, log failures
            if bridge_task_inserted:
                try:
                    await db.mobile_recharge_tasks.delete_one({"id": bridge_task_id})
                except Exception:
                    logger.exception("Rollback: failed to delete bridge task %s", bridge_task_id)
            if txn_inserted:
                try:
                    await db.transactions.delete_one({"id": txn_record_id})
                except Exception:
                    logger.exception("Rollback: failed to delete transaction %s", txn_record_id)
            if cashbox_updated:
                try:
                    await db.cash_boxes.update_one(
                        {"id": recharge.payment_method},
                        {"$inc": {"balance": -recharge.amount}, "$set": {"updated_at": now}},
                    )
                except Exception:
                    logger.exception("Rollback: failed to reverse cash_box for recharge %s", recharge_id)
            if recharge_inserted:
                try:
                    await db.recharges.delete_one({"id": recharge_id})
                except Exception:
                    logger.exception("Rollback: failed to delete recharge %s", recharge_id)
            try:
                await credit_wallet(
                    main_db, entity_id, cost, "recharge_refund", wallet_txn_id,
                    f"استرجاع شحن فاشل {recharge_code}", user.get("name", ""),
                )
            except Exception:
                logger.exception("Rollback: failed to compensate wallet for recharge %s", recharge_id)
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail="فشل تسجيل عملية الشحن") from e

        return RechargeResponse(**recharge_doc)

    @router.get("/recharge", response_model=List[RechargeResponse])
    async def get_recharges(
        operator: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user: dict = Depends(require_tenant)
    ):
        """Get recharge history"""
        query = {}
        if operator:
            query["operator"] = operator
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date
            else:
                query["created_at"] = {"$lte": end_date}

        recharges = await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return [RechargeResponse(**r) for r in recharges]

    @router.get("/recharge/stats")
    async def get_recharge_stats(days: int = 30, admin: dict = Depends(get_tenant_admin)):
        """Get recharge statistics"""
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

        # Total by operator
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": "$operator",
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"},
                "total_profit": {"$sum": "$profit"}
            }}
        ]
        by_operator = await db.recharges.aggregate(pipeline).to_list(10)

        # Today's stats
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_stats = await db.recharges.aggregate([
            {"$match": {"created_at": {"$gte": today}}},
            {"$group": {
                "_id": None,
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"},
                "total_profit": {"$sum": "$profit"}
            }}
        ]).to_list(1)

        return {
            "by_operator": by_operator,
            "today": today_stats[0] if today_stats else {"count": 0, "total_amount": 0, "total_profit": 0},
            "period_days": days
        }

    # ============ ALGERIA WILAYAS (for delivery) ============

    ALGERIA_WILAYAS = {
        "01": {"name_ar": "أدرار", "name_en": "Adrar", "desk_fee": 600, "home_fee": 800},
        "02": {"name_ar": "الشلف", "name_en": "Chlef", "desk_fee": 400, "home_fee": 600},
        "03": {"name_ar": "الأغواط", "name_en": "Laghouat", "desk_fee": 500, "home_fee": 700},
        "04": {"name_ar": "أم البواقي", "name_en": "Oum El Bouaghi", "desk_fee": 450, "home_fee": 650},
        "05": {"name_ar": "باتنة", "name_en": "Batna", "desk_fee": 400, "home_fee": 600},
        "06": {"name_ar": "بجاية", "name_en": "Béjaïa", "desk_fee": 400, "home_fee": 600},
        "07": {"name_ar": "بسكرة", "name_en": "Biskra", "desk_fee": 450, "home_fee": 650},
        "08": {"name_ar": "بشار", "name_en": "Béchar", "desk_fee": 600, "home_fee": 800},
        "09": {"name_ar": "البليدة", "name_en": "Blida", "desk_fee": 300, "home_fee": 450},
        "10": {"name_ar": "البويرة", "name_en": "Bouira", "desk_fee": 350, "home_fee": 500},
        "11": {"name_ar": "تمنراست", "name_en": "Tamanrasset", "desk_fee": 800, "home_fee": 1000},
        "12": {"name_ar": "تبسة", "name_en": "Tébessa", "desk_fee": 500, "home_fee": 700},
        "13": {"name_ar": "تلمسان", "name_en": "Tlemcen", "desk_fee": 500, "home_fee": 700},
        "14": {"name_ar": "تيارت", "name_en": "Tiaret", "desk_fee": 450, "home_fee": 650},
        "15": {"name_ar": "تيزي وزو", "name_en": "Tizi Ouzou", "desk_fee": 350, "home_fee": 500},
        "16": {"name_ar": "الجزائر", "name_en": "Algiers", "desk_fee": 250, "home_fee": 400},
        "17": {"name_ar": "الجلفة", "name_en": "Djelfa", "desk_fee": 450, "home_fee": 650},
        "18": {"name_ar": "جيجل", "name_en": "Jijel", "desk_fee": 400, "home_fee": 600},
        "19": {"name_ar": "سطيف", "name_en": "Sétif", "desk_fee": 350, "home_fee": 500},
        "20": {"name_ar": "سعيدة", "name_en": "Saïda", "desk_fee": 500, "home_fee": 700},
        "21": {"name_ar": "سكيكدة", "name_en": "Skikda", "desk_fee": 400, "home_fee": 600},
        "22": {"name_ar": "سيدي بلعباس", "name_en": "Sidi Bel Abbès", "desk_fee": 500, "home_fee": 700},
        "23": {"name_ar": "عنابة", "name_en": "Annaba", "desk_fee": 400, "home_fee": 600},
        "24": {"name_ar": "قالمة", "name_en": "Guelma", "desk_fee": 450, "home_fee": 650},
        "25": {"name_ar": "قسنطينة", "name_en": "Constantine", "desk_fee": 350, "home_fee": 500},
        "26": {"name_ar": "المدية", "name_en": "Médéa", "desk_fee": 350, "home_fee": 500},
        "27": {"name_ar": "مستغانم", "name_en": "Mostaganem", "desk_fee": 450, "home_fee": 650},
        "28": {"name_ar": "المسيلة", "name_en": "M'sila", "desk_fee": 400, "home_fee": 600},
        "29": {"name_ar": "معسكر", "name_en": "Mascara", "desk_fee": 450, "home_fee": 650},
        "30": {"name_ar": "ورقلة", "name_en": "Ouargla", "desk_fee": 600, "home_fee": 800},
        "31": {"name_ar": "وهران", "name_en": "Oran", "desk_fee": 400, "home_fee": 600},
        "32": {"name_ar": "البيض", "name_en": "El Bayadh", "desk_fee": 600, "home_fee": 800},
        "33": {"name_ar": "إليزي", "name_en": "Illizi", "desk_fee": 900, "home_fee": 1100},
        "34": {"name_ar": "برج بوعريريج", "name_en": "Bordj Bou Arréridj", "desk_fee": 350, "home_fee": 500},
        "35": {"name_ar": "بومرداس", "name_en": "Boumerdès", "desk_fee": 300, "home_fee": 450},
        "36": {"name_ar": "الطارف", "name_en": "El Tarf", "desk_fee": 450, "home_fee": 650},
        "37": {"name_ar": "تندوف", "name_en": "Tindouf", "desk_fee": 900, "home_fee": 1100},
        "38": {"name_ar": "تيسمسيلت", "name_en": "Tissemsilt", "desk_fee": 450, "home_fee": 650},
        "39": {"name_ar": "الوادي", "name_en": "El Oued", "desk_fee": 550, "home_fee": 750},
        "40": {"name_ar": "خنشلة", "name_en": "Khenchela", "desk_fee": 500, "home_fee": 700},
        "41": {"name_ar": "سوق أهراس", "name_en": "Souk Ahras", "desk_fee": 500, "home_fee": 700},
        "42": {"name_ar": "تيبازة", "name_en": "Tipaza", "desk_fee": 300, "home_fee": 450},
        "43": {"name_ar": "ميلة", "name_en": "Mila", "desk_fee": 400, "home_fee": 600},
        "44": {"name_ar": "عين الدفلى", "name_en": "Aïn Defla", "desk_fee": 350, "home_fee": 500},
        "45": {"name_ar": "النعامة", "name_en": "Naâma", "desk_fee": 600, "home_fee": 800},
        "46": {"name_ar": "عين تموشنت", "name_en": "Aïn Témouchent", "desk_fee": 500, "home_fee": 700},
        "47": {"name_ar": "غرداية", "name_en": "Ghardaïa", "desk_fee": 550, "home_fee": 750},
        "48": {"name_ar": "غليزان", "name_en": "Relizane", "desk_fee": 450, "home_fee": 650},
        "49": {"name_ar": "تيميمون", "name_en": "Timimoun", "desk_fee": 800, "home_fee": 1000},
        "50": {"name_ar": "برج باجي مختار", "name_en": "Bordj Badji Mokhtar", "desk_fee": 900, "home_fee": 1100},
        "51": {"name_ar": "أولاد جلال", "name_en": "Ouled Djellal", "desk_fee": 500, "home_fee": 700},
        "52": {"name_ar": "بني عباس", "name_en": "Béni Abbès", "desk_fee": 700, "home_fee": 900},
        "53": {"name_ar": "عين صالح", "name_en": "In Salah", "desk_fee": 800, "home_fee": 1000},
        "54": {"name_ar": "عين قزام", "name_en": "In Guezzam", "desk_fee": 900, "home_fee": 1100},
        "55": {"name_ar": "توقرت", "name_en": "Touggourt", "desk_fee": 550, "home_fee": 750},
        "56": {"name_ar": "جانت", "name_en": "Djanet", "desk_fee": 900, "home_fee": 1100},
        "57": {"name_ar": "المغير", "name_en": "El M'Ghair", "desk_fee": 550, "home_fee": 750},
        "58": {"name_ar": "المنيعة", "name_en": "El Meniaa", "desk_fee": 650, "home_fee": 850}
    }

    @router.get("/delivery/wilayas")
    async def get_wilayas():
        """Get all Algerian wilayas with delivery fees"""
        result = []
        for code, data in ALGERIA_WILAYAS.items():
            result.append({
                "code": code,
                "name_ar": data["name_ar"],
                "name_en": data["name_en"],
                "desk_fee": data["desk_fee"],
                "home_fee": data["home_fee"]
            })
        return sorted(result, key=lambda x: x["code"])

    @router.get("/delivery/fee")
    async def get_delivery_fee(wilaya_code: str, delivery_type: str = "desk"):
        """Calculate delivery fee for a wilaya"""
        if wilaya_code not in ALGERIA_WILAYAS:
            raise HTTPException(status_code=404, detail="Wilaya not found")

        wilaya = ALGERIA_WILAYAS[wilaya_code]
        fee = wilaya["home_fee"] if delivery_type == "home" else wilaya["desk_fee"]

        return {
            "wilaya_code": wilaya_code,
            "wilaya_name_ar": wilaya["name_ar"],
            "wilaya_name_en": wilaya["name_en"],
            "delivery_type": delivery_type,
            "fee": fee
        }

    # ============ SYSTEM SETTINGS ============

    class SystemSettingsUpdate(BaseModel):
        cash_difference_threshold: float = 1000  # حد التنبيه للعجز/الفائض
        low_stock_threshold: int = 10  # حد المخزون المنخفض
        currency_symbol: str = "دج"
        business_name: str = "NT"

    DEFAULT_SYSTEM_SETTINGS = {
        "id": "global",
        "cash_difference_threshold": 1000,
        "low_stock_threshold": 10,
        "currency_symbol": "دج",
        "business_name": "NT"
    }

    @router.get("/system/settings")
    async def get_system_settings(user: dict = Depends(require_tenant)):
        """Get system settings"""
        settings = await db.system_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = {**DEFAULT_SYSTEM_SETTINGS}
            await db.system_settings.insert_one(settings)
        else:
            settings = {k: v for k, v in settings.items() if k != "_id"}
        return settings

    @router.put("/system/settings")
    async def update_system_settings(settings: SystemSettingsUpdate, admin: dict = Depends(get_tenant_admin)):
        """Update system settings (admin only)"""
        update_data = settings.model_dump()

        existing = await db.system_settings.find_one({"id": "global"})
        if existing:
            await db.system_settings.update_one(
                {"id": "global"},
                {"$set": update_data}
            )
        else:
            await db.system_settings.insert_one({**update_data, "id": "global"})

        return {"message": "تم تحديث الإعدادات بنجاح"}

    # ============ SIM BALANCE MANAGEMENT ============

    class SimSlotBalance(BaseModel):
        slot_id: int  # 1 أو 2
        operator: str  # موبيليس، جازي، أوريدو
        phone: str
        balance: float = 0
        last_updated: str = ""

    class SimBalanceUpdate(BaseModel):
        balance: float
        notes: Optional[str] = ""

    @router.get("/sim/slots")
    async def get_sim_slots(admin: dict = Depends(get_tenant_admin)):
        """Get all SIM slots with their balances"""
        slots = await db.sim_slots.find({}, {"_id": 0}).to_list(10)
        if not slots:
            # Create default slots
            default_slots = [
                {"slot_id": 1, "operator": "موبيليس", "phone": "", "balance": 0, "last_updated": "", "prefix": "06"},
                {"slot_id": 2, "operator": "جازي", "phone": "", "balance": 0, "last_updated": "", "prefix": "07"},
                {"slot_id": 3, "operator": "أوريدو", "phone": "", "balance": 0, "last_updated": "", "prefix": "05"}
            ]
            await db.sim_slots.insert_many(default_slots)
            slots = await db.sim_slots.find({}, {"_id": 0}).to_list(10)
        return slots

    @router.put("/sim/slots/{slot_id}")
    async def update_sim_slot(slot_id: int, slot_data: dict, admin: dict = Depends(get_tenant_admin)):
        """Update SIM slot info"""
        now = datetime.now(timezone.utc).isoformat()
        update_data = {**slot_data, "last_updated": now}

        await db.sim_slots.update_one(
            {"slot_id": slot_id},
            {"$set": update_data},
            upsert=True
        )
        return {"message": "تم تحديث الشريحة بنجاح"}

    @router.put("/sim/slots/{slot_id}/balance")
    async def update_sim_balance(slot_id: int, balance_data: SimBalanceUpdate, admin: dict = Depends(get_tenant_admin)):
        """Update SIM slot balance"""
        now = datetime.now(timezone.utc).isoformat()

        # Get current slot
        slot = await db.sim_slots.find_one({"slot_id": slot_id})
        old_balance = slot.get("balance", 0) if slot else 0

        await db.sim_slots.update_one(
            {"slot_id": slot_id},
            {"$set": {"balance": balance_data.balance, "last_updated": now}}
        )

        # Log the balance change
        log_entry = {
            "id": str(uuid.uuid4()),
            "slot_id": slot_id,
            "old_balance": old_balance,
            "new_balance": balance_data.balance,
            "change": balance_data.balance - old_balance,
            "notes": balance_data.notes or "",
            "created_at": now,
            "created_by": admin.get("name", "")
        }
        await db.sim_balance_logs.insert_one(log_entry)

        return {"message": "تم تحديث الرصيد بنجاح"}

    @router.get("/sim/slots/{slot_id}/logs")
    async def get_sim_balance_logs(slot_id: int, admin: dict = Depends(get_tenant_admin)):
        """Get balance change history for a SIM slot"""
        logs = await db.sim_balance_logs.find({"slot_id": slot_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return logs

    # ============ AUTO RECHARGE BY OPERATOR ============

    @router.post("/recharge/auto")
    async def auto_recharge(phone: str, amount: float, user: dict = Depends(require_tenant)):
        """Auto-select SIM slot based on phone number prefix"""

        # Clean phone number
        clean_phone = phone.replace(" ", "").replace("-", "")
        if clean_phone.startswith("+213"):
            clean_phone = "0" + clean_phone[4:]
        elif clean_phone.startswith("213"):
            clean_phone = "0" + clean_phone[3:]

        # Determine operator by prefix
        prefix = clean_phone[:2] if len(clean_phone) >= 2 else ""

        operator_map = {
            "06": {"name": "موبيليس", "name_fr": "Mobilis"},
            "07": {"name": "جازي", "name_fr": "Djezzy"},
            "05": {"name": "أوريدو", "name_fr": "Ooredoo"}
        }

        if prefix not in operator_map:
            raise HTTPException(status_code=400, detail="رقم هاتف غير صالح. يجب أن يبدأ بـ 05, 06, أو 07")

        operator = operator_map[prefix]

        # Find the appropriate SIM slot
        slot = await db.sim_slots.find_one({"prefix": prefix}, {"_id": 0})

        if not slot or not slot.get("phone"):
            raise HTTPException(status_code=400, detail=f"شريحة {operator['name']} غير مفعلة")

        if slot.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail=f"رصيد شريحة {operator['name']} غير كافي")

        # Log the recharge (MOCKED)
        now = datetime.now(timezone.utc).isoformat()
        recharge_log = {
            "id": str(uuid.uuid4()),
            "phone": clean_phone,
            "amount": amount,
            "operator": operator["name"],
            "slot_id": slot["slot_id"],
            "status": "success",  # MOCKED
            "created_at": now,
            "created_by": user.get("name", "")
        }
        await db.recharge_logs.insert_one(recharge_log)

        # Deduct from SIM balance
        await db.sim_slots.update_one(
            {"slot_id": slot["slot_id"]},
            {"$inc": {"balance": -amount}, "$set": {"last_updated": now}}
        )

        return {
            "success": True,
            "phone": clean_phone,
            "amount": amount,
            "operator": operator["name"],
            "message": f"تم شحن {amount} دج لـ {clean_phone} عبر {operator['name']}"
        }

    # ============ BRIDGE API ============

    @router.get("/recharge/bridge/status")
    async def bridge_status(tenant_db=Depends(verify_bridge)):
        """Bridge heartbeat — updates last_seen and returns pending task count.
        Uses tenant_db returned by verify_bridge (correctly resolved from X-Tenant-ID).
        """
        now = datetime.now(timezone.utc).isoformat()
        await tenant_db.settings.update_one(
            {"key": "bridge_last_seen"},
            {"$set": {"key": "bridge_last_seen", "value": now}},
            upsert=True,
        )
        pending = await tenant_db.mobile_recharge_tasks.count_documents({"status": "pending"})
        return {"ok": True, "pending_tasks": pending, "server_time": now}

    @router.get("/recharge/bridge/tasks")
    async def bridge_get_tasks(tenant_db=Depends(verify_bridge)):
        """Return pending bridge tasks and atomically claim them (mark as processing).
        Claim semantics prevent duplicate USSD dispatch by concurrent bridge workers.
        Also carries the check_balances flag set by POST /recharge/bridge/check-balances.
        The flag is atomically cleared on read so the bridge only runs one extra check.
        """
        now = datetime.now(timezone.utc).isoformat()
        # Fetch up to 50 pending tasks
        tasks = await tenant_db.mobile_recharge_tasks.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", 1).to_list(50)
        if tasks:
            task_ids = [t["id"] for t in tasks]
            # Atomically move claimed tasks to "processing"
            await tenant_db.mobile_recharge_tasks.update_many(
                {"id": {"$in": task_ids}, "status": "pending"},
                {"$set": {"status": "processing", "updated_at": now}},
            )
            for t in tasks:
                t["status"] = "processing"

        # Atomically read-and-clear the on-demand balance-check flag
        flag_doc = await tenant_db.settings.find_one_and_update(
            {"key": "balance_check_requested", "value": True},
            {"$set": {"value": False}},
        )
        check_balances = flag_doc is not None

        return {"tasks": tasks, "check_balances": check_balances}

    # ── Admin: request an on-demand SIM balance check ─────────────────────────
    @router.post("/recharge/bridge/check-balances")
    async def request_balance_check(admin: dict = Depends(get_tenant_admin)):
        """Set a one-shot flag that tells the bridge to run a balance check on its
        next poll cycle.  The flag is atomically cleared by GET /bridge/tasks."""
        await db.settings.update_one(
            {"key": "balance_check_requested"},
            {"$set": {"key": "balance_check_requested", "value": True}},
            upsert=True,
        )
        return {"ok": True}

    # ── Tenant admin: read their self-bridge config ───────────────────────────
    @router.get("/settings/bridge-config")
    async def get_bridge_config(user: dict = Depends(get_tenant_admin)):
        """Return the current tenant's bridge mode and URLs (tenant-readable fields)."""
        entity_id = user.get("tenant_id") or user.get("id", "")
        tenant_doc = None
        if entity_id and main_db is not None:
            tenant_doc = await main_db.saas_tenants.find_one(
                {"id": entity_id},
                {"_id": 0, "recharge_mode": 1, "self_bridge_url": 1, "self_bridge_api_key": 1},
            )
        if not tenant_doc:
            return {"recharge_mode": "owner_bridge", "self_bridge_url": "", "self_bridge_api_key": ""}
        return {
            "recharge_mode": tenant_doc.get("recharge_mode", "owner_bridge"),
            "self_bridge_url": tenant_doc.get("self_bridge_url", ""),
            "self_bridge_api_key": tenant_doc.get("self_bridge_api_key", ""),
        }

    # ── Tenant admin: update their own self-bridge URL / API key ──────────────
    @router.put("/settings/bridge-config")
    async def update_bridge_config(body: dict, user: dict = Depends(get_tenant_admin)):
        """Tenant admin: update self_bridge_url / self_bridge_api_key in main_db.
        Allowed only when the tenant is already in self_bridge mode."""
        entity_id = user.get("tenant_id") or user.get("id", "")
        if not entity_id or main_db is None:
            raise HTTPException(status_code=400, detail="بيانات المشترك غير متاحة")

        tenant_doc = await main_db.saas_tenants.find_one(
            {"id": entity_id},
            {"_id": 0, "recharge_mode": 1},
        )
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="بيانات المشترك غير موجودة")
        if tenant_doc.get("recharge_mode") != "self_bridge":
            raise HTTPException(status_code=403, detail="هذا الإعداد متاح فقط في وضع الجسر الذاتي")

        update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if "self_bridge_url" in body:
            update["self_bridge_url"] = body["self_bridge_url"] or ""
        if "self_bridge_api_key" in body:
            update["self_bridge_api_key"] = body["self_bridge_api_key"] or ""

        await main_db.saas_tenants.update_one({"id": entity_id}, {"$set": update})
        return {"ok": True}

    # ── Tenant admin: test their own self-bridge connectivity ─────────────────
    @router.post("/settings/test-bridge")
    async def tenant_test_bridge(user: dict = Depends(get_tenant_admin)):
        """Tenant admin: ping the configured self_bridge_url/health endpoint."""
        entity_id = user.get("tenant_id") or user.get("id", "")
        tenant_doc = None
        if entity_id and main_db is not None:
            tenant_doc = await main_db.saas_tenants.find_one(
                {"id": entity_id},
                {"_id": 0, "recharge_mode": 1, "self_bridge_url": 1, "self_bridge_api_key": 1},
            )
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="بيانات المشترك غير موجودة")
        if tenant_doc.get("recharge_mode") != "self_bridge":
            raise HTTPException(status_code=400, detail="هذا المشترك لا يستخدم وضع الجسر الذاتي")

        bridge_url = (tenant_doc.get("self_bridge_url") or "").rstrip("/")
        bridge_api_key = tenant_doc.get("self_bridge_api_key", "")
        if not bridge_url:
            raise HTTPException(status_code=400, detail="لم يُعدَّ رابط الجسر بعد")
        _assert_safe_bridge_url(bridge_url)

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"{bridge_url}/health",
                    headers={"X-Api-Key": bridge_api_key} if bridge_api_key else {},
                )
            return {"ok": resp.status_code < 400, "status_code": resp.status_code}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    TERMINAL_STATUSES = {"success", "failed"}

    class BridgeTaskResult(BaseModel):
        status: Literal["success", "failed"]
        result_message: str = ""

    @router.patch("/recharge/bridge/tasks/{task_id}/result")
    async def bridge_report_result(
        task_id: str,
        body: BridgeTaskResult,
        tenant_db=Depends(verify_bridge),
    ):
        """Bridge reports the outcome of a recharge task.
        Idempotent: calling again with the same terminal status returns early.
        Uses tenant_db from verify_bridge — not the JWT-ContextVar proxy.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Atomically transition from non-terminal → terminal (prevents duplicate processing)
        update_result = await tenant_db.mobile_recharge_tasks.find_one_and_update(
            {"id": task_id, "status": {"$nin": list(TERMINAL_STATUSES)}},
            {"$set": {"status": body.status, "result_message": body.result_message, "updated_at": now}},
            return_document=False,
        )
        if update_result is None:
            # Either task not found, or already in a terminal state — safe to return idempotently
            task_doc = await tenant_db.mobile_recharge_tasks.find_one({"id": task_id}, {"_id": 0})
            if task_doc is None:
                raise HTTPException(status_code=404, detail="مهمة الجسر غير موجودة")
            return {"ok": True, "task_id": task_id, "status": task_doc.get("status"), "idempotent": True}

        # update_result is the OLD doc (return_document=False)
        task_doc = update_result or {}

        recharge_id = task_doc.get("recharge_id", "")
        recharge = await tenant_db.recharges.find_one({"id": recharge_id}, {"_id": 0}) if recharge_id else None

        # Update recharge record
        if recharge:
            await tenant_db.recharges.update_one(
                {"id": recharge_id},
                {"$set": {"status": body.status, "result_message": body.result_message, "updated_at": now}},
            )

        # If failed → compensate tenant wallet (credit back cost) — only once, guarded above
        if body.status == "failed" and recharge:
            from services.wallet_service import credit_wallet
            # entity_id and wallet_txn_id stored on recharge doc at creation time (reliable)
            entity_id = recharge.get("entity_id", "") or task_doc.get("entity_id", "")
            wallet_txn_id = recharge.get("wallet_txn_id", "") or task_doc.get("wallet_txn_id", recharge_id)
            cost = recharge.get("cost", 0)
            if cost > 0 and entity_id:
                try:
                    await credit_wallet(
                        main_db, entity_id, cost, "recharge_refund", wallet_txn_id,
                        f"استرجاع شحن فاشل {recharge.get('code', recharge_id)}", "bridge",
                    )
                except Exception:
                    logger.exception("Bridge: failed to compensate wallet for recharge %s", recharge_id)

        return {"ok": True, "task_id": task_id, "status": body.status}

    # Bridge secret management (admin)
    @router.get("/recharge/bridge/secret")
    async def get_bridge_secret_value(admin: dict = Depends(get_tenant_admin)):
        doc = await db.settings.find_one({"key": "bridge_secret"}, {"_id": 0})
        return {"secret": doc.get("value", "") if doc else ""}

    class BridgeSecretUpdate(BaseModel):
        secret: str

    @router.put("/recharge/bridge/secret")
    async def set_bridge_secret(body: BridgeSecretUpdate, admin: dict = Depends(get_tenant_admin)):
        if not body.secret or len(body.secret) < 16:
            raise HTTPException(status_code=400, detail="يجب أن لا يقل الـ secret عن 16 حرفاً")
        await db.settings.update_one(
            {"key": "bridge_secret"},
            {"$set": {"key": "bridge_secret", "value": body.secret}},
            upsert=True,
        )
        return {"ok": True}

    # Bridge: update SIM slot balance (called by local bridge after balance USSD)
    class BridgeSimBalance(BaseModel):
        balance_text: str = ""
        balance: float = 0.0

    @router.patch("/recharge/bridge/sim/{slot_id}/balance")
    async def bridge_update_sim_balance(
        slot_id: int,
        body: BridgeSimBalance,
        tenant_db=Depends(verify_bridge),
    ):
        """Bridge reports SIM slot balance after a balance-check USSD.
        Auth via bridge secret — no admin JWT required.
        """
        now = datetime.now(timezone.utc).isoformat()
        await tenant_db.sim_slots.update_one(
            {"slot_id": slot_id},
            {"$set": {
                "balance": body.balance,
                "balance_text": body.balance_text,
                "last_updated": now,
            }},
            upsert=True,
        )
        return {"ok": True, "slot_id": slot_id, "balance": body.balance}

    # Tenant-accessible bridge ping — any authenticated user can check bridge status
    # Used by POS tab for non-admin users to display the offline warning banner.
    @router.get("/recharge/bridge/ping")
    async def bridge_ping(user: dict = Depends(require_tenant)):
        """Lightweight bridge connectivity status — accessible to all tenant users.
        Returns only last_seen and is_online; no sensitive config exposed.
        """
        doc = await db.settings.find_one({"key": "bridge_last_seen"}, {"_id": 0})
        last_seen = doc.get("value") if doc else None
        is_online = False
        if last_seen:
            from datetime import datetime, timezone, timedelta
            try:
                ts = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                is_online = (datetime.now(timezone.utc) - ts) < timedelta(seconds=60)
            except Exception:
                pass
        return {"last_seen": last_seen, "pending_tasks": None, "is_online": is_online}

    # Admin: view bridge last seen
    @router.get("/recharge/bridge/last-seen")
    async def bridge_last_seen(admin: dict = Depends(get_tenant_admin)):
        doc = await db.settings.find_one({"key": "bridge_last_seen"}, {"_id": 0})
        pending = await db.mobile_recharge_tasks.count_documents({"status": "pending"})
        return {
            "last_seen": doc.get("value") if doc else None,
            "pending_tasks": pending,
        }

    # Recharge status poll (note: placed after all /recharge/bridge/* to avoid path conflict)
    @router.get("/recharges/{recharge_id}/status")
    async def get_recharge_status(recharge_id: str, user: dict = Depends(require_tenant)):
        """Poll the status of a single recharge (pending/completed/failed)."""
        doc = await db.recharges.find_one({"id": recharge_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="عملية الشحن غير موجودة")
        return {"id": doc["id"], "status": doc.get("status", "pending"),
                "result_message": doc.get("result_message", "")}

    # ============ IDOOM CODE INVENTORY ============

    class IdoomCodeSell(BaseModel):
        denomination: float
        payment_method: str = "cash"
        customer_id: Optional[str] = None
        notes: Optional[str] = ""

    @router.get("/idoom/codes/stats")
    async def idoom_codes_stats(admin: dict = Depends(get_tenant_admin)):
        pipeline = [
            {"$group": {
                "_id": {"denomination": "$denomination", "status": "$status"},
                "count": {"$sum": 1},
            }}
        ]
        rows = await db.idoom_codes.aggregate(pipeline).to_list(100)
        result: dict = {}
        for row in rows:
            denom = str(row["_id"]["denomination"])
            status = row["_id"]["status"]
            if denom not in result:
                result[denom] = {"denomination": row["_id"]["denomination"], "available": 0, "sold": 0}
            result[denom][status] = row["count"]
        total_available = await db.idoom_codes.count_documents({"status": "available"})
        total_sold = await db.idoom_codes.count_documents({"status": "sold"})
        return {"by_denomination": list(result.values()), "total_available": total_available, "total_sold": total_sold}

    @router.get("/idoom/codes")
    async def list_idoom_codes(
        status: Optional[str] = None,
        denomination: Optional[float] = None,
        skip: int = 0,
        limit: int = 50,
        admin: dict = Depends(get_tenant_admin),
    ):
        query: dict = {}
        if status:
            query["status"] = status
        if denomination is not None:
            query["denomination"] = denomination
        docs = await db.idoom_codes.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await db.idoom_codes.count_documents(query)
        return {"items": docs, "total": total}

    @router.post("/idoom/codes/bulk")
    async def idoom_bulk_upload(file: UploadFile = File(...), admin: dict = Depends(get_tenant_admin)):
        """Upload a CSV file with columns: code,denomination to add to inventory."""
        content = await file.read()
        try:
            text = content.decode("utf-8-sig")
        except Exception:
            text = content.decode("latin-1")
        reader = csv.DictReader(io.StringIO(text))
        now = datetime.now(timezone.utc).isoformat()
        inserted = 0
        duplicates = 0
        errors = []
        for i, row in enumerate(reader):
            code = (row.get("code") or row.get("Code") or "").strip()
            denom_raw = (row.get("denomination") or row.get("Denomination") or row.get("prix") or "").strip()
            if not code:
                errors.append(f"صف {i+2}: كود فارغ")
                continue
            try:
                denomination = float(denom_raw)
            except (ValueError, TypeError):
                errors.append(f"صف {i+2}: قيمة غير صالحة '{denom_raw}'")
                continue
            existing = await db.idoom_codes.find_one({"code": code})
            if existing:
                duplicates += 1
                continue
            await db.idoom_codes.insert_one({
                "id": str(uuid.uuid4()),
                "code": code,
                "denomination": denomination,
                "status": "available",
                "created_at": now,
                "added_by": admin.get("name", ""),
                "sold_at": None,
                "sold_txn_id": None,
                "customer_id": None,
            })
            inserted += 1
        return {"inserted": inserted, "duplicates": duplicates, "errors": errors}

    @router.post("/idoom/codes/sell")
    async def sell_idoom_code(body: IdoomCodeSell, user: dict = Depends(require_tenant)):
        """Debit wallet by denomination, mark a matching code as sold, return the code.
        Uses atomic find_one_and_update to prevent duplicate sales under concurrent requests.
        """
        from services.wallet_service import debit_wallet
        entity_id = user.get("tenant_id") or user.get("id", "")
        txn_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Atomically claim one available code (prevents race conditions)
        code_doc = await db.idoom_codes.find_one_and_update(
            {"denomination": body.denomination, "status": "available"},
            {"$set": {"status": "reserved", "sold_at": now, "sold_txn_id": txn_id,
                      "customer_id": body.customer_id or ""}},
            return_document=True,
            projection={"_id": 0},
        )
        if not code_doc:
            raise HTTPException(status_code=404, detail=f"لا توجد أكواد Idoom متاحة بقيمة {body.denomination} دج")

        try:
            await debit_wallet(
                main_db, entity_id, body.denomination, "idoom_sell", txn_id,
                f"بيع كود Idoom {body.denomination} دج", user.get("name", ""),
            )
        except Exception as debit_err:
            # Wallet debit failed — release the claimed code back to available
            await db.idoom_codes.update_one(
                {"id": code_doc["id"]},
                {"$set": {"status": "available", "sold_at": None, "sold_txn_id": None, "customer_id": None}},
            )
            raise HTTPException(status_code=402, detail=str(debit_err))

        try:
            # Confirm sale
            await db.idoom_codes.update_one(
                {"id": code_doc["id"]},
                {"$set": {"status": "sold"}},
            )
            if body.payment_method != "wallet":
                await db.cash_boxes.update_one(
                    {"id": body.payment_method},
                    {"$inc": {"balance": body.denomination}, "$set": {"updated_at": now}},
                )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "cash_box_id": body.payment_method,
                "type": "income",
                "amount": body.denomination,
                "description": f"بيع كود Idoom {body.denomination} دج",
                "reference_type": "idoom_sell",
                "reference_id": txn_id,
                "created_at": now,
                "created_by": user.get("name", ""),
            })
        except Exception as e:
            # DB logging failed after wallet was already debited — compensate + release code
            from services.wallet_service import credit_wallet
            try:
                await credit_wallet(
                    main_db, entity_id, body.denomination, "idoom_refund", txn_id,
                    f"استرجاع بيع كود Idoom فاشل", user.get("name", ""),
                )
            except Exception:
                logger.exception("Failed to compensate idoom sell for txn %s", txn_id)
            try:
                await db.idoom_codes.update_one(
                    {"id": code_doc["id"]},
                    {"$set": {"status": "available", "sold_at": None, "sold_txn_id": None, "customer_id": None}},
                )
            except Exception:
                logger.exception("Failed to release reserved idoom code %s", code_doc.get("id"))
            raise HTTPException(status_code=500, detail="فشل تسجيل عملية البيع") from e

        return {
            "ok": True,
            "code": code_doc["code"],
            "denomination": body.denomination,
            "txn_id": txn_id,
        }

    return router
