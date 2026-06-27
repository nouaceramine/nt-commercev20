"""Email templates — beautifully formatted Arabic-first transactional HTML.

All templates share `_base_layout()` for a consistent header / footer / brand
color so platform emails feel cohesive.

Each public function returns a tuple (subject, html) ready to pass to
`send_email(to, subject=..., html=...)`.

Templates:
  • welcome_tenant_email — new tenant onboarding
  • debt_reminder_email — outstanding wallet balance
  • impersonation_notice_email — GDPR-grade alert when super-admin starts a session
  • order_confirmation_email — e-com order receipt to the customer
  • generic_alert_email — fallback for system / health alerts

Style notes (intentional choices, NOT to be changed casually):
  - Inline CSS only (most email clients strip <style>).
  - 600px max-width centred card (Gmail / Outlook compatible).
  - dir="rtl" + font-family Tahoma/Segoe UI for proper Arabic rendering.
  - Soft emerald accent (#059669) matching the in-app palette.
"""
from html import escape as _h


_BRAND_COLOR = "#059669"   # emerald-600 — matches the in-app primary
_BRAND_COLOR_DARK = "#047857"
_BG_SOFT = "#f3f4f6"
_TEXT_PRIMARY = "#111827"
_TEXT_MUTED = "#6b7280"


