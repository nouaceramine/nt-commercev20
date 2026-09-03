"""p357: إعادة تنشيط الزبائن الغائبين — كشف الخاملين + إرسال SMS.

النشاط = آخر بيع (sales) أو آخر كسب ولاء (loyalty_transactions) — يغطي
زبائن الكاشير وزبائن المطعم بالهاتف معاً. المنطق واحد يتقاسمه الروبوت
اليومي ونقاط المعاينة/التشغيل اليدوي.

بوابة: reactivation_settings {"id": "global", enabled: False افتراضياً}.
تبريد: لا رسالة ثانية لنفس الزبون قبل cooldown_days (افتراضي = dormant_days).
"""
from datetime import datetime, timezone, timedelta
import uuid

DEFAULT_MSG = "مرحباً {name}، اشتقنا لك في {company}! عد وزورنا — يسعدنا خدمتك من جديد."


def _now():
    return datetime.now(timezone.utc).isoformat()


async def find_dormant(tdb, dormant_days: int, limit: int = 500):
    """زبائن لهم هاتف وآخر نشاط لهم أقدم من dormant_days يوماً."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=dormant_days)).isoformat()

    last_sale = {}
    async for s in tdb.sales.aggregate([
        {"$match": {"customer_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$customer_id", "last": {"$max": "$created_at"}}},
    ]):
        last_sale[s["_id"]] = s.get("last") or ""

    last_loyalty = {}
    async for t in tdb.loyalty_transactions.aggregate([
        {"$match": {"type": "earn"}},
        {"$group": {"_id": "$customer_id", "last": {"$max": "$created_at"}}},
    ]):
        last_loyalty[t["_id"]] = t.get("last") or ""

    out = []
    async for c in tdb.customers.find(
            {"phone": {"$exists": True, "$nin": ["", None]}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1}):
        last = max(last_sale.get(c["id"]) or "", last_loyalty.get(c["id"]) or "")
        if not last:
            continue  # بلا أي نشاط موثق — لا دليل أنه كان زبوناً فاعلاً
        if last < cutoff:
            out.append({"customer_id": c["id"], "name": c.get("name", ""),
                        "phone": c["phone"], "last_activity": last})
            if len(out) >= limit:
                break
    out.sort(key=lambda d: d["last_activity"])
    return out


async def get_settings(tdb):
    st = await tdb.reactivation_settings.find_one({"id": "global"}, {"_id": 0})
    return st or {"id": "global", "enabled": False, "dormant_days": 30,
                  "cooldown_days": 30, "message": DEFAULT_MSG,
                  "max_per_run": 50}


async def run_reactivation(tdb, tenant, sms, max_per_run=None):
    """يرسل لكل خامل لم يُراسل ضمن فترة التبريد. يرجع ملخصاً."""
    st = await get_settings(tdb)
    if not st.get("enabled"):
        return {"enabled": False, "dormant": 0, "sent": 0}
    days = max(7, int(st.get("dormant_days", 30) or 30))
    cooldown = max(7, int(st.get("cooldown_days", days) or days))
    cap = max(1, int(max_per_run or st.get("max_per_run", 50) or 50))
    msg_tpl = st.get("message") or DEFAULT_MSG
    company = tenant.get("company_name") or ""

    dormant = await find_dormant(tdb, days)
    cooldown_cut = (datetime.now(timezone.utc) - timedelta(days=cooldown)).isoformat()

    sent = 0
    for d in dormant:
        if sent >= cap:
            break
        already = await tdb.reactivation_log.find_one(
            {"customer_id": d["customer_id"]}, {"_id": 0, "sent_at": 1},
            sort=[("sent_at", -1)])
        if already and (already.get("sent_at") or "") > cooldown_cut:
            continue
        msg = msg_tpl.replace("{name}", d["name"]).replace("{company}", company)
        try:
            ok = await sms.send_sms(d["phone"], msg)
        except Exception:
            ok = False
        if ok:
            sent += 1
            await tdb.reactivation_log.insert_one({
                "id": str(uuid.uuid4()), "customer_id": d["customer_id"],
                "name": d["name"], "phone": d["phone"], "message": msg,
                "last_activity": d["last_activity"], "sent_at": _now()})
    return {"enabled": True, "dormant": len(dormant), "sent": sent}
