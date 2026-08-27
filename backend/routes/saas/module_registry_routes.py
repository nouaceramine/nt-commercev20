"""p340/p341: Module Registry API for super-admin.

Exposes the motherboard registry (core/registry.py + core/modules_map.py):

- GET /api/saas/modules          → every component with gate, category, health
                                   (metrics, circuit breaker, last error)
- GET /api/saas/modules/gates    → feature-gate catalog with Arabic labels,
                                   categories, module names, opt-in flags
- GET /api/saas/modules/coverage → audit: every live API path must be owned by
                                   exactly one component (longest-prefix rule)
"""
from fastapi import APIRouter, Depends, Request

from core import registry
from core import modules_map
from core.business_profiles import OPT_IN_GATES
from .helpers import get_super_admin

router = APIRouter(tags=["Module Registry"])

CATEGORY_LABELS = {
    "core": "أساسي",
    "commerce": "تجارة",
    "inventory": "المخزون",
    "sales": "المبيعات",
    "customers": "الزبائن",
    "suppliers": "الموردون",
    "finance": "المالية",
    "restaurant": "المطعم",
    "telecom": "الاتصالات",
    "ecommerce": "التجارة الإلكترونية",
    "marketing": "التسويق",
    "communication": "التواصل",
    "integrations": "التكاملات",
    "hr": "الموارد البشرية",
    "maintenance": "الصيانة",
    "ai": "الذكاء الاصطناعي",
    "platform": "المنصة",
    "general": "عام",
}

# p341: Arabic labels per feature gate (used by the feature-management UI)
GATE_LABELS = {
    "pos": "نقطة البيع والمبيعات",
    "inventory": "المخزون والمخازن",
    "customers": "الزبائن",
    "credit_sales": "الديون والأقساط",
    "loyalty_points": "نقاط الولاء",
    "purchases": "المشتريات والموردون",
    "accounting": "المحاسبة والبنوك",
    "expenses": "المصاريف",
    "wallet": "المحفظة المالية",
    "reports": "التقارير والتحليلات",
    "promotions": "العروض والكوبونات",
    "employees": "الموظفون والمهام",
    "partners": "الشركاء",
    "recharge": "التعبئة والشرائح",
    "digital_services": "الخدمات الرقمية",
    "ecommerce_hub": "التجارة الإلكترونية",
    "restaurant": "المطعم",
    "production": "الإنتاج",
    "rental": "الكراء",
    "maintenance": "الصيانة والإصلاح",
    "screen_recording": "تسجيل شاشة الكاشير",
    "sms": "الرسائل القصيرة",
    "whatsapp": "واتساب",
    "ai_bots": "الذكاء الاصطناعي",
}


def _component_out(c) -> dict:
    metrics = registry.get_metrics(c.key)
    circuit = registry.get_circuit_status(c.key)
    last_error = registry.get_last_error(c.key)
    if circuit.get("open"):
        status = "degraded"
    elif last_error:
        status = "error"
    else:
        status = "ok"
    return {
        "key": c.key,
        "name_ar": c.name_ar,
        "name_fr": c.name_fr,
        "gate": c.gate,
        "category": c.category,
        "category_ar": CATEGORY_LABELS.get(c.category, c.category),
        "prefixes": c.prefixes,
        "collections": c.collections,
        "probe": c.probe,
        "status": status,
        "metrics": metrics,
        "circuit": circuit,
        "last_error": last_error,
    }


@router.get("/saas/modules")
async def list_modules(admin=Depends(get_super_admin)):
    components = [_component_out(c) for c in modules_map.all_components()]
    return {
        "total": len(components),
        "gated": len([c for c in components if c["gate"]]),
        "categories": [{"key": k, "name_ar": v} for k, v in CATEGORY_LABELS.items()],
        "components": components,
    }


@router.get("/saas/modules/gates")
async def list_gates(admin=Depends(get_super_admin)):
    comps = {c.key: c for c in modules_map.all_components()}
    out = []
    for g in modules_map.gates_catalog():
        gate = g["gate"]
        modules = g["modules"]
        out.append({
            "gate": gate,
            "label_ar": GATE_LABELS.get(gate, gate),
            "modules": modules,
            "module_names_ar": [comps[m].name_ar for m in modules if m in comps],
            "categories": sorted({comps[m].category for m in modules if m in comps}),
            "opt_in": gate in OPT_IN_GATES,
        })
    return {"gates": out}


@router.get("/saas/modules/coverage")
async def coverage_audit(request: Request, admin=Depends(get_super_admin)):
    spec = request.app.openapi()
    paths = sorted(spec.get("paths", {}).keys())
    owned = {}
    unowned = []
    for p in paths:
        comp = registry.find_by_path(p)
        if comp is None:
            unowned.append(p)
        else:
            owned[comp.key] = owned.get(comp.key, 0) + 1
    return {
        "total_paths": len(paths),
        "owned_paths": len(paths) - len(unowned),
        "coverage_pct": round((len(paths) - len(unowned)) / max(len(paths), 1) * 100, 2),
        "unowned": unowned,
        "per_component": dict(sorted(owned.items(), key=lambda kv: -kv[1])),
    }
