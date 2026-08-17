"""
AI Routes — Google Gemini API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
import os
import sys
import urllib.parse
import urllib.request as _urlreq
import json as _json
import google.generativeai as genai
from services.ai_service import AIService

from services.ai_service import ai_service

from main import get_tenant_admin

router = APIRouter(prefix="/ai", tags=["AI"])

@router.post("/generate-description")
async def generate_description(data: dict, admin: dict = Depends(get_tenant_admin)):
    """يولد وصف منتج بالذكاء الاصطناعي"""
    result = await ai_service.generate_product_description(
        name=data.get("name", ""),
        category=data.get("category", ""),
        features=data.get("features", "")
    )
    return result

@router.post("/product-images")
async def product_images(data: dict, admin: dict = Depends(get_tenant_admin)):
    """
    جلب صور حقيقية للمنتج بناءً على اسمه:
    1) Gemini يحوّل الاسم (أي لغة) إلى عبارة بحث إنجليزية محسّنة — مع fallback للاسم نفسه
    2) Openverse API (مجاني، بلا مفتاح) يرجع صوراً مرخّصة للاستخدام التجاري
    ملاحظة: توليد صور Gemini متعطّل حالياً بسبب استنفاد حصة المفتاح (429) — صور حقيقية أفضل للمنتجات أصلاً
    """
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="أدخل اسم المنتج أولاً")

    query = name
    try:
        model = genai.GenerativeModel(AIService.MODEL)
        r = await model.generate_content_async(
            f'Product name (may be Arabic or French): "{name}"\n'
            'Write ONE short English image-search query (3-6 words) to find professional e-commerce product photos of this item. '
            'Reply with the query ONLY — no quotes, no punctuation, no explanation.'
        )
        q = (r.text or "").strip().strip('"').strip()
        if 2 <= len(q) <= 80:
            query = q
    except Exception:
        pass

    images = []
    error = None

    def _search(q):
        params = urllib.parse.urlencode({"q": q, "page_size": 12, "license_type": "commercial", "filter_dead": "false"})
        req = _urlreq.Request(
            f"https://api.openverse.org/v1/images/?{params}",
            headers={"User-Agent": "NTCommerce/1.0 (product-image-search)"},
        )
        with _urlreq.urlopen(req, timeout=12) as resp:
            payload = _json.loads(resp.read().decode("utf-8"))
        return [it for it in payload.get("results", []) if it.get("url") and it.get("thumbnail")]

    try:
        # تبسيط تدريجي: عبارة Gemini قد تكون أدقّ من فهرس Openverse (مطابقة كل الكلمات)
        candidates = [query]
        words = query.split()
        while len(words) > 2:
            words = words[:-1]
            candidates.append(" ".join(words))
        if name not in candidates:
            candidates.append(name)
        results = []
        for cand in candidates:
            results = _search(cand)
            if results:
                query = cand
                break
        for it in results[:5]:
            images.append({
                "url": it["url"],
                "thumb": it["thumbnail"],
                "title": (it.get("title") or "")[:80],
                "license": it.get("license") or "",
                "source": it.get("source") or "",
            })
    except Exception as e:
        error = str(e)[:120]

    return {"success": bool(images), "query": query, "images": images, "error": error}


@router.post("/translate")
async def translate_text(data: dict, admin: dict = Depends(get_tenant_admin)):
    """يترجم نص إلى الفرنسية"""
    result = await ai_service.translate_to_french(text=data.get("text", ""))
    return result

@router.post("/social-post")
async def generate_social_post(data: dict, admin: dict = Depends(get_tenant_admin)):
    """ينشئ منشوراً لوسائل التواصل"""
    result = await ai_service.generate_social_media_post(
        product_name=data.get("product_name", ""),
        price=data.get("price", 0),
        store_name=data.get("store_name", "متجري")
    )
    return result

@router.get("/status")
async def ai_status():
    """يتحقق من حالة AI"""
    return {
        "configured": ai_service.is_configured(),
        "model": ai_service.MODEL if ai_service.is_configured() else None,
        "message": "AI جاهز" if ai_service.is_configured() else "أضف GEMINI_API_KEY في .env"
    }


# ============ p149: AI product-image GENERATION — Gemini image -> OpenAI fallback ============
@router.post("/generate-product-image")
async def generate_product_image(data: dict, admin: dict = Depends(get_tenant_admin)):
    """توليد صورة منتج بالذكاء الاصطناعي وحفظها في static/uploads.
    السلسلة: نماذج صور Gemini (مجانية عند توفر الحصة) <- OpenAI Images — أول نموذج ينجح يُعتمد."""
    import uuid as _uuid
    from pathlib import Path as _Path

    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="أدخل اسم المنتج أولاً")

    prompt = (
        f'Professional e-commerce product photo of: "{name}". '
        'Single product centered on a clean pure-white studio background, soft even lighting, '
        'realistic, high detail, no text, no watermark, no people, no hands.'
    )
    errors = []
    content = None

    # 1) Gemini image models
    if os.environ.get("GEMINI_API_KEY"):
        for mn in ("gemini-3.1-flash-lite-image", "gemini-2.5-flash-image"):
            try:
                gm = genai.GenerativeModel(mn)
                r = await gm.generate_content_async(prompt)
                for part in r.candidates[0].content.parts:
                    idata = getattr(part, "inline_data", None)
                    if idata and idata.data:
                        content = idata.data
                        break
                if content:
                    break
            except Exception as e:
                errors.append(f"Gemini {mn}: {str(e)[:60]}")

    # 2) OpenAI Images fallback
    if not content and os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"):
        try:
            import base64 as _b64
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=os.environ["AI_INTEGRATIONS_OPENAI_API_KEY"],
                base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") or None,
            )
            resp = await client.images.generate(model="gpt-image-1", prompt=prompt, size="1024x1024", n=1)
            item = resp.data[0]
            if getattr(item, "b64_json", None):
                content = _b64.b64decode(item.b64_json)
            elif getattr(item, "url", None):
                req = _urlreq.Request(item.url, headers={"User-Agent": "NTCommerce/1.0"})
                with _urlreq.urlopen(req, timeout=60) as rr:
                    content = rr.read()
        except Exception as e:
            errors.append(f"OpenAI: {str(e)[:60]}")

    if not content:
        raise HTTPException(
            status_code=503,
            detail="حصة توليد الصور مستنفدة حالياً — فعّل الفوترة على مفتاح Gemini أو أضف مفتاح OpenAI مدفوعاً",
        )

    upload_dir = _Path(__file__).resolve().parent.parent / "static" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{_uuid.uuid4()}.png"
    with open(upload_dir / fname, "wb") as f:
        f.write(content)
    return {"success": True, "url": f"/api/static/uploads/{fname}", "filename": fname}
