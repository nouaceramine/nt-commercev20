"""
AutoHeal Engine — p54
Intelligent self-healing scanner for the NT Commerce SaaS platform.

Runs scheduled + on-demand scans across the three platform levels
(subscriber / agent / super-admin), detects findings, applies SAFE
auto-remediations (priority degrees 1-3) inline, and queues the rest
(degrees 4-6) for super-admin approval via /api/saas/autoheal/*.

Safety rules (from the AutoHeal spec):
  - no record deletion — archive only (DB findings are never hard-deleted
    except clearly-expired auth artifacts)
  - no direct subscriber-data modification without explicit approval
  - when in doubt: skip auto-fix and flag for human review
"""
import asyncio
import hashlib
import re
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

SCAN_INTERVAL_SECONDS = 300
BACKUP_MAX_AGE_HOURS = 36

_engine = None


def get_engine():
    """Lazy singleton — main_db is imported at call time (never capture
    collections at module import; rule: _TenantDBProxy discipline)."""
    global _engine
    if _engine is None:
        from config.database import main_db
        _engine = AutoHealEngine(main_db)
    return _engine


def start_autoheal_scheduler(interval_seconds: int = SCAN_INTERVAL_SECONDS, first_delay: int = 45):
    """Start the periodic scan loop. MUST be called from a running event loop
    (main.py startup_event)."""
    eng = get_engine()

    async def _loop():
        await asyncio.sleep(first_delay)
        while True:
            try:
                # multi-worker guard: 4 uvicorn workers each start this loop —
                # only the Redis lock holder scans; lock self-expires so a dead
                # worker hands leadership over automatically.
                leader = True
                if eng._redis:
                    try:
                        leader = bool(await asyncio.to_thread(
                            eng._redis.set, "autoheal:leader", str(os.getpid()),
                            nx=True, ex=interval_seconds + 120,
                        ))
                    except Exception:  # noqa: BLE001
                        leader = True  # redis hiccup — scan anyway; dedupe handles overlap
                if leader:
                    logger.info("AutoHeal leader pid=%s running scan", os.getpid())
                    await eng.run_scan("scheduled")
            except Exception:  # noqa: BLE001
                logger.exception("AutoHeal scheduled scan failed")
            await asyncio.sleep(interval_seconds)

    asyncio.create_task(_loop())
    logger.info("AutoHeal scheduler started (every %ss, first run in %ss)", interval_seconds, first_delay)


