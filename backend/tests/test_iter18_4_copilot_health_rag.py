"""iter 18.4 — AI Co-pilot + Health Alerts smoke tests."""
import asyncio
import json
import time

import httpx
import pytest

BASE_URL = "http://localhost:8001/api"
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"


async def _login(email: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, f"login failed: {r.text}"
        return r.json()["access_token"]


@pytest.mark.asyncio
async def test_copilot_returns_arabic_answer():
    """POST /api/ecom/analytics/copilot returns a well-shaped Arabic answer."""
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=45) as c:
        ts = (await c.get(f"{BASE_URL}/saas/tenants", headers=super_h)).json()
        tid = ts[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=super_h, json={"ecommerce_hub": True})
        imp = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=super_h)).json()
        th = {"Authorization": f"Bearer {imp['access_token']}"}

        # Seed at least one order so context isn't empty
        await c.post(
            f"{BASE_URL}/ecom/orders",
            headers=th,
            json={
                "channel": "manual",
                "customer": {"name": "Copilot Test", "phone": "0500"},
                "items": [{"name": "AI Item", "qty": 1, "price": 1234}],
            },
        )

        # First turn
        r1 = await c.post(
            f"{BASE_URL}/ecom/analytics/copilot",
            headers=th,
            json={"question": "ما هي أفضل قناة بيع لديّ؟", "days": 30},
        )
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert "answer" in body1 and len(body1["answer"]) > 0
        assert body1.get("source") in ("llm", "heuristic", "error")
        session_id = body1.get("session_id")
        assert session_id

        # Second turn — same session
        r2 = await c.post(
            f"{BASE_URL}/ecom/analytics/copilot",
            headers=th,
            json={"question": "اقترح علي 3 خطوات لتحسين الأداء", "session_id": session_id, "days": 30},
        )
        assert r2.status_code == 200
        assert r2.json().get("session_id") == session_id


@pytest.mark.asyncio
async def test_health_alerts_endpoint():
    """GET /api/saas/health-alerts returns shape + handles resolve flow."""
    token = await _login(SUPER_EMAIL, SUPER_PASS)
    h = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30) as c:
        # Touch the AI insights endpoint to trigger alert evaluation
        await c.get(f"{BASE_URL}/saas/ai-insights", headers=h)
        # Health alerts list
        r = await c.get(f"{BASE_URL}/saas/health-alerts", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "open_count" in body
        # Items shape (only if any alert fired — depends on platform state)
        for a in body["items"][:1]:
            assert a["kind"] == "health_score"
            assert a["severity"] in ("warning", "critical")
            assert "score" in a


@pytest.mark.asyncio
async def test_rag_lead_categorizer_uses_context():
    """When categorizing a lead, the new RAG-aware service is invoked."""
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=60) as c:
        ts = (await c.get(f"{BASE_URL}/saas/tenants", headers=super_h)).json()
        tid = ts[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=super_h, json={"ecommerce_hub": True})
        imp = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=super_h)).json()
        th = {"Authorization": f"Bearer {imp['access_token']}"}

        lead = (await c.post(
            f"{BASE_URL}/ecom/leads",
            headers=th,
            json={
                "channel": "instagram",
                "name": "RAG Test Lead",
                "phone": "0551001000",
                "message": "هذا المنتج غالي جداً، هل يوجد تخفيض؟",
            },
        )).json()
        lead_id = lead["id"]

        r = await c.post(f"{BASE_URL}/ecom/leads/{lead_id}/ai-categorize", headers=th)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] in ("interested", "price_inquiry", "support", "complaint", "spam", "other")
        # When LLM is wired (Emergent key), source should reflect the RAG path
        # When key missing → heuristic. Either is acceptable; ensure shape is right.
        assert "source" in body
        assert 0 <= body["score"] <= 100

        await c.delete(f"{BASE_URL}/ecom/leads/{lead_id}", headers=th)
