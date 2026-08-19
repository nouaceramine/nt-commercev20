"""
p170: Customer category sources — one helper to tag (or create) customers
with the module they came from: pos / recharge / digital / repairs / ecom.
A customer can carry several sources at once (زبون محل + صيانة مثلاً).
"""
import uuid
from datetime import datetime, timezone

SOURCE_POS = "pos"
SOURCE_RECHARGE = "recharge"
SOURCE_DIGITAL = "digital"
SOURCE_REPAIRS = "repairs"
SOURCE_ECOM = "ecom"

ALL_SOURCES = (SOURCE_POS, SOURCE_RECHARGE, SOURCE_DIGITAL, SOURCE_REPAIRS, SOURCE_ECOM)


async def tag_customer_source(db, source: str, customer_id: str = None,
                              phone: str = "", name: str = "", address: str = ""):
    """Add `source` to the customer's sources (create a minimal record when
    only phone+name are known — e.g. an ecom order). Never raises: tagging
    must never break the business operation it rides on."""
    try:
        if source not in ALL_SOURCES:
            return None
        cust = None
        if customer_id:
            cust = await db.customers.find_one({"id": customer_id}, {"_id": 0, "id": 1})
        if not cust and phone:
            cust = await db.customers.find_one({"phone": phone}, {"_id": 0, "id": 1})
        if cust:
            await db.customers.update_one({"id": cust["id"]}, {"$addToSet": {"sources": source}})
            return cust["id"]
        if phone and name:
            now = datetime.now(timezone.utc).isoformat()
            doc = {
                "id": str(uuid.uuid4()),
                "name": name, "phone": phone, "email": "", "address": address,
                "notes": "", "code": "", "family_id": "", "family_name": "",
                "price_tier": "retail", "customer_type": "regular",
                "national_id": "", "commercial_register": "", "birthdate": "",
                "max_debt_limit": 0, "special_discount": 0,
                "total_purchases": 0, "balance": 0,
                "sources": [source],
                "created_at": now,
            }
            await db.customers.insert_one(doc)
            return doc["id"]
    except Exception:
        return None
    return None
