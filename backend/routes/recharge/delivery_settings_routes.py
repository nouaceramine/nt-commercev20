"""Delivery wilayas reference + tenant system settings."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel


def build_delivery_settings_router(db, require_tenant, get_tenant_admin):
    router = APIRouter()

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

    return router
