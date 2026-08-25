"""
Indexes for Sections 13-30: Analytics, AI, Marketplace, Subscription, RBAC,
Settings, Import/Export, Notifications, Suppliers, Purchases, Loyalty, Search,
Audit, Integrations, Workflow, Security, Admin, Developer
"""

async def create_enhanced_remaining_indexes(db):
    indexes_created = []

    # Section 13: Analytics
    await db.dashboard_widgets.create_index("id", unique=True)
    await db.dashboard_widgets.create_index("tenant_id")
    await db.scheduled_reports.create_index("id", unique=True)
    await db.scheduled_reports.create_index("tenant_id")
    indexes_created.append("analytics: dashboard_widgets, scheduled_reports")

    # Section 14: AI
    await db.ai_pricing_rules.create_index("id", unique=True)
    await db.ai_pricing_rules.create_index("tenant_id")
    await db.ai_pricing_rules.create_index([("tenant_id", 1), ("is_active", 1)])
    await db.chatbot_configs.create_index("id", unique=True)
    await db.chatbot_configs.create_index("tenant_id")
    await db.ai_action_logs.create_index("tenant_id")
    await db.ai_action_logs.create_index("created_at")
    indexes_created.append("ai: ai_pricing_rules, chatbot_configs, ai_action_logs")

    # Section 15: Marketplace
    await db.vendors.create_index("id", unique=True)
    await db.vendors.create_index([("tenant_id", 1), ("email", 1)], unique=True)
    await db.vendors.create_index([("tenant_id", 1), ("status", 1)])
    await db.vendor_products.create_index("id", unique=True)
    await db.vendor_products.create_index([("tenant_id", 1), ("vendor_id", 1)])
    await db.vendor_products.create_index([("tenant_id", 1), ("product_id", 1), ("vendor_id", 1)], unique=True)
    await db.vendor_orders.create_index("id", unique=True)
    await db.vendor_orders.create_index([("tenant_id", 1), ("vendor_id", 1)])
    await db.vendor_payouts.create_index("id", unique=True)
    await db.vendor_payouts.create_index([("tenant_id", 1), ("vendor_id", 1)])
    await db.vendor_reviews.create_index("id", unique=True)
    await db.vendor_reviews.create_index([("tenant_id", 1), ("vendor_id", 1)])
    indexes_created.append("marketplace: vendors, vendor_products, vendor_orders, vendor_payouts, vendor_reviews")

    # Section 16: Subscription
    await db.subscription_plans.create_index("id", unique=True)
    await db.subscription_plans.create_index([("tenant_id", 1), ("is_active", 1)])
    await db.subscriptions.create_index("id", unique=True)
    await db.subscriptions.create_index([("tenant_id", 1), ("customer_id", 1)])
    await db.subscriptions.create_index([("tenant_id", 1), ("status", 1)])
    await db.usage_records.create_index("id", unique=True)
    await db.usage_records.create_index([("tenant_id", 1), ("subscription_id", 1)])
    indexes_created.append("subscription: subscription_plans, subscriptions, usage_records")

    # Section 17: User Management
    await db.roles.create_index("id", unique=True)
    await db.roles.create_index([("tenant_id", 1), ("name", 1)], unique=True)
    await db.user_groups.create_index("id", unique=True)
    await db.user_groups.create_index([("tenant_id", 1), ("name", 1)], unique=True)
    indexes_created.append("user_mgmt: roles, user_groups")

    # Section 18: Settings
    await db.tenant_settings.create_index("tenant_id", unique=True)
    await db.notification_settings.create_index("tenant_id", unique=True)
    await db.appearance_settings.create_index("tenant_id", unique=True)
    # p141 fix: unique tenant_id here breaks per-company upserts (tenant_id is null in tenant DBs) — use company_id unique instead
    await db.shipping_settings.create_index("company_id", unique=True, sparse=True)
    await db.payment_settings.create_index("tenant_id", unique=True)
    await db.email_templates.create_index("id", unique=True)
    await db.email_templates.create_index([("tenant_id", 1), ("id", 1)])
    indexes_created.append("settings: tenant_settings, notification_settings, appearance_settings, shipping_settings, payment_settings, email_templates")

    # Section 19: Import/Export
    await db.import_jobs.create_index("id", unique=True)
    await db.import_jobs.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.export_jobs.create_index("id", unique=True)
    await db.export_jobs.create_index([("tenant_id", 1), ("created_at", -1)])
    indexes_created.append("import_export: import_jobs, export_jobs")

    # Section 20: Notifications Center
    await db.notification_inbox.create_index("id", unique=True)
    await db.notification_inbox.create_index([("tenant_id", 1), ("user_id", 1), ("read", 1)])
    await db.notification_inbox.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.notification_templates.create_index("id", unique=True)
    await db.notification_templates.create_index([("tenant_id", 1), ("channel", 1)])
    indexes_created.append("notifications: notification_inbox, notification_templates")

    # Section 21: Suppliers
    await db.suppliers.create_index([("tenant_id", 1), ("name", 1)])
    indexes_created.append("suppliers: name index on suppliers")

    # Section 22: Purchase Orders
    await db.purchase_orders.create_index("id", unique=True)
    await db.purchase_orders.create_index([("tenant_id", 1), ("po_number", 1)], unique=True)
    await db.purchase_orders.create_index([("tenant_id", 1), ("supplier_id", 1)])
    await db.purchase_orders.create_index([("tenant_id", 1), ("status", 1)])
    indexes_created.append("purchase_orders: id(u), po_number(u), supplier_id, status")

    # Section 23: Loyalty
    await db.loyalty_programs.create_index("id", unique=True)
    await db.loyalty_programs.create_index("tenant_id")
    await db.loyalty_rewards.create_index("id", unique=True)
    await db.loyalty_rewards.create_index("tenant_id")
    await db.points_transactions.create_index("id", unique=True)
    await db.points_transactions.create_index([("tenant_id", 1), ("customer_id", 1)])
    await db.reward_redemptions.create_index("id", unique=True)
    indexes_created.append("loyalty: loyalty_programs, loyalty_rewards, points_transactions, reward_redemptions")

    # Section 24: Search (uses existing product/customer indexes)
    await db.search_history.create_index([("tenant_id", 1), ("user_id", 1), ("created_at", -1)])
    indexes_created.append("search: search_history")

    # Section 25: Audit
    await db.audit_logs_v2.create_index("id", unique=True)
    await db.audit_logs_v2.create_index([("tenant_id", 1), ("entity_type", 1), ("entity_id", 1)])
    await db.audit_logs_v2.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.audit_logs_v2.create_index([("tenant_id", 1), ("user_id", 1)])
    indexes_created.append("audit: audit_logs_v2")

    # Section 26: Integrations (p300: dropped dead `integrations` index defs —
    # collection unused; live hub stores are ecom_integrations / *_integration_settings)
    await db.integration_logs.create_index([("tenant_id", 1), ("integration_id", 1), ("created_at", -1)])
    indexes_created.append("integrations: integration_logs")

    # Section 27: Workflow
    await db.workflows.create_index("id", unique=True)
    await db.workflows.create_index([("tenant_id", 1), ("trigger", 1)])
    await db.workflow_executions.create_index([("tenant_id", 1), ("workflow_id", 1), ("created_at", -1)])
    indexes_created.append("workflow: workflows, workflow_executions")

    # Section 28: Security
    await db.user_sessions.create_index("id", unique=True)
    await db.user_sessions.create_index([("tenant_id", 1), ("user_id", 1), ("status", 1)])
    await db.login_history.create_index([("tenant_id", 1), ("user_id", 1), ("created_at", -1)])
    await db.ip_allowlist.create_index("id", unique=True)
    await db.ip_allowlist.create_index([("tenant_id", 1), ("ip_address", 1)], unique=True)
    indexes_created.append("security: user_sessions, login_history, ip_allowlist")

    # Section 29: Admin
    await db.backups.create_index("id", unique=True)
    await db.backups.create_index([("tenant_id", 1), ("created_at", -1)])
    indexes_created.append("admin: backups")

    # Section 30: Developer
    await db.webhooks.create_index("id", unique=True)
    await db.webhooks.create_index([("tenant_id", 1), ("url", 1)])
    await db.webhook_deliveries.create_index([("tenant_id", 1), ("webhook_id", 1), ("created_at", -1)])
    await db.api_keys.create_index("id", unique=True)
    await db.api_keys.create_index([("tenant_id", 1), ("key", 1)], unique=True)
    indexes_created.append("developer: webhooks, webhook_deliveries, api_keys")

    return indexes_created
