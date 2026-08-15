"""
Repair System Routes - Complete repair ticket management
16 collections: repair_tickets, device_brands, device_models, spare_parts,
part_usage, technicians, repair_history, repair_warranties, repair_invoices, etc.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_repair_routes(db, get_current_user, get_tenant_admin, main_db=None) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/repairs", tags=["repairs"])

    # ── Models ──
    class RepairTicketCreate(BaseModel):
        customer_name: str
        customer_phone: str
        brand_name: str = ""
        model_name: str = ""
        imei: Optional[str] = None
        reported_issue: str
        estimated_cost: float = 0
        priority: str = "medium"
        technician_id: Optional[str] = None
        technician_name: Optional[str] = None
        warranty_days: int = 30

    class SparePartCreate(BaseModel):
        part_number: str = ""
        name_ar: str
        name_fr: str = ""
        quantity: int = 0
        purchase_price: float = 0
        selling_price: float = 0
        compatible_models: List[str] = []

    class TechnicianCreate(BaseModel):
        name: str
        phone: str = ""
        specialties: List[str] = []

    # ── Create repair from frontend format (RepairReceptionPage) ──
    @router.post("")
    async def create_repair(data: dict, user: dict = Depends(get_current_user)):
        """Accept the full frontend repair form format"""
        from services.code_generator import generate_code
        now = datetime.now(timezone.utc).isoformat()
        ticket_id = str(uuid.uuid4())
        ticket_number = data.get("ticket_number") or await generate_code(db, "repair_tickets", "RP", 5, with_year=True)
        ticket = {
            "id": ticket_id,
            "ticket_number": ticket_number,
            "customer_name": data.get("customer_name", ""),
            "customer_phone": data.get("customer_phone", ""),
            "customer_phone2": data.get("customer_phone2", ""),
            "device_brand": data.get("device_brand", ""),
            "device_model": data.get("device_model", ""),
            "device_color": data.get("device_color", ""),
            "device_imei": data.get("device_imei", ""),
            "device_password": data.get("device_password", ""),
            "problems": data.get("problems", []),
            "problem_description": data.get("problem_description", ""),
            "device_condition": data.get("device_condition", ""),
            "accessories": data.get("accessories", ""),
            "estimated_cost": float(data.get("estimated_cost", 0)),
            "estimated_days": int(data.get("estimated_days", 0)),
            "advance_payment": float(data.get("advance_payment", 0)),
            "technician_notes": data.get("technician_notes", ""),
            "technician_id": data.get("technician_id"),
            "technician_name": data.get("technician_name"),
            "status": data.get("status", "received"),
            "priority": data.get("priority", "medium"),
            "diagnosis": None,
            "final_cost": None,
            "received_at": now,
            "diagnosed_at": None,
            "repaired_at": None,
            "delivered_at": None,
            "created_by": user.get("name", user.get("email", "")),
            "created_at": now,
        }
        await db.repair_tickets.insert_one(ticket)
        await db.repair_history.insert_one({
            "id": str(uuid.uuid4()),
            "repair_ticket_id": ticket_id,
            "old_status": None,
            "new_status": "received",
            "changed_by": user.get("name", ""),
            "notes": "تم استلام الجهاز",
            "created_at": now,
        })
        ticket.pop("_id", None)
        return ticket

    # ── Repair Tickets ──
    @router.post("/tickets")
    async def create_ticket(data: RepairTicketCreate, admin: dict = Depends(require_permission("repairs.add"))):
        from services.code_generator import generate_code
        ticket = {
            "id": str(uuid.uuid4()),
            "ticket_number": await generate_code(db, "repair_tickets", "RP", 5, with_year=True),
            **data.dict(),
            "status": "received",
            "diagnosis": None,
            "final_cost": None,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "diagnosed_at": None,
            "repaired_at": None,
            "delivered_at": None,
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.repair_tickets.insert_one(ticket)
        await db.repair_history.insert_one({
            "id": str(uuid.uuid4()),
            "repair_ticket_id": ticket["id"],
            "old_status": None,
            "new_status": "received",
            "changed_by": admin.get("name", ""),
            "notes": "تم استلام الجهاز",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        ticket.pop("_id", None)
        return ticket

    @router.get("", operation_id="get_repairs_list")
    async def get_repairs(
        status: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        user: dict = Depends(get_current_user)
    ):
        """Get all repair tickets (alias for /tickets)"""
        query = {}
        if status:
            query["status"] = status
        if priority:
            query["priority"] = priority
        if search:
            query["$or"] = [
                {"ticket_number": {"$regex": search, "$options": "i"}},
                {"customer_name": {"$regex": search, "$options": "i"}},
                {"customer_phone": {"$regex": search, "$options": "i"}},
            ]
        tickets = await db.repair_tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return tickets

    @router.get("/tickets")
    async def get_tickets(
        status: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        user: dict = Depends(get_current_user)
    ):
        query = {}
        if status:
            query["status"] = status
        if priority:
            query["priority"] = priority
        if search:
            query["$or"] = [
                {"ticket_number": {"$regex": search, "$options": "i"}},
                {"customer_name": {"$regex": search, "$options": "i"}},
                {"customer_phone": {"$regex": search, "$options": "i"}},
                {"imei": {"$regex": search, "$options": "i"}},
            ]
        tickets = await db.repair_tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return tickets

    @router.get("/tickets/paginated")
    async def get_tickets_paginated(
        status: Optional[str] = None, priority: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        user: dict = Depends(get_current_user)
    ):
        from utils.pagination import paginate
        query = {}
        if status:
            query["status"] = status
        if priority:
            query["priority"] = priority
        if search:
            query["$or"] = [
                {"ticket_number": {"$regex": search, "$options": "i"}},
                {"customer_name": {"$regex": search, "$options": "i"}},
                {"customer_phone": {"$regex": search, "$options": "i"}},
                {"imei": {"$regex": search, "$options": "i"}},
            ]
        return await paginate(db.repair_tickets, query, page, page_size)

    @router.get("/tickets/{ticket_id}")
    async def get_ticket(ticket_id: str, user: dict = Depends(get_current_user)):
        ticket = await db.repair_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not ticket:
            raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
        parts = await db.part_usage.find({"repair_ticket_id": ticket_id}, {"_id": 0}).to_list(100)
        history = await db.repair_history.find({"repair_ticket_id": ticket_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        ticket["parts_used"] = parts
        ticket["history"] = history
        return ticket

    @router.put("/tickets/{ticket_id}")
    async def update_ticket(ticket_id: str, data: dict, admin: dict = Depends(require_permission("repairs.edit"))):
        ticket = await db.repair_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not ticket:
            raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
        old_status = ticket.get("status")
        new_status = data.get("status", old_status)
        now = datetime.now(timezone.utc).isoformat()
        updates = {k: v for k, v in data.items() if k not in ["id", "ticket_number"]}
        updates["updated_at"] = now
        if new_status != old_status:
            if new_status == "diagnosed":
                updates["diagnosed_at"] = now
            elif new_status in ("repaired", "ready"):
                updates["repaired_at"] = now
            elif new_status == "repairing":
                updates["repairing_at"] = now
            elif new_status == "delivered":
                updates["delivered_at"] = now
            await db.repair_history.insert_one({
                "id": str(uuid.uuid4()),
                "repair_ticket_id": ticket_id,
                "old_status": old_status,
                "new_status": new_status,
                "changed_by": admin.get("name", ""),
                "notes": data.get("notes", ""),
                "created_at": now,
            })
        await db.repair_tickets.update_one({"id": ticket_id}, {"$set": updates})
        updated = await db.repair_tickets.find_one({"id": ticket_id}, {"_id": 0})

        # Auto-notify customer when the device is ready (SMS/WhatsApp if configured)
        if new_status in ("ready", "repaired") and old_status not in ("ready", "repaired"):
            try:
                from services.smart_notifications import notify
                await notify(
                    db, "success",
                    "صيانة جاهزة",
                    f"جهاز {ticket.get('ticket_number', ticket_id)} جاهز للاستلام",
                    link="/repairs",
                )
                from services.sms_service import SMSService
                customer_phone = ticket.get("customer_phone") or ticket.get("phone") or ""
                if customer_phone:
                    sms = SMSService(main_db if main_db is not None else db)
                    await sms.send_sms(customer_phone, f"جهازك جاهز للاستلام. رقم التذكرة: {ticket.get('ticket_number', ticket_id)}")
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("repair ready notify: %s", exc)
        return updated

    @router.delete("/tickets/{ticket_id}")
    async def delete_ticket(ticket_id: str, admin: dict = Depends(require_permission("repairs.delete"))):
        await db.repair_tickets.delete_one({"id": ticket_id})
        await db.repair_history.delete_many({"repair_ticket_id": ticket_id})
        await db.part_usage.delete_many({"repair_ticket_id": ticket_id})
        return {"message": "تم حذف التذكرة"}

    @router.get("/stats")
    async def get_repair_stats(user: dict = Depends(get_current_user)):
        total = await db.repair_tickets.count_documents({})
        statuses = {}
        for s in ["received", "diagnosed", "repairing", "in_repair", "ready", "repaired", "delivered", "cancelled"]:
            statuses[s] = await db.repair_tickets.count_documents({"status": s})
        revenue = await db.repair_tickets.aggregate([
            {"$match": {"status": "delivered", "final_cost": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$final_cost"}}},
        ]).to_list(1)
        return {
            "total": total,
            "statuses": statuses,
            "revenue": revenue[0]["total"] if revenue else 0,
        }

    # ── Spare Parts ──
    @router.post("/parts")
    async def create_part(data: SparePartCreate, admin: dict = Depends(require_permission("repairs.add"))):
        part = {"id": str(uuid.uuid4()), **data.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
        await db.spare_parts.insert_one(part)
        part.pop("_id", None)
        return part

    @router.get("/parts")
    async def get_parts(search: Optional[str] = None, user: dict = Depends(get_current_user)):
        query = {}
        if search:
            query["$or"] = [
                {"name_ar": {"$regex": search, "$options": "i"}},
                {"part_number": {"$regex": search, "$options": "i"}},
            ]
        return await db.spare_parts.find(query, {"_id": 0}).to_list(500)

    @router.post("/tickets/{ticket_id}/use-part")
    async def use_part(ticket_id: str, data: dict, admin: dict = Depends(require_permission("repairs.edit"))):
        part_id = data.get("part_id")
        qty = data.get("quantity", 1)
        part = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
        source_collection = "spare_parts"
        if not part:
            part = await db.products.find_one({"id": part_id}, {"_id": 0})
            source_collection = "products"
        if not part:
            raise HTTPException(status_code=404, detail="القطعة غير موجودة")
        available = part.get("quantity", part.get("stock", 0)) or 0
        if available < qty:
            raise HTTPException(status_code=400, detail="الكمية غير كافية")
        # p66: unified products use retail_price/name_en — fall back so price is never lost
        _unit_price = part.get("selling_price") or part.get("retail_price") or part.get("sell_price") or 0
        _part_name = part.get("name_ar") or part.get("name_en") or part.get("name") or ""
        usage = {
            "id": str(uuid.uuid4()),
            "repair_ticket_id": ticket_id,
            "part_id": part_id,
            "part_name": _part_name,
            "quantity": qty,
            "unit_price": _unit_price,
            "total_price": _unit_price * qty,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.part_usage.insert_one(usage)
        if source_collection == "products":
            inc = {"quantity": -qty} if "quantity" in part else {"stock": -qty}
            await db.products.update_one({"id": part_id}, {"$inc": inc})
        else:
            await db.spare_parts.update_one({"id": part_id}, {"$inc": {"quantity": -qty}})
        usage.pop("_id", None)
        return usage

    # ── Technicians ──
    @router.post("/technicians")
    async def create_technician(data: TechnicianCreate, admin: dict = Depends(require_permission("repairs.add"))):
        tech = {"id": str(uuid.uuid4()), **data.dict(), "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()}
        await db.technicians.insert_one(tech)
        tech.pop("_id", None)
        return tech

    @router.get("/technicians")
    async def get_technicians(user: dict = Depends(get_current_user)):
        return await db.technicians.find({}, {"_id": 0}).to_list(100)

    return router
