# p322: شاشات العرض (TV) — إقران بكود قصير + تحكم مركزي من واجهة المستأجر
#
# التدفق:
#   1) التلفاز يفتح /tv ← الواجهة تطلب POST /restaurant/public/screens/pair
#      ← يُنشأ كود من 6 أرقام صالح 15 دقيقة (display_pairings في قاعدة المنصة)
#   2) المدير يُدخل الكود في /screens ← POST /restaurant/screens/claim
#      ← تُنشأ الشاشة في قاعدة المستأجر (display_screens) بتوكن دائم TVS-…
#   3) التلفاز يستلم التوكن ويحفظه محلياً، ثم يستعلم GET …/screens/{token}
#      كل 10 ث لمعرفة الوضع الحالي (طلبات/قائمة/شرائح) — التغيير من لوحة
#      التحكم ينعكس على التلفاز تلقائياً، ويبقى بعد إطفائه وإعادة تشغيله
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import secrets
import uuid

PAIR_TTL_SECONDS = 15 * 60
ONLINE_SECONDS = 45
MODES = ("catalog", "slider", "orders", "menu")  # p329: catalog/slider لكل الأنشطة — orders/menu للمطاعم


def create_display_routes(db, main_db, get_tenant_db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/restaurant", tags=["display-screens"])

    def _now():
        return datetime.now(timezone.utc)

    def _aware(dt):
        """pymongo يعيد تواريخ ساذجة (UTC ضمنياً) — نوحّدها قبل أي مقارنة"""
        if dt is None:
            return None
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _screens():
        # resolve per-call: _TenantDBProxy routes via ContextVar
        return db.display_screens

    def _screen_out(s: dict) -> dict:
        s.pop("_id", None)
        s.pop("token", None)  # لا يُكشف التوكن في القوائم
        ls = _aware(s.get("last_seen"))
        s["online"] = bool(ls) and (_now() - ls) < timedelta(seconds=ONLINE_SECONDS)
        return s

    class ClaimBody(BaseModel):
        code: str

    class ScreenUpdate(BaseModel):
        name: Optional[str] = None
        mode: Optional[str] = None

    async def _find_screen_by_token(token: str):
        """-> (tenant, screen). التوكن سرّي فترتيب المسح لا يهم. يقتصر المسح
        على مستأجري وضع المطعم النشطين."""
        # p329: كل المستأجرين النشطين — الشاشات صارت لكل الأنشطة
        tenants = await main_db.saas_tenants.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1, "features_override": 1},
        ).to_list(500)
        for t in tenants:
            s = await get_tenant_db(t["id"]).display_screens.find_one({"token": token})
            if s:
                return t, s
        return None, None

    # ---------- جانب المستأجر (مصادق عليه) ----------
    @router.get("/screens")
    async def list_screens(admin: dict = Depends(get_tenant_admin)):
        out = []
        async for s in _screens().find({}).sort("created_at", 1):
            out.append(_screen_out(s))
        return out

    @router.post("/screens/claim", status_code=201)
    async def claim_screen(body: ClaimBody, admin: dict = Depends(get_tenant_admin)):
        code = (body.code or "").strip()
        if not (code.isdigit() and len(code) == 6):
            raise HTTPException(status_code=400, detail="الكود 6 أرقام")
        pending = await main_db.display_pairings.find_one({"code": code})
        if not pending or pending.get("claimed"):
            raise HTTPException(status_code=404, detail="كود غير صالح أو مستعمل")
        exp = _aware(pending.get("expires_at"))
        if exp and exp < _now():
            raise HTTPException(status_code=410, detail="انتهت صلاحية الكود — اطلب كوداً جديداً على التلفاز")
        # المستأجر الحالي من سياق المصادقة
        tenant_id = admin.get("tenant_id") or admin.get("tenant")
        doc = {
            "id": f"scr_{uuid.uuid4().hex[:12]}",
            "token": "TVS-" + secrets.token_hex(12),
            "name": "شاشة عرض",
            "mode": "catalog",  # p329: الافتراضي كتالوج عام
            "last_seen": None,
            "created_at": _now(),
            "created_by": admin.get("email") or admin.get("username"),
        }
        await _screens().insert_one(doc)
        await main_db.display_pairings.update_one(
            {"code": code},
            {"$set": {"claimed": True, "screen_token": doc["token"], "tenant_id": tenant_id}},
        )
        return _screen_out(dict(doc))

    @router.put("/screens/{screen_id}")
    async def update_screen(screen_id: str, body: ScreenUpdate, admin: dict = Depends(get_tenant_admin)):
        s = await _screens().find_one({"id": screen_id})
        if not s:
            raise HTTPException(status_code=404, detail="الشاشة غير موجودة")
        upd = {}
        if body.name is not None:
            if not body.name.strip():
                raise HTTPException(status_code=400, detail="اسم الشاشة مطلوب")
            upd["name"] = body.name.strip()
        if body.mode is not None:
            if body.mode not in MODES:
                raise HTTPException(status_code=400, detail="وضع غير صالح")
            upd["mode"] = body.mode
        if upd:
            await _screens().update_one({"id": screen_id}, {"$set": upd})
        return _screen_out(await _screens().find_one({"id": screen_id}))

    @router.delete("/screens/{screen_id}")
    async def delete_screen(screen_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await _screens().delete_one({"id": screen_id})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="الشاشة غير موجودة")
        return {"ok": True}

    # ---------- جانب التلفاز (عمومي، بلا حساب) ----------
    @router.post("/public/screens/pair", status_code=201)
    async def public_pair_request():
        # كود فريد من 6 أرقام، صالح 15 دقيقة
        for _ in range(10):
            code = f"{secrets.randbelow(1000000):06d}"
            if not await main_db.display_pairings.find_one({"code": code, "claimed": {"$ne": True}}):
                break
        doc = {
            "code": code,
            "claimed": False,
            "created_at": _now(),
            "expires_at": _now() + timedelta(seconds=PAIR_TTL_SECONDS),
        }
        await main_db.display_pairings.insert_one(doc)
        return {"code": code, "expires_in": PAIR_TTL_SECONDS}

    @router.get("/public/screens/pair/{code}")
    async def public_pair_poll(code: str):
        pending = await main_db.display_pairings.find_one(
            {"code": code}, {"_id": 0, "claimed": 1, "expires_at": 1, "screen_token": 1}
        )
        if not pending:
            raise HTTPException(status_code=404, detail="كود غير موجود")
        exp = _aware(pending.get("expires_at"))
        if exp and exp < _now() and not pending.get("claimed"):
            raise HTTPException(status_code=410, detail="انتهت الصلاحية")
        if pending.get("claimed"):
            return {"paired": True, "token": pending.get("screen_token")}
        return {"paired": False}

    @router.get("/public/screens/{token}")
    async def public_screen_config(token: str):
        t, s = await _find_screen_by_token(token)
        if not s:
            raise HTTPException(status_code=404, detail="شاشة غير موجودة")
        await get_tenant_db(t["id"]).display_screens.update_one(
            {"token": token}, {"$set": {"last_seen": _now()}}
        )
        _biz = t.get("company_name") or t.get("name") or ""
        return {
            "name": s.get("name") or "شاشة عرض",
            "mode": s.get("mode") or "catalog",
            "tenant_id": t["id"],
            "restaurant_name": _biz,   # توافق p322
            "business_name": _biz,     # p329
            "has_restaurant": bool((t.get("features_override") or {}).get("restaurant")),  # p329
        }

    # ---------- p329: لوحة كتالوج عامة لأي نشاط ----------
    @router.get("/public/catalog-board/{tenant_id}")
    async def public_catalog_board(tenant_id: str):
        """منتجات أي مستأجر نشط بأسعارها + توفر حي من المخزون — لشاشات العرض العامة."""
        t = await main_db.saas_tenants.find_one(
            {"id": tenant_id, "is_active": {"$ne": False}},
            {"_id": 0, "name": 1, "company_name": 1},
        )
        if not t:
            raise HTTPException(status_code=404, detail="غير موجود")
        tdb = get_tenant_db(tenant_id)
        fams = {
            f["id"]: (f.get("name_ar") or f.get("name") or "")
            for f in await tdb.families.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1}).to_list(500)
        }
        prods = await tdb.products.find(
            {"retail_price": {"$gt": 0}, "is_active": {"$ne": False}, "is_blocked": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1,
             "family_id": 1, "image_url": 1, "images": 1, "stock_quantity": 1, "quantity": 1,
             "is_stockable": 1},
        ).to_list(1000)
        items = []
        for p_ in prods:
            stockable = p_.get("is_stockable") is not False
            qty = p_.get("stock_quantity", p_.get("quantity")) or 0
            try:
                qty = float(qty)
            except (TypeError, ValueError):
                qty = 0
            items.append({
                "id": p_["id"],
                "name": p_.get("name_ar") or p_.get("name") or p_.get("name_en"),
                "price": p_.get("retail_price") or 0,
                "family": fams.get(p_.get("family_id")) or "",
                "image_url": p_.get("image_url"),
                "images": [i for i in (p_.get("images") or []) if i][:5],
                "available": (not stockable) or qty > 0,
                "remaining": int(qty) if stockable else None,
            })
        items.sort(key=lambda x: (x["family"], x["name"] or ""))
        return {
            "business_name": t.get("company_name") or t.get("name") or "",
            "items": items,
            "generated_at": _now().isoformat(),
        }

    return {"router": router}