async def emit_exception_finding(component_key: str, component_name_ar: str,
                                 path: str, method: str, error_id: str, exc: Exception) -> None:
    """p55 Channel 1 — real-time bridge: core.error_handler calls this on every
    unhandled exception so it becomes an AutoHeal finding instantly (no 5-min wait)."""
    try:
        await get_engine().emit_exception(component_key, component_name_ar, path, method, error_id, exc)
    except Exception:  # noqa: BLE001 — never break the error handler itself
        logger.warning("AutoHeal emit_exception_finding failed", exc_info=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _sig(module: str, key: str) -> str:
    return hashlib.sha1(f"{module}:{key}".encode(), usedforsecurity=False).hexdigest()[:16]


class AutoHealEngine:
    def __init__(self, main_db):
        self._main_db = main_db
        self._redis = None
        try:
            import redis as _redis_mod
            self._redis = _redis_mod.from_url(
                os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
                decode_responses=True, socket_connect_timeout=2,
            )
            self._redis.ping()
        except Exception:  # noqa: BLE001
            self._redis = None

    # ── main entry ──────────────────────────────────────────────────────────
    async def run_scan(self, scan_type: str = "scheduled") -> dict:
        started = _now()
        scan_id = f"SCAN-{started.strftime('%Y-%m-%d-%H-%M-%S')}-{uuid.uuid4().hex[:6]}"
        findings = []
        auto_actions = []

        checks = [
            self._check_mongo,
            self._check_redis,
            self._check_disk,
            self._check_memory,
            self._check_load,
            self._check_site_reachability,
            self._check_critical_system_errors,
            self._check_backup_freshness,
            self._check_expired_subscriptions,
            self._check_email_provider,
            self._check_bruteforce_wave,
            # p55: log-system channels
            self._check_error_log_patterns,
            self._check_client_logs,
            self._check_component_metrics,
        ]
        for check in checks:
            try:
                res = await check()
                if res:
                    findings.extend(res if isinstance(res, list) else [res])
            except Exception as exc:  # noqa: BLE001 — one broken check must not kill the scan
                logger.warning("AutoHeal check %s failed: %s", check.__name__, exc)

        # degree-2 hygiene, always safe
        cleaned = await self._cleanup_expired_auth_artifacts()
        if cleaned:
            auto_actions.append(cleaned)

        # persist findings (dedupe by signature)
        new_findings = []
        for f in findings:
            stored = await self._upsert_finding(scan_id, f)
            if stored:
                new_findings.append(stored)

        # critical findings → surface in the existing /saas-admin/alerts UI
        for f in new_findings:
            if f.get("severity") == "Critical":
                await self._notify_critical(f)

        # score from ACTIVE findings (not only this scan's)
        score, counts = await self._health_score()
        needs_approval = await self._main_db.autoheal_findings.count_documents(
            {"status": "awaiting_approval"}
        )
        scan_doc = {
            "id": scan_id,
            "scan_type": scan_type,
            "ai_engine": "AutoHeal-v1",
            "started_at": _iso(started),
            "duration_ms": int((_now() - started).total_seconds() * 1000),
            "counts": counts,
            "auto_fixed": len([a for a in auto_actions if a.get("status") == "success"]),
            "auto_actions": auto_actions,
            "needs_approval": needs_approval,
            "health_score": score,
        }
        await self._main_db.autoheal_scans.insert_one({**scan_doc})
        await self._update_known_issues(findings)
        logger.info(
            "AutoHeal %s done: score=%s findings=%s (new=%s) in %sms",
            scan_id, score, len(findings), len(new_findings), scan_doc["duration_ms"],
        )
        return scan_doc

    # ── individual checks (each returns a finding dict or None) ────────────
    async def _check_mongo(self):
        try:
            await self._main_db.command("ping")
        except Exception as exc:  # noqa: BLE001
            await asyncio.sleep(2)  # degree 1: smart retry
            try:
                await self._main_db.command("ping")
            except Exception:  # noqa: BLE001
                return self._finding(
                    "Critical", "System-wide", "DB", "mongo_down",
                    "قاعدة البيانات MongoDB لا تستجيب",
                    f"فشل ping مرتين متتاليتين: {exc}",
                    "أعد تشغيل حاوية mongodb فوراً وراجع سجلاتها (docker logs ntcommerce-mongodb)",
                    "immediate", "availability",
                    prevention="RULE-DB-01: مراقبة RestartCount يومياً — أي قفزة >0 تُنبه",
                )
        return None

    async def _check_redis(self):
        ok = False
        if self._redis:
            try:
                ok = await asyncio.to_thread(self._redis.ping)
            except Exception:  # noqa: BLE001
                ok = False
        if not ok:
            return self._finding(
                "High", "System-wide", "Config", "redis_down",
                "Redis لا يستجيب — القفل المشترك والكاش يعملان بوضع السقوط",
                "فشل الاتصال بـ Redis من خدمة backend",
                "أعد تشغيل حاوية redis وراجع REDIS_URL",
                "within-1h", "availability",
                prevention="RULE-INFRA-02: healthcheck لـ redis في docker-compose",
            )
        return None

    async def _check_disk(self):
        try:
            usage = shutil.disk_usage("/backups")  # bind-mounted host path
            pct = usage.used / usage.total * 100
        except Exception:  # noqa: BLE001
            return None
        if pct >= 95:
            sev, urg = "Critical", "immediate"
        elif pct >= 85:
            sev, urg = "High", "within-24h"
        else:
            return None
        return self._finding(
            sev, "System-wide", "DB", "disk_usage",
            f"امتلاء القرص {pct:.0f}٪",
            f"المساحة المستخدمة {usage.used // 2**30}GB من {usage.total // 2**30}GB",
            "نظّف النسخ الاحتياطية القديمة والسجلات أو وسّع القرص",
            urg, "availability",
            prevention="RULE-INFRA-03: تنبيه استباقي عند 80٪ + دورة حذف نسخ أقدم من 90 يوماً",
        )

    async def _check_memory(self):
        try:
            info = {}
            with open("/proc/meminfo") as fh:
                for line in fh:
                    k, _, v = line.partition(":")
                    info[k] = int(v.strip().split()[0])
            avail_pct = info["MemAvailable"] / info["MemTotal"] * 100
        except Exception:  # noqa: BLE001
            return None
        if avail_pct < 5:
            sev = "Critical"
        elif avail_pct < 10:
            sev = "High"
        else:
            return None
        return self._finding(
            sev, "System-wide", "Config", "memory_low",
            f"ذاكرة متاحة {avail_pct:.0f}٪ فقط",
            "ضغط ذاكرة على المضيف — قد يؤدي إلى OOM kills للحاويات",
            "راجع أكثر الحاويات استهلاكاً (docker stats) وأعد تشغيل المتضخمة",
            "within-1h", "availability",
        )

    async def _check_load(self):
        try:
            load1 = os.getloadavg()[0]
            cores = os.cpu_count() or 1
            ratio = load1 / cores
        except Exception:  # noqa: BLE001
            return None
        if ratio > 4:
            sev = "Critical"
        elif ratio > 2:
            sev = "High"
        else:
            return None
        return self._finding(
            sev, "System-wide", "Config", "cpu_load",
            f"حمل المعالج مرتفع ({load1:.1f} على {cores} أنوية)",
            "استهلاك CPU مستمر فوق الضعف — استجابة API ستتدهور",
            "حدّد العملية المستهلكة (top) وقيّم الترقية",
            "within-1h", "availability",
        )

    async def _check_site_reachability(self):
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                for attempt in (1, 2):  # degree 1: smart retry
                    try:
                        r = await client.get("https://nt-commerce.net/api/health")
                        if r.status_code == 200:
                            return None
                    except Exception:  # noqa: BLE001
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2)
                return self._finding(
                    "High", "System-wide", "API", "site_unhealthy",
                    "الموقع يستجيب لكن health لا يعيد 200",
                    "الواجهة تعمل لكن الـ backend قد يكون متدهوراً",
                    "راجع حالة حاوية backend",
                    "within-1h", "availability",
                )
        except Exception:  # noqa: BLE001
            return self._finding(
                "Critical", "System-wide", "API", "site_down",
                "الموقع غير قابل للوصول من الخارج",
                "فشل طلب HTTPS عبر Cloudflare مرتين — انقطاع محتمل",
                "افحص nginx والحاويات وCloudflare فوراً",
                "immediate", "availability",
                prevention="RULE-AVAIL-01: مراقبة خارجية (uptime monitor) كخط ثانٍ",
            )

    async def _check_critical_system_errors(self):
        try:
            count = await self._main_db.system_errors.count_documents(
                {"status": "active", "severity": "critical"}
            )
        except Exception:  # noqa: BLE001
            return None
        if count == 0:
            return None
        return self._finding(
            "High", "Super Admin", "System", "active_critical_errors",
            f"{count} أخطاء نظام حرجة ما تزال نشطة في سجل الأخطاء",
            "أخطاء مسجلة في system_errors لم تُعالج",
            "راجعها في /saas-admin/alerts — أو وافق على إغلاقها دفعة واحدة",
            "within-1h", "availability",
            remediation_key="resolve_critical_system_errors", remediation_payload={},
        )

    async def _check_backup_freshness(self):
        try:
            daily = "/backups/daily"
            if not os.path.isdir(daily):
                return None
            newest = 0.0
            for entry in os.scandir(daily):
                newest = max(newest, entry.stat().st_mtime)
            age_h = (_now().timestamp() - newest) / 3600 if newest else 9999
        except Exception:  # noqa: BLE001
            return None
        if age_h <= BACKUP_MAX_AGE_HOURS:
            return None
        return self._finding(
            "High", "Super Admin", "DB", "backup_stale",
            f"آخر نسخة احتياطية يومية عمرها {age_h:.0f} ساعة",
            "مهمة النسخ اليومي لم تُنتج جديداً خلال 36 ساعة",
            "افحص cron/مهمة النسخ وشغّل نسخة يدوية",
            "within-1h", "data-integrity",
            prevention="RULE-BKP-01: فشل النسخ اليومي يُنشئ system_error حرجاً تلقائياً",
        )

    async def _check_expired_subscriptions(self):
        try:
            now_iso = _iso(_now())
            expired = await self._main_db.saas_tenants.find(
                {
                    "subscription_ends_at": {"$lt": now_iso},
                    "is_trial": {"$ne": True},
                    "is_active": True,
                },
                {"_id": 0, "id": 1, "email": 1, "company_name": 1},
            ).to_list(50)
        except Exception:  # noqa: BLE001
            return None
        if not expired:
            return None
        names = ", ".join(t.get("company_name") or t.get("email", "?") for t in expired[:5])
        return self._finding(
            "Medium", "Subscriber", "Payment", "expired_subscriptions_active",
            f"{len(expired)} اشتراكات منتهية لكن حساباتها ما تزال نشطة",
            f"subscription_ends_at تجاوز الحاضر دون تعطيل: {names}",
            "وافق على التعطيل أو جدد اشتراكاتهم يدوياً",
            "within-24h", "revenue",
            remediation_key="deactivate_expired_tenants",
            remediation_payload={"tenant_ids": [t["id"] for t in expired if t.get("id")]},
            prevention="RULE-BILL-01: مهمة يومية تُعطل المنتهي تلقائياً بعد مهلة سماح متفق عليها",
        )

    async def _check_email_provider(self):
        try:
            from services.email_service import get_active_provider
            provider = await get_active_provider()
        except Exception:  # noqa: BLE001
            return None
        if provider != "mock":
            return None
        return self._finding(
            "Low", "Super Admin", "Config", "email_mock_mode",
            "البريد في وضع المحاكاة — رسائل إعادة كلمة المرور لا تصل للمستخدمين",
            "لم يُضبط أي مزوّد بريد (Brevo/Resend/SendGrid)",
            "اضبط المزود من /saas-admin/email-settings (Brevo مجاني 300 رسالة/يوم)",
            "within-24h", "availability",
        )

    async def _check_bruteforce_wave(self):
        if not self._redis:
            return None
        try:
            locks = await asyncio.to_thread(
                lambda: [k for k in self._redis.scan_iter("bf_lock:*")]
            )
        except Exception:  # noqa: BLE001
            return None
        if len(locks) < 5:
            return None
        return self._finding(
            "Medium", "System-wide", "Auth", "bruteforce_wave",
            f"{len(locks)} حسابات مقفلة حالياً — موجة تخمين محتملة",
            "عدد مفاتيح bf_lock في Redis تجاوز 5",
            "راجع سجل الدخول؛ يمكنك الموافقة على فك كل الأقفال دفعة واحدة",
            "within-1h", "security",
            remediation_key="clear_bruteforce_locks", remediation_payload={},
        )

    # ── p55 Channel 1: real-time exception intake ────────────────────────────
    async def emit_exception(self, component_key, component_name_ar, path, method, error_id, exc):
        exc_type = type(exc).__name__
        norm_path = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24}|/\d+", "/{id}", path)
        sensitive = component_key in ("auth", "payments", "sales", "finance", "wallet", "customers")
        sev = "Critical" if sensitive else "High"
        f = self._finding(
            sev, "System-wide", component_key, f"exc:{exc_type}:{norm_path}",
            f"استثناء غير معالَج في {component_name_ar}: {exc_type}",
            f"{method} {path} → {exc_type}: {str(exc)[:200]}",
            f"راجع logs/{component_key}.log — error_id: {error_id}",
            "immediate" if sensitive else "within-1h", "availability",
        )
        stored = await self._upsert_finding("realtime", f)
        if stored and sev == "Critical":
            await self._notify_critical(stored)

    # ── p55 Channel 2: incremental errors.log pattern reader ────────────────
    async def _check_error_log_patterns(self):
        log_file = os.path.join(os.path.dirname(__file__), "..", "logs", "errors.log")
        if not os.path.isfile(log_file):
            return None
        try:
            size = os.path.getsize(log_file)
            state = await self._main_db.autoheal_state.find_one({"_id": "errors_log_offset"})
            offset = state["value"] if state else None
            if offset is None:
                # first run: skip history, start tailing from now
                await self._main_db.autoheal_state.update_one(
                    {"_id": "errors_log_offset"},
                    {"$set": {"value": size, "initialized_at": _iso(_now())}},
                    upsert=True,
                )
                logger.info("AutoHeal errors.log tailing initialized at offset %s", size)
                return None
            if size < offset:  # log rotated
                offset = 0
            with open(log_file, encoding="utf-8", errors="replace") as fh:
                fh.seek(offset)
                chunk = fh.read(1_000_000)  # cap per cycle
                new_offset = fh.tell()
            await self._main_db.autoheal_state.update_one(
                {"_id": "errors_log_offset"}, {"$set": {"value": new_offset}}, upsert=True
            )
        except Exception:  # noqa: BLE001
            return None

        patterns = {}  # (component, norm_msg) -> {"count": int, "sample": str}
        for line in chunk.splitlines():
            parts = line.split(" | ", 3)
            if len(parts) < 4 or parts[1].strip() != "ERROR":
                continue  # continuation lines of tracebacks
            comp = parts[2].replace("nt.", "", 1)
            msg = parts[3]
            norm = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24}|\d+", "#", msg)
            norm = re.sub(r"\s+", " ", norm).strip()[:120]
            key = (comp, norm)
            p = patterns.setdefault(key, {"count": 0, "sample": msg})
            p["count"] += 1

        findings = []
        for (comp, norm), p in patterns.items():
            if p["count"] >= 20:
                sev = "High"
            elif p["count"] >= 5:
                sev = "Medium"
            else:
                continue
            findings.append(self._finding(
                sev, "System-wide", comp, f"logpat:{_sig(comp, norm)}",
                f"نمط أخطاء متكرر في {comp} ({p['count']}× خلال دورة المسح)",
                f"العينة: {p['sample'][:180]}",
                f"راجع logs/{comp}.log للتفاصيل الكاملة",
                "within-1h" if sev == "High" else "within-24h", "availability",
            ))
        return findings or None

    # ── p55 Channel 3: frontend/client error logs (system_logs) ─────────────
    async def _check_client_logs(self):
        try:
            cutoff = _iso(_now() - timedelta(minutes=10))
            docs = await self._main_db.system_logs.find(
                {"level": "error", "created_at": {"$gte": cutoff}},
                {"_id": 0, "source": 1, "type": 1, "message": 1, "url": 1},
            ).to_list(200)
        except Exception:  # noqa: BLE001
            return None
        if len(docs) < 5:
            return None
        groups = {}
        for d in docs:
            g = groups.setdefault(d.get("source") or "unknown", [])
            g.append(d)
        findings = []
        for source, items in groups.items():
            if len(items) < 5:
                continue
            sample = (items[0].get("message") or "")[:180]
            urls = {i.get("url") for i in items if i.get("url")}
            findings.append(self._finding(
                "Medium", "Subscriber", "API", f"client_logs:{source}",
                f"{len(items)} أخطاء واجهة ({source}) خلال 10 دقائق",
                f"العينة: {sample}" + (f" — الصفحات: {', '.join(list(urls)[:3])}" if urls else ""),
                "أخطاء متصفح لا تصل للـ backend — راجع /saas-admin/system-logs",
                "within-24h", "availability",
            ))
        return findings or None

    # ── p55: per-component performance/error metrics (registry) ─────────────
    async def _check_component_metrics(self):
        try:
            from core.registry import get_all_metrics
            metrics = get_all_metrics()
        except Exception:  # noqa: BLE001
            return None
        findings = []
        for key, m in metrics.items():
            reqs, rate, avg = m.get("requests", 0), m.get("error_rate", 0), m.get("avg_ms", 0)
            if reqs >= 20 and rate >= 20:
                sev, kind, desc = "High", "err", f"معدل أخطاء {rate}٪ في مكوّن {key} ({m['errors']}/{reqs} طلب)"
            elif reqs >= 20 and rate >= 5:
                sev, kind, desc = "Medium", "err", f"معدل أخطاء {rate}٪ في مكوّن {key}"
            elif reqs >= 10 and avg > 3000:
                sev, kind, desc = "Medium", "slow", f"مكوّن {key} بطيء — متوسط {avg:.0f}ms"
            else:
                continue
            findings.append(self._finding(
                sev, "System-wide", key, f"metrics:{kind}",
                desc,
                "مقاييس registry الحية (عينة من العامل الحالي — تُصفَّر عند إعادة التشغيل)",
                f"راجع logs/{key}.log ولوحة التشخيص /diagnostics",
                "within-1h" if sev == "High" else "within-24h", "availability",
            ))
        return findings or None

    # ── safe inline remediation (degree 2) ─────────────────────────────────
    async def _cleanup_expired_auth_artifacts(self):
        now_iso = _iso(_now())
        deleted = 0
        try:
            r1 = await self._main_db.pending_2fa_logins.delete_many({"expires_at": {"$lt": now_iso}})
            deleted += r1.deleted_count
            cutoff = _iso(_now() - timedelta(hours=24))
            r2 = await self._main_db.password_reset_requests.delete_many(
                {"$or": [{"used": True}, {"expires_at": {"$lt": now_iso}}], "created_at": {"$lt": cutoff}}
            )
            deleted += r2.deleted_count
        except Exception:  # noqa: BLE001
            return None
        if not deleted:
            return None
        return {
            "action": "cleanup_expired_auth_artifacts",
            "status": "success",
            "detail": f"حُذفت {deleted} مذكرات دخول/استعادة منتهية الصلاحية",
        }

    # ── approval-gated remediations (degrees 4-6) ──────────────────────────
    async def execute_remediation(self, finding: dict, approved_by: str) -> dict:
        key = finding.get("remediation_key")
        payload = finding.get("remediation_payload") or {}
        if key == "deactivate_expired_tenants":
            ids = payload.get("tenant_ids") or []
            r = await self._main_db.saas_tenants.update_many(
                {"id": {"$in": ids}},
                {"$set": {
                    "is_active": False,
                    "deactivated_by": f"autoheal:{approved_by}",
                    "deactivated_at": _iso(_now()),
                }},
            )
            return {"ok": True, "detail": f"عُطّلت {r.modified_count} حسابات منتهية الاشتراك"}
        if key == "resolve_critical_system_errors":
            r = await self._main_db.system_errors.update_many(
                {"status": "active", "severity": "critical"},
                {"$set": {
                    "status": "resolved",
                    "resolved_at": _iso(_now()),
                    "resolved_by": f"autoheal:{approved_by}",
                }},
            )
            return {"ok": True, "detail": f"أُغلقت {r.modified_count} أخطاء حرجة"}
        if key == "clear_bruteforce_locks":
            removed = 0
            if self._redis:
                keys = await asyncio.to_thread(lambda: list(self._redis.scan_iter("bf_lock:*")))
                if keys:
                    removed = await asyncio.to_thread(self._redis.delete, *keys)
            return {"ok": True, "detail": f"فُكّ قفل {removed} حسابات"}
        return {"ok": False, "detail": f"لا يوجد إصلاح مسجل للمفتاح: {key}"}

    # ── persistence helpers ────────────────────────────────────────────────
    def _finding(self, severity, level, module, key, title, root_cause,
                 manual_details, urgency, impact, remediation_key=None,
                 remediation_payload=None, prevention=None):
        return {
            "signature": _sig(module, key),
            "severity": severity,
            "level": level,
            "module": module,
            "title_ar": title,
            "root_cause_ar": root_cause,
            "auto_action_taken": None,
            "auto_action_status": "skipped",
            "manual_action_required": remediation_key is not None or severity in ("Critical", "High"),
            "manual_action_urgency": urgency,
            "manual_action_details_ar": manual_details,
            "ai_suggestion_ar": None,
            "prevention_rule_ar": prevention,
            "estimated_impact": impact,
            "remediation_key": remediation_key,
            "remediation_payload": remediation_payload,
        }

    async def _upsert_finding(self, scan_id: str, f: dict):
        """Dedupe: same active signature → bump occurrences; else insert."""
        existing = await self._main_db.autoheal_findings.find_one(
            {"signature": f["signature"], "status": {"$in": ["active", "awaiting_approval"]}}
        )
        if not existing:
            # a dismissed Low/Medium advisory stays dismissed (no 5-min spam);
            # Critical/High always re-surface while the problem persists.
            dismissed = await self._main_db.autoheal_findings.find_one(
                {"signature": f["signature"], "status": "dismissed"}
            )
            if dismissed and f.get("severity") in ("Low", "Medium"):
                return None
        if existing:
            await self._main_db.autoheal_findings.update_one(
                {"id": existing["id"]},
                {"$set": {"last_seen": _iso(_now()), "scan_id": scan_id},
                 "$inc": {"occurrences": 1}},
            )
            return None
        doc = dict(f)
        doc.update({
            "id": f"ERR-{uuid.uuid4().hex[:8].upper()}",
            "scan_id": scan_id,
            "status": "awaiting_approval" if f.get("remediation_key") else "active",
            "first_seen": _iso(_now()),
            "last_seen": _iso(_now()),
            "occurrences": 1,
            "affected_users_count": len((f.get("remediation_payload") or {}).get("tenant_ids") or []),
        })
        await self._main_db.autoheal_findings.insert_one(doc)
        return doc

    async def _update_known_issues(self, findings: list):
        for f in findings:
            ki = await self._main_db.autoheal_known_issues.find_one({"signature": f["signature"]})
            if ki:
                await self._main_db.autoheal_known_issues.update_one(
                    {"signature": f["signature"]},
                    {"$set": {"last_seen": _iso(_now())}, "$inc": {"occurrences": 1}},
                )
            elif f.get("severity") in ("Critical", "High"):
                await self._main_db.autoheal_known_issues.insert_one({
                    "signature": f["signature"],
                    "title_ar": f["title_ar"],
                    "module": f["module"],
                    "severity": f["severity"],
                    "first_seen": _iso(_now()),
                    "last_seen": _iso(_now()),
                    "occurrences": 1,
                    "prevention_rule_ar": f.get("prevention_rule_ar"),
                })

    async def _health_score(self):
        counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        async for f in self._main_db.autoheal_findings.find(
            {"status": {"$in": ["active", "awaiting_approval"]}}, {"_id": 0, "severity": 1}
        ):
            if f.get("severity") in counts:
                counts[f["severity"]] += 1
        score = 100 - 25 * counts["Critical"] - 10 * counts["High"] - 5 * counts["Medium"] - 2 * counts["Low"]
        return max(0, score), counts

    async def _notify_critical(self, f: dict):
        """Surface a new Critical finding in the existing alerts UI."""
        try:
            await self._main_db.system_errors.insert_one({
                "id": str(uuid.uuid4()),
                "type": "system",
                "severity": "critical",
                "message": f"[AutoHeal] {f['title_ar']}",
                "tenant_id": None,
                "tenant_name": None,
                "details": {"finding_id": f.get("id"), "root_cause": f.get("root_cause_ar")},
                "auto_fixable": bool(f.get("remediation_key")),
                "fix_action": f.get("remediation_key"),
                "timestamp": _iso(_now()),
                "status": "active",
            })
        except Exception:  # noqa: BLE001
            logger.warning("AutoHeal critical notify failed")
