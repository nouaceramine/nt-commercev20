"""
NT Commerce 12.0 - Legendary Build
Main application entry point with modular architecture
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextvars import ContextVar
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import io
import requests as http_requests
import asyncio
import shutil
import base64
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Load environment variables from .env file
load_dotenv()

# Try to import resend
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False

# Import SendGrid
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False

# Import Stripe via emergentintegrations
try:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Initialize resend if available
if RESEND_AVAILABLE:
    resend.api_key = os.environ.get('RESEND_API_KEY', '')

# MongoDB connection — canonical definitions live in config/database.py.
from config.database import (
    client,
    main_db,
    db,
    _tenant_db_ctx,
    get_tenant_db,
    set_tenant_context,
    init_tenant_database,
)

# JWT Settings
from utils.jwt_config import SECRET_KEY, ALGORITHM
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Currency
CURRENCY = "دج"  # Algerian Dinar

# Create the main app
app = FastAPI(title="NT API")

# Request Context Middleware
from middleware.request_context import RequestContextMiddleware
app.add_middleware(RequestContextMiddleware)

# p135: APM-lite middleware
from middleware.apm import APMMiddleware
app.add_middleware(APMMiddleware)
# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://nt-commerce.net", "https://www.nt-commerce.net", "http://168.231.81.154", "http://168.231.81.154:8001"],
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?$",  # p152: subscriber custom domains (https only)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Structured logging
from utils.logging_setup import setup_logging
setup_logging(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    force_json=(os.environ.get("LOG_FORMAT", "text").lower() == "json"),
)

# Rate limiter
from middleware.rate_limit import limiter
from middleware.security_headers import SecurityHeadersMiddleware
from middleware.monitoring import MonitoringMiddleware
from services.tenant_throttle import tenant_throttle
from middleware.input_sanitization import InputSanitizationMiddleware
from audit.middleware import AuditMiddleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# p135: APM stats router
from middleware.apm import create_apm_router, flush_apm
try:
    from routes.saas.helpers import get_super_admin as _apm_admin
    app.include_router(create_apm_router(main_db, _apm_admin), prefix="/api")
except Exception as _apm_exc:
    logger.warning(f"APM router not registered: {_apm_exc}")

@app.on_event("startup")
async def _apm_flush_task():
    import asyncio
    asyncio.create_task(flush_apm(main_db))

# Error handlers
from utils.errors import AppException, app_exception_handler, general_exception_handler
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# Pydantic ValidationError raised manually inside routes (XCreate(**dict) pattern)
# must become 422 with the Arabic validator messages — not a masked 500.
from fastapi.responses import JSONResponse as _JSONResponse
from pydantic import ValidationError as _PydanticValidationError


@app.exception_handler(_PydanticValidationError)
async def pydantic_validation_exception_handler(request, exc):
    details = []
    for e in exc.errors():
        msg = e.get('msg', '')
        if msg.startswith('Value error, '):
            msg = msg[len('Value error, '):]
        loc = '.'.join(str(x) for x in e.get('loc', []) if x is not None)
        details.append({'field': loc, 'message': msg})
    return _JSONResponse(status_code=422, content={'detail': details})

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()
logger = logging.getLogger(__name__)

UPLOAD_DIR = ROOT_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ============ IMPORT ROBOT & SERVICES ============
from robots.robot_manager import RobotManager
from services.notification_service import NotificationService
from services.sms_service import SMSService
from services.email_service import EmailService
from services.cache_service import cache
from core.diagnostics import set_robot_manager as _set_robot_manager_in_diagnostics
from core.feature_flags import (
    FeatureFlagManager, PLATFORM_FEATURES, CATEGORY_LABELS,
    set_feature_flag_manager, get_feature_flag_manager,
)

# ============ IMPORT REFACTORED ROUTES ============
from routes.saas_routes import get_super_admin
from routes.auth_routes import router as auth_router
from routes.audit_routes import router as audit_router
from routes.performance_routes import record_request_time
from utils.permissions import create_permission_checker, create_cashier_block

# ============ IMPORT MODELS FROM MODULES ============
from models.schemas import (
    UserCreate, UserLogin, UserUpdate, PasswordUpdate, UserResponse,
    PlanCreate, PlanUpdate, PlanResponse,
    TenantCreate, TenantUpdate, TenantResponse,
    AgentCreate, AgentUpdate, AgentResponse, AgentTransaction, AgentTransactionResponse,
    SubscriptionPayment, SubscriptionPaymentResponse,
    TokenResponse,
    ProductCreate, ProductUpdate, ProductResponse,
    CustomerCreate, CustomerUpdate, CustomerResponse,
    SupplierCreate, SupplierUpdate, SupplierResponse,
    SaleItem, DeliveryInfo, SaleCreate, SaleResponse,
    PurchaseItem, PurchaseCreate, PurchaseResponse,
    CashBoxResponse, TransactionCreate, TransactionResponse,
    EmployeeCreate, EmployeeAlertSettings,
    WarehouseCreate, WarehouseUpdate, WarehouseResponse,
    StockTransferCreate, StockTransferResponse,
    PriceHistoryResponse,
    EmployeeUpdate, EmployeeResponse,
    AttendanceCreate, AttendanceResponse,
    AdvanceCreate, AdvanceResponse,
    DebtCreate, DebtPaymentCreate, DebtResponse, DebtPaymentResponse,
    ApiKeyCreate, ApiKeyResponse,
    RechargeCreate, RechargeResponse,
    ProductFamilyCreate, ProductFamilyUpdate, ProductFamilyResponse,
    OCRRequest, OCRResponse,
    DEFAULT_PERMISSIONS, ROLE_DESCRIPTIONS, PERMISSION_CATEGORIES, RECHARGE_CONFIG,
)
from models.accounting.schemas import (
    AccountCreate, AccountResponse,
    JournalEntryLineCreate, JournalEntryCreate, JournalEntryResponse,
    InvoiceItemCreate, InvoiceCreate, InvoiceResponse,
    PaymentCreate, PaymentResponse,
    ExpenseCreate, ExpenseResponse,
    TaxRateCreate, TaxRateResponse,
    BudgetCreate, BudgetResponse,
    ReconciliationCreate, ReconciliationResponse,
    AuditLogCreate, AuditLogResponse,
)
from models.ai.schemas import (
    AIInsightCreate, AIInsightResponse,
    ChatMessageCreate, ChatSessionCreate, ChatSessionResponse,
    ChatRequest, ChatResponse,
    AIAgentTaskCreate, AIAgentTaskResponse,
    AIAgentConfigCreate, AIAgentConfigResponse,
    InvoiceOCRRequest, InvoiceOCRResponse,
    WhatsAppMessageCreate, WhatsAppMessageResponse,
)

# ============ INITIALIZE SERVICES & ROBOT MANAGER ============
notification_service = NotificationService(main_db)
sms_service = SMSService(main_db)
email_service = EmailService()
robot_manager = RobotManager(main_db, client, notification_service, sms_service, email_service)
_set_robot_manager_in_diagnostics(robot_manager)

# ============ IMPORT EXTRA MODELS ============
from models.extra_schemas import (
    DailySessionCreate, DailySessionClose, DailySessionResponse,
    RepairCreate, RepairUpdate, RepairResponse,
    SparePartCreate, SparePartResponse,
    NotificationCreate, NotificationResponse,
    PhoneDirectoryCreate, PhoneDirectoryResponse,
    RechargeTransactionCreate, RechargeTransactionResponse,
    ChatMessage, ImageOCRRequest,
)

from utils.enhanced_indexes import create_all_enhanced_indexes

# ============ HELPER FUNCTIONS ============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_type = payload.get("type")
        role = payload.get("role")
        tenant_id = payload.get("tenant_id")

        try:
            from middleware.request_context import set_tenant_context
            set_tenant_context(tenant_id=tenant_id, user_id=user_id)
        except Exception:
            pass

        # CRITICAL multi-tenancy: route the modular routers' `db` proxy to the
        # tenant database. The logging context above only tags logs — without
        # this, every auto-registered route ran tenant requests against
        # main_db (cross-tenant data leak, e.g. /store/settings).
        if tenant_id:
            # aliased import: the name `set_tenant_context` is shadowed above
            # by middleware.request_context's logging-only variant
            from config.database import set_tenant_context as _set_db_tenant_ctx
            _set_db_tenant_ctx(get_tenant_db(tenant_id))

        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        if user_type == "tenant" and tenant_id:
            tenant_db = get_tenant_db(tenant_id)
            user = await tenant_db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0})
            tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "password": 0})

            if user is None:
                if tenant:
                    user = {
                        "id": tenant["id"],
                        "email": tenant["email"],
                        "name": tenant["name"],
                        "role": "admin",
                        "tenant_id": tenant_id,
                        "user_type": "tenant",
                        "company_name": tenant.get("company_name", ""),
                        "created_at": tenant.get("created_at", datetime.now(timezone.utc).isoformat()),
                    }
                else:
                    raise HTTPException(status_code=401, detail="User not found")
            else:
                user["tenant_id"] = tenant_id
                user["user_type"] = "tenant"
                if not user.get("created_at"):
                    user["created_at"] = datetime.now(timezone.utc).isoformat()

            if tenant:
                plan = await main_db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
                if plan:
                    features_map = {**plan.get("features", {}), **tenant.get("features_override", {})}
                    OPT_IN_FEATURES = ("ecommerce_hub", "rental", "restaurant", "production")  # p185-188 opt-ins
                    for opt_key in OPT_IN_FEATURES:
                        if opt_key not in features_map:
                            features_map[opt_key] = False
                    user["features"] = features_map
                    user["limits"] = {**plan.get("limits", {}), **tenant.get("limits_override", {})}
                user["company_name"] = tenant.get("company_name", "")
            return user

        if user_type == "agent" or role == "agent":
            agent = await main_db.saas_agents.find_one(
                {"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0}
            )
            if not agent:
                raise HTTPException(status_code=401, detail="Agent not found")
            agent["user_type"] = "agent"
            agent["role"] = "agent"
            return agent

        user = await main_db.users.find_one(
            {"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0}
        )
        if user is None:
            user = await main_db.super_admins.find_one(
                {"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0}
            )
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        user["user_type"] = user_type or "admin"
        if tenant_id:
            user["tenant_id"] = tenant_id
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_tenant_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_type = payload.get("type")
        tenant_id = payload.get("tenant_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        if user_type == "tenant" and tenant_id:
            tenant_db = get_tenant_db(tenant_id)
        else:
            tenant_db = main_db
            tenant_id = None
        user = await tenant_db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0})
        if user is None and tenant_id:
            tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "password": 0})
            if tenant:
                user = {"id": tenant["id"], "email": tenant["email"], "name": tenant["name"], "role": "admin"}
        if user is None:
            user = await main_db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return {"user": user, "db": tenant_db, "tenant_id": tenant_id}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    if not current_user.get("id"):
        raise HTTPException(status_code=403, detail="Invalid admin identity")
    if current_user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return current_user

async def get_tenant_admin(current_user: dict = Depends(get_current_user)) -> dict:
    # Platform-level admins (main_db users) act on the main DB
    if not current_user.get("tenant_id") and current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح فقط لمشتركي المنصة")
    if current_user.get("role") not in ["admin", "manager", "user", "tenant_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="صلاحيات غير كافية")
    return current_user

async def require_tenant(current_user: dict = Depends(get_current_user)) -> dict:
    # Platform-level users (admin/cashier/agent in main_db) operate on the main DB
    if not current_user.get("tenant_id") and current_user.get("user_type") not in ("super_admin", "admin", "cashier", "agent"):
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح فقط لمشتركي المنصة")
    return current_user

async def generate_invoice_number(prefix: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.counters.find_one_and_update(
        {"_id": f"{prefix}_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return f"{prefix}-{today}-{count['seq']:04d}"

async def init_cash_boxes() -> dict:
    boxes = [
        {"id": "cash", "name": "الصندوق النقدي", "name_fr": "Caisse", "type": "cash", "balance": 0},
        {"id": "bank", "name": "الحساب البنكي", "name_fr": "Compte bancaire", "type": "bank", "balance": 0},
        {"id": "wallet", "name": "المحفظة الإلكترونية", "name_fr": "Portefeuille électronique", "type": "wallet", "balance": 0},
        {"id": "safe", "name": "الخزنة", "name_fr": "Coffre-fort", "type": "safe", "balance": 0},
        {"id": "personal", "name": "المال الخاص", "name_fr": "Argent personnel", "type": "personal", "balance": 0},  # p68
        {"id": "ecom_store", "name": "محفظة المتجر الإلكتروني", "name_fr": "Boutique en ligne", "type": "ecom", "balance": 0}  # p86: COD money held by the courier until payout
    ]
    from services.code_generator import generate_code
    for box in boxes:
        existing = await db.cash_boxes.find_one({"id": box["id"]})
        if not existing:
            await db.cash_boxes.insert_one(box)
    return {"status": "initialized", "boxes": len(boxes)}

from utils.permissions import require_permission

@app.get("/")
async def root():
    return {
        "message": "NT Commerce API",
        "version": "16.0.0",
        "status": "operational",
        "environment": os.getenv("ENVIRONMENT", "production"),
    }

@app.get("/health")
async def health_check():
    try:
        await main_db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    return {"status": "healthy", "database": db_status, "version": "16.0.0"}

@app.on_event("startup")
async def startup_event():
    logger.info("NT Commerce 16.0 starting up...")
    try:
        await init_cash_boxes()
    except Exception as e:
        logger.warning("Cash box init: %s", e)

    try:
        # p47: create_all_enhanced_indexes(db) requires a db arg — the bare call
        # always raised TypeError (caught by the warning below) so these indexes
        # were never created. Loop main + all tenant DBs (data lives per-tenant),
        # mirroring the barcode-index pattern below; per-db guard so one failing
        # database never blocks the rest.
        from config.database import get_tenant_db as _get_tenant_db, main_db as _main_db
        _idx_dbs = [_main_db]
        async for _t in _main_db.saas_tenants.find({}, {"_id": 0, "id": 1}):
            if _t.get("id"):
                try:
                    _idx_dbs.append(_get_tenant_db(_t["id"]))
                except Exception:
                    pass
        _idx_ok = 0
        for _d in _idx_dbs:
            try:
                await create_all_enhanced_indexes(_d)
                _idx_ok += 1
            except Exception as _ie:
                logger.warning("Enhanced indexes on %s: %s", getattr(_d, "name", "?"), _ie)
        logger.info("Enhanced indexes created on %d/%d databases", _idx_ok, len(_idx_dbs))
    except Exception as e:
        logger.warning("Enhanced indexes: %s", e)

    # Unique barcode per tenant (partial: ignores empty/missing) — idempotent
    try:
        from config.database import get_tenant_db as _get_tenant_db, main_db as _main_db
        _dbs = [_main_db]
        async for t in _main_db.saas_tenants.find({}, {"_id": 0, "id": 1}):
            if t.get("id"):
                try:
                    _dbs.append(_get_tenant_db(t["id"]))
                except Exception:
                    pass
        for _d in _dbs:
            await _d.products.create_index(
                [("barcode", 1)],
                unique=True, name="barcode_unique_partial",
                partialFilterExpression={"barcode": {"$gt": ""}},
            )
        logger.info("Barcode unique partial indexes ensured on %d databases", len(_dbs))
    except Exception as e:
        logger.warning("Barcode index ensure: %s", e)

    # p190: actually START the bus — register handlers, bind Mongo, run consumer.
    # Previously `event_bus.start()` was called without await/args: a dead
    # coroutine, so no handler was ever registered and nothing was consumed.
    try:
        from services.event_bus import event_bus
        from services.event_consumers import register_handlers
        register_handlers(event_bus)
        await event_bus.start(main_db)
        asyncio.create_task(event_bus.consume_loop())
        logger.info("Event bus started with consumers")
    except Exception as e:
        logger.warning("Event bus start: %s", e)

    # p189: transactional outbox relay — drains main_db.outbox to the Redis bus
    try:
        from services.outbox import start_outbox_relay
        start_outbox_relay(main_db)
        logger.info("Outbox relay started")
    except Exception as e:
        logger.warning("Outbox relay start: %s", e)

    # Start background robots (restored — removed during the Sections refactor)
    try:
        robot_manager.initialize()
        asyncio.create_task(robot_manager.start_all())
        logger.info("Robots initialized and starting")
    except Exception as e:
        logger.warning("Robots start: %s", e)

    # p80: Yalidine periodic auto-sync (every 2h, all tenants with active integration)
    try:
        from config.database import get_tenant_db as _yal_get_tenant_db, main_db as _yal_main_db
        from services.ecom.yalidine_scheduler import start_yalidine_scheduler
        start_yalidine_scheduler(_yal_main_db, _yal_get_tenant_db)
    except Exception as e:
        logger.warning("Yalidine scheduler start: %s", e)

    # p84: Telegram daily summary (21:00 Africa/Algiers, per-tenant opt-in)
    try:
        from config.database import get_tenant_db as _tg_get_tenant_db, main_db as _tg_main_db
        from services.telegram_daily import start_telegram_daily
        start_telegram_daily(_tg_main_db, _tg_get_tenant_db)
    except Exception as e:
        logger.warning("Telegram daily scheduler start: %s", e)

    # p54: AutoHeal self-healing scanner (scheduled every 5 min)
    try:
        from services.autoheal_service import start_autoheal_scheduler
        start_autoheal_scheduler()
    except Exception as e:
        logger.warning("AutoHeal scheduler: %s", e)

    try:
        from core.feature_flags import FeatureFlagManager, PLATFORM_FEATURES
        from utils.super_admin_seed import ensure_super_admin
        await ensure_super_admin()
        ffm = FeatureFlagManager(main_db)
        # p49: removed vestigial `await ffm.ensure_defaults(...)` — the method no longer
        # exists on FeatureFlagManager (_load() self-seeds from PLATFORM_FEATURES), and
        # its AttributeError aborted this block so set_feature_flag_manager never ran.
        set_feature_flag_manager(ffm)
    except Exception as e:
        logger.warning("Feature flags: %s", e)

    # Seed default data (customers/products/suppliers/employees/plans) on first run
    try:
        # قيد فريد على المحافظ لمنع تكرار (entity_type, entity_id)
        try:
            await main_db.wallets.create_index(
                [("entity_type", 1), ("entity_id", 1)], unique=True, sparse=True
            )
        except Exception as wal_exc:
            logger.warning("wallets unique index: %s", wal_exc)

        from seed_defaults import seed_default_data, seed_whatsapp_templates
        seeded = await seed_default_data(main_db)
        tpl_seeded = await seed_whatsapp_templates(main_db)
        logger.info("Default data seed result: %s records, %s templates", seeded, tpl_seeded)
    except Exception as exc:
        logger.warning("Default data seed skipped: %s", exc)

    try:
        from services.sim_catalog_seed import seed_sim_catalog
        seed_result = await seed_sim_catalog(main_db)
        logger.info("SIM catalog seed result: %s", seed_result)
    except Exception as exc:
        logger.warning("SIM catalog seed skipped: %s", exc)

    try:
        from services.sim_catalog_seed import seed_sim_catalog
        seed_result = await seed_sim_catalog(main_db)
        logger.info("SIM catalog seed result: %s", seed_result)
    except Exception as exc:
        logger.warning("SIM catalog seed skipped: %s", exc)

    try:
        await db.products.create_index("id", unique=True)
        await db.products.create_index("family_id")
        await db.products.create_index("barcode")
        await db.products.create_index("article_code")
        await db.customers.create_index("id", unique=True)
        await db.customers.create_index("phone")
        await db.suppliers.create_index("id", unique=True)
        await db.sales.create_index("id", unique=True)
        await db.sales.create_index("created_at")
        await db.sales.create_index("customer_id")
        await db.purchases.create_index("id", unique=True)
        await db.purchases.create_index("created_at")
        await db.purchases.create_index("items.product_id")
        await db.daily_sessions.create_index("id", unique=True)
        await db.daily_sessions.create_index("status")
        await db.transactions.create_index("created_at")
        await db.transactions.create_index("cash_box_id")
        await db.accounts.create_index("id", unique=True)
        await db.accounts.create_index("code", unique=True)
        await db.accounts.create_index("account_type")
        await db.journal_entries.create_index("id", unique=True)
        await db.journal_entries.create_index("entry_number", unique=True)
        await db.journal_entries.create_index("date")
        await db.journal_entries.create_index("status")
        await db.invoices.create_index("id", unique=True)
        await db.invoices.create_index("invoice_number", unique=True)
        await db.invoices.create_index("invoice_type")
        await db.invoices.create_index("status")
        await db.invoices.create_index("issue_date")
        await db.invoices.create_index("due_date")
        await db.invoices.create_index("customer_id")
        await db.invoices.create_index("supplier_id")
        await db.payments.create_index("id", unique=True)
        await db.payments.create_index("payment_number", unique=True)
        await db.payments.create_index("payment_type")
        await db.payments.create_index("payment_date")
        await db.expenses.create_index("id", unique=True)
        await db.expenses.create_index("expense_number", unique=True)
        await db.expenses.create_index("category")
        await db.expenses.create_index("expense_date")
        await db.ai_insights.create_index("id", unique=True)
        await db.ai_insights.create_index("insight_type")
        await db.ai_insights.create_index("priority")
        await db.ai_insights.create_index("is_dismissed")
        await db.chat_sessions.create_index("id", unique=True)
        await db.chat_sessions.create_index("user_id")
        await db.agent_tasks.create_index("id", unique=True)
        await db.agent_tasks.create_index("agent_type")
        await db.fraud_alerts.create_index("id", unique=True)
        await db.fraud_alerts.create_index("is_resolved")
        await db.daily_reports.create_index("id", unique=True)
        await db.daily_reports.create_index("date", unique=True)
        await db.audit_logs.create_index("id", unique=True)
        await db.audit_logs.create_index("entity_type")
        await db.audit_logs.create_index("entity_id")
        await db.audit_logs.create_index("created_at")
        await db.whatsapp_messages.create_index("id", unique=True)
        await db.whatsapp_messages.create_index("from_number")
        await db.whatsapp_messages.create_index("processed")
        await db.whatsapp_messages.create_index("tenant_id")
        await db.whatsapp_config.create_index("tenant_id", unique=True)
        await db.tax_rates.create_index("id", unique=True)
        await db.tax_rates.create_index("type")
        await db.tax_declarations.create_index("id", unique=True)
        await db.tax_declarations.create_index("year")
        await db.push_notifications.create_index("id", unique=True)
        await db.push_notifications.create_index("tenant_id")
        await db.push_notifications.create_index("created_at")
        await db.notification_preferences.create_index("user_id", unique=True)
        await db.currencies.create_index("code", unique=True)
        await db.currency_settings.create_index("tenant_id")
        await db.currency_rate_history.create_index("code")
        await db.ecom_orders.create_index("id", unique=True)
        await db.ecom_orders.create_index("order_code", unique=True)
        await db.ecom_orders.create_index("created_at")
        await db.ecom_orders.create_index([("channel", 1), ("status", 1)])
        await db.ecom_orders.create_index("customer.phone")
        await db.ecom_orders.create_index("integration_id")
        await db.ecom_integrations.create_index("id", unique=True)
        await db.ecom_integrations.create_index("channel")
        await db.ecom_leads.create_index("id", unique=True)
        await db.ecom_leads.create_index("created_at")
        await db.ecom_leads.create_index([("channel", 1), ("status", 1)])
        await db.ecom_leads.create_index("ai_category")
        await db.ecom_leads.create_index([("channel", 1), ("external_id", 1)], unique=True, sparse=True)
        await db.ecom_shipping_labels.create_index("id", unique=True)
        await db.ecom_shipping_labels.create_index("order_id")
        await db.ecom_shipping_labels.create_index("tracking_number", unique=True, sparse=True)
        await db.ecom_external_products.create_index([("channel", 1), ("integration_id", 1), ("external_id", 1)], unique=True)
        await db.ecom_external_products.create_index("updated_at")
        try:
            print("Enhanced modules indexes created")
        except Exception as enh_err:
            print(f"Enhanced modules indexes warning: {enh_err}")
        print("Database indexes created successfully")
    except Exception as e:
        print(f"Index creation warning: {e}")

    try:
        from routes.saas.commission_routes import backfill_legacy_commissions
        backfilled = await backfill_legacy_commissions()
        if backfilled:
            logger.info("Commission backfill: %d legacy records set to 'available'", backfilled)
    except Exception as bf_err:
        logger.warning("Commission backfill failed (non-fatal): %s", bf_err)

@app.on_event("shutdown")
async def shutdown_db_client():
    await robot_manager.stop_all()
    try:
        from services.event_bus import event_bus
        event_bus.stop()
    except Exception:
        pass
    client.close()

# Motherboard Core
from core import install_motherboard
install_motherboard(app, get_super_admin)

# Phase 20-30 Routes
try:
    from routes.health_routes import router as health_router
    app.include_router(health_router, prefix="/api", tags=["Health"])
    app.include_router(auth_router, prefix="/api", tags=["Auth"])
except ImportError:
    pass

try:
    from routes.monitoring_routes import router as monitoring_router
    app.include_router(monitoring_router, prefix="/api", tags=["Monitoring"])
except ImportError:
    pass

try:
    from routes.audit_routes import router as audit_router
    app.include_router(audit_router, prefix="/api", tags=["Audit"])
except ImportError:
    pass

try:
    from routes.twofa_routes import router as twofa_router
    app.include_router(twofa_router, prefix="/api", tags=["2FA"])
except ImportError:
    pass

try:
    from routes.search_routes import router as search_router
    app.include_router(search_router, prefix="/api", tags=["Search"])
except ImportError:
    pass

try:
    from routes.export_routes import router as export_router
    app.include_router(export_router, prefix="/api", tags=["Export"])
except ImportError:
    pass

try:
    from routes.backup_routes import router as backup_router
    app.include_router(backup_router, prefix="/api", tags=["Backup"])
except ImportError:
    pass

try:
    from routes.webhook_routes import router as webhook_router
    app.include_router(webhook_router, prefix="/api", tags=["Webhooks"])
except ImportError:
    pass

try:
    from routes.analytics_routes import router as analytics_router
    app.include_router(analytics_router, prefix="/api", tags=["Analytics"])
except ImportError:
    pass

try:
    from routes.migration_routes import router as migration_router
    app.include_router(migration_router, prefix="/api", tags=["Migrations"])
except ImportError:
    pass

try:
    from routes.activity_routes import router as activity_router
    app.include_router(activity_router, prefix="/api", tags=["Activity"])
except ImportError:
    pass

# Fixes for missing routes
try:
    from routes.backup_routes import router as backup_router
    app.include_router(backup_router, prefix="/api/backups", tags=["Backup"])
    print("[INIT] Backup routes registered at /api/backups")
except ImportError:
    pass

try:
    from fastapi import APIRouter
    config_router = APIRouter(prefix="/config", tags=["Config"])

    @config_router.get("")
    async def get_config():
        import os
        return {
            "environment": os.getenv("ENVIRONMENT", "production"),
            "version": "16.0.0",
            "features": {
                "saas": True, "multi_tenant": True, "recharge": True, "ai_agents": True,
                "analytics": True, "2fa": True, "rbac": True, "audit_log": True,
                "backup": True, "export": True, "search": True, "webhooks": True,
            },
            "currencies": ["DZD"],
            "languages": ["ar", "fr", "en"],
            "timezone": "Africa/Algiers",
        }

    app.include_router(config_router, prefix="/api", tags=["Config"])
    print("[INIT] Config route registered at /api/config")
except Exception as e:
    print(f"[INIT] Config route error: {e}")

try:
    from fastapi import Request
    from fastapi.responses import RedirectResponse

    @app.get("/api/saas/subscribers", tags=["SaaS"])
    async def subscribers_alias(request: Request):
        return RedirectResponse(url="/api/saas/tenants", status_code=307)
    print("[INIT] Subscribers alias registered")
except Exception as e:
    print(f"[INIT] Subscribers alias error: {e}")

# recharge_fallback removed: it shadowed the real auto-registered GET /recharge list


try:
    from fastapi import APIRouter
    gateways_router = APIRouter(prefix="/payments/gateways", tags=["Payments"])

    @gateways_router.get("")
    async def list_gateways():
        return {
            "gateways": [
                {"id": "cod", "name": "Cash on Delivery", "name_ar": "الدفع عند الاستلام", "enabled": True},
                {"id": "ccp", "name": "CCP", "name_ar": "بريد الجزائر", "enabled": True},
                {"id": "bank", "name": "Bank Transfer", "name_ar": "حوالة بنكية", "enabled": True},
            ]
        }

    app.include_router(gateways_router, prefix="/api", tags=["Payments"])
    print("[INIT] Payment gateways registered")
except Exception as e:
    print(f"[INIT] Payment gateways error: {e}")

try:
    from routes.search_routes import router as search_router
    app.include_router(search_router, prefix="/api", tags=["Search"])
    print("[INIT] Search routes registered")
except ImportError:
    pass

print("[INIT] All fixes applied successfully")

# ============ LEGACY / SAAS ADMIN ROUTES (restored 2026-08-07) ============
# These route modules existed in the codebase but were never registered after
# the Sections refactor — causing 404s across the super-admin panel.
try:
    from routes.saas_routes import router as saas_admin_router
    app.include_router(saas_admin_router, prefix="/api", tags=["SaaS Admin"])
    print("[INIT] SaaS admin routes registered")
except Exception as _e:
    print(f"[INIT] SaaS admin routes: {_e}")

try:
    from routes.saas.commission_routes import router as saas_commission_router
    app.include_router(saas_commission_router, prefix="/api", tags=["SaaS Commissions"])
    print("[INIT] SaaS commission routes registered")
except Exception as _e:
    print(f"[INIT] SaaS commission routes: {_e}")

try:
    from routes.system_logs_routes import router as system_logs_router
    app.include_router(system_logs_router, prefix="/api", tags=["System Logs"])
    print("[INIT] System logs routes registered")
except Exception as _e:
    print(f"[INIT] System logs routes: {_e}")

try:
    from routes.system_sync_routes import router as system_sync_router
    app.include_router(system_sync_router, prefix="/api", tags=["System Sync"])
    print("[INIT] System sync routes registered (tenant-branding, system-updates)")
except Exception as _e:
    print(f"[INIT] System sync routes: {_e}")

try:
    from routes.families_permissions_routes import router as families_router
    app.include_router(families_router, prefix="/api", tags=["Families"])
    print("[INIT] Families routes registered")
except Exception as _e:
    print(f"[INIT] Families routes: {_e}")

try:
    from routes.products_routes import create_products_routes
    legacy_products_router = create_products_routes(db, get_current_user, get_tenant_admin, require_tenant)
    app.include_router(legacy_products_router, prefix="/api", tags=["Products"])
    print("[INIT] Legacy products routes registered")
except Exception as _e:
    print(f"[INIT] Legacy products routes: {_e}")

# Platform feature flags (restored from pre-Section-11 main.py)
@app.get("/api/platform/features")
async def list_platform_features(admin: dict = Depends(get_super_admin)) -> dict:
    mgr = get_feature_flag_manager()
    if mgr is None:
        return {"features": [{**f, "enabled": f["default"]} for f in PLATFORM_FEATURES], "categories": CATEGORY_LABELS}
    features = await mgr.get_all()
    enabled = sum(1 for f in features if f["enabled"])
    return {"features": features, "categories": CATEGORY_LABELS, "enabled_count": enabled, "total": len(features)}

@app.post("/api/platform/features/{key}/toggle")
async def toggle_platform_feature(key: str, admin: dict = Depends(get_super_admin)) -> dict:
    mgr = get_feature_flag_manager()
    if mgr is None:
        raise HTTPException(status_code=503, detail="Feature flag manager not ready")
    try:
        new_state = await mgr.toggle(key)
        return {"key": key, "enabled": new_state}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/platform/features/{key}/set")
async def set_platform_feature(key: str, enabled: bool, admin: dict = Depends(get_super_admin)) -> dict:
    mgr = get_feature_flag_manager()
    if mgr is None:
        raise HTTPException(status_code=503, detail="Feature flag manager not ready")
    try:
        await mgr.set_flag(key, enabled)
        return {"key": key, "enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/platform/features/public")
async def get_public_features() -> dict:
    mgr = get_feature_flag_manager()
    if mgr is None:
        return {"enabled": [f["key"] for f in PLATFORM_FEATURES if f["default"]]}
    enabled_keys = await mgr.get_enabled_keys()
    return {"enabled": enabled_keys}


# ============ LEGACY ROUTES — round 2 (dashboard & wallet & POS settings) ============
try:
    from routes.pos_settings_routes import create_pos_settings_routes
    pos_settings_router = create_pos_settings_routes(db, main_db, get_current_user, get_super_admin, get_tenant_admin=get_tenant_admin)
    app.include_router(pos_settings_router, prefix="/api", tags=["POS Settings"])
    print("[INIT] POS settings routes registered")
except Exception as _e:
    print(f"[INIT] POS settings routes: {_e}")

try:
    from routes.stats_routes import create_stats_routes
    stats_router = create_stats_routes(db, get_current_user, get_tenant_admin, require_tenant, init_cash_boxes, main_db=main_db)
    app.include_router(stats_router, prefix="/api", tags=["Stats"])
    print("[INIT] Stats routes registered")
except Exception as _e:
    print(f"[INIT] Stats routes: {_e}")

try:
    from utils.permissions import create_cashier_block
    from routes.wallet import (
        create_wallet_core_routes, create_wallet_transactions_routes,
        create_wallet_requests_routes, create_wallet_services_routes,
    )
    block_cashier = create_cashier_block(get_current_user)
    app.include_router(create_wallet_core_routes(main_db, get_current_user, get_super_admin, block_cashier), prefix="/api", tags=["Wallet"])
    app.include_router(create_wallet_transactions_routes(main_db, get_current_user, get_super_admin, block_cashier), prefix="/api", tags=["Wallet"])
    app.include_router(create_wallet_requests_routes(main_db, get_current_user, get_super_admin, block_cashier), prefix="/api", tags=["Wallet"])
    app.include_router(create_wallet_services_routes(main_db, get_current_user, block_cashier), prefix="/api", tags=["Wallet"])
    print("[INIT] Wallet routes registered")
except Exception as _e:
    print(f"[INIT] Wallet routes: {_e}")

try:
    from routes.notifications_routes import create_notifications_routes
    notifications_router = create_notifications_routes(db, require_tenant, get_tenant_admin, get_current_user, DEFAULT_PERMISSIONS)
    app.include_router(notifications_router, prefix="/api", tags=["Notifications"])
    print("[INIT] Legacy notifications routes registered")
except Exception as _e:
    print(f"[INIT] Legacy notifications routes: {_e}")

# Database import/export routes — frontend expects them under /api/saas/database/*
try:
    from routes.database_routes import router as database_io_router
    app.include_router(database_io_router, prefix="/api/saas", tags=["Database IO"])
    print("[INIT] Database IO routes registered at /api/saas/database")
except Exception as _e:
    print(f"[INIT] Database IO routes: {_e}")

# AI routes (Gemini) — product description / translation / social posts
try:
    from routes.ai_routes import router as ai_gemini_router
    app.include_router(ai_gemini_router, prefix="/api", tags=["AI"])
    print("[INIT] AI (Gemini) routes registered at /api/ai")
except Exception as _e:
    print(f"[INIT] AI routes: {_e}")


# init_default_data restored from git history (removed in Section-11 refactor)
# Needed by routes.auth_users_routes factory.
async def init_default_data(tenant_db) -> dict:
    # p60: delegate to the shared seeder in config.database so the manual
    # endpoint and the legacy init path can never drift apart again.
    from config.database import seed_default_entities
    await seed_default_entities(tenant_db)

# ============ AUTO-REGISTER ALL REMAINING LEGACY ROUTE MODULES ============
# The Sections refactor left most legacy route modules unregistered, causing
# widespread 404s across the app. This block discovers each module's router
# (module-level `router`, `create_*_routes(...)` or `build_*_router(...)`
# factory) and registers it, matching factory parameters by name. Every
# registration is isolated in try/except so one bad module can't break startup.
import importlib as _importlib
import inspect as _inspect

try:
    from utils.permissions import create_cashier_block as _mk_cashier_block
    _auto_block_cashier = _mk_cashier_block(get_current_user)
except Exception:
    _auto_block_cashier = None

_AUTO_REG_CTX = {
    'app': app, 'db': db, 'main_db': main_db, 'client': client,
    'get_current_user': get_current_user, 'get_admin_user': get_admin_user,
    'get_tenant_admin': get_tenant_admin, 'require_tenant': require_tenant,
    'get_super_admin': get_super_admin, 'require_permission': require_permission,
    'init_cash_boxes': init_cash_boxes, 'DEFAULT_PERMISSIONS': DEFAULT_PERMISSIONS,
    'block_cashier': _auto_block_cashier, 'CURRENCY': CURRENCY,
    'RECHARGE_CONFIG': RECHARGE_CONFIG, 'RechargeCreate': RechargeCreate,
    'RechargeResponse': RechargeResponse, 'get_tenant_db': get_tenant_db,
    'robot_manager': robot_manager,
    # extra deps for auth_users / ocr_invoice / utility factories
    'hash_password': hash_password, 'verify_password': verify_password,
    'create_access_token': create_access_token,
    'init_tenant_database': init_tenant_database,
    'init_default_data': init_default_data,
    'SECRET_KEY': SECRET_KEY, 'ALGORITHM': ALGORITHM,
    'ACCESS_TOKEN_EXPIRE_HOURS': ACCESS_TOKEN_EXPIRE_HOURS, 'security': security,
    'UserCreate': UserCreate, 'UserLogin': UserLogin, 'UserUpdate': UserUpdate,
    'UserResponse': UserResponse, 'TokenResponse': TokenResponse,
    'PasswordUpdate': PasswordUpdate,
    'ApiKeyCreate': ApiKeyCreate, 'ApiKeyResponse': ApiKeyResponse,
    'ImageOCRRequest': ImageOCRRequest, 'OCRResponse': OCRResponse,
    'generate_invoice_number': generate_invoice_number,
    'PriceHistoryResponse': PriceHistoryResponse, 'limiter': limiter,
}

_AUTO_REG_MODULES = [
    # ── module-level routers ──
    'routes.accounting.accounting_routes',
    'routes.ai.chat_routes',
    'routes.banking_routes',
    'routes.currency_routes',
    'routes.settings_routes',
    'routes.tax_routes',
    'routes.whatsapp_routes',
    'routes.performance_routes',
    'routes.ecom_routes',
    'routes.ecom.analytics_routes',
    'routes.ecom.integrations_routes',
    'routes.ecom.leads_routes',
    'routes.ecom.orders_routes',
    'routes.ecom.shipping_routes',
    'routes.ecom.webhooks_routes',
    # ── factory modules ──
    'routes.advanced_sales_routes',
    'routes.agent_hierarchy_routes',
    'routes.ai_assistant_routes',
    'routes.auth_users_routes',
    'routes.cashbox_routes',
    'routes.customer_debts_routes',
    'routes.customers_routes',
    'routes.daily_sessions_routes',
    'routes.debts_routes',
    'routes.defective_routes',
    'routes.digital_panel_routes',
    'routes.employees_routes',
    'routes.expenses_routes',
    'routes.import_export_routes',
    'routes.installments_routes',
    'routes.ocr_invoice_routes',
    'routes.online_store_routes',
    'routes.orders_routes',
    'routes.permissions_routes',
    'routes.printing_routes',
    'routes.promotions_routes',
    'routes.purchases_routes',
    'routes.push_notification_routes',
    'routes.repair_routes',
    'routes.sales_routes',
    'routes.security_routes',
    'routes.sendgrid_email_routes',
    'routes.sendgrid_integration_routes',
    'routes.shipping_loyalty_routes',
    'routes.smart_notifications_routes',
    'routes.sms_marketing_routes',
    'routes.stripe_routes',
    'routes.supplier_tracking_routes',
    'routes.suppliers_routes',
    'routes.task_chat_routes',
    'routes.utility_routes',
    'routes.warehouse_core_routes',
    'routes.whatsapp_integration_routes',
    'routes.yalidine_integration_routes',
    # ── recharge package (build_*_router factories) ──
    'routes.recharge.bridge_routes',
    'routes.recharge.core_routes',
    'routes.recharge.delivery_settings_routes',
    'routes.recharge.idoom_routes',
    'routes.recharge.sim_routes',
    'routes.recharge.sim_offers_routes',
    'routes.recharge.card_stock_routes',
    # ── saas extras not covered by the aggregate router ──
    'routes.saas.event_bus_routes',
    'routes.saas.supplier_routes',
    'routes.saas.platform_finance_routes',
    # ── round 4: previously unregistered modules ──
    'routes.backup_routes',
    'routes.ad_webhooks_routes',
    'routes.digital_services_routes',
    'routes.activity_routes',
    'routes.testimonials_routes',
    'routes.twofa_routes',
    'routes.suppliers_core_routes',
    'routes.system_errors',
    'routes.saas.autoheal_routes',  # p54: AutoHeal engine API
    'routes.wallet.wallet_billing_routes',
    'routes.partners_routes',  # p182: partners & profit distribution
    'routes.saas.business_profiles_routes',  # p183: business activity profiles
    'routes.rental_routes',  # p185: rental module (cars & properties)
    'routes.restaurant_routes',  # p186: restaurant mode (tables + kitchen orders)
    'routes.serials_routes',  # p187: IMEI/serial tracking
    'routes.production_routes',  # p188: BOM / production recipes
]

for _mod_path in _AUTO_REG_MODULES:
    try:
        _m = _importlib.import_module(_mod_path)
        if _mod_path == 'routes.system_errors' and hasattr(_m, 'init_routes'):
            _m.init_routes(main_db)
        _router = getattr(_m, 'router', None)
        if _router is not None and len(getattr(_router, 'routes', [])) == 0:
            _router = None  # empty module-level placeholder — use the factory instead
        if _router is None:
            _factory = None
            for _n in dir(_m):
                if (_n.startswith('create_') and _n.endswith('_routes')) or (_n.startswith('build_') and _n.endswith('_router')):
                    _factory = getattr(_m, _n)
                    break
            _factories = []
            for _n in dir(_m):
                if (_n.startswith('create_') and _n.endswith('_routes')) or (_n.startswith('build_') and _n.endswith('_router')):
                    _factories.append(getattr(_m, _n))
            if not _factories:
                raise RuntimeError('no router or factory found')
            _router = []
            for _factory in _factories:
                _sig = _inspect.signature(_factory)
                _kwargs = {}
                _missing = []
                for _pn, _pp in _sig.parameters.items():
                    if _pn in _AUTO_REG_CTX and _AUTO_REG_CTX[_pn] is not None:
                        _kwargs[_pn] = _AUTO_REG_CTX[_pn]
                    elif _pp.default is _pp.empty:
                        _missing.append(_pn)
                if _missing:
                    print(f'[INIT] factory skip {_mod_path}.{_factory.__name__}: missing {_missing}')
                    continue
                _router.append(_factory(**_kwargs))
            if not _router:
                raise RuntimeError('all factories skipped')
        if isinstance(_router, dict):
            for _sub in _router.values():
                app.include_router(_sub, prefix='/api')
        elif isinstance(_router, list):
            for _sub in _router:
                if isinstance(_sub, dict):
                    for _sub2 in _sub.values():
                        app.include_router(_sub2, prefix='/api')
                else:
                    app.include_router(_sub, prefix='/api')
        else:
            app.include_router(_router, prefix='/api')
        print(f'[INIT] auto-registered {_mod_path}')
    except Exception as _e:
        print(f'[INIT] AUTO-SKIP {_mod_path}: {_e}')


# ============ ROUND 4: RESTORED & MISSING ENDPOINTS ============
if "block_cashier" not in globals():
    block_cashier = create_cashier_block(get_current_user)

# ── Robot API (restored from git history e825d32) ──
robot_router = APIRouter(prefix="/robots", tags=["robots"])

@robot_router.get("/status")
async def get_robot_status(user: dict = Depends(block_cashier)) -> dict:
    return robot_manager.get_status()

@robot_router.post("/restart/{robot_name}")
async def restart_robot(robot_name: str, user: dict = Depends(block_cashier)) -> dict:
    success = await robot_manager.restart_robot(robot_name)
    if success:
        return {"message": f"تم اعادة تشغيل روبوت {robot_name}"}
    raise HTTPException(status_code=404, detail="الروبوت غير موجود")

@robot_router.post("/run/{robot_name}")
async def run_robot_once(robot_name: str, user: dict = Depends(block_cashier)) -> dict:
    result = await robot_manager.run_robot_once(robot_name)
    if result is not None:
        return {"message": f"تم تشغيل {robot_name} بنجاح", "stats": result}
    raise HTTPException(status_code=404, detail="الروبوت غير موجود")

@robot_router.post("/stop-all")
async def stop_all_robots(user: dict = Depends(block_cashier)) -> dict:
    await robot_manager.stop_all()
    return {"message": "تم ايقاف جميع الروبوتات"}

@robot_router.post("/start-all")
async def start_all_robots(user: dict = Depends(block_cashier)) -> dict:
    asyncio.create_task(robot_manager.start_all())
    return {"message": "تم بدء تشغيل جميع الروبوتات"}

@robot_router.get("/history")
async def get_robot_history(robot: str = None, limit: int = 20, user: dict = Depends(block_cashier)) -> dict:
    runs = await robot_manager.get_history(robot=robot, limit=min(limit, 100))
    return {"runs": runs, "total": len(runs)}

@robot_router.post("/interval/{robot_name}")
async def set_robot_interval(robot_name: str, body: dict, user: dict = Depends(block_cashier)) -> dict:
    interval = body.get("interval_seconds")
    if not isinstance(interval, (int, float)) or interval < 60:
        raise HTTPException(status_code=400, detail="interval_seconds يجب أن يكون >= 60")
    ok = await robot_manager.set_interval(robot_name, int(interval))
    if not ok:
        raise HTTPException(status_code=404, detail="الروبوت غير موجود")
    return {"message": f"تم تحديث الفترة الزمنية لـ {robot_name} إلى {interval} ثانية"}

app.include_router(robot_router, prefix="/api")

# ── p143/p144: Smart features (AI call scripts, auto-dispatch, forecasts, etc.) ──
try:
    from routes.smart_routes import create_smart_router, create_smart_router_ext
    app.include_router(create_smart_router(db, main_db, require_tenant, get_tenant_admin), prefix="/api", tags=["Smart"])
    app.include_router(create_smart_router_ext(db, main_db, require_tenant, get_tenant_admin, get_tenant_db), prefix="/api", tags=["Smart2"])
    print("✅ Smart features router loaded")
except Exception as _smart_err:
    print(f"⚠️ smart router not loaded: {_smart_err}")


# ── Advanced Dashboard endpoints ──
@app.get("/api/dashboard/advanced-stats")
async def dashboard_advanced_stats(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    month_start = (now - timedelta(days=30)).isoformat()

    async def _sum_sales(since):
        agg = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": since}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}},
        ]).to_list(1)
        return agg[0]["total"] if agg else 0

    low_stock = await db.products.count_documents({"$expr": {"$lte": ["$stock", {"$ifNull": ["$min_stock", 5]}]}})
    debts_agg = await db.debts.aggregate([
        {"$match": {"remaining_amount": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}}},
    ]).to_list(1)
    return {
        "todaySales": await _sum_sales(today_start),
        "weekSales": await _sum_sales(week_start),
        "monthSales": await _sum_sales(month_start),
        "totalProducts": await db.products.count_documents({}),
        "lowStockCount": low_stock,
        "pendingDebts": debts_agg[0]["total"] if debts_agg else 0,
        "activeCustomers": await db.customers.count_documents({}),
    }

@app.get("/api/dashboard/sales-chart")
async def dashboard_sales_chart(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    results = []
    ar_days = ["أحد", "اثنين", "ثلا", "أرب", "خمي", "جمع", "سبت"]
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        day_end = (day + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        agg = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": day_start, "$lt": day_end}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "sales": {"$sum": "$total"}, "orders": {"$sum": 1}}},
        ]).to_list(1)
        # p148: expenses were hardcoded to 0 — aggregate them per day (expense.date is ISO, prefix-match the day)
        day_prefix = day_start[:10]
        exp_agg = await db.expenses.aggregate([
            {"$match": {"date": {"$gte": day_prefix, "$lt": (day + timedelta(days=1)).strftime("%Y-%m-%d")}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        row = agg[0] if agg else {"sales": 0, "orders": 0}
        results.append({
            "name": ar_days[(day.weekday() + 1) % 7],
            "sales": row["sales"],
            "orders": row["orders"],
            "expenses": round(exp_agg[0]["total"], 2) if exp_agg else 0,
        })
    return results

@app.get("/api/dashboard/alerts")
async def dashboard_alerts(user: dict = Depends(get_current_user)):
    alerts = []
    # p148: products store quantity/low_stock_threshold (not stock/min_stock) — old fields flagged everything with "(0)"
    low_stock = await db.products.find(
        {"$expr": {"$lte": [{"$ifNull": ["$quantity", 0]}, {"$ifNull": ["$low_stock_threshold", 5]}]}},
        {"_id": 0, "name": 1, "name_ar": 1, "quantity": 1},
    ).limit(10).to_list(10)
    for p in low_stock:
        pname = p.get("name_ar") or p.get("name", "")
        alerts.append({
            "id": f"stock-{pname}",
            "type": "low_stock",
            "message": f"المنتج {pname} منخفض المخزون ({p.get('quantity', 0)})",
            "priority": "high",
        })
    overdue = await db.debts.count_documents({"remaining_amount": {"$gt": 0}})
    if overdue:
        alerts.append({"id": "debts", "type": "debt", "message": f"{overdue} ديون غير مسددة", "priority": "medium"})
    return alerts


# ── Defective products aliases (frontend uses /defective-products) ──
@app.get("/api/defective-products")
async def defective_products_list(user: dict = Depends(get_current_user)):
    return await db.defective_goods.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

@app.get("/api/defective-products/stats")
async def defective_products_stats(user: dict = Depends(get_current_user)):
    total = await db.defective_goods.count_documents({})
    pending = await db.defective_goods.count_documents({"status": "pending_inspection"})
    confirmed = await db.defective_goods.count_documents({"status": "confirmed_defective"})
    returned = await db.supplier_returns.count_documents({})
    disposed = await db.disposal_records.count_documents({})
    cost_agg = await db.defective_goods.aggregate([{"$group": {"_id": None, "total": {"$sum": "$total_cost"}}}]).to_list(1)
    return {
        "total_defective": total,
        "pending_inspection": pending,
        "confirmed_defective": confirmed,
        "total_returns": returned,
        "total_disposals": disposed,
        "total_cost": cost_agg[0]["total"] if cost_agg else 0,
    }

@app.post("/api/defective-products")
async def defective_products_create(data: dict, user: dict = Depends(get_current_user)):
    doc = dict(data)
    doc.setdefault("id", str(uuid.uuid4()))
    doc.setdefault("status", "pending_inspection")
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = user.get("name", "")
    await db.defective_goods.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc

@app.put("/api/defective-products/{item_id}")
async def defective_products_update(item_id: str, data: dict, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.items() if k not in ("id", "_id")}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.defective_goods.update_one({"id": item_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="العنصر غير موجود")
    return await db.defective_goods.find_one({"id": item_id}, {"_id": 0})

@app.delete("/api/defective-products/{item_id}")
async def defective_products_delete(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.defective_goods.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="العنصر غير موجود")
    return {"message": "تم الحذف"}


# ── Misc aliases ──
@app.get("/api/cash/accounts")
async def cash_accounts_alias(user: dict = Depends(get_current_user)):
    return await db.cash_boxes.find({}, {"_id": 0}).to_list(100)

@app.get("/api/recharges")
async def recharges_list_alias(limit: int = 100, user: dict = Depends(get_current_user)):
    return await db.recharges.find({}, {"_id": 0}).sort("created_at", -1).limit(min(limit, 1000)).to_list(min(limit, 1000))

@app.put("/api/repairs/{repair_id}")
async def repair_update_alias(repair_id: str, data: dict, user: dict = Depends(get_current_user)):
    ticket = await db.repair_tickets.find_one({"id": repair_id}, {"_id": 0})
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
        elif new_status == "repaired":
            updates["repaired_at"] = now
        elif new_status == "delivered":
            updates["delivered_at"] = now
        await db.repair_history.insert_one({
            "id": str(uuid.uuid4()),
            "repair_ticket_id": repair_id,
            "old_status": old_status,
            "new_status": new_status,
            "changed_by": user.get("name", ""),
            "notes": data.get("notes", ""),
            "created_at": now,
        })
    await db.repair_tickets.update_one({"id": repair_id}, {"$set": updates})
    return await db.repair_tickets.find_one({"id": repair_id}, {"_id": 0})

# ============ END ROUND 4 ============


# Serve uploaded files (product/purchase images) — StaticFiles was imported but never
# mounted, so every /api/static/uploads/* URL returned 404 (audit P1 fix)
app.mount("/api/static", StaticFiles(directory=ROOT_DIR / "static"), name="static")
