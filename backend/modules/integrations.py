"""Component: integrations — WhatsApp, SMS, Stripe, SendGrid, Yalidine, OCR."""
from core import get_module_logger

COMPONENT = "integrations"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.whatsapp_routes import create_whatsapp_routes
    from routes.whatsapp_integration_routes import create_whatsapp_integration_routes
    from routes.sms_marketing_routes import create_sms_marketing_routes
    from routes.stripe_routes import create_stripe_routes
    from routes.sendgrid_email_routes import create_sendgrid_email_routes
    from routes.sendgrid_integration_routes import create_sendgrid_integration_routes
    from routes.yalidine_integration_routes import create_yalidine_integration_routes
    from routes.ocr_invoice_routes import create_ocr_invoice_routes

    app.include_router(create_whatsapp_routes(ctx.db, ctx.get_current_user), prefix="/api")
    app.include_router(create_whatsapp_integration_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_sms_marketing_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_stripe_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.get_super_admin), prefix="/api")
    app.include_router(create_sendgrid_email_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.get_super_admin), prefix="/api")
    app.include_router(create_sendgrid_integration_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_yalidine_integration_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_ocr_invoice_routes(ctx.db, ctx.require_tenant, ctx.get_tenant_admin, ctx.CURRENCY, ctx.ApiKeyCreate, ctx.ApiKeyResponse, ctx.ImageOCRRequest, ctx.OCRResponse, ctx.generate_invoice_number), prefix="/api")
    log.info("integrations component mounted (8 routers)")
