"""Health Score Alerts Service (iter 18.4)

Watches the AI Insights health_score and notifies super-admins via Email
(through email_service) AND records an alert row in main_db.platform_alerts
when the score drops below configurable thresholds.

State machine (per super_admin):
  - score ≥ 75 → no alert
  - 50 ≤ score < 75 → 'warning' (yellow)
  - score < 50 → 'critical' (red)

Avoids alert fatigue: only fires when the new severity DIFFERS from the last
recorded alert OR when 24h have passed since the previous one at this severity.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from config.database import main_db
from services.email_service import EmailService

logger = logging.getLogger(__name__)


def _severity_for(score: int) -> Optional[str]:
    if score < 50:
        return "critical"
    if score < 75:
        return "warning"
    return None  # healthy — no alert


async def _last_alert() -> Optional[dict]:
    return await main_db.platform_alerts.find_one(
        {"kind": "health_score"},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )


async def _should_fire_alert(new_severity: str) -> bool:
    """Throttle: only fire when severity changes OR > 24h passed since last
    alert at the same severity. Keeps alerts meaningful without spamming."""
    last = await _last_alert()
    if not last:
        return True
    if last.get("severity") != new_severity:
        return True
    # Same severity — only re-fire if 24h passed
    try:
        last_at = datetime.fromisoformat(last["created_at"].replace("Z", "+00:00"))
    except Exception:
        return True
    return (datetime.now(timezone.utc) - last_at) > timedelta(hours=24)


async def evaluate_and_alert(insights: dict) -> dict:
    """Inspect an AI-insights payload and persist/send an alert if warranted.

    Returns {"fired": bool, "severity": ..., "score": ...} for diagnostics.
    """
    try:
        score = int(insights.get("health_score") or 0)
    except (TypeError, ValueError):
        return {"fired": False, "reason": "invalid_score"}

    severity = _severity_for(score)
    if severity is None:
        return {"fired": False, "score": score, "reason": "healthy"}

    if not await _should_fire_alert(severity):
        return {"fired": False, "score": score, "severity": severity, "reason": "throttled"}

    now_iso = datetime.now(timezone.utc).isoformat()
    alert_doc = {
        "kind": "health_score",
        "severity": severity,
        "score": score,
        "headline": insights.get("headline", ""),
        "risks": insights.get("risks", []),
        "recommendations": insights.get("recommendations", []),
        "metrics_snapshot": insights.get("metrics", {}),
        "created_at": now_iso,
        "resolved_at": None,
    }
    await main_db.platform_alerts.insert_one(alert_doc)

    # ── Best-effort email to all super-admins ──────────────────────────────
    admins_cursor = main_db.saas_super_admins.find({}, {"_id": 0, "email": 1, "name": 1})
    admins = await admins_cursor.to_list(50)

    if admins:
        label = "حرج" if severity == "critical" else "تحذير"
        risks_text = " • ".join((insights.get("risks") or [])[:3]) or "—"
        recs_text = " • ".join((insights.get("recommendations") or [])[:3]) or "—"
        from services.email_templates import generic_alert_email
        subject, body = generic_alert_email(
            title=f"تنبيه صحة المنصة — {label} (درجة {score}/100)",
            message=(
                f"{insights.get('headline', '—')}\n\n"
                f"المخاطر: {risks_text}\n\n"
                f"التوصيات: {recs_text}"
            ),
            severity=severity,
        )
        es = EmailService()
        for a in admins:
            email = a.get("email")
            if email:
                try:
                    await es.send_email(
                        to=email,
                        subject=subject,
                        html=body,
                    )
                except Exception as exc:
                    logger.warning("Failed to email %s: %s", email, exc)

    logger.info("Health alert fired: severity=%s score=%d", severity, score)
    return {"fired": True, "severity": severity, "score": score, "notified": len(admins)}
