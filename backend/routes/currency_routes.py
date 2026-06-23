"""
Multi-Currency Support Routes
Exchange rates, currency settings, conversions
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/currencies", tags=["Currencies"])

# Default currencies
DEFAULT_CURRENCIES = [
    {"code": "DZD", "name": "Algerian Dinar", "name_ar": "دينار جزائري", "symbol": "دج", "rate_to_dzd": 1.0, "is_default": True},
    {"code": "USD", "name": "US Dollar", "name_ar": "دولار أمريكي", "symbol": "$", "rate_to_dzd": 135.0, "is_default": False},
    {"code": "EUR", "name": "Euro", "name_ar": "يورو", "symbol": "€", "rate_to_dzd": 148.0, "is_default": False},
    {"code": "GBP", "name": "British Pound", "name_ar": "جنيه إسترليني", "symbol": "£", "rate_to_dzd": 172.0, "is_default": False},
    {"code": "SAR", "name": "Saudi Riyal", "name_ar": "ريال سعودي", "symbol": "ر.س", "rate_to_dzd": 36.0, "is_default": False},
    {"code": "AED", "name": "UAE Dirham", "name_ar": "درهم إماراتي", "symbol": "د.إ", "rate_to_dzd": 36.8, "is_default": False},
    {"code": "TRY", "name": "Turkish Lira", "name_ar": "ليرة تركية", "symbol": "₺", "rate_to_dzd": 4.2, "is_default": False},
    {"code": "MAD", "name": "Moroccan Dirham", "name_ar": "درهم مغربي", "symbol": "د.م", "rate_to_dzd": 13.5, "is_default": False},
    {"code": "TND", "name": "Tunisian Dinar", "name_ar": "دينار تونسي", "symbol": "د.ت", "rate_to_dzd": 43.5, "is_default": False},
    {"code": "CNY", "name": "Chinese Yuan", "name_ar": "يوان صيني", "symbol": "¥", "rate_to_dzd": 18.6, "is_default": False},
]


class CurrencyRate(BaseModel):
    code: str
    rate_to_dzd: float


class CurrencySettings(BaseModel):
    default_currency: str = "DZD"
    show_multi_currency: bool = False
    auto_convert: bool = True


class ConvertRequest(BaseModel):
    amount: float
    from_currency: str
    to_currency: str


def create_currency_routes(db, get_current_user) -> dict:
    """Create currency routes with dependencies"""
    from utils.permissions import create_cashier_block
    block_cashier = create_cashier_block(get_current_user)

    @router.get("/")
    async def get_currencies(current_user: dict = Depends(block_cashier)):
        """Get all currencies with exchange rates"""
        currencies = await db.currencies.find({}, {"_id": 0}).to_list(50)
        if not currencies:
            # Initialize defaults
            for c in DEFAULT_CURRENCIES:
                c["id"] = str(uuid.uuid4())
                c["is_active"] = True
                c["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.currencies.insert_many(DEFAULT_CURRENCIES)
            currencies = [{k: v for k, v in c.items() if k != "_id"} for c in DEFAULT_CURRENCIES]
        return currencies

    @router.put("/rates")
    async def update_exchange_rates(
        rates: List[CurrencyRate],
        current_user: dict = Depends(block_cashier),
    ):
        """Update exchange rates"""
        for rate in rates:
            await db.currencies.update_one(
                {"code": rate.code},
                {"$set": {
                    "rate_to_dzd": rate.rate_to_dzd,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }}
            )
            # Log rate history
            await db.currency_rate_history.insert_one({
                "id": str(uuid.uuid4()),
                "code": rate.code,
                "rate_to_dzd": rate.rate_to_dzd,
                "updated_by": current_user.get("name", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        return {"success": True, "message": "تم تحديث أسعار الصرف"}

    @router.post("/convert")
    async def convert_currency(
        req: ConvertRequest,
        current_user: dict = Depends(block_cashier),
    ):
        """Convert amount between currencies"""
        from_curr = await db.currencies.find_one({"code": req.from_currency}, {"_id": 0})
        to_curr = await db.currencies.find_one({"code": req.to_currency}, {"_id": 0})

        if not from_curr or not to_curr:
            raise HTTPException(status_code=400, detail="Currency not found")

        # Convert via DZD as base
        amount_in_dzd = req.amount * from_curr["rate_to_dzd"]
        converted = amount_in_dzd / to_curr["rate_to_dzd"]

        return {
            "from": req.from_currency,
            "to": req.to_currency,
            "original_amount": req.amount,
            "converted_amount": round(converted, 2),
            "rate": round(from_curr["rate_to_dzd"] / to_curr["rate_to_dzd"], 6),
        }

    @router.get("/settings")
    async def get_currency_settings(current_user: dict = Depends(block_cashier)):
        settings = await db.currency_settings.find_one({}, {"_id": 0})
        if not settings:
            settings = CurrencySettings().model_dump()
            await db.currency_settings.insert_one(settings)
            settings.pop("_id", None)
        return settings

    @router.put("/settings")
    async def update_currency_settings(
        settings: CurrencySettings,
        current_user: dict = Depends(block_cashier),
    ):
        update_data = settings.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.currency_settings.update_one(
            {}, {"$set": update_data}, upsert=True
        )
        return {"success": True}

    @router.get("/rate-history/{code}")
    async def get_rate_history(
        code: str,
        limit: int = 30,
        current_user: dict = Depends(block_cashier),
    ):
        """Get exchange rate history for a currency"""
        history = await db.currency_rate_history.find(
            {"code": code}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        return history

    return router
