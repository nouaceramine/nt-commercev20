"""Testimonials — public read for the landing page + super-admin CRUD."""
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


SEED = [
    {"name": "أحمد محمد", "role": "صاحب محل إلكترونيات", "text": "برنامج ممتاز غير طريقة إدارة محلي بالكامل!", "rating": 5},
    {"name": "فاطمة علي", "role": "مديرة سوبر ماركت", "text": "التقارير الذكية ساعدتني في زيادة المبيعات 30%", "rating": 5},
    {"name": "يوسف أمين", "role": "تاجر جملة", "text": "أفضل استثمار قمت به لتطوير عملي", "rating": 5},
]


class TestimonialCreate(BaseModel):
    name: str
    role: str = ""
    text: str
    rating: int = 5
    is_active: bool = True


def create_testimonials_routes(main_db, get_super_admin) -> dict:
    router = APIRouter(tags=["testimonials"])

    async def _ensure_seed():
        if await main_db.testimonials.count_documents({}) == 0:
            now = datetime.now(timezone.utc).isoformat()
            await main_db.testimonials.insert_many([
                {"id": str(uuid.uuid4()), **s, "is_active": True, "created_at": now} for s in SEED
            ])

    @router.get("/public/testimonials")
    async def public_testimonials():
        await _ensure_seed()
        rows = await main_db.testimonials.find(
            {"is_active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1, "text": 1, "rating": 1}
        ).sort("created_at", -1).to_list(12)
        return {"items": rows}

    @router.get("/saas/testimonials")
    async def list_testimonials(admin: dict = Depends(get_super_admin)):
        await _ensure_seed()
        return await main_db.testimonials.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

    @router.post("/saas/testimonials", status_code=201)
    async def create_testimonial(data: TestimonialCreate, admin: dict = Depends(get_super_admin)):
        doc = {"id": str(uuid.uuid4()), **data.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
        await main_db.testimonials.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/saas/testimonials/{tid}")
    async def update_testimonial(tid: str, data: dict, admin: dict = Depends(get_super_admin)):
        allowed = {k: v for k, v in data.items() if k in ("name", "role", "text", "rating", "is_active")}
        res = await main_db.testimonials.update_one({"id": tid}, {"$set": allowed})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="غير موجود")
        return {"ok": True}

    @router.delete("/saas/testimonials/{tid}")
    async def delete_testimonial(tid: str, admin: dict = Depends(get_super_admin)):
        res = await main_db.testimonials.delete_one({"id": tid})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="غير موجود")
        return {"ok": True}

    return router
