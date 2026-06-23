"""
Stripe Payment Integration Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import os
import io
import logging

logger = logging.getLogger(__name__)

try:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False

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
        metadata: dict = {}

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
    async def create_checkout_session(request: CreateCheckoutRequest, http_request: Request):
        if not STRIPE_AVAILABLE:
            raise HTTPException(status_code=500, detail="Stripe غير متوفر")
        package = SUBSCRIPTION_PACKAGES.get(request.package_id)
        if not package:
            raise HTTPException(status_code=400, detail="الباقة غير موجودة")
        api_key = os.environ.get("STRIPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="مفتاح Stripe غير موجود")
        try:
            success_url = f"{request.origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
            cancel_url = f"{request.origin_url}/payment-cancel"
            host_url = str(http_request.base_url)
            webhook_url = f"{host_url}api/webhook/stripe"
            stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
            checkout_request = CheckoutSessionRequest(amount=package["amount"], currency="usd", success_url=success_url, cancel_url=cancel_url, metadata={"package_id": request.package_id, "package_name": package["name"], "duration_days": str(package["duration_days"]), "source": "nt_commerce"})
            session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
            transaction_id = str(uuid.uuid4())
            await main_db.payment_transactions.insert_one({"id": transaction_id, "session_id": session.session_id, "package_id": request.package_id, "package_name": package["name"], "amount": package["amount"], "currency": package["currency"], "payment_status": "pending", "created_at": datetime.now(timezone.utc).isoformat(), "metadata": {"package_id": request.package_id, "duration_days": package["duration_days"]}})
            return {"url": session.url, "session_id": session.session_id, "transaction_id": transaction_id}
        except Exception as e:
            logger.error(f"Stripe checkout error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/payments/status/{session_id}")
    async def get_payment_status(session_id: str, http_request: Request):
        if not STRIPE_AVAILABLE:
            raise HTTPException(status_code=500, detail="Stripe غير متوفر")
        api_key = os.environ.get("STRIPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="مفتاح Stripe غير موجود")
        try:
            host_url = str(http_request.base_url)
            webhook_url = f"{host_url}api/webhook/stripe"
            stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
            status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
            await main_db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"payment_status": status.payment_status, "status": status.status, "updated_at": datetime.now(timezone.utc).isoformat()}})
            return {"status": status.status, "payment_status": status.payment_status, "amount_total": status.amount_total, "currency": status.currency, "metadata": status.metadata}
        except Exception as e:
            logger.error(f"Stripe status error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        if not STRIPE_AVAILABLE:
            raise HTTPException(status_code=500, detail="Stripe غير متوفر")
        api_key = os.environ.get("STRIPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="مفتاح Stripe غير موجود")
        try:
            body = await request.body()
            signature = request.headers.get("Stripe-Signature")
            host_url = str(request.base_url)
            webhook_url = f"{host_url}api/webhook/stripe"
            stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
            webhook_response = await stripe_checkout.handle_webhook(body, signature)
            if webhook_response.session_id:
                await main_db.payment_transactions.update_one({"session_id": webhook_response.session_id}, {"$set": {"payment_status": webhook_response.payment_status, "event_type": webhook_response.event_type, "event_id": webhook_response.event_id, "webhook_received_at": datetime.now(timezone.utc).isoformat()}})
            return {"received": True}
        except Exception as e:
            logger.error(f"Stripe webhook error: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))

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
        invoice_html = f"""<html dir="rtl"><head><style>body{{font-family:Arial;padding:40px;}}.header{{text-align:center;border-bottom:2px solid #333;padding-bottom:20px;margin-bottom:30px;}}.total{{font-size:1.2em;font-weight:bold;text-align:left;margin-top:20px;}}</style></head><body><div class="header"><h1>فاتورة</h1><p>NT Commerce</p></div><p><strong>رقم الفاتورة:</strong> {record.get('invoice_number','N/A')}</p><p><strong>التاريخ:</strong> {record.get('created_at','')[:10]}</p><p><strong>العميل:</strong> {tenant.get('business_name','N/A') if tenant else 'N/A'}</p><div class="total">الإجمالي: {record.get('amount',0):,.2f} {record.get('currency','دج').upper()}</div></body></html>"""
        return StreamingResponse(io.BytesIO(invoice_html.encode('utf-8')), media_type="text/html", headers={"Content-Disposition": f"inline; filename=invoice_{record.get('invoice_number', record_id)}.html"})

    return router