def _base_layout(*, title: str, preheader: str, content_html: str, cta_label: str | None = None, cta_url: str | None = None) -> str:
    """Shared email shell. Renders the brand header, the content slot, and the footer."""
    cta_block = ""
    if cta_label and cta_url:
        cta_block = (
            f'<div style="text-align:center;margin:32px 0 8px 0">'
            f'<a href="{_h(cta_url)}" '
            f'style="display:inline-block;background:{_BRAND_COLOR};color:#ffffff;'
            f'text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;'
            f'font-size:15px;font-family:Tahoma,Arial,sans-serif">'
            f'{_h(cta_label)}</a></div>'
        )

    return f"""<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{_h(title)}</title>
</head>
<body style="margin:0;padding:0;background:{_BG_SOFT};font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:{_TEXT_PRIMARY}">
  <!-- preheader (hidden by most clients but visible in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:transparent">{_h(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG_SOFT};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.06)">
        <!-- Brand header -->
        <tr>
          <td style="background:{_BRAND_COLOR};padding:22px 30px;color:#ffffff">
            <div style="font-size:13px;opacity:0.9;letter-spacing:1px">NT COMMERCE</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px">{_h(title)}</div>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:28px 30px;font-size:15px;line-height:1.7;color:{_TEXT_PRIMARY}">
            {content_html}
            {cta_block}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:18px 30px;border-top:1px solid #e5e7eb;font-size:12px;color:{_TEXT_MUTED};text-align:center">
            هذا الإيميل أُرسل تلقائياً من نظام <strong style="color:{_BRAND_COLOR_DARK}">NT Commerce</strong>.<br>
            لا ترد على هذا العنوان مباشرة. للاستفسار، تواصل مع الدعم من داخل لوحة التحكم.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── 1. Tenant Welcome ──────────────────────────────────────────────────────
def welcome_tenant_email(*, tenant_name: str, company_name: str = "", login_url: str = "") -> tuple[str, str]:
    name = _h(tenant_name or "")
    company = _h(company_name or tenant_name or "متجركم")
    body = f"""
      <p>مرحباً <strong>{name}</strong>،</p>
      <p>تم إنشاء حسابك بنجاح على منصة <strong>NT Commerce</strong> لإدارة متجركم <strong style="color:{_BRAND_COLOR_DARK}">{company}</strong>.</p>
      <p>الآن يمكنك:</p>
      <ul style="padding-right:20px;margin:10px 0">
        <li>إدارة المنتجات والمخزون</li>
        <li>إصدار الفواتير وقبول المدفوعات</li>
        <li>تتبُّع المبيعات والديون</li>
        <li>تفعيل ميزة <strong>التجارة الإلكترونية</strong> لربط Shopify / Facebook / Instagram / WhatsApp</li>
      </ul>
      <p>سعداء بانضمامك إلينا — فريق الدعم متاح دائماً لمساعدتك.</p>
    """
    return ("🎉 مرحباً بك في NT Commerce", _base_layout(
        title="مرحباً بك في NT Commerce",
        preheader="تم إنشاء حسابك بنجاح — ابدأ بإعداد متجرك الآن.",
        content_html=body,
        cta_label="الدخول إلى لوحة التحكم" if login_url else None,
        cta_url=login_url or None,
    ))


# ── 2. Debt / Subscription Reminder ────────────────────────────────────────
def debt_reminder_email(*, tenant_name: str, amount_due: float, currency: str = "دج", statement_url: str = "") -> tuple[str, str]:
    name = _h(tenant_name or "")
    amount = f"{amount_due:,.2f}".replace(",", " ")
    body = f"""
      <p>عزيزنا <strong>{name}</strong>،</p>
      <p>نود تذكيركم بأن هناك مبلغاً متبقياً على حسابكم في منصة NT Commerce:</p>
      <div style="background:#fef9c3;border:1px solid #facc15;border-radius:10px;padding:18px;margin:18px 0;text-align:center">
        <div style="font-size:13px;color:#854d0e">المبلغ المستحق</div>
        <div style="font-size:28px;font-weight:800;color:#854d0e;margin-top:4px">{amount} {_h(currency)}</div>
      </div>
      <p>الرجاء تسوية المبلغ في أقرب وقت لتجنُّب أي توقُّف في الخدمات. يمكنكم تحميل كشف الحساب من خلال الرابط أدناه أو التواصل مع فريق المحاسبة.</p>
      <p style="color:{_TEXT_MUTED};font-size:13px">إذا كنتم قد سددتم المبلغ بالفعل، يرجى تجاهل هذا التذكير.</p>
    """
    return (f"تذكير: مبلغ مستحق {amount} {currency}", _base_layout(
        title="تذكير بمبلغ مستحق",
        preheader=f"رصيدكم المتأخر: {amount} {currency}",
        content_html=body,
        cta_label="تحميل كشف الحساب" if statement_url else None,
        cta_url=statement_url or None,
    ))


# ── 3. Impersonation Notice (GDPR transparency) ────────────────────────────
def impersonation_notice_email(*, tenant_name: str, admin_email: str, started_at: str, ip: str = "", stop_url: str = "") -> tuple[str, str]:
    name = _h(tenant_name or "")
    admin = _h(admin_email or "—")
    when = _h(started_at or "—")
    ip_part = f'<div>عنوان IP: <span style="font-family:monospace">{_h(ip)}</span></div>' if ip else ""
    body = f"""
      <p>تنبيه <strong>{name}</strong>،</p>
      <p>قام أحد مسؤولي منصة NT Commerce بالدخول إلى حسابكم لأغراض الدعم الفني أو الصيانة.</p>
      <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:14px;margin:14px 0;font-size:13px">
        <div>📧 المسؤول: <strong>{admin}</strong></div>
        <div>🕒 الوقت: <strong>{when}</strong></div>
        {ip_part}
      </div>
      <p>إذا لم تطلب هذا الدعم، يرجى التواصل معنا فوراً.</p>
      <p style="color:{_TEXT_MUTED};font-size:13px">جميع جلسات الانتحال مُسجَّلة بالكامل في سجل التدقيق ضمن لوحة التحكم.</p>
    """
    return ("🔐 جلسة دعم بدأت على حسابك", _base_layout(
        title="جلسة دعم على حسابكم",
        preheader=f"دعم بدأ بواسطة {admin} في {when}",
        content_html=body,
        cta_label="مراجعة سجل التدقيق" if stop_url else None,
        cta_url=stop_url or None,
    ))


# ── 4. E-com Order Confirmation (to customer) ──────────────────────────────
def order_confirmation_email(*, store_name: str, order_code: str, customer_name: str, items: list, total: float, currency: str = "دج", tracking_url: str = "") -> tuple[str, str]:
    store = _h(store_name or "متجر")
    code = _h(order_code or "")
    cust = _h(customer_name or "عزيزنا")
    total_fmt = f"{total:,.2f}".replace(",", " ")

    rows = ""
    for it in items:
        nm = _h((it.get("name") if isinstance(it, dict) else None) or "—")
        qty = (it.get("qty") if isinstance(it, dict) else None) or 0
        price = (it.get("total") if isinstance(it, dict) else None) or 0
        price_fmt = f"{float(price):,.2f}".replace(",", " ")
        rows += (
            f'<tr><td style="padding:8px;border-bottom:1px solid #eee">{nm}</td>'
            f'<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">{qty}</td>'
            f'<td style="padding:8px;border-bottom:1px solid #eee;text-align:left;direction:ltr">{price_fmt} {_h(currency)}</td></tr>'
        )

    body = f"""
      <p>مرحباً <strong>{cust}</strong>،</p>
      <p>شكراً لطلبك من <strong style="color:{_BRAND_COLOR_DARK}">{store}</strong>! تم تأكيد طلبك بنجاح برقم:</p>
      <div style="background:{_BG_SOFT};border-radius:10px;padding:14px;text-align:center;margin:14px 0;font-size:20px;font-weight:700;font-family:monospace;color:{_BRAND_COLOR_DARK}">
        {code}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;font-size:14px">
        <thead>
          <tr>
            <th style="background:{_BRAND_COLOR};color:#fff;padding:8px;text-align:right;font-weight:600">المنتج</th>
            <th style="background:{_BRAND_COLOR};color:#fff;padding:8px;text-align:center;font-weight:600">الكمية</th>
            <th style="background:{_BRAND_COLOR};color:#fff;padding:8px;text-align:left;font-weight:600">الإجمالي</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <div style="text-align:left;margin-top:18px;font-size:18px;font-weight:700;color:{_BRAND_COLOR_DARK};direction:ltr">
        المجموع: {total_fmt} {_h(currency)}
      </div>
      <p style="margin-top:18px">سنبدأ بتحضير طلبك ونرسل لك تحديثاً عند الشحن.</p>
    """
    return (f"تأكيد طلب {code}", _base_layout(
        title="تم استلام طلبك",
        preheader=f"طلب رقم {code} بإجمالي {total_fmt} {currency}",
        content_html=body,
        cta_label="تتبُّع الطلب" if tracking_url else None,
        cta_url=tracking_url or None,
    ))


# ── 5. Generic Alert (system health, security, etc.) ───────────────────────
def generic_alert_email(*, title: str, message: str, severity: str = "info", cta_label: str = "", cta_url: str = "") -> tuple[str, str]:
    """severity: 'info' | 'warning' | 'critical'"""
    colors = {
        "info":     ("#dbeafe", "#1e40af", "ℹ️"),
        "warning":  ("#fef9c3", "#854d0e", "⚠️"),
        "critical": ("#fee2e2", "#991b1b", "🚨"),
    }
    bg, fg, icon = colors.get(severity, colors["info"])
    body = f"""
      <div style="background:{bg};color:{fg};border-radius:10px;padding:16px;margin:8px 0;font-size:15px;line-height:1.7">
        <div style="font-size:18px;font-weight:700;margin-bottom:6px">{icon} {_h(title)}</div>
        <div>{_h(message)}</div>
      </div>
    """
    return (f"{icon} {title}", _base_layout(
        title=title,
        preheader=message[:100],
        content_html=body,
        cta_label=cta_label or None,
        cta_url=cta_url or None,
    ))
