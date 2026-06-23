"""
Ocr Invoice Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging


logger = logging.getLogger(__name__)


def create_ocr_invoice_routes(db, require_tenant, get_tenant_admin, CURRENCY, ApiKeyCreate, ApiKeyResponse, ImageOCRRequest, OCRResponse, generate_invoice_number) -> dict:
    """Create ocr invoice routes"""
    router = APIRouter()

    # ============ OCR ROUTE ============

    @router.post("/ocr/extract-models", response_model=OCRResponse)
    async def extract_models_from_image(request: ImageOCRRequest, admin: dict = Depends(get_tenant_admin)):
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="OCR service not configured")

        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"ocr-{uuid.uuid4()}",
                system_message="""You are an OCR assistant specialized in extracting phone model names from images.
                Extract all phone model names you can see in the image.
                Return ONLY the model names, one per line, without any additional text or explanation.
                Examples of model names: iPhone 15 Pro, Samsung Galaxy S24, Huawei P60 Pro, etc."""
            ).with_model("gemini", "gemini-2.5-flash")

            image_content = ImageContent(image_base64=request.image_base64)
            user_message = UserMessage(
                text="Extract all phone model names from this image. Return only the model names, one per line.",
                file_contents=[image_content]
            )

            response = await chat.send_message(user_message)
            raw_text = response.strip()
            models = [m.strip() for m in raw_text.split('\n') if m.strip()]

            return OCRResponse(extracted_models=models, raw_text=raw_text)

        except Exception as e:
            logger.error(f"OCR error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    # ============ INVOICE PDF ============

    @router.get("/sales/{sale_id}/invoice-pdf")
    async def get_invoice_pdf(sale_id: str, user: dict = Depends(require_tenant)):
        sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")

        # Get sale code if exists
        sale_code = sale.get("code", "")

        # Generate simple HTML invoice
        items_html = ""
        for i, item in enumerate(sale["items"], 1):
            barcode = item.get('barcode', '-')
            items_html += f"""
            <tr>
                <td>{i}</td>
                <td>{barcode}</td>
                <td>{item['product_name']}</td>
                <td>{item['quantity']}</td>
                <td>{item['unit_price']:.2f} {CURRENCY}</td>
                <td>{item['discount']:.2f} {CURRENCY}</td>
                <td>{item['total']:.2f} {CURRENCY}</td>
            </tr>
            """

        html_content = f"""
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>فاتورة {sale['invoice_number']}</title>
            <style>
                body {{ font-family: 'Cairo', Arial, sans-serif; margin: 20px; direction: rtl; }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .header h1 {{ color: #2563EB; margin: 0; }}
                .sale-code {{ font-family: monospace; font-size: 14px; background: #f0f0f0; padding: 4px 8px; border-radius: 4px; }}
                .info {{ display: flex; justify-content: space-between; margin-bottom: 20px; }}
                .info div {{ width: 48%; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ border: 1px solid #ddd; padding: 10px; text-align: right; }}
                th {{ background: #2563EB; color: white; }}
                .barcode {{ font-family: monospace; font-size: 11px; }}
                .totals {{ text-align: left; margin-top: 20px; }}
                .totals table {{ width: 300px; margin-right: 0; margin-left: auto; }}
                .footer {{ text-align: center; margin-top: 40px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>NT</h1>
                <p>فاتورة مبيعات</p>
                {f'<p class="sale-code">{sale_code}</p>' if sale_code else ''}
            </div>

            <div class="info">
                <div>
                    <p><strong>رقم الفاتورة:</strong> {sale['invoice_number']}</p>
                    <p><strong>التاريخ:</strong> {sale['created_at'][:10]}</p>
                    <p><strong>البائع:</strong> {sale['created_by']}</p>
                </div>
                <div>
                    <p><strong>العميل:</strong> {sale['customer_name']}</p>
                    <p><strong>طريقة الدفع:</strong> {sale['payment_method']}</p>
                    <p><strong>الحالة:</strong> {sale['status']}</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>الباركود</th>
                        <th>المنتج</th>
                        <th>الكمية</th>
                        <th>السعر</th>
                        <th>الخصم</th>
                        <th>الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                </tbody>
            </table>

            <div class="totals">
                <table>
                    <tr><td>المجموع الفرعي:</td><td>{sale['subtotal']:.2f} {CURRENCY}</td></tr>
                    <tr><td>الخصم:</td><td>{sale['discount']:.2f} {CURRENCY}</td></tr>
                    <tr><td><strong>الإجمالي:</strong></td><td><strong>{sale['total']:.2f} {CURRENCY}</strong></td></tr>
                    <tr><td>المدفوع:</td><td>{sale['paid_amount']:.2f} {CURRENCY}</td></tr>
                    <tr><td>المتبقي:</td><td>{sale['remaining']:.2f} {CURRENCY}</td></tr>
                </table>
            </div>

            <div class="footer">
                <p>شكراً لتعاملكم معنا</p>
            </div>
        </body>
        </html>
        """

        return StreamingResponse(
            io.BytesIO(html_content.encode('utf-8')),
            media_type="text/html",
            headers={"Content-Disposition": f"inline; filename=invoice_{sale['invoice_number']}.html"}
        )

    # ============ API KEYS MANAGEMENT ============

    import secrets

    @router.post("/api-keys", response_model=ApiKeyResponse)
    async def create_api_key(api_key: ApiKeyCreate, admin: dict = Depends(get_tenant_admin)):
        key_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Generate internal API key if type is internal
        generated_key = ""
        if api_key.type == "internal":
            generated_key = f"sk_{secrets.token_hex(32)}"

        key_value = api_key.key_value or generated_key

        api_key_doc = {
            "id": key_id,
            "name": api_key.name,
            "type": api_key.type,
            "service": api_key.service or "",
            "key_value": key_value,
            "secret_value": api_key.secret_value or "",
            "endpoint_url": api_key.endpoint_url or "",
            "permissions": api_key.permissions,
            "is_active": True,
            "last_used": "",
            "created_at": now
        }
        await db.api_keys.insert_one(api_key_doc)

        return ApiKeyResponse(
            **api_key_doc,
            key_preview=f"...{key_value[-4:]}" if len(key_value) > 4 else key_value
        )

    @router.get("/api-keys", response_model=List[ApiKeyResponse])
    async def get_api_keys(admin: dict = Depends(get_tenant_admin)):
        keys = await db.api_keys.find({}, {"_id": 0}).to_list(100)
        result = []
        for k in keys:
            k["key_preview"] = f"...{k['key_value'][-4:]}" if len(k.get('key_value', '')) > 4 else k.get('key_value', '')
            # Hide full key value
            if k["type"] == "internal":
                k["key_value"] = k["key_preview"]
            result.append(ApiKeyResponse(**k))
        return result

    @router.get("/api-keys/{key_id}")
    async def get_api_key(key_id: str, admin: dict = Depends(get_tenant_admin)):
        key = await db.api_keys.find_one({"id": key_id}, {"_id": 0})
        if not key:
            raise HTTPException(status_code=404, detail="API Key not found")
        return key

    @router.put("/api-keys/{key_id}/toggle")
    async def toggle_api_key(key_id: str, admin: dict = Depends(get_tenant_admin)):
        key = await db.api_keys.find_one({"id": key_id})
        if not key:
            raise HTTPException(status_code=404, detail="API Key not found")

        new_status = not key.get("is_active", True)
        await db.api_keys.update_one({"id": key_id}, {"$set": {"is_active": new_status}})
        return {"is_active": new_status}

    @router.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: str, admin: dict = Depends(get_tenant_admin)):
        result = await db.api_keys.delete_one({"id": key_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="API Key not found")
        return {"message": "API Key deleted successfully"}


    return router
