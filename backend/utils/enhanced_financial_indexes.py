"""
Section 12: Financial Enhancement Indexes
Collections: payment_methods, financial_transactions, refunds, invoices,
family_capital, profitability_settings, commissions, payouts
"""

async def create_financial_indexes(db):
    """Create all indexes for Section 12: Financial Management."""
    indexes_created = []

    # ── payment_methods ──
    await db.payment_methods.create_index("id", unique=True)
    await db.payment_methods.create_index("code", unique=True)
    await db.payment_methods.create_index("tenant_id")
    await db.payment_methods.create_index("type")
    await db.payment_methods.create_index("is_active")
    indexes_created.append("payment_methods: id(u), code(u), tenant_id, type, is_active")

    # ── financial_transactions ──
    await db.financial_transactions.create_index("id", unique=True)
    await db.financial_transactions.create_index("tenant_id")
    await db.financial_transactions.create_index("order_id")
    await db.financial_transactions.create_index("customer_id")
    await db.financial_transactions.create_index("payment_method_id")
    await db.financial_transactions.create_index("type")
    await db.financial_transactions.create_index("status")
    await db.financial_transactions.create_index("created_at")
    await db.financial_transactions.create_index([("tenant_id", 1), ("type", 1), ("status", 1)])
    await db.financial_transactions.create_index([("tenant_id", 1), ("created_at", -1)])
    indexes_created.append("financial_transactions: id(u), tenant_id, order_id, customer_id, payment_method_id, type, status, created_at, tenant+type+status, tenant+created")

    # ── refunds ──
    await db.refunds.create_index("id", unique=True)
    await db.refunds.create_index("tenant_id")
    await db.refunds.create_index("transaction_id")
    await db.refunds.create_index("status")
    await db.refunds.create_index("created_at")
    indexes_created.append("refunds: id(u), tenant_id, transaction_id, status, created_at")

    # ── invoices ──
    await db.invoices.create_index("id", unique=True)
    await db.invoices.create_index("invoice_number", unique=True)
    await db.invoices.create_index("tenant_id")
    await db.invoices.create_index("customer_id")
    await db.invoices.create_index("status")
    await db.invoices.create_index("created_at")
    await db.invoices.create_index([("tenant_id", 1), ("status", 1)])
    indexes_created.append("invoices: id(u), invoice_number(u), tenant_id, customer_id, status, created_at, tenant+status")

    # ── family_capital ──
    await db.family_capital.create_index("id", unique=True)
    await db.family_capital.create_index(["family_id", "tenant_id"], unique=True)
    await db.family_capital.create_index("tenant_id")
    await db.family_capital.create_index("created_at")
    indexes_created.append("family_capital: id(u), family_id+tenant_id(u), tenant_id, created_at")

    # ── profitability_settings ──
    await db.profitability_settings.create_index("tenant_id", unique=True)
    indexes_created.append("profitability_settings: tenant_id(u)")

    # ── commissions ──
    await db.commissions.create_index("id", unique=True)
    await db.commissions.create_index("tenant_id")
    await db.commissions.create_index("agent_id")
    await db.commissions.create_index("sale_id")
    await db.commissions.create_index("status")
    await db.commissions.create_index("created_at")
    await db.commissions.create_index([("tenant_id", 1), ("agent_id", 1), ("status", 1)])
    indexes_created.append("commissions: id(u), tenant_id, agent_id, sale_id, status, created_at, tenant+agent+status")

    # ── payouts ──
    await db.payouts.create_index("id", unique=True)
    await db.payouts.create_index("tenant_id")
    await db.payouts.create_index("agent_id")
    await db.payouts.create_index("status")
    await db.payouts.create_index("created_at")
    indexes_created.append("payouts: id(u), tenant_id, agent_id, status, created_at")

    return indexes_created
