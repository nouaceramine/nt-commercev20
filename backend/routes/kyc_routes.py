"""M12: KYC (Know Your Customer) — tenant identity verification.

Tenants submit business identity data + documents (base64); the platform
super-admin reviews and approves/rejects. Approved tenants get
`kyc_status: 'verified'` on their saas_tenants record.

Submissions live in the MAIN database (cross-tenant review), keyed by
tenant_id. Only summary fields are returned in list endpoints; document
payloads are served by the single-submission admin endpoint.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config.database import main_db
from utils.ids import new_id
from .saas.helpers import get_super_admin

DOC_TYPES = ["id_card", "rc_extract", "nif_doc", "photo_shop", "other"]
MAX_DOCS = 3
MAX_DOC_B64_CHARS = 3_500_000  # ~2.5MB binary
REVIEW_ACTIONS = ("approve", "reject")


# ── Pure helpers (unit-tested) ──────────────────────────────────────────────
def validate_submission(data: dict) -> list:
    """Return a list of validation error strings (empty = valid)."""
    errors = []
    if not (data.get("business_name") or "").strip():
        errors.append("business_name_required")
    if not (data.get("phone") or "").strip():
        errors.append("phone_required")
    docs = data.get("documents") or []
    if not docs:
        errors.append("documents_required")
    if len(docs) > MAX_DOCS:
        errors.append("too_many_documents")
    for d in docs:
        if d.get("doc_type") not in DOC_TYPES:
            errors.append("bad_doc_type")
            break
        payload = d.get("data_b64") or ""
        if not payload:
            errors.append("empty_document")
            break
        if len(payload) > MAX_DOC_B64_CHARS:
            errors.append("document_too_large")
            break
    return errors


def next_status(action: str) -> str:
    if action not in REVIEW_ACTIONS:
        raise ValueError("bad_action")
    return "approved" if action == "approve" else "rejected"


async def _next_kyc_code() -> str:
    year = datetime.now(timezone.utc).year
    doc = await main_db.counters.find_one_and_update(
        {"_id": f"KYC_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"KYC-{year}-{doc['seq']:04d}"


def _summary(doc: dict) -> dict:
    """Submission without document payloads."""
    return {k: v for k, v in doc.items() if k not in ("_id", "documents")} | {
        "documents_count": len(doc.get("documents") or []),
    }


# ── Payload models ──────────────────────────────────────────────────────────
class KycDocument(BaseModel):
    doc_type: str
    filename: str = ""
    data_b64: str


class KycSubmissionIn(BaseModel):
    business_name: str = ""
    activity: str = ""
    rc_number: str = ""
    nif: str = ""
    phone: str = ""
    address: str = ""
    wilaya: str = ""
    documents: List[KycDocument] = Field(default_factory=list)


class KycReviewIn(BaseModel):
    action: str
    note: Optional[str] = ""


def create_kyc_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/kyc", tags=["kyc"])

    # ── Tenant side ─────────────────────────────────────────────────────────
    @router.get("/status")
    async def kyc_status(user: dict = Depends(require_tenant)):
        tid = user.get("tenant_id") or user.get("id")
        doc = await main_db.kyc_submissions.find_one(
            {"tenant_id": tid}, sort=[("submitted_at", -1)]
        )
        tenant = await main_db.saas_tenants.find_one({"id": tid}, {"kyc_status": 1})
        if not doc:
            return {"status": "none", "kyc_status": (tenant or {}).get("kyc_status"), "submission": None}
        return {
            "status": doc.get("status"),
            "kyc_status": (tenant or {}).get("kyc_status"),
            "submission": _summary(doc),
        }

    @router.get("/history")
    async def kyc_history(user: dict = Depends(require_tenant)):
        tid = user.get("tenant_id") or user.get("id")
        cursor = main_db.kyc_submissions.find({"tenant_id": tid}).sort("submitted_at", -1)
        return {"items": [_summary(d) async for d in cursor]}

    @router.post("/submit")
    async def kyc_submit(payload: KycSubmissionIn, user: dict = Depends(get_tenant_admin)):
        tid = user.get("tenant_id") or user.get("id")
        data = payload.model_dump()
        errors = validate_submission(data)
        if errors:
            raise HTTPException(status_code=422, detail={"errors": errors})
        pending = await main_db.kyc_submissions.find_one({"tenant_id": tid, "status": "pending"})
        if pending:
            raise HTTPException(status_code=409, detail="pending_submission_exists")
        tenant = await main_db.saas_tenants.find_one({"id": tid}, {"short_id": 1})
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": new_id(),
            "code": await _next_kyc_code(),
            "tenant_id": tid,
            "tenant_short_id": (tenant or {}).get("short_id"),
            "business_name": data["business_name"].strip(),
            "activity": data.get("activity", "").strip(),
            "rc_number": data.get("rc_number", "").strip(),
            "nif": data.get("nif", "").strip(),
            "phone": data["phone"].strip(),
            "address": data.get("address", "").strip(),
            "wilaya": data.get("wilaya", "").strip(),
            "documents": [d.model_dump() if hasattr(d, "model_dump") else d for d in data["documents"]],
            "status": "pending",
            "review_note": None,
            "submitted_at": now,
            "submitted_by": user.get("id"),
            "reviewed_at": None,
            "reviewed_by": None,
        }
        await main_db.kyc_submissions.insert_one(doc)
        await main_db.saas_tenants.update_one({"id": tid}, {"$set": {"kyc_status": "pending"}})
        return {"message": "submitted", "code": doc["code"], "status": "pending"}

    # ── Platform (super-admin) side ─────────────────────────────────────────
    @router.get("/admin/submissions")
    async def admin_list(status: Optional[str] = None, limit: int = 50, admin: dict = Depends(get_super_admin)):
        q = {"status": status} if status in ("pending", "approved", "rejected") else {}
        cursor = main_db.kyc_submissions.find(q).sort("submitted_at", -1).limit(min(limit, 200))
        return {"items": [_summary(d) async for d in cursor]}

    @router.get("/admin/submissions/{sid}")
    async def admin_get(sid: str, admin: dict = Depends(get_super_admin)):
        doc = await main_db.kyc_submissions.find_one({"id": sid}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="not_found")
        return doc

    @router.put("/admin/submissions/{sid}/review")
    async def admin_review(sid: str, payload: KycReviewIn, admin: dict = Depends(get_super_admin)):
        doc = await main_db.kyc_submissions.find_one({"id": sid})
        if not doc:
            raise HTTPException(status_code=404, detail="not_found")
        if doc.get("status") != "pending":
            raise HTTPException(status_code=409, detail="already_reviewed")
        try:
            status = next_status(payload.action)
        except ValueError:
            raise HTTPException(status_code=422, detail="bad_action")
        now = datetime.now(timezone.utc).isoformat()
        await main_db.kyc_submissions.update_one(
            {"id": sid, "status": "pending"},
            {"$set": {
                "status": status,
                "review_note": (payload.note or "").strip(),
                "reviewed_at": now,
                "reviewed_by": admin.get("id"),
            }},
        )
        await main_db.saas_tenants.update_one(
            {"id": doc["tenant_id"]},
            {"$set": {"kyc_status": "verified" if status == "approved" else "rejected",
                      "kyc_reviewed_at": now}},
        )
        return {"message": "reviewed", "status": status}

    return router
