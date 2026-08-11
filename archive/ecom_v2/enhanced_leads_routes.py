"""
Enhanced Leads Routes - NT Commerce v16
Section 6: Leads Management Enhancement
Provides 30 endpoints for advanced lead scoring, distribution, nurturing & conversion
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback

LEAD_STATUSES = ["new", "contacted", "qualified", "proposal_sent", "negotiating", "converted", "lost", "archived"]
LEAD_SOURCES = ["facebook", "instagram", "tiktok", "whatsapp", "telegram", "website", "referral", "call", "walk_in", "manual", "other"]


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class LeadScoreUpdate(BaseModel):
    score: int = Field(ge=0, le=100)
    reason: Optional[str] = None

class LeadStatusUpdate(BaseModel):
    status: Literal["new", "contacted", "qualified", "proposal_sent", "negotiating", "converted", "lost", "archived"]
    notes: Optional[str] = None
    notify: bool = True

class LeadAssignment(BaseModel):
    assigned_to: str  # user_id
    auto_assign: bool = False
    notes: Optional[str] = None

class LeadTagRequest(BaseModel):
    tags: List[str] = Field(min_length=1)

class LeadNoteCreate(BaseModel):
    content: str = Field(min_length=1)
    note_type: Literal["general", "call", "email", "meeting", "follow_up", "complaint"] = "general"
    follow_up_date: Optional[str] = None
    reminder: bool = False

class LeadConversionRequest(BaseModel):
    convert_to: Literal["order", "customer"] = "customer"
    customer_id: Optional[str] = None  # if linking to existing customer
    order_items: Optional[List[Dict[str, Any]]] = None
    shipping_address: Optional[Dict[str, str]] = None

class LeadCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    source: Optional[str] = None
    channel: Optional[str] = None
    budget: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    target_audience: Optional[Dict[str, Any]] = None
    is_active: bool = True

class LeadCampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source: Optional[str] = None
    budget: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    target_audience: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class LeadDistributionRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    conditions: Dict[str, Any] = Field(default_factory=dict)
    assign_to_user_ids: List[str] = Field(min_length=1)
    distribution_method: Literal["round_robin", "least_loaded", "random", "skill_based"] = "round_robin"
    is_active: bool = True

class AdvancedLeadSearch(BaseModel):
    query: Optional[str] = None
    status: Optional[List[str]] = None
    source: Optional[List[str]] = None
    channel: Optional[List[str]] = None
    assigned_to: Optional[str] = None
    campaign_id: Optional[str] = None
    min_score: Optional[int] = None
    max_score: Optional[int] = None
    tags: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    has_follow_up: Optional[bool] = None
    sort_by: Optional[str] = "created_at"
    sort_order: Optional[str] = "desc"
    page: int = 1
    limit: int = 50

class BulkLeadUpdate(BaseModel):
    lead_ids: List[str] = Field(min_length=1)
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    tags: Optional[List[str]] = None
    campaign_id: Optional[str] = None


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_leads_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/leads", tags=["Leads v2 - Management"])

    async def log_activity(lead_id: str, action: str, details: str, user_id: str = "system", metadata: Dict = None):
        entry = {
            "id": str(uuid.uuid4()),
            "lead_id": lead_id,
            "action": action,
            "details": details,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        await db.lead_activity_log.insert_one(entry)
        if event_bus:
            await event_bus.publish("lead.activity", {"lead_id": lead_id, "action": action})
        return entry

    async def get_lead_or_404(lead_id: str):
        lead = await db.ecom_leads.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")
        return lead

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, limit + 1

    # ===== 1. LEAD SCORING (2 endpoints) =====

    @router.put("/{lead_id}/score", response_model=Dict[str, Any])
    async def update_lead_score(lead_id: str, score_update: LeadScoreUpdate, current_user: dict = Depends(get_current_user)):
        """Update lead score (0-100) manually or via AI."""
        try:
            lead = await get_lead_or_404(lead_id)
            old_score = lead.get("score", 0) or 0
            await db.ecom_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "score": score_update.score,
                    "score_reason": score_update.reason,
                    "score_updated_at": now_iso(),
                    "score_updated_by": current_user.get("id", ""),
                    "updated_at": now_iso()
                }}
            )
            await log_activity(lead_id, "score_updated", f"Score: {old_score} -> {score_update.score}", current_user.get("id", ""), {"old": old_score, "new": score_update.score})
            return {"lead_id": lead_id, "old_score": old_score, "new_score": score_update.score, "reason": score_update.reason}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{lead_id}/score/auto", response_model=Dict[str, Any])
    async def auto_score_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
        """Auto-calculate lead score based on rules: source quality, engagement, completeness."""
        try:
            lead = await get_lead_or_404(lead_id)
            score = 0
            reasons = []

            # Source quality (0-30)
            source_scores = {"facebook": 15, "instagram": 15, "tiktok": 10, "whatsapp": 25, "referral": 30, "website": 20, "call": 25}
            src = lead.get("source", lead.get("channel", "manual"))
            src_score = source_scores.get(src, 5)
            score += src_score
            reasons.append(f"source ({src}): +{src_score}")

            # Data completeness (0-30)
            has_phone = 1 if lead.get("phone") else 0
            has_email = 1 if lead.get("email") else 0
            has_message = 1 if lead.get("message") else 0
            has_name = 1 if lead.get("name") else 0
            completeness = (has_phone + has_email + has_message + has_name) * 7
            score += min(30, completeness)
            reasons.append(f"completeness: +{min(30, completeness)}")

            # Engagement (0-20)
            interactions = await db.lead_activity_log.count_documents({"lead_id": lead_id})
            engagement = min(20, interactions * 5)
            score += engagement
            reasons.append(f"engagement ({interactions} interactions): +{engagement}")

            # Status bonus (0-20)
            status_bonus = {"qualified": 15, "proposal_sent": 20, "negotiating": 18, "converted": 20, "contacted": 10}
            st = lead.get("status", "new")
            bonus = status_bonus.get(st, 0)
            score += bonus
            reasons.append(f"status ({st}): +{bonus}")

            score = min(100, max(0, score))

            await db.ecom_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "score": score,
                    "score_reason": "; ".join(reasons),
                    "score_updated_at": now_iso(),
                    "score_method": "auto",
                    "updated_at": now_iso()
                }}
            )
            return {"lead_id": lead_id, "score": score, "breakdown": reasons, "method": "auto"}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. LEAD ASSIGNMENT & DISTRIBUTION (3 endpoints) =====

    @router.put("/{lead_id}/assign", response_model=Dict[str, Any])
    async def assign_lead(lead_id: str, assignment: LeadAssignment, current_user: dict = Depends(get_current_user)):
        """Assign a lead to a sales rep / user."""
        try:
            lead = await get_lead_or_404(lead_id)
            assigned_user = await db.users.find_one({"id": assignment.assigned_to}, {"_id": 0, "id": 1, "name": 1, "email": 1})
            if not assigned_user:
                raise HTTPException(status_code=404, detail="User not found")

            await db.ecom_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "assigned_to": assignment.assigned_to,
                    "assigned_to_name": assigned_user.get("name", ""),
                    "assigned_at": now_iso(),
                    "assigned_by": current_user.get("id", ""),
                    "assignment_notes": assignment.notes,
                    "status": "contacted" if lead.get("status") == "new" else lead.get("status"),
                    "updated_at": now_iso()
                }}
            )
            await log_activity(lead_id, "assigned", f"Assigned to {assigned_user.get('name', '')}", current_user.get("id", ""))
            return {"lead_id": lead_id, "assigned_to": assignment.assigned_to, "assigned_to_name": assigned_user.get("name", "")}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/distribution/rules", response_model=Dict[str, Any])
    async def list_distribution_rules(is_active: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
        """List lead distribution rules."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            rules = await db.lead_distribution_rules.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"rules": rules, "total": len(rules)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/distribution/rules", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_distribution_rule(rule: LeadDistributionRuleCreate, current_user: dict = Depends(get_current_user)):
        """Create an auto-distribution rule (round-robin, least-loaded, etc.)."""
        try:
            rule_id = str(uuid.uuid4())
            doc = {
                "id": rule_id,
                "name": rule.name,
                "conditions": rule.conditions,
                "assign_to_user_ids": rule.assign_to_user_ids,
                "distribution_method": rule.distribution_method,
                "is_active": rule.is_active,
                "last_assigned_index": 0,  # for round-robin
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.lead_distribution_rules.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. LEAD CAMPAIGNS (5 endpoints) =====

    @router.post("/campaigns", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_campaign(campaign: LeadCampaignCreate, current_user: dict = Depends(get_current_user)):
        """Create a lead acquisition campaign."""
        try:
            camp_id = str(uuid.uuid4())
            doc = {
                "id": camp_id,
                "name": campaign.name,
                "description": campaign.description,
                "source": campaign.source,
                "channel": campaign.channel,
                "budget": campaign.budget,
                "start_date": campaign.start_date,
                "end_date": campaign.end_date,
                "target_audience": campaign.target_audience,
                "is_active": campaign.is_active,
                "total_leads": 0,
                "converted_leads": 0,
                "total_revenue": 0,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.lead_campaigns.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/campaigns", response_model=Dict[str, Any])
    async def list_campaigns(is_active: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
        """List lead campaigns with stats."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            campaigns = await db.lead_campaigns.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            # Enrich with real counts
            for c in campaigns:
                c["total_leads"] = await db.ecom_leads.count_documents({"campaign_id": c["id"]})
                c["converted_leads"] = await db.ecom_leads.count_documents({"campaign_id": c["id"], "status": "converted"})
            return {"campaigns": campaigns, "total": len(campaigns)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/campaigns/{campaign_id}", response_model=Dict[str, Any])
    async def get_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
        """Get campaign details with leads."""
        try:
            campaign = await db.lead_campaigns.find_one({"id": campaign_id}, {"_id": 0})
            if not campaign:
                raise HTTPException(status_code=404, detail="Campaign not found")
            campaign["total_leads"] = await db.ecom_leads.count_documents({"campaign_id": campaign_id})
            campaign["converted_leads"] = await db.ecom_leads.count_documents({"campaign_id": campaign_id, "status": "converted"})
            leads = await db.ecom_leads.find({"campaign_id": campaign_id}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(None)
            campaign["leads"] = leads
            return campaign
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/campaigns/{campaign_id}", response_model=Dict[str, Any])
    async def update_campaign(campaign_id: str, campaign: LeadCampaignUpdate, current_user: dict = Depends(get_current_user)):
        """Update campaign settings."""
        try:
            existing = await db.lead_campaigns.find_one({"id": campaign_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Campaign not found")
            update = {k: v for k, v in campaign.model_dump().items() if v is not None}
            if update:
                update["updated_at"] = now_iso()
                await db.lead_campaigns.update_one({"id": campaign_id}, {"$set": update})
            doc = await db.lead_campaigns.find_one({"id": campaign_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate a campaign."""
        try:
            await db.lead_campaigns.update_one({"id": campaign_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. LEAD CONVERSION (1 endpoint) =====

    @router.post("/{lead_id}/convert", response_model=Dict[str, Any])
    async def convert_lead(lead_id: str, req: LeadConversionRequest, current_user: dict = Depends(get_current_user)):
        """Convert a lead to a customer or order. Creates customer if needed, links order."""
        try:
            lead = await get_lead_or_404(lead_id)
            if lead.get("status") == "converted":
                raise HTTPException(status_code=400, detail="Lead already converted")

            now = now_iso()
            result = {"lead_id": lead_id}

            if req.convert_to == "customer":
                # Create customer from lead
                customer_id = str(uuid.uuid4())
                customer_doc = {
                    "id": customer_id,
                    "name": lead.get("name", ""),
                    "phone": lead.get("phone", ""),
                    "email": lead.get("email", ""),
                    "address": "",
                    "notes": f"Converted from lead {lead_id}\n{lead.get('message', '')}",
                    "code": "",
                    "family_id": "",
                    "family_name": "",
                    "total_purchases": 0,
                    "balance": 0,
                    "source": lead.get("source", lead.get("channel", "")),
                    "lead_id": lead_id,
                    "created_at": now
                }
                await db.customers.insert_one(customer_doc)

                # Update lead
                await db.ecom_leads.update_one(
                    {"id": lead_id},
                    {"$set": {
                        "status": "converted",
                        "converted_at": now,
                        "converted_by": current_user.get("id", ""),
                        "converted_to": "customer",
                        "converted_customer_id": customer_id,
                        "updated_at": now
                    }}
                )

                result["customer_id"] = customer_id
                result["converted_to"] = "customer"
                await log_activity(lead_id, "converted", f"Converted to customer {customer_id}", current_user.get("id", ""))

            elif req.convert_to == "order":
                # Create order from lead
                order_id = str(uuid.uuid4())
                order_doc = {
                    "id": order_id,
                    "order_code": f"ORD-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
                    "channel": lead.get("source", lead.get("channel", "manual")),
                    "status": "new",
                    "customer": {
                        "id": "",
                        "name": lead.get("name", ""),
                        "phone": lead.get("phone", ""),
                        "email": lead.get("email", ""),
                        "address": lead.get("message", "")
                    },
                    "items": req.order_items or [],
                    "total": sum(item.get("total", 0) for item in (req.order_items or [])),
                    "shipping_address": req.shipping_address or {},
                    "lead_id": lead_id,
                    "created_at": now,
                    "created_by": current_user.get("id", "")
                }
                await db.ecom_orders.insert_one(order_doc)

                # Update lead
                await db.ecom_leads.update_one(
                    {"id": lead_id},
                    {"$set": {
                        "status": "converted",
                        "converted_at": now,
                        "converted_by": current_user.get("id", ""),
                        "converted_to": "order",
                        "converted_order_id": order_id,
                        "updated_at": now
                    }}
                )

                result["order_id"] = order_id
                result["converted_to"] = "order"
                await log_activity(lead_id, "converted", f"Converted to order {order_id}", current_user.get("id", ""))

            return result
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. LEAD NOTES & TIMELINE (3 endpoints) =====

    @router.post("/{lead_id}/notes", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def add_lead_note(lead_id: str, note: LeadNoteCreate, current_user: dict = Depends(get_current_user)):
        """Add a note to a lead with optional follow-up reminder."""
        try:
            lead = await get_lead_or_404(lead_id)
            note_id = str(uuid.uuid4())
            doc = {
                "id": note_id,
                "lead_id": lead_id,
                "content": note.content,
                "note_type": note.note_type,
                "follow_up_date": note.follow_up_date,
                "reminder": note.reminder,
                "created_at": now_iso(),
                "created_by": current_user.get("id", ""),
                "created_by_name": current_user.get("name", "")
            }
            await db.lead_notes.insert_one(doc)
            doc.pop("_id", None)
            await log_activity(lead_id, "note_added", f"Note ({note.note_type}): {note.content[:50]}", current_user.get("id", ""))
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{lead_id}/notes", response_model=Dict[str, Any])
    async def get_lead_notes(lead_id: str, note_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        """Get all notes for a lead."""
        try:
            query = {"lead_id": lead_id}
            if note_type:
                query["note_type"] = note_type
            notes = await db.lead_notes.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"lead_id": lead_id, "notes": notes, "total": len(notes)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{lead_id}/timeline", response_model=Dict[str, Any])
    async def get_lead_timeline(lead_id: str, current_user: dict = Depends(get_current_user)):
        """Get unified timeline for a lead: notes + status changes + assignments."""
        try:
            lead = await get_lead_or_404(lead_id)
            events = []

            # Notes
            notes = await db.lead_notes.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
            for n in notes:
                events.append({
                    "type": "note",
                    "subtype": n.get("note_type", ""),
                    "title": n.get("note_type", "note").capitalize(),
                    "description": n.get("content", ""),
                    "timestamp": n.get("created_at", ""),
                    "by": n.get("created_by_name", "")
                })

            # Activity log
            activities = await db.lead_activity_log.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
            for a in activities:
                events.append({
                    "type": "activity",
                    "subtype": a.get("action", ""),
                    "title": a.get("action", "").replace("_", " ").capitalize(),
                    "description": a.get("details", ""),
                    "timestamp": a.get("created_at", ""),
                    "by": ""
                })

            # Sort
            events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return {"lead_id": lead_id, "lead_name": lead.get("name", ""), "events": events, "total": len(events)}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. LEAD TAGS & FOLLOW-UP (3 endpoints) =====

    @router.post("/{lead_id}/tags", response_model=Dict[str, Any])
    async def add_lead_tags(lead_id: str, req: LeadTagRequest, current_user: dict = Depends(get_current_user)):
        """Add tags to a lead."""
        try:
            lead = await get_lead_or_404(lead_id)
            existing_tags = set(lead.get("tags", []))
            new_tags = set(req.tags)
            merged = list(existing_tags | new_tags)
            await db.ecom_leads.update_one({"id": lead_id}, {"$set": {"tags": merged, "updated_at": now_iso()}})
            await log_activity(lead_id, "tags_added", f"Tags: {req.tags}", current_user.get("id", ""))
            return {"lead_id": lead_id, "tags": merged, "added": list(new_tags - existing_tags)}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{lead_id}/tags/{tag}", response_model=Dict[str, Any])
    async def remove_lead_tag(lead_id: str, tag: str, current_user: dict = Depends(get_current_user)):
        """Remove a tag from a lead."""
        try:
            lead = await get_lead_or_404(lead_id)
            tags = lead.get("tags", [])
            if tag in tags:
                tags.remove(tag)
                await db.ecom_leads.update_one({"id": lead_id}, {"$set": {"tags": tags, "updated_at": now_iso()}})
            return {"lead_id": lead_id, "tags": tags, "removed": tag}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/follow-ups/pending", response_model=Dict[str, Any])
    async def get_pending_follow_ups(
        assigned_to: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """Get leads with pending follow-ups (based on notes with follow_up_date)."""
        try:
            # Find notes with follow_up_date in range
            note_query = {"follow_up_date": {"$exists": True, "$ne": None}}
            if date_from or date_to:
                note_query["follow_up_date"]["$gte"] = date_from or datetime.utcnow().isoformat()[:10]
                note_query["follow_up_date"]["$lte"] = date_to or (datetime.utcnow() + timedelta(days=7)).isoformat()[:10]

            pending_notes = await db.lead_notes.find(note_query, {"_id": 0}).sort("follow_up_date", 1).to_list(100)

            # Enrich with lead data
            results = []
            seen_leads = set()
            for note in pending_notes:
                lid = note["lead_id"]
                if lid in seen_leads:
                    continue
                seen_leads.add(lid)
                lead = await db.ecom_leads.find_one({"id": lid}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "status": 1, "assigned_to": 1, "assigned_to_name": 1})
                if lead:
                    if assigned_to and lead.get("assigned_to") != assigned_to:
                        continue
                    results.append({"lead": lead, "follow_up_note": note})

            return {"pending_follow_ups": results, "total": len(results)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. ADVANCED LEAD SEARCH (1 endpoint) =====

    @router.post("/search/advanced", response_model=Dict[str, Any])
    async def advanced_lead_search(search: AdvancedLeadSearch, current_user: dict = Depends(get_current_user)):
        """Advanced lead search with multiple filters and sorting."""
        try:
            query = {}
            if search.query:
                escaped = search.query.replace("\\", "\\").replace("*", "\\*").replace("(", "\\(").replace(")", "\\)")
                query["$or"] = [
                    {"name": {"$regex": escaped, "$options": "i"}},
                    {"phone": {"$regex": escaped, "$options": "i"}},
                    {"email": {"$regex": escaped, "$options": "i"}},
                    {"message": {"$regex": escaped, "$options": "i"}}
                ]
            if search.status:
                query["status"] = {"$in": search.status}
            if search.source:
                query["source"] = {"$in": search.source}
            if search.channel:
                query["channel"] = {"$in": search.channel}
            if search.assigned_to:
                query["assigned_to"] = search.assigned_to
            if search.campaign_id:
                query["campaign_id"] = search.campaign_id
            if search.min_score is not None or search.max_score is not None:
                query["score"] = {}
                if search.min_score is not None:
                    query["score"]["$gte"] = search.min_score
                if search.max_score is not None:
                    query["score"]["$lte"] = search.max_score
            if search.tags:
                query["tags"] = {"$in": search.tags}
            if search.date_from or search.date_to:
                query["created_at"] = {}
                if search.date_from:
                    query["created_at"]["$gte"] = search.date_from
                if search.date_to:
                    query["created_at"]["$lte"] = search.date_to

            skip, _ = paginate(search.page, search.limit)
            sort_dir = -1 if search.sort_order == "desc" else 1
            sort_field = search.sort_by if search.sort_by in ["name", "created_at", "score", "status"] else "created_at"

            total = await db.ecom_leads.count_documents(query)
            items = await db.ecom_leads.find(query, {"_id": 0}).sort(sort_field, sort_dir).skip(skip).limit(search.limit).to_list(search.limit)
            return {
                "leads": items,
                "total": total,
                "page": search.page,
                "limit": search.limit,
                "pages": (total + search.limit - 1) // search.limit
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. BULK OPERATIONS (2 endpoints) =====

    @router.post("/bulk/update", response_model=Dict[str, Any])
    async def bulk_update_leads(req: BulkLeadUpdate, current_user: dict = Depends(get_current_user)):
        """Bulk update leads (status, assignee, tags, campaign)."""
        try:
            update = {"updated_at": now_iso()}
            if req.status:
                update["status"] = req.status
            if req.assigned_to:
                update["assigned_to"] = req.assigned_to
            if req.tags:
                update["tags"] = req.tags
            if req.campaign_id:
                update["campaign_id"] = req.campaign_id

            result = await db.ecom_leads.update_many(
                {"id": {"$in": req.lead_ids}},
                {"$set": update}
            )
            return {"matched": result.matched_count, "modified": result.modified_count, "update_fields": list(update.keys())}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk/assign", response_model=Dict[str, Any])
    async def bulk_assign_leads(lead_ids: List[str] = Body(...), assigned_to: str = Body(...), current_user: dict = Depends(get_current_user)):
        """Bulk assign leads to a user."""
        try:
            user_doc = await db.users.find_one({"id": assigned_to}, {"_id": 0, "name": 1})
            if not user_doc:
                raise HTTPException(status_code=404, detail="User not found")

            result = await db.ecom_leads.update_many(
                {"id": {"$in": lead_ids}},
                {"$set": {
                    "assigned_to": assigned_to,
                    "assigned_to_name": user_doc.get("name", ""),
                    "assigned_at": now_iso(),
                    "updated_at": now_iso()
                }}
            )
            return {"assigned_to": assigned_to, "matched": result.matched_count, "modified": result.modified_count}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. LEAD ANALYTICS (4 endpoints) =====

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_leads_analytics(current_user: dict = Depends(get_current_user)):
        """Lead analytics dashboard overview."""
        try:
            total = await db.ecom_leads.count_documents({})
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            new_today = await db.ecom_leads.count_documents({"created_at": {"$gte": today_start}})

            # Status breakdown
            status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
            status_counts = await db.ecom_leads.aggregate(status_pipeline).to_list(None)
            status_map = {s["_id"]: s["count"] for s in status_counts}

            # Source breakdown
            source_pipeline = [{"$group": {"_id": "$source", "count": {"$sum": 1}}}]
            source_counts = await db.ecom_leads.aggregate(source_pipeline).to_list(None)

            # Score distribution
            score_ranges = {
                "hot (80-100)": await db.ecom_leads.count_documents({"score": {"$gte": 80}}),
                "warm (50-79)": await db.ecom_leads.count_documents({"score": {"$gte": 50, "$lt": 80}}),
                "cold (0-49)": await db.ecom_leads.count_documents({"score": {"$lt": 50}}),
                "unscored": await db.ecom_leads.count_documents({"score": {"$exists": False}})
            }

            # Conversion rate
            converted = status_map.get("converted", 0)
            conversion_rate = round(converted / total * 100, 1) if total > 0 else 0

            # Unassigned
            unassigned = await db.ecom_leads.count_documents({"assigned_to": {"$exists": False}})

            return {
                "total_leads": total,
                "new_today": new_today,
                "status_breakdown": status_map,
                "source_breakdown": [{"source": s["_id"] or "unknown", "count": s["count"]} for s in source_counts],
                "score_distribution": score_ranges,
                "converted_leads": converted,
                "conversion_rate": conversion_rate,
                "unassigned_leads": unassigned
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/funnel", response_model=Dict[str, Any])
    async def get_leads_funnel(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Lead conversion funnel over time."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}}
            ]
            status_counts = await db.ecom_leads.aggregate(pipeline).to_list(None)
            status_map = {s["_id"]: s["count"] for s in status_counts}

            funnel = [
                {"stage": "new", "count": status_map.get("new", 0), "label": "New Leads"},
                {"stage": "contacted", "count": status_map.get("contacted", 0), "label": "Contacted"},
                {"stage": "qualified", "count": status_map.get("qualified", 0), "label": "Qualified"},
                {"stage": "proposal_sent", "count": status_map.get("proposal_sent", 0), "label": "Proposal Sent"},
                {"stage": "negotiating", "count": status_map.get("negotiating", 0), "label": "Negotiating"},
                {"stage": "converted", "count": status_map.get("converted", 0), "label": "Converted"},
            ]

            # Calculate drop-off rates
            for i in range(1, len(funnel)):
                prev = funnel[i-1]["count"]
                curr = funnel[i]["count"]
                funnel[i]["conversion_from_prev"] = round(curr / prev * 100, 1) if prev > 0 else 0

            return {"period_days": days, "funnel": funnel}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/performance", response_model=Dict[str, Any])
    async def get_team_performance(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Team performance: leads handled, converted per user."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"assigned_to": {"$exists": True}, "created_at": {"$gte": since}}},
                {"$group": {
                    "_id": "$assigned_to",
                    "total_leads": {"$sum": 1},
                    "converted": {"$sum": {"$cond": [{"$eq": ["$status", "converted"]}, 1, 0]}},
                    "lost": {"$sum": {"$cond": [{"$eq": ["$status", "lost"]}, 1, 0]}},
                    "avg_score": {"$avg": "$score"}
                }}
            ]
            results = await db.ecom_leads.aggregate(pipeline).to_list(None)

            enriched = []
            for r in results:
                user_doc = await db.users.find_one({"id": r["_id"]}, {"_id": 0, "name": 1})
                enriched.append({
                    "user_id": r["_id"],
                    "name": user_doc.get("name", "") if user_doc else "",
                    "total_leads": r["total_leads"],
                    "converted": r["converted"],
                    "lost": r["lost"],
                    "conversion_rate": round(r["converted"] / r["total_leads"] * 100, 1) if r["total_leads"] > 0 else 0,
                    "avg_lead_score": round(r.get("avg_score", 0) or 0, 1)
                })

            enriched.sort(key=lambda x: x["conversion_rate"], reverse=True)
            return {"period_days": days, "team": enriched}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/campaigns", response_model=Dict[str, Any])
    async def get_campaign_analytics(current_user: dict = Depends(get_current_user)):
        """Analytics per campaign: leads, conversion, ROI."""
        try:
            campaigns = await db.lead_campaigns.find({}, {"_id": 0}).to_list(None)
            results = []
            for c in campaigns:
                cid = c["id"]
                total = await db.ecom_leads.count_documents({"campaign_id": cid})
                converted = await db.ecom_leads.count_documents({"campaign_id": cid, "status": "converted"})
                revenue_pipeline = [
                    {"$match": {"campaign_id": cid, "status": "converted"}},
                    {"$group": {"_id": None, "total": {"$sum": "$converted_value"}}}
                ]
                rev_result = await db.ecom_leads.aggregate(revenue_pipeline).to_list(1)
                revenue = rev_result[0]["total"] if rev_result else 0
                budget = c.get("budget", 0) or 1  # avoid div by zero
                results.append({
                    "campaign_id": cid,
                    "name": c.get("name", ""),
                    "total_leads": total,
                    "converted": converted,
                    "conversion_rate": round(converted / total * 100, 1) if total > 0 else 0,
                    "revenue": round(revenue, 2),
                    "budget": budget if c.get("budget") else 0,
                    "roi": round((revenue - budget) / budget * 100, 1) if budget > 0 and c.get("budget") else 0
                })
            return {"campaigns": results}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. LEAD STATUS MANAGEMENT (2 endpoints) =====

    @router.put("/{lead_id}/status", response_model=Dict[str, Any])
    async def update_lead_status(lead_id: str, update: LeadStatusUpdate, current_user: dict = Depends(get_current_user)):
        """Update lead status with history tracking."""
        try:
            lead = await get_lead_or_404(lead_id)
            old_status = lead.get("status", "")
            await db.ecom_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "status": update.status,
                    "updated_at": now_iso(),
                    "status_updated_by": current_user.get("id", "")
                }, "$push": {
                    "status_history": {
                        "from": old_status,
                        "to": update.status,
                        "notes": update.notes,
                        "at": now_iso(),
                        "by": current_user.get("id", "")
                    }
                }}
            )
            await log_activity(lead_id, "status_changed", f"{old_status} -> {update.status}: {update.notes or ''}", current_user.get("id", ""))
            return {"lead_id": lead_id, "old_status": old_status, "new_status": update.status}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sources/list", response_model=Dict[str, Any])
    async def list_lead_sources(current_user: dict = Depends(get_current_user)):
        """Get all lead sources with counts."""
        try:
            pipeline = [
                {"$group": {"_id": "$source", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            results = await db.ecom_leads.aggregate(pipeline).to_list(None)
            return {"sources": [{"source": r["_id"] or "unknown", "count": r["count"]} for r in results], "total": len(results)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 11. ADDITIONAL ENDPOINTS (6 endpoints) =====

    @router.get("/{lead_id}/activity", response_model=Dict[str, Any])
    async def get_lead_activity(lead_id: str, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
        """Get activity log for a specific lead."""
        try:
            lead = await get_lead_or_404(lead_id)
            skip, _ = paginate(page, limit)
            total = await db.lead_activity_log.count_documents({"lead_id": lead_id})
            items = await db.lead_activity_log.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"lead_id": lead_id, "activities": items, "total": total, "page": page, "limit": limit}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{lead_id}/reassign", response_model=Dict[str, Any])
    async def reassign_lead(lead_id: str, new_assignee: str = Body(..., embed=True), current_user: dict = Depends(get_current_user)):
        """Reassign a lead to a different sales rep."""
        try:
            lead = await get_lead_or_404(lead_id)
            old_assignee = lead.get("assigned_to_name", "")
            user_doc = await db.users.find_one({"id": new_assignee}, {"_id": 0, "name": 1})
            if not user_doc:
                raise HTTPException(status_code=404, detail="User not found")
            await db.ecom_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "assigned_to": new_assignee,
                    "assigned_to_name": user_doc.get("name", ""),
                    "reassigned_at": now_iso(),
                    "updated_at": now_iso()
                }}
            )
            await log_activity(lead_id, "reassigned", f"Reassigned from {old_assignee} to {user_doc.get('name', '')}", current_user.get("id", ""))
            return {"lead_id": lead_id, "old_assignee": old_assignee, "new_assignee": user_doc.get("name", ""), "new_assignee_id": new_assignee}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/trends", response_model=Dict[str, Any])
    async def get_lead_trends(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Daily lead creation and conversion trends."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            # Daily lead creation
            create_pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
                {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "created": {"$sum": 1}}},
                {"$sort": {"_id": 1}}
            ]
            created_daily = await db.ecom_leads.aggregate(create_pipeline).to_list(None)

            # Daily conversions
            convert_pipeline = [
                {"$match": {"converted_at": {"$gte": since}}},
                {"$group": {"_id": {"$substr": ["$converted_at", 0, 10]}, "converted": {"$sum": 1}}},
                {"$sort": {"_id": 1}}
            ]
            converted_daily = await db.ecom_leads.aggregate(convert_pipeline).to_list(None)

            # Merge
            date_map = {}
            for d in created_daily:
                date_map[d["_id"]] = {"date": d["_id"], "created": d["created"], "converted": 0}
            for d in converted_daily:
                if d["_id"] in date_map:
                    date_map[d["_id"]]["converted"] = d["converted"]
                else:
                    date_map[d["_id"]] = {"date": d["_id"], "created": 0, "converted": d["converted"]}

            return {"period_days": days, "daily": list(date_map.values())}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{lead_id}/duplicate", response_model=Dict[str, Any])
    async def mark_lead_duplicate(lead_id: str, primary_lead_id: str = Body(..., embed=True), current_user: dict = Depends(get_current_user)):
        """Mark a lead as duplicate of another lead."""
        try:
            lead = await get_lead_or_404(lead_id)
            primary = await get_lead_or_404(primary_lead_id)
            await db.ecom_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "status": "archived",
                    "is_duplicate": True,
                    "primary_lead_id": primary_lead_id,
                    "archived_at": now_iso(),
                    "updated_at": now_iso()
                }}
            )
            # Merge notes to primary
            notes = await db.lead_notes.find({"lead_id": lead_id}, {"_id": 0}).to_list(None)
            for note in notes:
                note["lead_id"] = primary_lead_id
                note["content"] = f"[From duplicate {lead_id}] {note.get('content', '')}"
                await db.lead_notes.insert_one(note)

            await log_activity(lead_id, "marked_duplicate", f"Duplicate of {primary_lead_id}", current_user.get("id", ""))
            return {"lead_id": lead_id, "primary_lead_id": primary_lead_id, "status": "archived"}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/dashboard/summary", response_model=Dict[str, Any])
    async def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
        """Quick dashboard summary for leads (counts, hot leads, pending follow-ups)."""
        try:
            total = await db.ecom_leads.count_documents({})
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            new_today = await db.ecom_leads.count_documents({"created_at": {"$gte": today_start}})
            hot_leads = await db.ecom_leads.find({"score": {"$gte": 70}, "status": {"$nin": ["converted", "lost", "archived"]}}).sort("score", -1).limit(10).to_list(None)
            unassigned = await db.ecom_leads.count_documents({"assigned_to": {"$exists": False}, "status": {"$nin": ["converted", "lost", "archived"]}})
            pending_followup = await db.lead_notes.count_documents({"follow_up_date": {"$gte": datetime.utcnow().isoformat()[:10]}, "reminder": True})

            return {
                "total_leads": total,
                "new_today": new_today,
                "hot_leads_count": len(hot_leads),
                "hot_leads": [{"id": l["id"], "name": l.get("name", ""), "phone": l.get("phone", ""), "score": l.get("score", 0), "status": l.get("status", "")} for l in hot_leads],
                "unassigned_count": unassigned,
                "pending_follow_ups": pending_followup
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{lead_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_lead_note(lead_id: str, note_id: str, current_user: dict = Depends(get_current_user)):
        """Delete a note from a lead."""
        try:
            result = await db.lead_notes.delete_one({"id": note_id, "lead_id": lead_id})
            if result.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Note not found")
            return None
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
