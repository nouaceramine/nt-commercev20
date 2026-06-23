"""
Backup, Printing, Barcode, Search, Performance, Security, Tasks, Chat, Supplier Models
"""
from pydantic import BaseModel
from typing import Optional, List, Dict


# ═══════ BACKUP (5) ═══════
class Backup(BaseModel):
    id: str = ""
    backup_number: str = ""
    entity_type: str = ""
    entity_id: str = ""
    entity_name: str = ""
    backup_type: str = "full"
    format: str = "json"
    status: str = "completed"
    file_name: str = ""
    file_size: int = 0
    tables_count: int = 0
    records_count: int = 0
    is_encrypted: bool = False
    created_at: Optional[str] = None

class BackupSchedule(BaseModel):
    id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    frequency: str = "daily"
    time: str = "02:00"
    format: str = "json"
    auto_email: bool = False
    keep_last: int = 7
    is_active: bool = True

class BackupDownload(BaseModel):
    id: str = ""
    backup_id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    downloaded_by: str = ""
    downloaded_at: Optional[str] = None

class BackupEmail(BaseModel):
    id: str = ""
    backup_id: str = ""
    recipient: str = ""
    sent_at: Optional[str] = None
    status: str = "sent"

class AdminBackup(BaseModel):
    id: str = ""
    timestamp: Optional[str] = None
    type: str = "full"
    file_name: str = ""
    file_size: int = 0
    databases_count: int = 0
    status: str = "completed"


# ═══════ PRINTING (5) ═══════
class PrintTemplate(BaseModel):
    id: str = ""
    tenant_id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    type: str = "receipt"
    printer_type: str = "thermal"
    template_html: str = ""
    is_default: bool = False
    created_at: Optional[str] = None

class PrintLog(BaseModel):
    id: str = ""
    tenant_id: str = ""
    document_type: str = ""
    document_id: str = ""
    printer_type: str = ""
    copies: int = 1
    printed_by: str = ""
    printed_at: Optional[str] = None

class PrinterSetting(BaseModel):
    id: str = ""
    tenant_id: str = ""
    default_printer: str = ""
    default_template: str = ""
    print_copies: int = 1
    auto_print: bool = False

class PrintQueue(BaseModel):
    id: str = ""
    tenant_id: str = ""
    document_type: str = ""
    document_id: str = ""
    priority: int = 0
    status: str = "pending"

class PrintJob(BaseModel):
    id: str = ""
    queue_id: str = ""
    printer_name: str = ""
    copies: int = 1
    status: str = "pending"
    started_at: Optional[str] = None


# ═══════ BARCODE (3) ═══════
class ProductBarcode(BaseModel):
    id: str = ""
    product_id: str = ""
    barcode: str = ""
    format: str = "EAN13"
    is_primary: bool = True

class BarcodeScan(BaseModel):
    id: str = ""
    tenant_id: str = ""
    barcode: str = ""
    product_id: Optional[str] = None
    scan_type: str = "lookup"
    scanned_by: str = ""
    scanned_at: Optional[str] = None

class LabelDesign(BaseModel):
    id: str = ""
    tenant_id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    width: int = 50
    height: int = 30
    template_html: str = ""
    include_price: bool = True
    include_barcode: bool = True


# ═══════ SEARCH (3) ═══════
class SearchHistory(BaseModel):
    id: str = ""
    tenant_id: str = ""
    user_id: str = ""
    query: str = ""
    search_type: str = "global"
    results_count: int = 0
    execution_time: float = 0
    created_at: Optional[str] = None

class SearchSuggestion(BaseModel):
    id: str = ""
    tenant_id: str = ""
    query: str = ""
    suggestion_type: str = "popular"
    suggestion_text: str = ""
    reference_id: Optional[str] = None
    search_count: int = 0

class CustomIndex(BaseModel):
    id: str = ""
    tenant_id: str = ""
    collection: str = ""
    fields: List[str] = []
    is_compound: bool = False
    query_count: int = 0


# ═══════ PERFORMANCE (4) ═══════
class QueryStat(BaseModel):
    id: str = ""
    collection: str = ""
    query_pattern: str = ""
    execution_time: float = 0
    documents_scanned: int = 0
    index_used: Optional[str] = None
    timestamp: Optional[str] = None

