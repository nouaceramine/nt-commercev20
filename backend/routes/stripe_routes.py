"""
Stripe Payment Integration Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import os
import io
import logging
import asyncio
import html
import re
from urllib.parse import urlparse
import stripe

logger = logging.getLogger(__name__)

STRIPE_AVAILABLE = True


def _stripe_client() -> stripe.StripeClient:
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Stripe غير مهيأ على الخادم")
    return stripe.StripeClient(api_key)


def _safe_origin(value: str) -> str:
    origin = (value or "").strip().rstrip("/")
    parsed = urlparse(origin)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="origin_url يجب أن يكون عنوان HTTPS صالحًا")
    return origin

SUBSCRIPTION_PACKAGES = {
    "basic_monthly": {"name": "الباقة الأساسية - شهري", "amount": 2500.0, "duration_days": 30, "currency": "dzd"},
    "basic_yearly": {"name": "الباقة الأساسية - سنوي", "amount": 25000.0, "duration_days": 365, "currency": "dzd"},
    "pro_monthly": {"name": "الباقة المتقدمة - شهري", "amount": 5000.0, "duration_days": 30, "currency": "dzd"},
    "pro_yearly": {"name": "الباقة المتقدمة - سنوي", "amount": 50000.0, "duration_days": 365, "currency": "dzd"},
    "enterprise_monthly": {"name": "باقة المؤسسات - شهري", "amount": 10000.0, "duration_days": 30, "currency": "dzd"},
    "enterprise_yearly": {"name": "باقة المؤسسات - سنوي", "amount": 100000.0, "duration_days": 365, "currency": "dzd"},
}


def create_stripe_routes(db, main_db, get_current_user, get_tenant_admin, require_tenant, get_super_admin) -> dict:
    router = APIRouter(tags=["payments"])

    # ── Models ──

    class CreateCheckoutRequest(BaseModel):
        package_id: str
        origin_url: str

    class PaymentRecord(BaseModel):
        tenant_id: Optional[str] = None
        amount: float
        currency: str = "dzd"
        payment_method: str = "stripe"
        description: str = ""
        invoice_number: str = ""
        status: str = "pending"
        metadata: dict = Field(default_factory=dict)

    class PaymentUpdateRequest(BaseModel):
        status: Optional[str] = None
        notes: Optional[str] = None
        invoice_number: Optional[str] = None

    # ── Routes ──

    @router.get("/payments/packages")
    async def get_subscription_packages():
        packages = []
        for pkg_id, pkg in SUBSCRIPTION_PACKAGES.items():
            packages.append({"id": pkg_id, "name": pkg["name"], "amount": pkg["amount"], "duration_days": pkg["duration_days"], "currency": pkg["currency"]})
        return packages

    @router.post("/payments/create-checkout")
    async def create_checkout_session(request: CreateCheckoutRequest, user: dict = Depends(get_current_user)):
        package = SUBSCRIPTION_PACKAGES.get(request.package_id)
        if not package:
            raise HTTPException(status_code=400, detail="الباقة غير موجودة")
        client = _stripe_client()
        origin = _safe_origin(request.origin_url)
        transaction_id = str(uuid.uuid4())
        tenant_id = user.get("tenant_id")
        user_id = user.get("id")
        metadata = {
            "transaction_id": transaction_id,
            "package_id": request.package_id,
            "package_name": package["name"],
            "duration_days": str(package["duration_days"]),
            "source": "nt_commerce",
            "created_by": str(user_id or ""),
        }
        if tenant_id:
            metadata["tenant_id"] = tenant_id
        try:
            session = await asyncio.to_thread(
                client.v1.checkout.sessions.create,
                params={
                    "mode": "payment",
                    "success_url": f"{origin}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
                    "cancel_url": f"{origin}/payment-cancel",
                    "line_items": [{
                        "quantity": 1,
                        "price_data": {
                            "currency": package["currency"],
                            "unit_amount": int(round(package["amount"] * 100)),
                            "product_data": {"name": package["name"]},
                        },
                    }],
                    "metadata": metadata,
                    "payment_intent_data": {"metadata": metadata},
                },
            )
            await main_db.payment_transactions.insert_one({
                "id": transaction_id, "session_id": session.id,
                "tenant_id": tenant_id, "created_by": user_id,
                "package_id": request.package_id, "package_name": package["name"],
                "amount": package["amount"], "currency": package["currency"],
                "payment_status": "pending", "status": session.status,
                "created_at": datetime.now(timezone.utc).isoformat(), "metadata": metadata,
            })
            return {"url": session.url, "session_id": session.id, "transaction_id": transaction_id}
        except stripe.StripeError as exc:
            logger.error("Stripe checkout failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="تعذر إنشاء جلسة الدفع لدى Stripe")

    @router.get("/payments/status/{session_id}")
    async def get_payment_status(session_id: str, user: dict = Depends(get_current_user)):
        if not session_id.startswith("cs_") or len(session_id) > 255:
            raise HTTPException(status_code=400, detail="معرّف جلسة غير صالح")
        record = await main_db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="جلسة الدفع غير موجودة")
        is_super = user.get("role") == "super_admin" or user.get("user_type") == "super_admin"
        if not is_super:
            if user.get("tenant_id"):
                owns_record = record.get("tenant_id") == user.get("tenant_id")
            else:
                owns_record = bool(user.get("id")) and record.get("created_by") == user.get("id")
            if not owns_record:
                raise HTTPException(status_code=404, detail="جلسة الدفع غير موجودة")
        client = _stripe_client()
        try:
            session = await asyncio.to_thread(client.v1.checkout.sessions.retrieve, session_id)
            metadata = dict(session.metadata or {})
            if session.id != session_id or metadata.get("transaction_id") != record.get("id"):
                logger.error("Stripe session ownership metadata mismatch")
                raise HTTPException(status_code=502, detail="تعذر التحقق من ملكية جلسة الدفع")
            await main_db.payment_transactions.update_one(
                {"id": record["id"], "session_id": session_id},
                {"$set": {
                    "payment_status": session.payment_status,
                    "status": session.status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            return {
                "status": session.status, "payment_status": session.payment_status,
                "amount_total": session.amount_total, "currency": session.currency,
                "transaction_id": record["id"], "package_id": record.get("package_id"),
            }
        except stripe.StripeError as exc:
            logger.error("Stripe status failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="تعذر الاستعلام عن جلسة الدفع")

    @router.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        from services.ecom.webhook_security import read_signed_body
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
        if not webhook_secret:
            raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET غير مضبوط")
        body = await read_signed_body(request)
        signature = request.headers.get("Stripe-Signature")
        if not signature:
            raise HTTPException(status_code=401, detail="توقيع Stripe مفقود")
        try:
            event = stripe.Webhook.construct_event(body, signature, webhook_secret)
        except (stripe.SignatureVerificationError, ValueError):
            raise HTTPException(status_code=401, detail="توقيع Stripe غير صالح")
        event_type = event.get("type", "")
        session = (event.get("data") or {}).get("object") or {}
        session_id = session.get("id")
        if session_id and event_type in {
            "checkout.session.completed", "checkout.session.async_payment_succeeded",
            "checkout.session.async_payment_failed", "checkout.session.expired",
        }:
            payment_status = session.get("payment_status") or (
                "paid" if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded")
                else "failed"
            )
            await main_db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": payment_status,
                    "status": session.get("status"),
                    "event_type": event_type, "event_id": event.get("id"),
                    "webhook_received_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
        return {"received": True}

    # Payment Records Management (manual/offline)
    @router.get("/payments/records")
    async def get_payment_records(page: int = 1, limit: int = 20, status: Optional[str] = None, admin: dict = Depends(get_super_admin)):
        query = {}
        if status:
            query["payment_status"] = status
        skip = (page - 1) * limit
        records = await main_db.payment_transactions.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await main_db.payment_transactions.count_documents(query)
        return {"records": records, "total": total, "page": page, "pages": (total + limit - 1) // limit}

    @router.post("/payments/records")
    async def create_payment_record(payment: PaymentRecord, admin: dict = Depends(get_super_admin)):
        record_id = str(uuid.uuid4())
        record = {"id": record_id, "tenant_id": payment.tenant_id, "amount": payment.amount, "currency": payment.currency, "payment_method": payment.payment_method, "description": payment.description, "invoice_number": payment.invoice_number or f"INV-{datetime.now().strftime('%Y%m%d')}-{record_id[:8].upper()}", "payment_status": payment.status, "metadata": payment.metadata, "created_by": admin.get("id"), "created_at": datetime.now(timezone.utc).isoformat()}
        await main_db.payment_transactions.insert_one(record)
        if payment.tenant_id and payment.status == "paid":
            tenant = await main_db.saas_tenants.find_one({"id": payment.tenant_id})
            if tenant:
                current_end = tenant.get("subscription_end")
                if current_end:
                    try:
                        end_date = datetime.fromisoformat(current_end.replace('Z', '+00:00'))
                    except Exception:
                        end_date = datetime.now(timezone.utc)
                else:
                    end_date = datetime.now(timezone.utc)
                new_end = end_date + timedelta(days=30)
                await main_db.saas_tenants.update_one({"id": payment.tenant_id}, {"$set": {"subscription_end": new_end.isoformat()}})
        return {"id": record_id, "message": "تم إنشاء سجل الدفع"}

    @router.put("/payments/records/{record_id}")
    async def update_payment_record(record_id: str, update: PaymentUpdateRequest, admin: dict = Depends(get_super_admin)):
        update_data = {}
        if update.status:
            update_data["payment_status"] = update.status
        if update.notes:
            update_data["notes"] = update.notes
        if update.invoice_number:
            update_data["invoice_number"] = update.invoice_number
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        update_data["updated_by"] = admin.get("id")
        result = await main_db.payment_transactions.update_one({"id": record_id}, {"$set": update_data})
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="سجل الدفع غير موجود")
        return {"success": True, "message": "تم تحديث سجل الدفع"}

    @router.delete("/payments/records/{record_id}")
    async def delete_payment_record(record_id: str, admin: dict = Depends(get_super_admin)):
        result = await main_db.payment_transactions.delete_one({"id": record_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="سجل الدفع غير موجود")
        return {"success": True, "message": "تم حذف سجل الدفع"}

    @router.get("/payments/invoice/{record_id}")
    async def generate_payment_invoice(record_id: str, admin: dict = Depends(get_super_admin)):
        record = await main_db.payment_transactions.find_one({"id": record_id}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="سجل الدفع غير موجود")
        tenant = None
        if record.get("tenant_id"):
            tenant = await main_db.saas_tenants.find_one({"id": record["tenant_id"]}, {"_id": 0})
        invoice_number = html.escape(str(record.get("invoice_number") or "N/A"))
        created_at = html.escape(str(record.get("created_at") or "")[:10])
        business_name = html.escape(str(tenant.get("business_name") or "N/A") if tenant else "N/A")
        currency = html.escape(str(record.get("currency") or "دج").upper())
        try:
            amount = float(record.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        invoice_html = f"""<html dir="rtl"><head><meta charset="utf-8"><style>body{{font-family:Arial;padding:40px;}}.header{{text-align:center;border-bottom:2px solid #333;padding-bottom:20px;margin-bottom:30px;}}.total{{font-size:1.2em;font-weight:bold;text-align:left;margin-top:20px;}}</style></head><body><div class="header"><h1>فاتورة</h1><p>NT Commerce</p></div><p><strong>رقم الفاتورة:</strong> {invoice_number}</p><p><strong>التاريخ:</strong> {created_at}</p><p><strong>العميل:</strong> {business_name}</p><div class="total">الإجمالي: {amount:,.2f} {currency}</div></body></html>"""
        safe_filename = re.sub(r"[^A-Za-z0-9_.-]", "_", str(record.get("invoice_number") or record_id))[:100]
        return StreamingResponse(io.BytesIO(invoice_html.encode('utf-8')), media_type="text/html", headers={"Content-Disposition": f"inline; filename=invoice_{safe_filename}.html"})

    return router
