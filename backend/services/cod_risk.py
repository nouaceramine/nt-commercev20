"""COD Anti-Cancellation Engine — Risk Score for cash-on-delivery orders."""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Wilayas with historically high COD cancellation rates (editable in settings)
DEFAULT_HIGH_RISK_WILAYAS = [
    "أدرار", "تمنراست", "إليزي", "تندوف", "جانت", "عين صالح", "In Salah", "Adrar", "Tamanrasset"
]

HIGH_VALUE_THRESHOLD = 50000  # DZD


def _is_night_order(created_at: str) -> bool:
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        return dt.hour >= 22 or dt.hour < 6
    except Exception:
        return False


def _verify_phone(phone: str) -> bool:
    digits = "".join(c for c in (phone or "") if c.isdigit())
    # Algerian mobile: 05/06/07 + 8 digits, optionally with 213 prefix
    if len(digits) == 10 and digits[:2] in ("05", "06", "07"):
        return True
    if len(digits) == 12 and digits.startswith("213") and digits[3:5] in ("05", "06", "07"):
        return True
    return False


def calculate_risk_score(order: dict, customer_history_count: int = 0, high_risk_wilayas: list = None,
                         customer_stats: dict = None) -> dict:
    """Compute cancellation risk score (0-100) and the recommended action.

    customer_stats (اختياري): {"delivered": n, "cancelled": n, "returned": n}
    — يجعل المحرك يتعلّم من سجل الإلغاءات الفعلي للزبون بدل قواعد ثابتة فقط.
    """
    wilayas = high_risk_wilayas if high_risk_wilayas is not None else DEFAULT_HIGH_RISK_WILAYAS
    score = 0
    reasons = []

    wilaya = (order.get("customer", {}) or {}).get("wilaya") or order.get("wilaya") or ""
    if wilaya and any(w.strip().lower() in wilaya.strip().lower() or wilaya.strip().lower() in w.strip().lower() for w in wilayas):
        score += 30
        reasons.append("ولاية عالية الخطورة")

    total = float(order.get("total", 0) or 0)
    if total > HIGH_VALUE_THRESHOLD:
        score += 20
        reasons.append("قيمة طلب مرتفعة")

    if customer_history_count == 0:
        score += 25
        reasons.append("زبون جديد بدون سجل شراء")

    # ── التعلّم من السجل الفعلي للزبون ──
    if customer_stats:
        delivered = int(customer_stats.get("delivered", 0) or 0)
        cancelled = int(customer_stats.get("cancelled", 0) or 0)
        returned = int(customer_stats.get("returned", 0) or 0)
        total_closed = delivered + cancelled + returned
        if total_closed >= 2:
            cancel_rate = (cancelled + returned) / total_closed
            if cancel_rate >= 0.5:
                score += 35
                reasons.append(f"زبون ألغى/أرجع {cancelled + returned} من آخر {total_closed} طلبات")
            elif cancel_rate >= 0.25:
                score += 20
                reasons.append("سجل إلغاءات متوسط لدى هذا الزبون")
            elif delivered >= 3 and cancel_rate < 0.1:
                score -= 15
                reasons.append("زبون موثوق بسجل استلام ممتاز")

    created_at = order.get("created_at") or datetime.utcnow().isoformat()
    if _is_night_order(created_at):
        score += 15
        reasons.append("طلب ليلي")

    phone = (order.get("customer", {}) or {}).get("phone") or order.get("phone") or ""
    if not _verify_phone(phone):
        score += 10
        reasons.append("رقم هاتف غير مؤكد")

    score = max(0, min(score, 100))

    if score <= 30:
        action, action_ar = "ship", "شحن عادي"
    elif score <= 60:
        action, action_ar = "confirm_first", "تأكيد هاتفي/واتساب قبل الشحن"
    elif score <= 80:
        action, action_ar = "require_deposit", "طلب تأمين (دفع جزئي 20-30%)"
    else:
        action, action_ar = "manual_review", "مراجعة يدوية قبل الشحن"

    return {
        "risk_score": score,
        "risk_level": "low" if score <= 30 else ("medium" if score <= 60 else ("high" if score <= 80 else "critical")),
        "action": action,
        "action_ar": action_ar,
        "reasons": reasons,
    }
