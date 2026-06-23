"""
AI Models for NT Commerce AI-Powered Accounting Platform
All data models for AI agents, insights, and chat
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum


# ============ AI INSIGHTS ============

class InsightType(str, Enum):
    REVENUE_TREND = "revenue_trend"
    EXPENSE_ALERT = "expense_alert"
    CASH_FLOW_RISK = "cash_flow_risk"
    PROFIT_MARGIN = "profit_margin"
    ANOMALY = "anomaly"
    RECOMMENDATION = "recommendation"
    FORECAST = "forecast"
    TAX_ALERT = "tax_alert"


class InsightPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AIInsightCreate(BaseModel):
    insight_type: InsightType
    title: str
    title_ar: str
    description: str
    description_ar: str
    priority: InsightPriority = InsightPriority.MEDIUM
    data: dict = {}
    recommendations: List[str] = []
    expires_at: Optional[str] = None


class AIInsightResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    insight_type: str
    title: str
    title_ar: str
    description: str
    description_ar: str
    priority: str
    data: dict = {}
    recommendations: List[str] = []
    is_read: bool = False
    is_dismissed: bool = False
    expires_at: Optional[str] = None
    created_at: str


# ============ AI CHAT ============

class ChatRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessageCreate(BaseModel):
    role: ChatRole
    content: str
    metadata: dict = {}


class ChatSessionCreate(BaseModel):
    title: str = "محادثة جديدة"


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    messages: List[dict] = []
    message_count: int = 0
    last_message_at: Optional[str] = None
    created_at: str


class ChatRequest(BaseModel):
    message: str
    session_id: str = ""
    context: dict = {}


class ChatResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    response: str
    data: Optional[dict] = None
    suggestions: List[str] = []


# ============ AI AGENTS ============

class AgentType(str, Enum):
    INVOICE_PROCESSOR = "invoice_processor"
    EXPENSE_CLASSIFIER = "expense_classifier"
    FINANCIAL_ANALYZER = "financial_analyzer"
    FRAUD_DETECTOR = "fraud_detector"
    SMART_REPORTER = "smart_reporter"
    TAX_ASSISTANT = "tax_assistant"
    FORECASTER = "forecaster"
    DAILY_AUTOMATION = "daily_automation"


class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AIAgentTaskCreate(BaseModel):
    agent_type: AgentType
    input_data: dict = {}
    priority: int = 5
    scheduled_at: Optional[str] = None


class AIAgentTaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    agent_type: str
    status: str
    input_data: dict = {}
    output_data: Optional[dict] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    execution_time_ms: Optional[int] = None
    created_at: str


class AIAgentConfigCreate(BaseModel):
    agent_type: AgentType
    is_enabled: bool = True
    schedule: Optional[str] = None  # cron expression
    settings: dict = {}


class AIAgentConfigResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    agent_type: str
    is_enabled: bool
    schedule: Optional[str] = None
    settings: dict = {}
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    run_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    created_at: str
    updated_at: str


# ============ INVOICE OCR ============

class InvoiceOCRRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    file_type: Literal["image", "pdf"] = "image"


class InvoiceOCRResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    success: bool
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    total_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    currency: str = "DZD"
    line_items: List[dict] = []
    raw_text: str = ""
    confidence: float = 0
    suggested_category: Optional[str] = None


# ============ EXPENSE CLASSIFICATION ============

class ExpenseClassificationRequest(BaseModel):
    description: str
    amount: float
    vendor: Optional[str] = None


class ExpenseClassificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    suggested_category: str
    confidence: float
    alternative_categories: List[dict] = []
    account_id: Optional[str] = None
    account_name: Optional[str] = None


# ============ FRAUD DETECTION ============

class FraudAlertResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    alert_type: str
    severity: str
    title: str
    description: str
    entity_type: str
    entity_id: str
    entity_details: dict = {}
    is_resolved: bool = False
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    resolution_notes: str = ""
    created_at: str


# ============ FORECASTING ============

class ForecastRequest(BaseModel):
    forecast_type: Literal["revenue", "expenses", "cash_flow", "profit"]
    periods: int = 3  # Number of periods to forecast
    period_type: Literal["day", "week", "month"] = "month"


class ForecastResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    forecast_type: str
    period_type: str
    historical_data: List[dict] = []
    forecast_data: List[dict] = []
    trend: str  # "up", "down", "stable"
    confidence: float
    insights: List[str] = []


# ============ FINANCIAL HEALTH ============

class FinancialHealthResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    overall_score: float  # 0-100
    liquidity_ratio: float
    debt_ratio: float
    profit_margin: float
    cash_runway_days: int
    revenue_growth: float
    expense_growth: float
    health_indicators: List[dict] = []
    recommendations: List[str] = []
    generated_at: str


# ============ DAILY SUMMARY ============

class DailySummaryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: str
    revenue: float
    expenses: float
    net_income: float
    cash_in: float
    cash_out: float
    new_invoices: int
    paid_invoices: int
    overdue_invoices: int
    transactions_count: int
    anomalies: List[dict] = []
    highlights: List[str] = []
    alerts: List[dict] = []


# ============ WHATSAPP INTEGRATION ============

class WhatsAppMessageCreate(BaseModel):
    from_number: str
    message_type: Literal["text", "image", "document"] = "text"
    content: str
    media_url: Optional[str] = None


class WhatsAppMessageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    from_number: str
    message_type: str
    content: str
    media_url: Optional[str] = None
    processed: bool = False
    processing_result: Optional[dict] = None
    response_sent: bool = False
    response_text: Optional[str] = None
    created_at: str


class WhatsAppCommand(BaseModel):
    command_type: Literal["expense", "income", "balance", "report", "invoice", "query"]
    parsed_data: dict = {}
    confidence: float = 0
