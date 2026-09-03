"""p359: تنبيه انحراف كلفة الوصفات (recipe cost-drift alerts).

عند وصول شراء بسعر مختلف لمكوّن (ingredient)، تُعاد كلفة كل وصفة تستخدمه؛
إن تجاوز الانحراف العتبة يُنشأ إشعار لكل مستخدمي المستأجر + سجل في cost_drift_log.
يُستدعى من purchases_routes بعد مزامنة purchase_price — ولا يُسقط عملية الشراء أبداً.
"""
import uuid
from datetime import datetime, timezone

THRESHOLD_PCT = 5.0  # أدنى انحراف نسبي في كلفة الطبق يستحق التنبيه


def _fmt(v):
    return f"{v:,.0f}".replace(",", " ") if float(v) == int(v) else f"{v:,.2f}".replace(",", " ")


async def check_cost_drift(db, price_changes, *, ref_label: str = "", user_name: str = ""):
    """price_changes: [{product_id, name, old_price, new_price}] — مكوّنات تغيّر سعر شرائها.
    يعيد [{recipe_id, dish_name, drift_pct, ...}] للتنبيهات المُنشأة. لا يرفع استثناءً أبداً."""
    alerts = []
    try:
        changes = [c for c in (price_changes or [])
                   if c.get("product_id") and float(c.get("old_price") or 0) > 0
                   and abs(float(c.get("new_price") or 0) - float(c.get("old_price") or 0)) > 1e-9]
        if not changes:
            return alerts
        by_id = {c["product_id"]: c for c in changes}
        now = datetime.now(timezone.utc).isoformat()

        cursor = db.recipes.find({"components.product_id": {"$in": list(by_id)}})
        async for r in cursor:
            old_total = 0.0
            new_total = 0.0
            causes = []  # المكوّنات المتغيّرة داخل هذه الوصفة
            for c in (r.get("components") or []):
                pid = c.get("product_id")
                qty = float(c.get("quantity") or 0)
                if pid in by_id:
                    ch = by_id[pid]
                    op, np_ = float(ch["old_price"]), float(ch["new_price"])
                    causes.append(f"{ch.get('name') or pid} ({_fmt(op)} ← {_fmt(np_)})")
                else:
                    comp = await db.products.find_one({"id": pid}, {"_id": 0, "purchase_price": 1})
                    np_ = float((comp or {}).get("purchase_price") or c.get("unit_cost") or 0)
                    op = np_
                old_total += qty * op
                new_total += qty * np_
            if old_total <= 0:
                continue
            drift_pct = round((new_total - old_total) / old_total * 100, 1)
            if abs(drift_pct) < THRESHOLD_PCT:
                continue

            out_qty = float(r.get("output_qty") or 1) or 1
            old_unit = round(old_total / out_qty, 2)
            new_unit = round(new_total / out_qty, 2)
            dish = await db.products.find_one({"id": r.get("product_id")},
                                              {"_id": 0, "name_ar": 1, "name_en": 1, "retail_price": 1})
            dish = dish or {}
            dish_name = dish.get("name_ar") or dish.get("name_en") or r.get("name") or r.get("product_id")
            price = float(dish.get("retail_price") or 0)
            new_margin_pct = round((price - new_unit) / price * 100, 1) if price > 0 else None

            if drift_pct > 0:
                msg = (f"ارتفعت كلفة «{dish_name}» بنسبة {drift_pct}% "
                       f"({_fmt(old_unit)} ← {_fmt(new_unit)} دج/وحدة) بسبب: {'، '.join(causes)}.")
                if new_margin_pct is not None:
                    msg += f" الهامش الجديد {new_margin_pct}% — راجع سعر البيع."
            else:
                msg = (f"انخفضت كلفة «{dish_name}» بنسبة {abs(drift_pct)}% "
                       f"({_fmt(old_unit)} ← {_fmt(new_unit)} دج/وحدة) بسبب: {'، '.join(causes)} — فرصة لتحسين الهامش.")

            doc = {
                "id": str(uuid.uuid4()),
                "kind": "cost_drift",
                "title": f"تنبيه كلفة: {dish_name}",
                "message": msg,
                "type": "warning" if drift_pct > 0 else "info",
                "user_id": None,          # كل مستخدمي المستأجر
                "is_read": False,
                "recipe_id": r.get("id"),
                "product_id": r.get("product_id"),
                "drift_pct": drift_pct,
                "old_unit_cost": old_unit,
                "new_unit_cost": new_unit,
                "new_margin_pct": new_margin_pct,
                "causes": causes,
                "ref": ref_label,
                "created_by": user_name or "system",
                "created_at": now,
            }
            await db.notifications.insert_one(doc)
            log_doc = {k: v for k, v in doc.items() if k not in ("user_id", "is_read", "title", "type")}
            log_doc["at"] = now
            await db.cost_drift_log.insert_one(log_doc)
            doc.pop("_id", None)
            alerts.append(doc)
    except Exception:
        # الكلفة المنحرفة تنبيه ثانوي — لا تُسقط الشراء أبداً
        return alerts
    return alerts
