"""
AI Routes — Google Gemini API Endpoints
"""
from fastapi import APIRouter, Depends
from typing import Optional
import os
import sys

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
        "model": "gemini-1.5-flash" if ai_service.is_configured() else None,
        "message": "AI جاهز" if ai_service.is_configured() else "أضف GEMINI_API_KEY في .env"
    }