class SlowQuery(BaseModel):
    id: str = ""
    collection: str = ""
    query: Dict = {}
    execution_time: float = 0
    threshold: float = 1.0
    timestamp: Optional[str] = None
    optimized: bool = False

class CacheStat(BaseModel):
    id: str = ""
    cache_level: str = ""
    hits: int = 0
    misses: int = 0
    hit_rate: float = 0
    timestamp: Optional[str] = None

class IndexRecommendation(BaseModel):
    id: str = ""
    collection: str = ""
    suggested_indexes: List[str] = []
    reason: str = ""
    estimated_improvement: float = 0
    is_implemented: bool = False


# ═══════ SECURITY (9) ═══════
class SecurityLog(BaseModel):
    id: str = ""
    event_type: str = ""
    severity: str = "info"
    ip_address: str = ""
    user_id: Optional[str] = None
    details: Dict = {}
    created_at: Optional[str] = None

class BlockedIP(BaseModel):
    id: str = ""
    ip_address: str = ""
    reason: str = ""
    blocked_at: Optional[str] = None
    expires_at: Optional[str] = None

class LoginAttempt(BaseModel):
    id: str = ""
    username: str = ""
    ip_address: str = ""
    success: bool = False
    user_agent: str = ""
    created_at: Optional[str] = None

class EncryptionKey(BaseModel):
    id: str = ""
    key_name: str = ""
    key_value: str = ""
    context: str = ""
    tenant_id: Optional[str] = None
    created_at: Optional[str] = None
    is_active: bool = True

class AuditLog(BaseModel):
    id: str = ""
    user_id: str = ""
    user_name: str = ""
    action: str = ""
    entity_type: str = ""
    entity_id: str = ""
    old_values: Dict = {}
    new_values: Dict = {}
    ip_address: str = ""
    created_at: Optional[str] = None

class TwoFactorAuth(BaseModel):
    id: str = ""
    user_id: str = ""
    user_type: str = ""
    secret_key: str = ""
    is_enabled: bool = False
    backup_codes: List[str] = []

class UserSession(BaseModel):
    id: str = ""
    user_id: str = ""
    user_type: str = ""
    token: str = ""
    ip_address: str = ""
    expires_at: Optional[str] = None

class APIKey(BaseModel):
    id: str = ""
    tenant_id: str = ""
    key_name: str = ""
    api_key: str = ""
    permissions: List[str] = []
    is_active: bool = True


# ═══════ TASKS (2) ═══════
class Task(BaseModel):
    id: str = ""
    task_number: str = ""
    tenant_id: str = ""
    title_ar: str = ""
    title_fr: str = ""
    description_ar: Optional[str] = None
    description_fr: Optional[str] = None
    task_type: str = "general"
    priority: str = "medium"
    status: str = "pending"
    created_at: Optional[str] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    created_by: str = ""
    progress: int = 0

class TaskComment(BaseModel):
    id: str = ""
    task_id: str = ""
    user_id: str = ""
    user_name: str = ""
    comment_ar: str = ""
    comment_fr: Optional[str] = None


# ═══════ CHAT (2) ═══════
class ChatRoom(BaseModel):
    id: str = ""
    tenant_id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    members: List[str] = []
    created_at: Optional[str] = None

class ChatMessage(BaseModel):
    id: str = ""
    room_id: str = ""
    user_id: str = ""
    user_name: str = ""
    content: str = ""
    created_at: Optional[str] = None


# ═══════ SUPPLIER TRACKING (2) ═══════
class SupplierGoods(BaseModel):
    id: str = ""
    supplier_id: str = ""
    product_id: str = ""
    purchase_price: float = 0
    last_purchase_date: Optional[str] = None
    quality_rating: float = 5.0
    is_preferred: bool = False

class SupplierGoodsOrder(BaseModel):
    id: str = ""
    order_number: str = ""
    supplier_id: str = ""
    items: List[dict] = []
    status: str = "pending"
    total_amount: float = 0
    expected_delivery: Optional[str] = None
    created_at: Optional[str] = None
