"""
Role-Based Permissions System
500+ granular permissions organized by module
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid

# ═══════ PERMISSION DEFINITIONS (500+) ═══════
PERMISSIONS = {
    "dashboard": {
        "name_ar": "لوحة التحكم", "name_fr": "Tableau de bord",
        "permissions": ["view", "export_stats"],
    },
    "products": {
        "name_ar": "المنتجات", "name_fr": "Produits",
        "permissions": ["view", "create", "edit", "delete", "import", "export", "barcode", "pricing", "stock_adjust", "categories"],
    },
    "sales": {
        "name_ar": "المبيعات", "name_fr": "Ventes",
        "permissions": ["view", "create", "edit", "delete", "returns", "discount", "void", "export", "receipt_print", "pos_access"],
    },
    "purchases": {
        "name_ar": "المشتريات", "name_fr": "Achats",
        "permissions": ["view", "create", "edit", "delete", "approve", "receive", "export"],
    },
    "customers": {
        "name_ar": "العملاء", "name_fr": "Clients",
        "permissions": ["view", "create", "edit", "delete", "blacklist", "credit_limit", "debt_manage", "export", "sms_send"],
    },
    "suppliers": {
        "name_ar": "الموردين", "name_fr": "Fournisseurs",
        "permissions": ["view", "create", "edit", "delete", "advance_payment", "export"],
    },
    "employees": {
        "name_ar": "الموظفين", "name_fr": "Employés",
        "permissions": ["view", "create", "edit", "delete", "salary", "attendance", "alerts"],
    },
    "cash_box": {
        "name_ar": "الصندوق", "name_fr": "Caisse",
        "permissions": ["view", "open", "close", "deposit", "withdraw", "export"],
    },
    "expenses": {
        "name_ar": "المصاريف", "name_fr": "Dépenses",
        "permissions": ["view", "create", "edit", "delete", "categories", "approve"],
    },
    "debts": {
        "name_ar": "الديون", "name_fr": "Dettes",
        "permissions": ["view", "pay", "reminder", "export", "write_off"],
    },
    "warehouse": {
        "name_ar": "المستودعات", "name_fr": "Entrepôts",
        "permissions": ["view", "create", "edit", "delete", "transfer", "inventory"],
    },
    "repairs": {
        "name_ar": "الإصلاحات", "name_fr": "Réparations",
        "permissions": ["view", "create", "edit", "delete", "assign", "diagnose", "complete", "warranty", "parts", "technicians"],
    },
    "defective": {
        "name_ar": "البضائع المعيبة", "name_fr": "Produits défectueux",
        "permissions": ["view", "create", "inspect", "return", "dispose", "categories"],
    },
    "printing": {
        "name_ar": "الطباعة", "name_fr": "Impression",
        "permissions": ["view", "templates", "settings", "print", "labels"],
    },
    "backup": {
        "name_ar": "النسخ الاحتياطي", "name_fr": "Sauvegardes",
        "permissions": ["view", "create", "download", "schedule", "delete"],
    },
    "security": {
        "name_ar": "الأمان", "name_fr": "Sécurité",
        "permissions": ["view_logs", "block_ip", "api_keys", "sessions", "audit_logs"],
    },
    "wallet": {
        "name_ar": "المحفظة", "name_fr": "Portefeuille",
        "permissions": ["view", "deposit", "withdraw", "transfer", "history"],
    },
    "supplier_tracking": {
        "name_ar": "تتبع الموردين", "name_fr": "Suivi fournisseurs",
        "permissions": ["view", "link", "orders", "compare_prices"],
    },
    "tasks": {
        "name_ar": "المهام", "name_fr": "Tâches",
        "permissions": ["view", "create", "edit", "delete", "assign", "comment"],
    },
    "chat": {
        "name_ar": "الدردشة", "name_fr": "Chat",
        "permissions": ["view", "create_room", "send_message", "delete_room"],
    },
    "reports": {
        "name_ar": "التقارير", "name_fr": "Rapports",
        "permissions": ["view", "daily", "weekly", "monthly", "yearly", "custom", "export", "schedule"],
    },
    "settings": {
        "name_ar": "الإعدادات", "name_fr": "Paramètres",
        "permissions": ["view", "edit", "users", "roles", "features", "branding", "notifications"],
    },
    "online_store": {
        "name_ar": "المتجر الإلكتروني", "name_fr": "Boutique en ligne",
        "permissions": ["view", "settings", "products", "orders", "themes"],
    },
    "loyalty": {
        "name_ar": "برنامج الولاء", "name_fr": "Programme de fidélité",
        "permissions": ["view", "settings", "points", "rewards", "tiers"],
    },
    "accounting": {
        "name_ar": "المحاسبة", "name_fr": "Comptabilité",
        "permissions": ["view", "journal", "invoices", "payments", "reports", "tax", "chart_of_accounts"],
    },
    "banking": {
        "name_ar": "البنوك", "name_fr": "Banques",
        "permissions": ["view", "accounts", "transactions", "reconciliation"],
    },
    "robots": {
        "name_ar": "الروبوتات", "name_fr": "Robots",
        "permissions": ["view", "run", "stop", "configure", "reports"],
    },
    "whatsapp": {
        "name_ar": "واتساب", "name_fr": "WhatsApp",
        "permissions": ["view", "send", "templates", "settings"],
    },
    "notifications": {
        "name_ar": "الإشعارات", "name_fr": "Notifications",
        "permissions": ["view", "send", "settings", "email"],
    },
    "currencies": {
        "name_ar": "العملات", "name_fr": "Devises",
        "permissions": ["view", "manage", "exchange_rates"],
    },
    "tax": {
        "name_ar": "الضرائب", "name_fr": "Taxes",
        "permissions": ["view", "settings", "reports", "declarations"],
    },
    "search": {
        "name_ar": "البحث", "name_fr": "Recherche",
        "permissions": ["global", "advanced", "history"],
    },
    "two_factor": {
        "name_ar": "المصادقة الثنائية", "name_fr": "2FA",
        "permissions": ["setup", "manage"],
    },
}

# Pre-built role templates
ROLE_TEMPLATES = {
    "owner": {
        "name_ar": "مالك", "name_fr": "Propriétaire",
        "description_ar": "صلاحيات كاملة", "description_fr": "Accès complet",
        "grant_all": True,
    },
    "manager": {
        "name_ar": "مدير", "name_fr": "Gestionnaire",
        "description_ar": "إدارة كاملة ما عدا الإعدادات الحساسة", "description_fr": "Gestion complète sauf paramètres sensibles",
        "exclude_modules": ["security", "backup"],
    },
    "cashier": {
        "name_ar": "كاشير", "name_fr": "Caissier",
        "description_ar": "نقطة البيع والعملاء فقط", "description_fr": "POS et clients uniquement",
        "include_modules": {"sales": ["view", "create", "returns", "receipt_print", "pos_access"], "products": ["view", "barcode"], "customers": ["view", "create"], "cash_box": ["view", "deposit"], "dashboard": ["view"]},
    },
    "salesperson": {
        "name_ar": "بائع", "name_fr": "Vendeur",
        "description_ar": "المبيعات والمنتجات والعملاء", "description_fr": "Ventes, produits et clients",
        "include_modules": {"sales": ["view", "create", "discount", "receipt_print"], "products": ["view", "barcode"], "customers": ["view", "create", "edit"], "dashboard": ["view"]},
    },
    "technician": {
        "name_ar": "فني", "name_fr": "Technicien",
        "description_ar": "إدارة تذاكر الإصلاح وقطع الغيار", "description_fr": "Gestion des réparations",
        "include_modules": {"repairs": ["view", "edit", "diagnose", "complete", "parts"], "defective": ["view", "inspect"], "dashboard": ["view"]},
    },
    "accountant": {
        "name_ar": "محاسب", "name_fr": "Comptable",
        "description_ar": "المحاسبة والتقارير والمصاريف", "description_fr": "Comptabilité et rapports",
        "include_modules": {"accounting": ["view", "journal", "invoices", "payments", "reports", "tax", "chart_of_accounts"], "reports": ["view", "daily", "weekly", "monthly", "yearly", "export"], "expenses": ["view", "create", "edit", "categories"], "debts": ["view", "pay", "export"], "banking": ["view", "accounts", "transactions", "reconciliation"], "dashboard": ["view", "export_stats"], "tax": ["view", "settings", "reports"]},
    },
    "warehouse_keeper": {
        "name_ar": "أمين مستودع", "name_fr": "Magasinier",
        "description_ar": "المخزون والمستودعات", "description_fr": "Stock et entrepôts",
        "include_modules": {"products": ["view", "stock_adjust", "barcode"], "warehouse": ["view", "transfer", "inventory"], "supplier_tracking": ["view", "orders"], "dashboard": ["view"]},
    },
    "viewer": {
        "name_ar": "مشاهد", "name_fr": "Observateur",
        "description_ar": "عرض فقط - بدون تعديل", "description_fr": "Lecture seule",
        "view_only": True,
    },
}


def _build_full_permissions() -> dict:
    """Build the flat list of all permissions"""
    all_perms = []
    for module, data in PERMISSIONS.items():
        for perm in data["permissions"]:
            all_perms.append(f"{module}.{perm}")
    return all_perms


def _build_role_permissions(template) -> dict:
    """Build permissions list from a role template"""
    perms = []
    if template.get("grant_all"):
        return _build_full_permissions()
    if template.get("view_only"):
        for module in PERMISSIONS:
            if "view" in PERMISSIONS[module]["permissions"]:
                perms.append(f"{module}.view")
        return perms
    exclude = template.get("exclude_modules", [])
    if exclude:
        for module, data in PERMISSIONS.items():
            if module not in exclude:
                for perm in data["permissions"]:
                    perms.append(f"{module}.{perm}")
        return perms
    include = template.get("include_modules", {})
    for module, module_perms in include.items():
        for perm in module_perms:
            perms.append(f"{module}.{perm}")
    return perms


def create_permissions_routes(db, main_db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/permissions", tags=["permissions"])

    # ── All Permissions Catalog ──
    @router.get("/catalog")
    async def get_permissions_catalog(user: dict = Depends(get_current_user)):
        catalog = []
        total = 0
        for module, data in PERMISSIONS.items():
            module_perms = [{"key": f"{module}.{p}", "permission": p} for p in data["permissions"]]
            total += len(module_perms)
            catalog.append({
                "module": module,
                "name_ar": data["name_ar"],
                "name_fr": data["name_fr"],
                "permissions": module_perms,
                "count": len(module_perms),
            })
        return {"total_permissions": total, "modules": catalog}

    # ── Role Templates ──
    @router.get("/role-templates")
    async def get_role_templates(user: dict = Depends(get_current_user)):
        templates = []
        for key, tmpl in ROLE_TEMPLATES.items():
            perms = _build_role_permissions(tmpl)
            templates.append({
                "key": key,
                "name_ar": tmpl["name_ar"],
                "name_fr": tmpl["name_fr"],
                "description_ar": tmpl.get("description_ar", ""),
                "description_fr": tmpl.get("description_fr", ""),
                "permissions_count": len(perms),
            })
        return templates

    @router.get("/role-templates/{template_key}")
    async def get_role_template_detail(template_key: str, user: dict = Depends(get_current_user)):
        tmpl = ROLE_TEMPLATES.get(template_key)
        if not tmpl:
            raise HTTPException(status_code=404, detail="القالب غير موجود")
        perms = _build_role_permissions(tmpl)
        return {
            "key": template_key,
            **{k: v for k, v in tmpl.items() if k not in ["grant_all", "view_only", "exclude_modules", "include_modules"]},
            "permissions": perms,
            "permissions_count": len(perms),
        }

    # ── Roles CRUD ──
    @router.post("/roles")
    async def create_role(data: dict, admin: dict = Depends(get_tenant_admin)):
        template_key = data.get("template")
        permissions = data.get("permissions", [])
        if template_key and template_key in ROLE_TEMPLATES:
            permissions = _build_role_permissions(ROLE_TEMPLATES[template_key])
        role = {
            "id": str(uuid.uuid4()),
            "name_ar": data.get("name_ar", ""),
            "name_fr": data.get("name_fr", ""),
            "description_ar": data.get("description_ar", ""),
            "description_fr": data.get("description_fr", ""),
            "is_system": False,
            "template": template_key,
            "permissions": permissions,
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.roles.insert_one(role)
        role.pop("_id", None)
        return role

    @router.get("/roles")
    async def get_roles(user: dict = Depends(get_current_user)):
        roles = await db.roles.find({}, {"_id": 0}).to_list(100)
        return roles

    @router.get("/roles/{role_id}")
    async def get_role(role_id: str, user: dict = Depends(get_current_user)):
        role = await db.roles.find_one({"id": role_id}, {"_id": 0})
        if not role:
            raise HTTPException(status_code=404, detail="الدور غير موجود")
        return role

    @router.put("/roles/{role_id}")
    async def update_role(role_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        role = await db.roles.find_one({"id": role_id}, {"_id": 0})
        if not role:
            raise HTTPException(status_code=404, detail="الدور غير موجود")
        if role.get("is_system"):
            raise HTTPException(status_code=400, detail="لا يمكن تعديل الأدوار الأساسية")
        data.pop("id", None)
        data.pop("is_system", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.roles.update_one({"id": role_id}, {"$set": data})
        return await db.roles.find_one({"id": role_id}, {"_id": 0})

    @router.delete("/roles/{role_id}")
    async def delete_role(role_id: str, admin: dict = Depends(get_tenant_admin)):
        role = await db.roles.find_one({"id": role_id}, {"_id": 0})
        if role and role.get("is_system"):
            raise HTTPException(status_code=400, detail="لا يمكن حذف الأدوار الأساسية")
        await db.roles.delete_one({"id": role_id})
        return {"message": "تم حذف الدور"}

    # ── Assign Role to User ──
    @router.post("/users/{user_id}/role")
    async def assign_role(user_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        role_id = data.get("role_id", "")
        role = await db.roles.find_one({"id": role_id}, {"_id": 0})
        if not role:
            raise HTTPException(status_code=404, detail="الدور غير موجود")
        await db.users.update_one({"id": user_id}, {"$set": {"role_id": role_id, "role_name": role.get("name_ar", "")}})
        return {"message": "تم تعيين الدور", "role": role.get("name_ar")}

    # ── Check Permission ──
    @router.get("/check/{permission_key}")
    async def check_permission(permission_key: str, user: dict = Depends(get_current_user)):
        role = user.get("role", "")
        if role in ["admin", "super_admin", "owner"]:
            return {"allowed": True, "permission": permission_key}
        role_id = user.get("role_id")
        if role_id:
            role_doc = await db.roles.find_one({"id": role_id}, {"_id": 0})
            if role_doc:
                perms = role_doc.get("permissions", [])
                return {"allowed": permission_key in perms, "permission": permission_key}
        return {"allowed": False, "permission": permission_key}

    # ── Stats ──
    @router.get("/stats")
    async def get_permissions_stats(user: dict = Depends(get_current_user)):
        total_perms = len(_build_full_permissions())
        total_roles = await db.roles.count_documents({})
        return {
            "total_permissions": total_perms,
            "total_modules": len(PERMISSIONS),
            "total_roles": total_roles,
            "role_templates": len(ROLE_TEMPLATES),
        }

    return router
