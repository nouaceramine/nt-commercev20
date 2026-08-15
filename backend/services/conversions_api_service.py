"""
Conversions API Service — Facebook + TikTok
إرسال أحداث المبيعات والتفاعلات إلى منصات الإعلانات
"""
import hashlib
import requests
import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class ConversionsAPIService:
    """Facebook Conversions API + TikTok Events API"""

    def __init__(self):
        self.fb_pixel_id = os.environ.get("FACEBOOK_PIXEL_ID", "")
        self.fb_access_token = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
        self.tiktok_pixel_id = os.environ.get("TIKTOK_PIXEL_ID", "")
        self.tiktok_access_token = os.environ.get("TIKTOK_ACCESS_TOKEN", "")

    def _hash(self, value: str) -> str:
        """Hash data for CAPI (SHA-256)"""
        if not value:
            return ""
        return hashlib.sha256(value.lower().strip().encode()).hexdigest()

    def _get_fb_url(self) -> str:
        return f"https://graph.facebook.com/v18.0/{self.fb_pixel_id}/events"

    def _get_tiktok_url(self) -> str:
        return "https://business-api.tiktok.com/open_api/v1.3/event/track/"

    async def send_event(self, event_name: str, event_data: Dict[str, Any],
                         user_data: Dict[str, str], tenant_id: str = "",
                         pixels: Optional[Dict[str, str]] = None, event_id: str = "") -> Dict[str, Any]:
        """Send event to both Facebook and TikTok.

        p81: `pixels` carries per-tenant credentials from the tenant's store
        settings (fb_pixel_id/fb_access_token/tiktok_pixel_id/tiktok_access_token);
        env vars remain as a global fallback. `event_id` dedupes against the
        browser pixel firing the same event.
        """
        results = {"facebook": None, "tiktok": None}
        px = pixels or {}
        fb_pixel_id = (px.get("fb_pixel_id") or "").strip() or self.fb_pixel_id
        fb_access_token = (px.get("fb_access_token") or "").strip() or self.fb_access_token
        tiktok_pixel_id = (px.get("tiktok_pixel_id") or "").strip() or self.tiktok_pixel_id
        tiktok_access_token = (px.get("tiktok_access_token") or "").strip() or self.tiktok_access_token

        # Facebook CAPI
        if fb_pixel_id and fb_access_token:
            try:
                fb_payload = {
                    "data": [{
                        "event_name": event_name,
                        "event_time": int(datetime.now(timezone.utc).timestamp()),
                        "event_source_url": event_data.get("event_source_url", ""),
                        "action_source": "website",
                        "user_data": {
                            "em": self._hash(user_data.get("email", "")),
                            "ph": self._hash(user_data.get("phone", "")),
                            "client_ip_address": event_data.get("client_ip", "0.0.0.0"),
                            "client_user_agent": event_data.get("user_agent", "")
                        },
                        "custom_data": {
                            "value": event_data.get("value", 0),
                            "currency": "DZD",
                            "content_ids": event_data.get("content_ids", []),
                            "content_type": "product",
                            "content_name": event_data.get("content_name", ""),
                            "contents": event_data.get("contents", [])
                        }
                    }]
                }

                if event_id:
                    fb_payload["data"][0]["event_id"] = event_id
                fb_response = requests.post(
                    f"https://graph.facebook.com/v18.0/{fb_pixel_id}/events",
                    params={"access_token": fb_access_token},
                    json=fb_payload,
                    timeout=10
                )
                results["facebook"] = {
                    "status": fb_response.status_code,
                    "response": fb_response.json() if fb_response.status_code == 200 else fb_response.text
                }
                logger.info(f"Facebook CAPI {event_name}: {fb_response.status_code}")
            except Exception as e:
                logger.error(f"Facebook CAPI error: {e}")
                results["facebook"] = {"error": str(e)}

        # TikTok Events API
        if tiktok_pixel_id and tiktok_access_token:
            try:
                tiktok_payload = {
                    "event_source": "web",
                    "event_source_id": tiktok_pixel_id,
                    "data": [{
                        "event": event_name,
                        "event_id": event_id or None,
                        "event_time": int(datetime.now(timezone.utc).timestamp()),
                        "user": {
                            "email": self._hash(user_data.get("email", "")),
                            "phone": self._hash(user_data.get("phone", ""))
                        },
                        "properties": {
                            "value": event_data.get("value", 0),
                            "currency": "DZD",
                            "content_id": event_data.get("content_ids", [""])[0] if event_data.get("content_ids") else "",
                            "content_type": "product",
                            "content_name": event_data.get("content_name", "")
                        }
                    }]
                }

                tiktok_response = requests.post(
                    self._get_tiktok_url(),
                    headers={"Access-Token": tiktok_access_token, "Content-Type": "application/json"},
                    json=tiktok_payload,
                    timeout=10
                )
                results["tiktok"] = {
                    "status": tiktok_response.status_code,
                    "response": tiktok_response.json() if tiktok_response.status_code == 200 else tiktok_response.text
                }
                logger.info(f"TikTok Events {event_name}: {tiktok_response.status_code}")
            except Exception as e:
                logger.error(f"TikTok Events error: {e}")
                results["tiktok"] = {"error": str(e)}

        return results

    async def send_page_view(self, url: str, user_data: Dict[str, str],
                           tenant_id: str = "", pixels: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """PageView event"""
        return await self.send_event("PageView", {
            "event_source_url": url,
            "value": 0
        }, user_data, tenant_id, pixels=pixels)

    async def send_view_content(self, product_id: str, product_name: str, 
                                price: float, url: str, 
                                user_data: Dict[str, str], tenant_id: str = "") -> Dict[str, Any]:
        """ViewContent event"""
        return await self.send_event("ViewContent", {
            "event_source_url": url,
            "value": price,
            "content_ids": [product_id],
            "content_name": product_name,
            "contents": [{"id": product_id, "quantity": 1, "item_price": price}]
        }, user_data, tenant_id)

    async def send_add_to_cart(self, product_id: str, product_name: str, 
                               price: float, quantity: int, url: str,
                               user_data: Dict[str, str], tenant_id: str = "") -> Dict[str, Any]:
        """AddToCart event"""
        return await self.send_event("AddToCart", {
            "event_source_url": url,
            "value": price * quantity,
            "content_ids": [product_id],
            "content_name": product_name,
            "contents": [{"id": product_id, "quantity": quantity, "item_price": price}]
        }, user_data, tenant_id)

    async def send_purchase(self, order_id: str, products: list, total: float,
                            url: str, user_data: Dict[str, str],
                            tenant_id: str = "", pixels: Optional[Dict[str, str]] = None,
                            event_id: str = "") -> Dict[str, Any]:
        """Purchase event (COD)"""
        content_ids = [p.get("product_id", "") for p in products]
        contents = [{"id": p.get("product_id", ""), "quantity": p.get("quantity", 1), 
                     "item_price": p.get("price", 0)} for p in products]

        return await self.send_event("Purchase", {
            "event_source_url": url,
            "value": total,
            "content_ids": content_ids,
            "content_name": f"Order {order_id}",
            "contents": contents
        }, user_data, tenant_id, pixels=pixels, event_id=event_id)

    async def send_lead(self, form_id: str, url: str, 
                        user_data: Dict[str, str], tenant_id: str = "") -> Dict[str, Any]:
        """Lead event (form submission)"""
        return await self.send_event("Lead", {
            "event_source_url": url,
            "value": 0,
            "content_ids": [form_id],
            "content_name": "Order Form"
        }, user_data, tenant_id)

# Singleton instance
conversions_service = ConversionsAPIService()
