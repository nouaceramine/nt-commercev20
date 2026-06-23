"""
AI Agents Service for NT Commerce
Implements 8 intelligent accounting agents
"""
import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import asyncio

from .llm_service import get_llm_service

logger = logging.getLogger(__name__)


class InvoiceProcessorAgent:
    """Agent 1: Extracts invoice data and creates entries"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("invoice_processor")
    
    async def process_invoice_image(self, image_data: str, ocr_text: str) -> Dict[str, Any]:
        """Process invoice image and extract data"""
        try:
            # Use LLM to extract structured data from OCR text
            extracted = await self.llm.extract_invoice_data(ocr_text)
            
            if extracted.get("confidence", 0) > 0.7:
                # Create journal entry automatically
                entry_data = self._create_journal_entry(extracted)
                return {
                    "success": True,
                    "extracted_data": extracted,
                    "journal_entry": entry_data,
                    "auto_created": True
                }
            else:
                return {
                    "success": True,
                    "extracted_data": extracted,
                    "auto_created": False,
                    "message": "الثقة منخفضة، يرجى المراجعة"
                }
        except Exception as e:
            logger.error(f"Invoice processing error: {e}")
            return {"success": False, "error": str(e)}
    
    def _create_journal_entry(self, invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create journal entry from invoice data"""
        return {
            "description": f"فاتورة من {invoice_data.get('vendor_name', 'مورد')}",
            "date": invoice_data.get("invoice_date"),
            "total_debit": invoice_data.get("total_amount", 0),
            "total_credit": invoice_data.get("total_amount", 0),
            "lines": [
                {"account": "expenses", "debit": invoice_data.get("total_amount", 0), "credit": 0},
                {"account": "accounts_payable", "debit": 0, "credit": invoice_data.get("total_amount", 0)}
            ]
        }


class ExpenseClassifierAgent:
    """Agent 2: Automatically categorizes expenses"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("expense_classifier")
    
    async def classify(self, description: str, amount: float, vendor: str = "") -> Dict[str, Any]:
        """Classify an expense"""
        return await self.llm.classify_expense(description, amount, vendor)
    
    async def batch_classify(self, expenses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Classify multiple expenses"""
        results = []
        for expense in expenses:
            result = await self.classify(
                expense.get("description", ""),
                expense.get("amount", 0),
                expense.get("vendor", "")
            )
            result["expense_id"] = expense.get("id")
            results.append(result)
        return results


