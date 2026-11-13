"""M13a: Real-estate CRM core — clients, follow-ups, viewings, projects, units,
and budget/area/type matching between clients and units.

Tenant-scoped (tenant db). Codes: CLT_YYYY / PRJ_YYYY / UNT_YYYY counters.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id

CLIENT_STATUSES = ["new", "contacted", "interested", "viewing", "negotiation", "won", "lost"]
UNIT_TYPES = ["apartment", "villa", "land", "office", "shop", "studio", "other"]
UNIT_STATUSES = ["available", "reserved", "sold"]
FOLLOWUP_KINDS = ["call", "whatsapp", "visit", "viewing", "other"]


# ── Pure helpers (unit-tested) ──────────────────────────────────────────────
def normalize_phone(raw: str) -> str:
    """Algerian-style normalization: digits only, 00213/+213 → leading 0."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("00213"):
        digits = "0" + digits[5:]
    elif digits.startswith("213") and len(digits) == 12:
        digits = "0" + digits[3:]
    return digits


def client_status_transition(current: str, target: str) -> bool:
    """Lost/won are terminal; anything else can move freely within the pipeline."""
    if current in ("won", "lost"):
        return False
    return target in CLIENT_STATUSES and target != current


def score_unit_for_client(unit: dict, client: dict) -> int:
    """0–100 match score: budget fit 50, wilaya 25, unit type 25."""
    score = 0
    price = float(unit.get("price") or 0)
    bmin = client.get("budget_min")
    bmax = client.get("budget_max")
    if price > 0 and (bmin := float(bmin or 0)) >= 0 and (bmax := float(bmax or 0)) > 0:
        if bmin <= price <= bmax:
            score += 50
        elif price < bmin:
            score += 35  # cheaper than budget — still a fit
        else:
            over = (price - bmax) / bmax
            if over <= 0.15:
                score += 20  # slightly above budget
    u_wil = (unit.get("wilaya") or "").strip().lower()
    c_wil = (client.get("wilaya") or "").strip().lower()
    if u_wil and c_wil and u_wil == c_wil:
        score += 25
    u_type = unit.get("unit_type")
    c_pref = client.get("unit_type_pref")
    if u_type_match(u_type, c_pref):
        score += 25
    return score


def u_type_match(unit_type: str, pref) -> bool:
    if not unit_type or not pref:
        return False
    if isinstance(pref, list):
        return unit_type in pref
    return unit_type == pref


