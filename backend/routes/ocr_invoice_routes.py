"""
Ocr Invoice Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List
from datetime import datetime, timezone
import uuid
import io
import logging


logger = logging.getLogger(__name__)


def create_ocr_invoice_routes(db, require_tenant, get_tenant_admin, CURRENCY, ApiKeyCreate, ApiKeyResponse, ImageOCRRequest, OCRResponse, generate_invoice_number) -> dict:
    """Create ocr invoice routes"""
    router = APIRouter()

    # ============ OCR ROUTE ============

    @router.post("/ocr/extract-models", response_model=OCRResponse)
    async def extract_models_from_image(request: ImageOCRRequest, admin: dict = Depends(get_tenant_admin)):
        from services.ai.openai_llm import llm_vision, llm_configured

        if not llm_configured():
            raise HTTPException(status_code=503, detail="خدمة OCR غير مفعّلة — يلزم ضبط مفتاح الذكاء الاصطناعي أولاً")

        try:
            response = await llm_vision(
                system_message="""You are an OCR assistant specialized in extracting phone model names from images.
                Extract all phone model names you can see in the image.
                Return ONLY the model names, one per line, without any additional text or explanation.
                Examples of model names: iPhone 15 Pro, Samsung Galaxy S24, Huawei P60 Pro, etc.""",
                user_prompt="Extract all phone model names from this image. Return only the model names, one per line.",
                image_base64=request.image_base64,
            )
            raw_text = (response or "").strip()
            models = [m.strip() for m in raw_text.split('\n') if m.strip()]

            return OCRResponse(extracted_models=models, raw_text=raw_text)

        except Exception as e:
            logger.error(f"OCR error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    # ============ INVOICE PDF ============

    @router.get("/sales/{sale_id}/invoice-pdf")
    async def get_invoice_pdf(sale_id: str, user: dict = Depends(require_tenant)):
        sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")

        # p494b: the route promises a PDF — build a real one (reportlab A4 +
        # Noto Naskh Arabic, same pattern as the restaurant/production reports)
        import os as _os
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen import canvas as _canvas
        import arabic_reshaper
        from bidi.algorithm import get_display

        font_path = _os.path.join(
            _os.path.dirname(__file__), "..", "assets", "NotoNaskhArabic-Regular.ttf"
        )
        try:
            pdfmetrics.getFont("Arabic")
        except Exception:
            pdfmetrics.registerFont(TTFont("Arabic", font_path))

        def _ar(v):
            try:
                return get_display(arabic_reshaper.reshape(str(v)))
            except Exception:
                return str(v)

        store = ""
        try:
            from config.database import main_db as _mdb

            tdoc = (
                await _mdb.saas_tenants.find_one(
                    {"id": user.get("tenant_id")},
                    {"_id": 0, "company_name": 1, "name": 1},
                )
                or {}
            )
            store = tdoc.get("company_name") or tdoc.get("name") or ""
        except Exception:
            pass

        W, H = A4
        MARGIN = 40
        buf = io.BytesIO()
        c = _canvas.Canvas(buf, pagesize=A4)
        y = [H - MARGIN]

        def _need():
            if y[0] < MARGIN + 30:
                c.showPage()
                y[0] = H - MARGIN

        def _center(txt, size=10):
            _need()
            c.setFont("Arabic", size)
            c.drawCentredString(W / 2, y[0], _ar(txt))
            y[0] -= size + 6

        def _row(label, val, size=10):
            _need()
            c.setFont("Arabic", size)
            c.drawRightString(W - MARGIN, y[0], _ar(label))
            c.drawString(MARGIN, y[0], _ar(val))
            y[0] -= size + 5

        def _dash():
            _need()
            c.setDash(1, 2)
            c.line(MARGIN, y[0] + 4, W - MARGIN, y[0] + 4)
            c.setDash(1, 0)
            y[0] -= 10

        _center(store, 16)
        _center("فاتورة مبيعات", 13)
        if sale.get("code"):
            _center(str(sale["code"]), 10)
        _dash()
        _row("رقم الفاتورة:", str(sale.get("invoice_number", "")))
        _row("التاريخ:", str(sale.get("created_at", ""))[:10])
        _row("البائع:", str(sale.get("employee_name") or sale.get("created_by", "")))
        _row("العميل:", str(sale.get("customer_name", "")))
        _row("طريقة الدفع:", str(sale.get("payment_method", "")))
        _row("الحالة:", str(sale.get("status", "")))
        _dash()
        _center("الأصناف", 11)
        for idx, item in enumerate(sale.get("items", []), 1):
            _need()
            c.setFont("Arabic", 10)
            line = "{}. {} — {} × {:.2f} = {:.2f} {}".format(
                idx, item.get("product_name", ""), item.get("quantity", 0),
                item.get("unit_price", 0), item.get("total", 0), CURRENCY)
            if item.get("discount"):
                line += " (خصم {:.2f})".format(item["discount"])
            c.drawRightString(W - MARGIN, y[0], _ar(line))
            y[0] -= 14
            if item.get("barcode"):
                c.setFont("Arabic", 8)
                c.drawRightString(W - MARGIN - 14, y[0], _ar("باركود: " + str(item["barcode"])))
                y[0] -= 10
        _dash()
        _row("المجموع الفرعي:", "{:.2f} {}".format(sale.get("subtotal", 0), CURRENCY))
        _row("الخصم:", "{:.2f} {}".format(sale.get("discount", 0), CURRENCY))
        if sale.get("delivery_fee"):
            _row("التوصيل:", "{:.2f} {}".format(sale.get("delivery_fee", 0), CURRENCY))
        _row("الإجمالي:", "{:.2f} {}".format(sale.get("total", 0), CURRENCY), 12)
        _row("المدفوع:", "{:.2f} {}".format(sale.get("paid_amount", 0), CURRENCY))
        _row("المتبقي:", "{:.2f} {}".format(sale.get("remaining", 0), CURRENCY))
        _dash()
        _center("شكراً لتعاملكم معنا", 10)
        c.save()
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=invoice_{sale.get('invoice_number', sale_id)}.pdf"}
        )


    # ============ API KEYS MANAGEMENT ============

    import secrets

    @router.post("/api-keys", response_model=ApiKeyResponse)
    async def create_api_key(api_key: ApiKeyCreate, admin: dict = Depends(get_tenant_admin)):
        key_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Generate internal API key if type is internal
        generated_key = ""
        if api_key.type == "internal":
            generated_key = f"sk_{secrets.token_hex(32)}"

        key_value = api_key.key_value or generated_key

        api_key_doc = {
            "id": key_id,
            "name": api_key.name,
            "type": api_key.type,
            "service": api_key.service or "",
            "key_value": key_value,
            "secret_value": api_key.secret_value or "",
            "endpoint_url": api_key.endpoint_url or "",
            "permissions": api_key.permissions,
            "is_active": True,
            "last_used": "",
            "created_at": now
        }
        await db.api_keys.insert_one(api_key_doc)

        return ApiKeyResponse(
            **api_key_doc,
            key_preview=f"...{key_value[-4:]}" if len(key_value) > 4 else key_value
        )

    @router.get("/api-keys", response_model=List[ApiKeyResponse])
    async def get_api_keys(admin: dict = Depends(get_tenant_admin)):
        keys = await db.api_keys.find({}, {"_id": 0}).to_list(100)
        result = []
        for k in keys:
            # p45: normalize legacy/foreign-schema docs (e.g. platform keys written by security_routes)
            kv = k.get("key_value") or k.get("api_key", "") or ""
            if not k.get("name") and k.get("key_name"):
                k["name"] = k["key_name"]
            k.setdefault("name", "")
            k.setdefault("type", "internal")
            k.setdefault("service", "")
            k.setdefault("endpoint_url", "")
            if not isinstance(k.get("permissions"), list):
                k["permissions"] = [k["permissions"]] if k.get("permissions") else []
            k.setdefault("is_active", True)
            k["last_used"] = str(k.get("last_used") or "")
            k["created_at"] = str(k.get("created_at") or "")
            k["key_preview"] = f"...{kv[-4:]}" if len(kv) > 4 else kv
            # Hide full key value
            if k.get("type") == "internal":
                k["key_value"] = k["key_preview"]
            else:
                k["key_value"] = kv
            result.append(ApiKeyResponse(**k))
        return result

    @router.get("/api-keys/{key_id}")
    async def get_api_key(key_id: str, admin: dict = Depends(get_tenant_admin)):
        key = await db.api_keys.find_one({"id": key_id}, {"_id": 0})
        if not key:
            raise HTTPException(status_code=404, detail="API Key not found")
        return key

    @router.put("/api-keys/{key_id}/toggle")
    async def toggle_api_key(key_id: str, admin: dict = Depends(get_tenant_admin)):
        key = await db.api_keys.find_one({"id": key_id})
        if not key:
            raise HTTPException(status_code=404, detail="API Key not found")

        new_status = not key.get("is_active", True)
        await db.api_keys.update_one({"id": key_id}, {"$set": {"is_active": new_status}})
        return {"is_active": new_status}

    @router.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: str, admin: dict = Depends(get_tenant_admin)):
        result = await db.api_keys.delete_one({"id": key_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="API Key not found")
        return {"message": "API Key deleted successfully"}


    return router
