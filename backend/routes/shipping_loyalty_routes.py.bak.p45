"""
Shipping Loyalty Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging


logger = logging.getLogger(__name__)


def create_shipping_loyalty_routes(db, require_tenant, get_tenant_admin, CURRENCY) -> dict:
    """Create shipping loyalty routes"""
    router = APIRouter()

    # ============ SHIPPING/DELIVERY MANAGEMENT ============

    ALGERIAN_SHIPPING_COMPANIES = [
        {"id": "yalidine", "name": "Yalidine", "name_ar": "ياليدين", "website": "https://yalidine.com", "has_api": True},
        {"id": "zr_express", "name": "ZR Express", "name_ar": "زد آر إكسبريس", "website": "https://zrexpress.com", "has_api": True},
        {"id": "maystro", "name": "Maystro Delivery", "name_ar": "مايسترو", "website": "https://maystro-delivery.com", "has_api": True},
        {"id": "ecotrack", "name": "EcoTrack", "name_ar": "إيكو تراك", "website": "https://ecotrack.dz", "has_api": True},
        {"id": "guepex", "name": "Guepex", "name_ar": "قيبكس", "website": "https://guepex.com", "has_api": True},
        {"id": "procolis", "name": "Procolis", "name_ar": "بروكوليس", "website": "https://procolis.com", "has_api": False},
        {"id": "other", "name": "Autre", "name_ar": "أخرى", "website": "", "has_api": False}
    ]

    class ShippingCompanySettings(BaseModel):
        company_id: str
        enabled: bool = False
        api_key: str = ""
        api_secret: str = ""
        default_wilaya: str = ""
        default_commune: str = ""

    class ShippingRateRequest(BaseModel):
        from_wilaya: str
        to_wilaya: str
        weight: float = 0.5  # kg
        company_id: str = ""

    @router.get("/shipping/companies")
    async def get_shipping_companies(user: dict = Depends(require_tenant)):
        """Get list of Algerian shipping companies"""
        return ALGERIAN_SHIPPING_COMPANIES

    @router.get("/shipping/settings")
    async def get_shipping_settings(admin: dict = Depends(get_tenant_admin)):
        """Get shipping integration settings"""
        settings = await db.shipping_settings.find({}, {"_id": 0}).to_list(20)

        # Add default settings for companies not configured
        configured_ids = {s["company_id"] for s in settings}
        for company in ALGERIAN_SHIPPING_COMPANIES:
            if company["id"] not in configured_ids:
                settings.append({
                    "company_id": company["id"],
                    "enabled": False,
                    "api_key": "",
                    "api_secret": "",
                    "default_wilaya": "",
                    "default_commune": ""
                })

        return settings

    @router.put("/shipping/settings/{company_id}")
    async def update_shipping_settings(company_id: str, settings: ShippingCompanySettings, admin: dict = Depends(get_tenant_admin)):
        """Update shipping company settings"""
        await db.shipping_settings.update_one(
            {"company_id": company_id},
            {"$set": settings.model_dump()},
            upsert=True
        )
        return {"message": "تم حفظ إعدادات شركة الشحن"}

    @router.post("/shipping/calculate-rate")
    async def calculate_shipping_rate(request: ShippingRateRequest, user: dict = Depends(require_tenant)):
        """Calculate shipping rate (MOCKED - returns estimated prices)"""

        # MOCKED shipping rates by wilaya distance
        base_rates = {
            "yalidine": 400,
            "zr_express": 350,
            "maystro": 380,
            "ecotrack": 420,
            "guepex": 390,
            "procolis": 450,
            "other": 500
        }

        # Same wilaya = lower rate
        is_same_wilaya = request.from_wilaya == request.to_wilaya

        rates = []
        for company in ALGERIAN_SHIPPING_COMPANIES:
            base = base_rates.get(company["id"], 400)
            if is_same_wilaya:
                price = base * 0.6
            else:
                price = base + (request.weight * 50)

            rates.append({
                "company_id": company["id"],
                "company_name": company["name"],
                "company_name_ar": company["name_ar"],
                "price": round(price, 2),
                "estimated_days": 2 if is_same_wilaya else 4,
                "currency": "دج"
            })

        return {"rates": sorted(rates, key=lambda x: x["price"])}

    @router.get("/shipping/wilayas")
    async def get_wilayas(user: dict = Depends(require_tenant)):
        """Get list of Algerian wilayas"""
        wilayas = [
            {"code": "01", "name": "أدرار", "name_fr": "Adrar"},
            {"code": "02", "name": "الشلف", "name_fr": "Chlef"},
            {"code": "03", "name": "الأغواط", "name_fr": "Laghouat"},
            {"code": "04", "name": "أم البواقي", "name_fr": "Oum El Bouaghi"},
            {"code": "05", "name": "باتنة", "name_fr": "Batna"},
            {"code": "06", "name": "بجاية", "name_fr": "Béjaïa"},
            {"code": "07", "name": "بسكرة", "name_fr": "Biskra"},
            {"code": "08", "name": "بشار", "name_fr": "Béchar"},
            {"code": "09", "name": "البليدة", "name_fr": "Blida"},
            {"code": "10", "name": "البويرة", "name_fr": "Bouira"},
            {"code": "11", "name": "تمنراست", "name_fr": "Tamanrasset"},
            {"code": "12", "name": "تبسة", "name_fr": "Tébessa"},
            {"code": "13", "name": "تلمسان", "name_fr": "Tlemcen"},
            {"code": "14", "name": "تيارت", "name_fr": "Tiaret"},
            {"code": "15", "name": "تيزي وزو", "name_fr": "Tizi Ouzou"},
            {"code": "16", "name": "الجزائر", "name_fr": "Alger"},
            {"code": "17", "name": "الجلفة", "name_fr": "Djelfa"},
            {"code": "18", "name": "جيجل", "name_fr": "Jijel"},
            {"code": "19", "name": "سطيف", "name_fr": "Sétif"},
            {"code": "20", "name": "سعيدة", "name_fr": "Saïda"},
            {"code": "21", "name": "سكيكدة", "name_fr": "Skikda"},
            {"code": "22", "name": "سيدي بلعباس", "name_fr": "Sidi Bel Abbès"},
            {"code": "23", "name": "عنابة", "name_fr": "Annaba"},
            {"code": "24", "name": "قالمة", "name_fr": "Guelma"},
            {"code": "25", "name": "قسنطينة", "name_fr": "Constantine"},
            {"code": "26", "name": "المدية", "name_fr": "Médéa"},
            {"code": "27", "name": "مستغانم", "name_fr": "Mostaganem"},
            {"code": "28", "name": "المسيلة", "name_fr": "M'Sila"},
            {"code": "29", "name": "معسكر", "name_fr": "Mascara"},
            {"code": "30", "name": "ورقلة", "name_fr": "Ouargla"},
            {"code": "31", "name": "وهران", "name_fr": "Oran"},
            {"code": "32", "name": "البيض", "name_fr": "El Bayadh"},
            {"code": "33", "name": "إليزي", "name_fr": "Illizi"},
            {"code": "34", "name": "برج بوعريريج", "name_fr": "Bordj Bou Arreridj"},
            {"code": "35", "name": "بومرداس", "name_fr": "Boumerdès"},
            {"code": "36", "name": "الطارف", "name_fr": "El Tarf"},
            {"code": "37", "name": "تندوف", "name_fr": "Tindouf"},
            {"code": "38", "name": "تيسمسيلت", "name_fr": "Tissemsilt"},
            {"code": "39", "name": "الوادي", "name_fr": "El Oued"},
            {"code": "40", "name": "خنشلة", "name_fr": "Khenchela"},
            {"code": "41", "name": "سوق أهراس", "name_fr": "Souk Ahras"},
            {"code": "42", "name": "تيبازة", "name_fr": "Tipaza"},
            {"code": "43", "name": "ميلة", "name_fr": "Mila"},
            {"code": "44", "name": "عين الدفلى", "name_fr": "Aïn Defla"},
            {"code": "45", "name": "النعامة", "name_fr": "Naâma"},
            {"code": "46", "name": "عين تموشنت", "name_fr": "Aïn Témouchent"},
            {"code": "47", "name": "غرداية", "name_fr": "Ghardaïa"},
            {"code": "48", "name": "غليزان", "name_fr": "Relizane"},
            {"code": "49", "name": "تميمون", "name_fr": "Timimoun"},
            {"code": "50", "name": "برج باجي مختار", "name_fr": "Bordj Badji Mokhtar"},
            {"code": "51", "name": "أولاد جلال", "name_fr": "Ouled Djellal"},
            {"code": "52", "name": "بني عباس", "name_fr": "Béni Abbès"},
            {"code": "53", "name": "عين صالح", "name_fr": "In Salah"},
            {"code": "54", "name": "عين قزام", "name_fr": "In Guezzam"},
            {"code": "55", "name": "توقرت", "name_fr": "Touggourt"},
            {"code": "56", "name": "جانت", "name_fr": "Djanet"},
            {"code": "57", "name": "المغير", "name_fr": "El M'Ghair"},
            {"code": "58", "name": "المنيعة", "name_fr": "El Meniaa"}
        ]
        return wilayas

    # ============ LOGIN PAGE CUSTOMIZATION ============

    class LoginPageSettings(BaseModel):
        logo_url: str = ""
        business_name: str = "NT"
        background_image_url: str = ""
        tagline_ar: str = "إدارة مخزون زجاج الحماية بسهولة"
        tagline_fr: str = "Gestion facile de stock de protection"

    @router.get("/branding/settings")
    async def get_branding_settings():
        """Get login page branding settings (public)"""
        settings = await db.branding_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = {
                "id": "global",
                "logo_url": "",
                "business_name": "NT",
                "background_image_url": "",
                "tagline_ar": "إدارة مخزون زجاج الحماية بسهولة",
                "tagline_fr": "Gestion facile de stock de protection"
            }
        return settings

    @router.put("/branding/settings")
    async def update_branding_settings(settings: LoginPageSettings, admin: dict = Depends(get_tenant_admin)):
        """Update login page branding settings"""
        update_data = settings.model_dump()

        await db.branding_settings.update_one(
            {"id": "global"},
            {"$set": update_data},
            upsert=True
        )
        return {"message": "تم تحديث إعدادات العلامة التجارية"}

    # ============ LOYALTY PROGRAM ============

    class LoyaltySettings(BaseModel):
        enabled: bool = False
        points_per_dinar: float = 0.01  # نقطة لكل دينار
        points_value: float = 0.1  # قيمة النقطة بالدينار
        min_redeem_points: int = 100
        welcome_bonus: int = 0  # نقاط ترحيبية للعميل الجديد

    class LoyaltyTransaction(BaseModel):
        customer_id: str
        points: int
        type: str  # earn, redeem
        sale_id: Optional[str] = None
        notes: Optional[str] = ""

    @router.get("/loyalty/settings")
    async def get_loyalty_settings(admin: dict = Depends(get_tenant_admin)):
        """Get loyalty program settings"""
        settings = await db.loyalty_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = {
                "id": "global",
                "enabled": False,
                "points_per_dinar": 0.01,
                "points_value": 0.1,
                "min_redeem_points": 100,
                "welcome_bonus": 0
            }
            await db.loyalty_settings.insert_one(settings.copy())
        return settings

    @router.put("/loyalty/settings")
    async def update_loyalty_settings(settings: LoyaltySettings, admin: dict = Depends(get_tenant_admin)):
        """Update loyalty program settings"""
        await db.loyalty_settings.update_one(
            {"id": "global"},
            {"$set": settings.model_dump()},
            upsert=True
        )
        return {"message": "تم تحديث إعدادات برنامج الولاء"}

    @router.get("/loyalty/customer/{customer_id}")
    async def get_customer_loyalty(customer_id: str, user: dict = Depends(require_tenant)):
        """Get customer loyalty points and history"""
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=404, detail="العميل غير موجود")

        points = customer.get("loyalty_points", 0)

        # Get transaction history
        transactions = await db.loyalty_transactions.find(
            {"customer_id": customer_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)

        # Get loyalty settings for point value
        settings = await db.loyalty_settings.find_one({"id": "global"}, {"_id": 0})
        points_value = settings.get("points_value", 0.1) if settings else 0.1

        return {
            "customer_id": customer_id,
            "customer_name": customer.get("name"),
            "points": points,
            "points_value_dinar": round(points * points_value, 2),
            "transactions": transactions
        }

    @router.post("/loyalty/earn")
    async def earn_loyalty_points(transaction: LoyaltyTransaction, user: dict = Depends(require_tenant)):
        """Add loyalty points from a sale"""
        customer = await db.customers.find_one({"id": transaction.customer_id})
        if not customer:
            raise HTTPException(status_code=404, detail="العميل غير موجود")

        now = datetime.now(timezone.utc).isoformat()
        current_points = customer.get("loyalty_points", 0)
        new_points = current_points + transaction.points

        # Update customer points
        await db.customers.update_one(
            {"id": transaction.customer_id},
            {"$set": {"loyalty_points": new_points}}
        )

        # Log transaction
        await db.loyalty_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "customer_id": transaction.customer_id,
            "points": transaction.points,
            "type": "earn",
            "sale_id": transaction.sale_id,
            "notes": transaction.notes or "",
            "balance_after": new_points,
            "created_at": now,
            "created_by": user.get("name", "")
        })

        return {"message": f"تم إضافة {transaction.points} نقطة", "new_balance": new_points}

    @router.post("/loyalty/redeem")
    async def redeem_loyalty_points(transaction: LoyaltyTransaction, user: dict = Depends(require_tenant)):
        """Redeem loyalty points"""
        customer = await db.customers.find_one({"id": transaction.customer_id})
        if not customer:
            raise HTTPException(status_code=404, detail="العميل غير موجود")

        current_points = customer.get("loyalty_points", 0)

        # Check minimum redeem
        settings = await db.loyalty_settings.find_one({"id": "global"}, {"_id": 0})
        min_redeem = settings.get("min_redeem_points", 100) if settings else 100

        if transaction.points > current_points:
            raise HTTPException(status_code=400, detail="رصيد النقاط غير كافي")

        if transaction.points < min_redeem:
            raise HTTPException(status_code=400, detail=f"الحد الأدنى للاسترداد {min_redeem} نقطة")

        now = datetime.now(timezone.utc).isoformat()
        new_points = current_points - transaction.points

        # Update customer points
        await db.customers.update_one(
            {"id": transaction.customer_id},
            {"$set": {"loyalty_points": new_points}}
        )

        # Log transaction
        points_value = settings.get("points_value", 0.1) if settings else 0.1
        discount_amount = transaction.points * points_value

        await db.loyalty_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "customer_id": transaction.customer_id,
            "points": -transaction.points,
            "type": "redeem",
            "sale_id": transaction.sale_id,
            "notes": transaction.notes or f"خصم {discount_amount} دج",
            "balance_after": new_points,
            "created_at": now,
            "created_by": user.get("name", "")
        })

        return {
            "message": f"تم استرداد {transaction.points} نقطة",
            "discount_amount": discount_amount,
            "new_balance": new_points
        }

    # ============ INVOICES ============

    class InvoiceTemplate(BaseModel):
        name: str
        type: str  # simple, detailed, thermal
        header_text: str = ""
        footer_text: str = ""
        show_logo: bool = True
        show_qr: bool = False

    @router.get("/invoices/templates")
    async def get_invoice_templates(user: dict = Depends(require_tenant)):
        """Get all invoice templates"""
        templates = await db.invoice_templates.find({}, {"_id": 0}).to_list(20)

        if not templates:
            # Create default templates
            default_templates = [
                {
                    "id": "simple",
                    "name": "فاتورة بسيطة",
                    "name_fr": "Facture simple",
                    "type": "simple",
                    "header_text": "",
                    "footer_text": "شكراً لتعاملكم معنا",
                    "show_logo": True,
                    "show_qr": False,
                    "is_default": True
                },
                {
                    "id": "detailed",
                    "name": "فاتورة تفصيلية",
                    "name_fr": "Facture détaillée",
                    "type": "detailed",
                    "header_text": "",
                    "footer_text": "",
                    "show_logo": True,
                    "show_qr": True,
                    "is_default": False
                },
                {
                    "id": "thermal",
                    "name": "فاتورة حرارية",
                    "name_fr": "Ticket thermique",
                    "type": "thermal",
                    "header_text": "",
                    "footer_text": "",
                    "show_logo": False,
                    "show_qr": False,
                    "is_default": False
                }
            ]
            await db.invoice_templates.insert_many(default_templates)
            templates = await db.invoice_templates.find({}, {"_id": 0}).to_list(20)

        return templates

    @router.post("/invoices/generate/{sale_id}")
    async def generate_invoice(sale_id: str, template_id: str = "simple", user: dict = Depends(require_tenant)):
        """Generate invoice for a sale"""
        sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
        if not sale:
            raise HTTPException(status_code=404, detail="البيع غير موجود")

        template = await db.invoice_templates.find_one({"id": template_id}, {"_id": 0})
        branding = await db.branding_settings.find_one({"id": "global"}, {"_id": 0})

        # Get customer info if exists
        customer = None
        if sale.get("customer_id"):
            customer = await db.customers.find_one({"id": sale["customer_id"]}, {"_id": 0})

        invoice_data = {
            "invoice_number": f"INV-{sale_id[:8].upper()}",
            "date": sale.get("created_at", ""),
            "business_name": branding.get("business_name", "NT") if branding else "NT",
            "logo_url": branding.get("logo_url", "") if branding else "",
            "customer": {
                "name": customer.get("name", "") if customer else sale.get("customer_name", ""),
                "phone": customer.get("phone", "") if customer else "",
                "address": customer.get("address", "") if customer else ""
            },
            "items": sale.get("items", []),
            "subtotal": sale.get("total", 0),
            "discount": sale.get("discount", 0),
            "total": sale.get("total", 0),
            "paid": sale.get("paid_amount", 0),
            "remaining": sale.get("remaining", 0),
            "payment_method": sale.get("payment_method", ""),
            "template": template,
            "header_text": template.get("header_text", "") if template else "",
            "footer_text": template.get("footer_text", "شكراً لتعاملكم معنا") if template else ""
        }

        return invoice_data

    # ============ PAYMENT GATEWAYS (MOCKED) ============

    class PaymentGatewaySettings(BaseModel):
        gateway: str  # cib, dahabia, baridimob
        enabled: bool = False
        merchant_id: str = ""
        api_key: str = ""
        terminal_id: str = ""

    ALGERIAN_PAYMENT_GATEWAYS = [
        {"id": "cib", "name": "CIB", "name_ar": "البطاقة البنكية CIB", "type": "card"},
        {"id": "dahabia", "name": "Dahabia", "name_ar": "بطاقة الذهبية", "type": "card"},
        {"id": "baridimob", "name": "BaridiMob", "name_ar": "بريدي موب", "type": "mobile"}
    ]

    @router.get("/payments/gateways")
    async def get_payment_gateways(admin: dict = Depends(get_tenant_admin)):
        """Get available payment gateways"""
        settings = await db.payment_gateways.find({}, {"_id": 0}).to_list(10)

        result = []
        for gateway in ALGERIAN_PAYMENT_GATEWAYS:
            setting = next((s for s in settings if s.get("gateway") == gateway["id"]), None)
            result.append({
                **gateway,
                "enabled": setting.get("enabled", False) if setting else False,
                "configured": bool(setting.get("merchant_id")) if setting else False
            })

        return result

    @router.put("/payments/gateways/{gateway_id}")
    async def update_payment_gateway(gateway_id: str, settings: PaymentGatewaySettings, admin: dict = Depends(get_tenant_admin)):
        """Update payment gateway settings"""
        await db.payment_gateways.update_one(
            {"gateway": gateway_id},
            {"$set": settings.model_dump()},
            upsert=True
        )
        return {"message": "تم تحديث إعدادات بوابة الدفع"}

    # ============ SMS REMINDER -> routes/sms_marketing_routes.py ============


    return router