class FinancialAnalyzerAgent:
    """Agent 3: Analyzes financial performance"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("financial_analyzer")
    
    async def analyze_performance(self, period_start: str, period_end: str) -> Dict[str, Any]:
        """Analyze financial performance for a period"""
        # Get data from database
        revenue = await self._get_revenue(period_start, period_end)
        expenses = await self._get_expenses(period_start, period_end)
        
        data = {
            "period": {"start": period_start, "end": period_end},
            "revenue": revenue,
            "expenses": expenses,
            "gross_profit": revenue.get("total", 0) - expenses.get("cost_of_goods", 0),
            "net_profit": revenue.get("total", 0) - expenses.get("total", 0)
        }
        
        analysis = await self.llm.analyze_financial_data(data, "حلل الأداء المالي وقدم توصيات")
        
        return {
            "data": data,
            "analysis": analysis,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def _get_revenue(self, start: str, end: str) -> Dict[str, Any]:
        """Get revenue data"""
        pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]
        result = await self.db.sales.aggregate(pipeline).to_list(1)
        return result[0] if result else {"total": 0, "count": 0}
    
    async def _get_expenses(self, start: str, end: str) -> Dict[str, Any]:
        """Get expenses data"""
        pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
        ]
        result = await self.db.expenses.aggregate(pipeline).to_list(1)
        return result[0] if result else {"total": 0, "count": 0}


class FraudDetectorAgent:
    """Agent 4: Detects suspicious transactions"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("fraud_detector")
    
    async def scan_transactions(self, days: int = 7) -> List[Dict[str, Any]]:
        """Scan recent transactions for anomalies"""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        # Get recent transactions
        transactions = await self.db.transactions.find(
            {"created_at": {"$gte": cutoff}},
            {"_id": 0}
        ).to_list(1000)
        
        if not transactions:
            return []
        
        # Use LLM to detect anomalies
        anomalies = await self.llm.detect_anomalies(transactions)
        
        # Store alerts
        for anomaly in anomalies:
            await self._create_alert(anomaly)
        
        return anomalies
    
    async def check_duplicate_invoices(self) -> List[Dict[str, Any]]:
        """Check for duplicate invoices"""
        pipeline = [
            {"$group": {
                "_id": {"supplier": "$supplier_id", "amount": "$total", "date": "$invoice_date"},
                "count": {"$sum": 1},
                "invoices": {"$push": "$id"}
            }},
            {"$match": {"count": {"$gt": 1}}}
        ]
        
        duplicates = await self.db.purchases.aggregate(pipeline).to_list(100)
        
        alerts = []
        for dup in duplicates:
            alert = {
                "type": "duplicate_invoice",
                "severity": "medium",
                "description": f"فواتير مكررة محتملة: {dup['count']} فواتير بنفس المبلغ والتاريخ",
                "invoices": dup["invoices"]
            }
            alerts.append(alert)
        
        return alerts
    
    async def _create_alert(self, anomaly: Dict[str, Any]) -> str:
        """Create fraud alert"""
        alert = {
            "id": f"alert_{datetime.now(timezone.utc).timestamp()}",
            "alert_type": anomaly.get("anomaly_type", "unknown"),
            "severity": anomaly.get("severity", "medium"),
            "title": "تنبيه احتيال محتمل",
            "description": anomaly.get("description", ""),
            "entity_type": "transaction",
            "entity_id": anomaly.get("transaction_id", ""),
            "is_resolved": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await self.db.fraud_alerts.insert_one(alert)
        return alert["id"]


class SmartReporterAgent:
    """Agent 5: Generates financial reports automatically"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("smart_reporter")
    
    async def generate_profit_loss(self, start: str, end: str) -> Dict[str, Any]:
        """Generate Profit & Loss statement"""
        # Get revenue
        revenue_pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]
        revenue = await self.db.sales.aggregate(revenue_pipeline).to_list(1)
        
        # Get cost of goods sold
        cogs_pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]
        cogs = await self.db.purchases.aggregate(cogs_pipeline).to_list(1)
        
        # Get expenses
        expenses_pipeline = [
            {"$match": {"expense_date": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}
        ]
        expenses = await self.db.expenses.aggregate(expenses_pipeline).to_list(100)
        
        total_revenue = revenue[0]["total"] if revenue else 0
        total_cogs = cogs[0]["total"] if cogs else 0
        total_expenses = sum(e["total"] for e in expenses)
        
        return {
            "period_start": start,
            "period_end": end,
            "revenue": {"sales": total_revenue, "total": total_revenue},
            "cost_of_goods_sold": {"purchases": total_cogs, "total": total_cogs},
            "gross_profit": total_revenue - total_cogs,
            "operating_expenses": {e["_id"]: e["total"] for e in expenses},
            "total_operating_expenses": total_expenses,
            "operating_income": total_revenue - total_cogs - total_expenses,
            "net_income": total_revenue - total_cogs - total_expenses,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def generate_balance_sheet(self, as_of_date: str) -> Dict[str, Any]:
        """Generate Balance Sheet"""
        # Get assets (cash boxes)
        cash_boxes = await self.db.cash_boxes.find({}, {"_id": 0}).to_list(100)
        total_cash = sum(cb.get("balance", 0) for cb in cash_boxes)
        
        # Get receivables
        receivables_pipeline = [
            {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
        ]
        receivables = await self.db.customers.aggregate(receivables_pipeline).to_list(1)
        total_receivables = receivables[0]["total"] if receivables else 0
        
        # Get inventory value
        inventory_pipeline = [
            {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$quantity", "$purchase_price"]}}}}
        ]
        inventory = await self.db.products.aggregate(inventory_pipeline).to_list(1)
        total_inventory = inventory[0]["total"] if inventory else 0
        
        # Get payables
        payables_pipeline = [
            {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
        ]
        payables = await self.db.suppliers.aggregate(payables_pipeline).to_list(1)
        total_payables = payables[0]["total"] if payables else 0
        
        total_assets = total_cash + total_receivables + total_inventory
        total_liabilities = total_payables
        total_equity = total_assets - total_liabilities
        
        return {
            "as_of_date": as_of_date,
            "assets": {
                "current_assets": {
                    "cash": total_cash,
                    "accounts_receivable": total_receivables,
                    "inventory": total_inventory
                },
                "total_current_assets": total_assets,
                "total_assets": total_assets
            },
            "liabilities": {
                "current_liabilities": {
                    "accounts_payable": total_payables
                },
                "total_current_liabilities": total_payables,
                "total_liabilities": total_liabilities
            },
            "equity": {
                "retained_earnings": total_equity,
                "total_equity": total_equity
            },
            "total_liabilities_and_equity": total_liabilities + total_equity,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def generate_cash_flow(self, start: str, end: str) -> Dict[str, Any]:
        """Generate Cash Flow statement"""
        # Operating activities
        sales_cash = await self.db.sales.aggregate([
            {"$match": {"created_at": {"$gte": start, "$lte": end}, "payment_type": "cash"}},
            {"$group": {"_id": None, "total": {"$sum": "$paid_amount"}}}
        ]).to_list(1)
        
        expenses_cash = await self.db.expenses.aggregate([
            {"$match": {"expense_date": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        purchases_cash = await self.db.purchases.aggregate([
            {"$match": {"created_at": {"$gte": start, "$lte": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$paid_amount"}}}
        ]).to_list(1)
        
        cash_from_sales = sales_cash[0]["total"] if sales_cash else 0
        cash_for_expenses = expenses_cash[0]["total"] if expenses_cash else 0
        cash_for_purchases = purchases_cash[0]["total"] if purchases_cash else 0
        
        net_operating = cash_from_sales - cash_for_expenses - cash_for_purchases
        
        return {
            "period_start": start,
            "period_end": end,
            "operating_activities": {
                "cash_from_sales": cash_from_sales,
                "cash_paid_for_expenses": -cash_for_expenses,
                "cash_paid_for_purchases": -cash_for_purchases,
                "net_cash_from_operating": net_operating
            },
            "investing_activities": {
                "net_cash_from_investing": 0
            },
            "financing_activities": {
                "net_cash_from_financing": 0
            },
            "net_cash_flow": net_operating,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }


class TaxAssistantAgent:
    """Agent 6: Calculates tax obligations"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("tax_assistant")
    
    async def calculate_tax_summary(self, period: str) -> Dict[str, Any]:
        """Calculate tax summary for a period"""
        year = period[:4]
        
        # Get total revenue
        revenue = await self.db.sales.aggregate([
            {"$match": {"created_at": {"$regex": f"^{year}"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]).to_list(1)
        
        # Get total expenses (deductible)
        expenses = await self.db.expenses.aggregate([
            {"$match": {"expense_date": {"$regex": f"^{year}"}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        total_revenue = revenue[0]["total"] if revenue else 0
        total_expenses = expenses[0]["total"] if expenses else 0
        taxable_income = max(0, total_revenue - total_expenses)
        
        # Simple tax calculation (Algeria tax rates)
        tax_rate = 0.19  # 19% TAP/TVA
        estimated_tax = taxable_income * tax_rate
        
        return {
            "period": period,
            "total_revenue": total_revenue,
            "total_deductible_expenses": total_expenses,
            "taxable_income": taxable_income,
            "tax_rate": tax_rate,
            "estimated_tax": estimated_tax,
            "tax_breakdown": {
                "TAP": taxable_income * 0.01,
                "TVA": total_revenue * 0.19,
                "IBS": taxable_income * 0.19
            },
            "recommendations": [
                "تأكد من توثيق جميع المصروفات القابلة للخصم",
                "احتفظ بجميع الفواتير لمدة 10 سنوات"
            ],
            "generated_at": datetime.now(timezone.utc).isoformat()
        }


class ForecastingAgent:
    """Agent 7: Predicts revenue and cash flow"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("forecaster")
    
    async def forecast_revenue(self, periods: int = 3) -> Dict[str, Any]:
        """Forecast future revenue"""
        # Get historical data
        historical = await self.db.sales.aggregate([
            {"$group": {
                "_id": {"$substr": ["$created_at", 0, 7]},
                "total": {"$sum": "$total"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}},
            {"$limit": 12}
        ]).to_list(12)
        
        historical_data = [{"period": h["_id"], "revenue": h["total"], "sales_count": h["count"]} for h in historical]
        
        # Use LLM for forecasting
        forecast = await self.llm.generate_forecast(historical_data, "revenue", periods)
        
        return {
            "forecast_type": "revenue",
            "historical_data": historical_data,
            "forecast": forecast.get("forecasts", []),
            "trend": forecast.get("trend", "stable"),
            "confidence": forecast.get("confidence", 0.5),
            "insights": forecast.get("insights", []),
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def forecast_cash_flow(self, periods: int = 3) -> Dict[str, Any]:
        """Forecast future cash flow"""
        # Get historical cash flow data
        cash_in = await self.db.sales.aggregate([
            {"$group": {
                "_id": {"$substr": ["$created_at", 0, 7]},
                "total": {"$sum": "$paid_amount"}
            }},
            {"$sort": {"_id": 1}},
            {"$limit": 12}
        ]).to_list(12)
        
        cash_out = await self.db.expenses.aggregate([
            {"$group": {
                "_id": {"$substr": ["$expense_date", 0, 7]},
                "total": {"$sum": "$amount"}
            }},
            {"$sort": {"_id": 1}},
            {"$limit": 12}
        ]).to_list(12)
        
        historical_data = []
        for ci in cash_in:
            co = next((c for c in cash_out if c["_id"] == ci["_id"]), {"total": 0})
            historical_data.append({
                "period": ci["_id"],
                "cash_in": ci["total"],
                "cash_out": co["total"],
                "net_cash": ci["total"] - co["total"]
            })
        
        forecast = await self.llm.generate_forecast(historical_data, "cash_flow", periods)
        
        return {
            "forecast_type": "cash_flow",
            "historical_data": historical_data,
            "forecast": forecast.get("forecasts", []),
            "trend": forecast.get("trend", "stable"),
            "confidence": forecast.get("confidence", 0.5),
            "insights": forecast.get("insights", []),
            "generated_at": datetime.now(timezone.utc).isoformat()
        }


class DailyAutomationAgent:
    """Agent 8: Runs daily analysis and generates summaries"""
    
    def __init__(self, db):
        self.db = db
        self.llm = get_llm_service("daily_automation")
        self.fraud_detector = FraudDetectorAgent(db)
        self.analyzer = FinancialAnalyzerAgent(db)
    
    async def run_daily_tasks(self) -> Dict[str, Any]:
        """Run all daily automation tasks"""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        results = {
            "date": today,
            "tasks_completed": [],
            "alerts": [],
            "summary": None
        }
        
        # Task 1: Generate daily summary
        summary = await self._generate_daily_summary(today)
        results["summary"] = summary
        results["tasks_completed"].append("daily_summary")
        
        # Task 2: Check for anomalies
        anomalies = await self.fraud_detector.scan_transactions(days=1)
        results["alerts"].extend(anomalies)
        results["tasks_completed"].append("anomaly_detection")
        
        # Task 3: Check overdue invoices
        overdue = await self._check_overdue_invoices()
        results["alerts"].extend(overdue)
        results["tasks_completed"].append("overdue_check")
        
        # Task 4: Low stock alerts
        low_stock = await self._check_low_stock()
        results["alerts"].extend(low_stock)
        results["tasks_completed"].append("low_stock_check")
        
        # Store daily report
        await self.db.daily_reports.insert_one({
            "id": f"daily_{today}",
            "date": today,
            "results": results,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return results
    
    async def _generate_daily_summary(self, date: str) -> Dict[str, Any]:
        """Generate daily financial summary"""
        # Get today's sales
        sales = await self.db.sales.find(
            {"created_at": {"$regex": f"^{date}"}},
            {"_id": 0, "total": 1, "paid_amount": 1}
        ).to_list(1000)
        
        # Get today's expenses
        expenses = await self.db.expenses.find(
            {"expense_date": {"$regex": f"^{date}"}},
            {"_id": 0, "amount": 1}
        ).to_list(1000)
        
        total_revenue = sum(s.get("total", 0) for s in sales)
        total_cash_in = sum(s.get("paid_amount", 0) for s in sales)
        total_expenses = sum(e.get("amount", 0) for e in expenses)
        
        data = {
            "date": date,
            "revenue": total_revenue,
            "cash_in": total_cash_in,
            "expenses": total_expenses,
            "net_income": total_revenue - total_expenses,
            "transactions_count": len(sales) + len(expenses)
        }
        
        # Get AI insights
        ai_summary = await self.llm.generate_daily_summary(data)
        
        return {
            **data,
            "highlights": ai_summary.get("highlights", []),
            "alerts": ai_summary.get("alerts", []),
            "recommendations": ai_summary.get("recommendations", [])
        }
    
    async def _check_overdue_invoices(self) -> List[Dict[str, Any]]:
        """Check for overdue invoices"""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        overdue = await self.db.sales.find(
            {
                "payment_type": {"$in": ["credit", "partial"]},
                "status": {"$ne": "paid"}
            },
            {"_id": 0, "id": 1, "invoice_number": 1, "customer_name": 1, "total": 1, "remaining": 1}
        ).to_list(100)
        
        alerts = []
        for invoice in overdue:
            alerts.append({
                "type": "overdue_invoice",
                "severity": "medium",
                "title": "فاتورة متأخرة",
                "description": f"الفاتورة {invoice.get('invoice_number')} للزبون {invoice.get('customer_name')} متأخرة",
                "amount": invoice.get("remaining", 0),
                "entity_id": invoice.get("id")
            })
        
        return alerts
    
    async def _check_low_stock(self) -> List[Dict[str, Any]]:
        """Check for low stock products"""
        low_stock = await self.db.products.find(
            {"$expr": {"$lte": ["$quantity", "$low_stock_threshold"]}},
            {"_id": 0, "id": 1, "name_en": 1, "name_ar": 1, "quantity": 1, "low_stock_threshold": 1}
        ).to_list(100)
        
        alerts = []
        for product in low_stock:
            alerts.append({
                "type": "low_stock",
                "severity": "low",
                "title": "مخزون منخفض",
                "description": f"المنتج {product.get('name_ar') or product.get('name_en')} - الكمية: {product.get('quantity')}",
                "entity_id": product.get("id")
            })
        
        return alerts


class AIAgentsManager:
    """Manager for all AI agents"""
    
    def __init__(self, db):
        self.db = db
        self.agents = {
            "invoice_processor": InvoiceProcessorAgent(db),
            "expense_classifier": ExpenseClassifierAgent(db),
            "financial_analyzer": FinancialAnalyzerAgent(db),
            "fraud_detector": FraudDetectorAgent(db),
            "smart_reporter": SmartReporterAgent(db),
            "tax_assistant": TaxAssistantAgent(db),
            "forecaster": ForecastingAgent(db),
            "daily_automation": DailyAutomationAgent(db)
        }
    
    def get_agent(self, agent_type: str) -> dict:
        """Get agent by type"""
        return self.agents.get(agent_type)
    
    async def run_agent_task(self, agent_type: str, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Run a specific agent task"""
        agent = self.get_agent(agent_type)
        if not agent:
            return {"error": f"Unknown agent type: {agent_type}"}
        
        start_time = datetime.now(timezone.utc)
        
        try:
            # Execute based on agent type
            if agent_type == "invoice_processor":
                result = await agent.process_invoice_image(
                    task_data.get("image_data", ""),
                    task_data.get("ocr_text", "")
                )
            elif agent_type == "expense_classifier":
                result = await agent.classify(
                    task_data.get("description", ""),
                    task_data.get("amount", 0),
                    task_data.get("vendor", "")
                )
            elif agent_type == "financial_analyzer":
                result = await agent.analyze_performance(
                    task_data.get("period_start", ""),
                    task_data.get("period_end", "")
                )
            elif agent_type == "fraud_detector":
                result = await agent.scan_transactions(task_data.get("days", 7))
            elif agent_type == "smart_reporter":
                report_type = task_data.get("report_type", "profit_loss")
                if report_type == "profit_loss":
                    result = await agent.generate_profit_loss(
                        task_data.get("start", ""),
                        task_data.get("end", "")
                    )
                elif report_type == "balance_sheet":
                    result = await agent.generate_balance_sheet(task_data.get("as_of", ""))
                elif report_type == "cash_flow":
                    result = await agent.generate_cash_flow(
                        task_data.get("start", ""),
                        task_data.get("end", "")
                    )
                else:
                    result = {"error": "Unknown report type"}
            elif agent_type == "tax_assistant":
                result = await agent.calculate_tax_summary(task_data.get("period", ""))
            elif agent_type == "forecaster":
                forecast_type = task_data.get("forecast_type", "revenue")
                if forecast_type == "revenue":
                    result = await agent.forecast_revenue(task_data.get("periods", 3))
                else:
                    result = await agent.forecast_cash_flow(task_data.get("periods", 3))
            elif agent_type == "daily_automation":
                result = await agent.run_daily_tasks()
            else:
                result = {"error": "Task not implemented"}
            
            end_time = datetime.now(timezone.utc)
            execution_time = int((end_time - start_time).total_seconds() * 1000)
            
            return {
                "success": True,
                "agent_type": agent_type,
                "result": result,
                "execution_time_ms": execution_time
            }
            
        except Exception as e:
            logger.error(f"Agent task error: {e}")
            return {
                "success": False,
                "agent_type": agent_type,
                "error": str(e)
            }