async def _next(db, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    doc = await db.counters.find_one_and_update(
        {"_id": f"{prefix}_{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"{prefix}-{year}-{doc['seq']:04d}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ── Payloads ────────────────────────────────────────────────────────────────
class ClientIn(BaseModel):
    name: str
    phones: List[str] = Field(default_factory=list)
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    wilaya: str = ""
    unit_type_pref: Optional[str] = None
    source: str = ""
    campaign_id: Optional[str] = None
    notes: str = ""


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phones: Optional[List[str]] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    wilaya: Optional[str] = None
    unit_type_pref: Optional[str] = None
    source: Optional[str] = None
    campaign_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class FollowUpIn(BaseModel):
    date: str  # ISO
    kind: str = "call"
    note: str = ""


class ViewingIn(BaseModel):
    unit_id: str
    date: str
    feedback: str = ""
    result: str = ""  # e.g. interested / not_interested / negotiation


class ProjectIn(BaseModel):
    name: str
    location: str = ""
    wilaya: str = ""
    developer: str = ""
    notes: str = ""


class UnitIn(BaseModel):
    project_id: Optional[str] = None
    unit_type: str = "apartment"
    area_m2: Optional[float] = None
    price: float
    wilaya: str = ""
    address: str = ""
    payment_plan: Optional[dict] = None  # {down_payment, months, monthly}
    photos: List[str] = Field(default_factory=list)  # base64 or URLs
    notes: str = ""


def create_crm_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/crm", tags=["crm"])

    # ── Clients ─────────────────────────────────────────────────────────────
    @router.get("/clients")
    async def list_clients(status: Optional[str] = None, q: Optional[str] = None,
                           user: dict = Depends(require_tenant)):
        query = {}
        if status in CLIENT_STATUSES:
            query["status"] = status
        if q:
            query["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                            {"phones": {"$regex": normalize_phone(q) or q}}]
        cursor = db.crm_clients.find(query).sort("created_at", -1).limit(500)
        return {"items": [_clean(d) async for d in cursor]}

    @router.post("/clients")
    async def create_client(payload: ClientIn, user: dict = Depends(get_tenant_admin)):
        if not payload.name.strip():
            raise HTTPException(status_code=422, detail="name_required")
        if payload.unit_type_pref and payload.unit_type_pref not in UNIT_TYPES:
            raise HTTPException(status_code=422, detail="bad_unit_type")
        doc = payload.model_dump()
        doc["phones"] = [normalize_phone(p) for p in doc["phones"] if normalize_phone(p)]
        doc.update({
            "id": new_id(), "code": await _next(db, "CLT"),
            "status": "new", "created_at": _now(), "created_by": user.get("id"),
            "assigned_to": user.get("id"),
        })
        await db.crm_clients.insert_one(doc)
        return _clean(doc)

    @router.get("/clients/{cid}")
    async def get_client(cid: str, user: dict = Depends(require_tenant)):
        doc = await db.crm_clients.find_one({"id": cid})
        if not doc:
            raise HTTPException(status_code=404, detail="not_found")
        followups = [f async for f in db.crm_followups.find({"client_id": cid}).sort("date", 1)]
        viewings = [v async for v in db.crm_viewings.find({"client_id": cid}).sort("date", -1)]
        out = _clean(doc)
        out["followups"] = [_clean(f) for f in followups]
        out["viewings"] = [_clean(v) for v in viewings]
        return out

    @router.put("/clients/{cid}")
    async def update_client(cid: str, payload: ClientUpdate, user: dict = Depends(get_tenant_admin)):
        doc = await db.crm_clients.find_one({"id": cid})
        if not doc:
            raise HTTPException(status_code=404, detail="not_found")
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        if "status" in data:
            if not client_status_transition(doc.get("status", "new"), data["status"]):
                raise HTTPException(status_code=409, detail="bad_status_transition")
        if "phones" in data:
            data["phones"] = [normalize_phone(p) for p in data["phones"] if normalize_phone(p)]
        if data.get("unit_type_pref") and data["unit_type_pref"] not in UNIT_TYPES:
            raise HTTPException(status_code=422, detail="bad_unit_type")
        data["updated_at"] = _now()
        await db.crm_clients.update_one({"id": cid}, {"$set": data})
        return {"message": "updated"}

    # ── Follow-ups (reminders) ──────────────────────────────────────────────
    @router.post("/clients/{cid}/followups")
    async def add_followup(cid: str, payload: FollowUpIn, user: dict = Depends(get_tenant_admin)):
        if not await db.crm_clients.find_one({"id": cid}):
            raise HTTPException(status_code=404, detail="client_not_found")
        if payload.kind not in FOLLOWUP_KINDS:
            raise HTTPException(status_code=422, detail="bad_kind")
        doc = {"id": new_id(), "client_id": cid, "date": payload.date, "kind": payload.kind,
               "note": payload.note, "done": False, "created_by": user.get("id"), "created_at": _now()}
        await db.crm_followups.insert_one(doc)
        return _clean(doc)

    @router.put("/followups/{fid}/done")
    async def followup_done(fid: str, user: dict = Depends(require_tenant)):
        r = await db.crm_followups.update_one({"id": fid}, {"$set": {"done": True, "done_at": _now()}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return {"message": "done"}

    @router.get("/followups/upcoming")
    async def upcoming_followups(days: int = 7, user: dict = Depends(require_tenant)):
        """Reminders due within `days` (or overdue), not yet done."""
        horizon = datetime.fromtimestamp(
            datetime.now(timezone.utc).timestamp() + days * 86400, timezone.utc
        ).isoformat()
        cursor = db.crm_followups.find({"done": False, "date": {"$lte": horizon}}).sort("date", 1).limit(200)
        items = []
        async for f in cursor:
            c = await db.crm_clients.find_one({"id": f["client_id"]}, {"name": 1})
            items.append(_clean(f) | {"client_name": (c or {}).get("name")})
        return {"items": items}

    # ── Viewings (معاينات) ──────────────────────────────────────────────────
    @router.post("/clients/{cid}/viewings")
    async def add_viewing(cid: str, payload: ViewingIn, user: dict = Depends(get_tenant_admin)):
        if not await db.crm_clients.find_one({"id": cid}):
            raise HTTPException(status_code=404, detail="client_not_found")
        unit = await db.crm_units.find_one({"id": payload.unit_id})
        if not unit:
            raise HTTPException(status_code=404, detail="unit_not_found")
        doc = {"id": new_id(), "client_id": cid, "unit_id": payload.unit_id,
               "unit_code": unit.get("code"), "date": payload.date,
               "feedback": payload.feedback, "result": payload.result,
               "created_by": user.get("id"), "created_at": _now()}
        await db.crm_viewings.insert_one(doc)
        return _clean(doc)

    # ── Projects ────────────────────────────────────────────────────────────
    @router.get("/projects")
    async def list_projects(user: dict = Depends(require_tenant)):
        cursor = db.crm_projects.find({}).sort("created_at", -1)
        items = []
        async for p in cursor:
            units = await db.crm_units.count_documents({"project_id": p["id"]})
            avail = await db.crm_units.count_documents({"project_id": p["id"], "status": "available"})
            items.append(_clean(p) | {"units_count": units, "available_count": avail})
        return {"items": items}

    @router.post("/projects")
    async def create_project(payload: ProjectIn, user: dict = Depends(get_tenant_admin)):
        if not payload.name.strip():
            raise HTTPException(status_code=422, detail="name_required")
        doc = payload.model_dump()
        doc.update({"id": new_id(), "code": await _next(db, "PRJ"), "created_at": _now()})
        await db.crm_projects.insert_one(doc)
        return _clean(doc)

    # ── Units ───────────────────────────────────────────────────────────────
    @router.get("/units")
    async def list_units(status: Optional[str] = None, project_id: Optional[str] = None,
                         user: dict = Depends(require_tenant)):
        query = {}
        if status in UNIT_STATUSES:
            query["status"] = status
        if project_id:
            query["project_id"] = project_id
        cursor = db.crm_units.find(query, {"photos": 0}).sort("created_at", -1).limit(500)
        return {"items": [_clean(d) async for d in cursor]}

    @router.post("/units")
    async def create_unit(payload: UnitIn, user: dict = Depends(get_tenant_admin)):
        if payload.unit_type not in UNIT_TYPES:
            raise HTTPException(status_code=422, detail="bad_unit_type")
        if payload.price is None or payload.price <= 0:
            raise HTTPException(status_code=422, detail="price_required")
        if payload.project_id and not await db.crm_projects.find_one({"id": payload.project_id}):
            raise HTTPException(status_code=404, detail="project_not_found")
        doc = payload.model_dump()
        doc.update({"id": new_id(), "code": await _next(db, "UNT"), "status": "available",
                    "created_at": _now(), "created_by": user.get("id")})
        await db.crm_units.insert_one(doc)
        doc.pop("_id", None)
        return {k: v for k, v in doc.items() if k != "photos"} | {"photos_count": len(doc.get("photos") or [])}

    @router.get("/units/{uid}")
    async def get_unit(uid: str, user: dict = Depends(require_tenant)):
        doc = await db.crm_units.find_one({"id": uid})
        if not doc:
            raise HTTPException(status_code=404, detail="not_found")
        return _clean(doc)

    @router.put("/units/{uid}/status")
    async def set_unit_status(uid: str, payload: dict, user: dict = Depends(get_tenant_admin)):
        target = (payload or {}).get("status")
        if target not in UNIT_STATUSES:
            raise HTTPException(status_code=422, detail="bad_status")
        r = await db.crm_units.update_one({"id": uid}, {"$set": {"status": target, "updated_at": _now()}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return {"message": "updated", "status": target}

    # ── Matching ────────────────────────────────────────────────────────────
    @router.get("/units/{uid}/matches")
    async def clients_for_unit(uid: str, limit: int = 10, user: dict = Depends(require_tenant)):
        unit = await db.crm_units.find_one({"id": uid})
        if not unit:
            raise HTTPException(status_code=404, detail="not_found")
        scored = []
        async for c in db.crm_clients.find({"status": {"$nin": ["won", "lost"]}}):
            s = score_unit_for_client(unit, c)
            if s > 0:
                scored.append({"client": _clean(c), "score": s})
        scored.sort(key=lambda x: -x["score"])
        return {"unit": _clean(unit) | {"photos": len(unit.get("photos") or [])}, "matches": scored[:limit]}

    @router.get("/clients/{cid}/matches")
    async def units_for_client(cid: str, limit: int = 10, user: dict = Depends(require_tenant)):
        client = await db.crm_clients.find_one({"id": cid})
        if not client:
            raise HTTPException(status_code=404, detail="not_found")
        scored = []
        async for u in db.crm_units.find({"status": "available"}, {"photos": 0}):
            s = score_unit_for_client(u, client)
            if s > 0:
                scored.append({"unit": _clean(u), "score": s})
        scored.sort(key=lambda x: -x["score"])
        return {"client": _clean(client), "matches": scored[:limit]}

    @router.get("/matching-report")
    async def matching_report(user: dict = Depends(require_tenant)):
        """Cross matching snapshot: best client per available unit + best unit per active client."""
        units = [_clean(u) async for u in db.crm_units.find({"status": "available"}, {"photos": 0})]
        clients = [_clean(c) async for c in db.crm_clients.find({"status": {"$nin": ["won", "lost"]}})]
        unit_matches = []
        for u in units:
            best = max(((score_unit_for_client(u, c), c) for c in clients), key=lambda x: x[0], default=(0, None))
            if best[0] > 0:
                unit_matches.append({"unit_code": u.get("code"), "unit_id": u["id"], "price": u.get("price"),
                                     "client_name": best[1]["name"], "client_id": best[1]["id"], "score": best[0]})
        client_matches = []
        for c in clients:
            best = max(((score_unit_for_client(u, c), u) for u in units), key=lambda x: x[0], default=(0, None))
            if best[0] > 0:
                client_matches.append({"client_name": c["name"], "client_id": c["id"],
                                       "unit_code": best[1].get("code"), "unit_id": best[1]["id"], "score": best[0]})
        return {"generated_at": _now(), "available_units": len(units), "active_clients": len(clients),
                "unit_matches": unit_matches, "client_matches": client_matches}

    return router
