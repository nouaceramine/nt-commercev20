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
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
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
# main.py imports them so there is a SINGLE tenant-context ContextVar + db proxy
# shared across the legacy in-file routes AND the modular routers. This prevents
# tenant-isolation drift (two separate ContextVars used to coexist here).
from config.database import (
    client,
    main_db,
    db,
    _tenant_db_ctx,
    get_tenant_db,
    set_tenant_context,
    init_tenant_database,
)

# init_tenant_database is imported from config.database (canonical single source).

# JWT Settings
SECRET_KEY = os.environ['JWT_SECRET_KEY']
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Currency
CURRENCY = "دج"  # Algerian Dinar

# Create the main app
app = FastAPI(title="NT API")

# Initialize rate limiter (slowapi)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create static directory for uploads
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
# Route handlers are mounted as independent components through the motherboard
# module layer (see `mount_all` below and backend/modules/<key>.py). Each component
# imports its own routers, so main.py only imports symbols it references directly.
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
        user_type = payload.get("type")  # admin, agent, tenant
        tenant_id = payload.get("tenant_id")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # For tenant users, get from tenant database
        if user_type == "tenant" and tenant_id:
            tenant_db = get_tenant_db(tenant_id)
            user = await tenant_db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0})
            
            # Get tenant info from main_db to get plan features
            tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "password": 0})
            
            if user is None:
                # Check main tenant record (always in main_db)
                if tenant:
                    user = {
                        "id": tenant["id"],
                        "email": tenant["email"],
                        "name": tenant["name"],
                        "role": "admin",
                        "tenant_id": tenant_id,
                        "user_type": "tenant",
                        "company_name": tenant.get("company_name", ""),
                        "created_at": tenant.get("created_at", datetime.now(timezone.utc).isoformat())
                    }
                else:
                    raise HTTPException(status_code=401, detail="User not found")
            else:
                user["tenant_id"] = tenant_id
                user["user_type"] = "tenant"
                if not user.get("created_at"):
                    user["created_at"] = datetime.now(timezone.utc).isoformat()
            
            # Add plan features and limits for tenant users
            if tenant:
                plan = await main_db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
                if plan:
                    user["features"] = {**plan.get("features", {}), **tenant.get("features_override", {})}
                    user["limits"] = {**plan.get("limits", {}), **tenant.get("limits_override", {})}
                user["company_name"] = tenant.get("company_name", "")
        else:
            # For admin users, get from main database
            user = await main_db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0})
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
    """Get current user and their tenant database"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_type = payload.get("type")
        tenant_id = payload.get("tenant_id")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get the appropriate database
        if user_type == "tenant" and tenant_id:
            tenant_db = get_tenant_db(tenant_id)
        else:
            tenant_db = main_db  # Use main database for admin users
            tenant_id = None
        
        # Get user info
        user = await tenant_db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "hashed_password": 0})
        if user is None and tenant_id:
            # For tenant owner, create entry from saas_tenants
            tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "password": 0})
            if tenant:
                user = {
                    "id": tenant["id"],
                    "email": tenant["email"],
                    "name": tenant["name"],
                    "role": "admin"
                }
        
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
    """Require tenant context - rejects super_admin users without tenant_id.
    Use this for tenant-specific data routes (products, customers, sales, etc.)."""
    if not current_user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح فقط لمشتركي المنصة")
    if current_user.get("role") not in ["admin", "manager", "user", "tenant_admin"]:
        raise HTTPException(status_code=403, detail="صلاحيات غير كافية")
    return current_user

async def require_tenant(current_user: dict = Depends(get_current_user)) -> dict:
    """Require tenant context for read operations - any authenticated tenant user."""
    if not current_user.get("tenant_id"):
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
    """Initialize default cash boxes if they don't exist, or update existing ones with name_fr"""
    boxes = [
        {"id": "cash", "name": "الصندوق النقدي", "name_fr": "Caisse", "type": "cash", "balance": 0},
        {"id": "bank", "name": "الحساب البنكي", "name_fr": "Compte bancaire", "type": "bank", "balance": 0},
        {"id": "wallet", "name": "المحفظة الإلكترونية", "name_fr": "Portefeuille électronique", "type": "wallet", "balance": 0},
        {"id": "safe", "name": "الخزنة", "name_fr": "Coffre-fort", "type": "safe", "balance": 0}
    ]
    from services.code_generator import generate_code
    for box in boxes:
        existing = await db.cash_boxes.find_one({"id": box["id"]})
        if not existing:
            box["code"] = await generate_code(db, "cash_boxes", "CA", 5, with_year=False)
            box["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.cash_boxes.insert_one(box)
        elif not existing.get("name_fr"):
            # Update existing box with name_fr if missing
            await db.cash_boxes.update_one(
                {"id": box["id"]},
                {"$set": {"name_fr": box["name_fr"]}}
            )

async def init_default_data(tenant_db) -> dict:
    """Initialize default data for a tenant (customers, suppliers, families, products)"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Default Customer Family
    default_customer_family_id = "default-customer-family"
    existing_cf = await tenant_db.customer_families.find_one({"id": default_customer_family_id})
    if not existing_cf:
        await tenant_db.customer_families.insert_one({
            "id": default_customer_family_id,
            "name": "عائلة زبائن متنوعة",
            "name_fr": "Famille clients divers",
            "description": "عائلة افتراضية للزبائن",
            "discount": 0,
            "created_at": now,
            "updated_at": now
        })
    
    # Default Customer
    default_customer_id = "default-customer"
    existing_c = await tenant_db.customers.find_one({"id": default_customer_id})
    if not existing_c:
        await tenant_db.customers.insert_one({
            "id": default_customer_id,
            "name": "زبون متنوع",
            "name_fr": "Client divers",
            "phone": "",
            "email": "",
            "address": "",
            "family_id": default_customer_family_id,
            "family_name": "عائلة زبائن متنوعة",
            "balance": 0,
            "total_purchases": 0,
            "notes": "زبون افتراضي للمبيعات العامة",
            "created_at": now,
            "updated_at": now
        })
    
    # Default Supplier Family
    default_supplier_family_id = "default-supplier-family"
    existing_sf = await tenant_db.supplier_families.find_one({"id": default_supplier_family_id})
    if not existing_sf:
        await tenant_db.supplier_families.insert_one({
            "id": default_supplier_family_id,
            "name": "عائلة مورد متنوع",
            "name_fr": "Famille fournisseurs divers",
            "description": "عائلة افتراضية للموردين",
            "created_at": now,
            "updated_at": now
        })
    
    # Default Supplier
    default_supplier_id = "default-supplier"
    existing_s = await tenant_db.suppliers.find_one({"id": default_supplier_id})
    if not existing_s:
        await tenant_db.suppliers.insert_one({
            "id": default_supplier_id,
            "name": "مورد متنوع",
            "name_fr": "Fournisseur divers",
            "phone": "",
            "email": "",
            "address": "",
            "family_id": default_supplier_family_id,
            "family_name": "عائلة مورد متنوع",
            "balance": 0,
            "total_purchases": 0,
            "notes": "مورد افتراضي للمشتريات العامة",
            "created_at": now,
            "updated_at": now
        })
    
    # Default Product Family
    default_product_family_id = "default-product-family"
    existing_pf = await tenant_db.product_families.find_one({"id": default_product_family_id})
    if not existing_pf:
        await tenant_db.product_families.insert_one({
            "id": default_product_family_id,
            "name": "عائلة منتج متنوع",
            "name_fr": "Famille produits divers",
            "name_ar": "عائلة منتج متنوع",
            "name_en": "Various Products Family",
            "description": "عائلة افتراضية للمنتجات",
            "description_ar": "عائلة افتراضية للمنتجات المتنوعة",
            "description_en": "Default family for various products",
            "parent_id": "",
            "parent_name": "",
            "image": "",
            "created_at": now,
            "updated_at": now
        })
    
    # Default Product
    default_product_id = "default-product"
    existing_p = await tenant_db.products.find_one({"id": default_product_id})
    if not existing_p:
        await tenant_db.products.insert_one({
            "id": default_product_id,
            "name_ar": "منتج متنوع",
            "name_en": "Produit divers",
            "article_code": "DIVERS-001",
            "barcode": "",
            "family_id": default_product_family_id,
            "family_name": "عائلة منتج متنوع",
            "purchase_price": 0,
            "wholesale_price": 0,
            "retail_price": 0,
            "quantity": 0,
            "min_stock": 0,
            "unit": "وحدة",
            "description": "منتج افتراضي للمبيعات المتنوعة",
            "supplier_id": default_supplier_id,
            "supplier_name": "مورد متنوع",
            "image": "",
            "created_at": now,
            "updated_at": now
        })


# ============ PERMISSION SYSTEM ============
require_permission = create_permission_checker(db, get_current_user)
block_cashier = create_cashier_block(get_current_user)


# ============ MOTHERBOARD MODULE MOUNTING ============
# Every domain is mounted as an independent component via backend/modules/.
# Components load in isolation: a failure in one is recorded in diagnostics
# (/api/diagnostics/modules) without preventing the others from loading.
from modules import AppContext, mount_all

_app_context = AppContext(
    db=db, main_db=main_db,
    get_current_user=get_current_user, get_admin_user=get_admin_user,
    get_tenant_admin=get_tenant_admin, get_super_admin=get_super_admin,
    require_tenant=require_tenant, get_tenant_db=get_tenant_db,
    hash_password=hash_password, verify_password=verify_password,
    create_access_token=create_access_token,
    init_tenant_database=init_tenant_database, init_default_data=init_default_data,
    init_cash_boxes=init_cash_boxes, generate_invoice_number=generate_invoice_number,
    security=security, limiter=limiter,
    SECRET_KEY=SECRET_KEY, ALGORITHM=ALGORITHM,
    ACCESS_TOKEN_EXPIRE_HOURS=ACCESS_TOKEN_EXPIRE_HOURS,
    CURRENCY=CURRENCY, DEFAULT_PERMISSIONS=DEFAULT_PERMISSIONS, RECHARGE_CONFIG=RECHARGE_CONFIG,
    UserCreate=UserCreate, UserLogin=UserLogin, UserUpdate=UserUpdate,
    UserResponse=UserResponse, TokenResponse=TokenResponse, PasswordUpdate=PasswordUpdate,
    PriceHistoryResponse=PriceHistoryResponse,
    ApiKeyCreate=ApiKeyCreate, ApiKeyResponse=ApiKeyResponse,
    ImageOCRRequest=ImageOCRRequest, OCRResponse=OCRResponse,
    RechargeCreate=RechargeCreate, RechargeResponse=RechargeResponse,
)
mount_all(app, _app_context)

# Internal main.py router (empty placeholder kept for backward compatibility)
app.include_router(api_router)

# ============ ROBOT API ENDPOINTS ============
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
async def get_robot_history(
    robot: str = None,
    limit: int = 20,
    user: dict = Depends(block_cashier),
) -> dict:
    runs = await robot_manager.get_history(robot=robot, limit=min(limit, 100))
    return {"runs": runs, "total": len(runs)}

@robot_router.post("/interval/{robot_name}")
async def set_robot_interval(
    robot_name: str,
    body: dict,
    user: dict = Depends(block_cashier),
) -> dict:
    interval = body.get("interval_seconds")
    if not isinstance(interval, (int, float)) or interval < 60:
        raise HTTPException(status_code=400, detail="interval_seconds يجب أن يكون >= 60")
    ok = await robot_manager.set_interval(robot_name, int(interval))
    if not ok:
        raise HTTPException(status_code=404, detail="الروبوت غير موجود")
    return {"message": f"تم تحديث الفترة الزمنية لـ {robot_name} إلى {interval} ثانية"}


# ── Platform Feature Flags ──────────────────────────────────────────────────
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
async def get_public_features(current_user: dict = Depends(get_current_user)) -> dict:
    mgr = get_feature_flag_manager()
    if mgr is None:
        return {"enabled": [f["key"] for f in PLATFORM_FEATURES if f["default"]]}
    enabled_keys = await mgr.get_enabled_keys()
    return {"enabled": enabled_keys}

app.include_router(robot_router, prefix="/api")  # Robot management routes

# ============ CACHE API ENDPOINTS ============
cache_router = APIRouter(prefix="/cache", tags=["cache"])

@cache_router.get("/stats")
async def get_cache_stats(admin: dict = Depends(get_super_admin)) -> dict:
    return cache.get_stats()

@cache_router.post("/flush")
async def flush_cache(admin: dict = Depends(get_super_admin)) -> dict:
    cache.flush_all()
    return {"message": "تم مسح ذاكرة التخزين المؤقت"}

@cache_router.delete("/{pattern}")
async def delete_cache_pattern(pattern: str, admin: dict = Depends(get_super_admin)) -> None:
    cache.delete_pattern(f"{pattern}:*")
    return {"message": f"تم مسح مفاتيح {pattern}"}

app.include_router(cache_router, prefix="/api")  # Cache management routes

# Tenant context middleware - extracts tenant_id from JWT and sets ContextVar
@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    """Sets the tenant database context for each request based on JWT tenant_id.
    Only tenant users get a tenant DB bound; super_admin (platform) requests stay on
    main_db. The context token is reset after the request to avoid intra-request
    ambiguity and any cross-request bleed."""
    auth_header = request.headers.get("authorization", "")
    ctx_token = None
    if auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            tenant_id = payload.get("tenant_id")
            user_type = payload.get("type")
            role = payload.get("role")
            # Never bind a tenant DB for super_admin/platform tokens.
            if tenant_id and user_type != "super_admin" and role != "super_admin":
                ctx_token = _tenant_db_ctx.set(get_tenant_db(tenant_id))
        except Exception:
            pass  # Invalid/expired token - no tenant context, falls back to main_db
    try:
        return await call_next(request)
    finally:
        if ctx_token is not None:
            _tenant_db_ctx.reset(ctx_token)

# Performance timing middleware
@app.middleware("http")
async def performance_timing_middleware(request: Request, call_next):
    """Track request timing for performance monitoring"""
    import time as _time
    start = _time.time()
    response = await call_next(request)
    duration = _time.time() - start
    if request.url.path.startswith("/api/"):
        record_request_time(duration, request.url.path)
    response.headers["X-Response-Time"] = f"{duration*1000:.0f}ms"
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# CORS Configuration - secure origins (no wildcard fallback)
_cors_env = os.environ.get('CORS_ORIGINS', '')
_cors_origins = [o.strip() for o in _cors_env.split(',') if o.strip()] if _cors_env else []
# Always allow preview URL in development
_preview_url = os.environ.get('PREVIEW_URL', '')
if _preview_url and _preview_url not in _cors_origins:
    _cors_origins.append(_preview_url)

if not _cors_origins:
    logger.warning("CORS_ORIGINS is empty - CORS will block all cross-origin requests")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)

# Mount static files for uploads
app.mount("/api/static", StaticFiles(directory=str(ROOT_DIR / "static")), name="static")

@app.on_event("startup")
async def startup():
    await init_cash_boxes()
    # Start robots in background
    robot_manager.initialize()
    asyncio.create_task(robot_manager.start_all())
    _set_robot_manager_in_diagnostics(robot_manager)
    logger.info("Robots initialized and starting in background")
    # Feature flag manager
    _ffm = FeatureFlagManager(main_db)
    set_feature_flag_manager(_ffm)
    logger.info("Feature flag manager initialized (%d flags)", len(PLATFORM_FEATURES))
    # Create indexes for better performance
    try:
        # Existing indexes
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
        
        # New accounting indexes
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
        
        # AI indexes
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
        
        # WhatsApp indexes
        await db.whatsapp_messages.create_index("id", unique=True)
        await db.whatsapp_messages.create_index("from_number")
        await db.whatsapp_messages.create_index("processed")
        await db.whatsapp_messages.create_index("tenant_id")
        await db.whatsapp_config.create_index("tenant_id", unique=True)
        
        # Tax indexes
        await db.tax_rates.create_index("id", unique=True)
        await db.tax_rates.create_index("type")
        await db.tax_declarations.create_index("id", unique=True)
        await db.tax_declarations.create_index("year")
        
        # Push notification indexes
        await db.push_notifications.create_index("id", unique=True)
        await db.push_notifications.create_index("tenant_id")
        await db.push_notifications.create_index("created_at")
        await db.notification_preferences.create_index("user_id", unique=True)
        
        # Currency indexes
        await db.currencies.create_index("code", unique=True)
        await db.currency_settings.create_index("tenant_id")
        await db.currency_rate_history.create_index("code")
        
        print("✅ Database indexes created successfully (including accounting & AI)")
    except Exception as e:
        print(f"⚠️ Index creation warning: {e}")

    # Idempotent backfill: commission records predating the status field → 'available'
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
    client.close()

# ============ MOTHERBOARD CORE ============
# Modular self-diagnostics + per-component logging + central error handling.
# See backend/core/ — each domain is an independent component with its own log file.
from core import install_motherboard
install_motherboard(app, get_tenant_admin)
