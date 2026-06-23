#!/usr/bin/env python3
"""
setup_wizard.py — NT Commerce Bridge First-Run Setup Wizard
واجهة رسومية بسيطة لإعداد ملف config.json للمرة الأولى.
Runs automatically when bridge.exe starts without a valid config.json.
"""
import json
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import font as tkfont
from tkinter import messagebox, ttk

# ── Detect exe bundle path ────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    BRIDGE_DIR = Path(sys.executable).parent
else:
    BRIDGE_DIR = Path(__file__).parent

CONFIG_FILE = BRIDGE_DIR / "config.json"

# ── Colours & fonts ───────────────────────────────────────────────────────────
CLR_BG      = "#f8f9fa"
CLR_HEADER  = "#1a56db"
CLR_BTN     = "#1a56db"
CLR_BTN_FG  = "#ffffff"
CLR_SUCCESS = "#15803d"
CLR_ERROR   = "#b91c1c"
CLR_BORDER  = "#d1d5db"
CLR_LABEL   = "#374151"
CLR_HINT    = "#6b7280"

NETWORKS = [
    ("mobilis",  "موبيليس", "*100#", "1"),
    ("djezzy",   "جازي",    "*555#", "2"),
    ("ooredoo",  "أوريدو",  "*555#", "3"),
]


def _load_existing() -> dict:
    """Load config if it already exists and has real values."""
    if not CONFIG_FILE.exists():
        return {}
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
        if cfg.get("cloud_url", "").startswith("https://your-app"):
            return {}
        return cfg
    except Exception:
        return {}


def run_wizard() -> bool:
    """
    Show the setup wizard.  Returns True if the user saved a valid config.
    Returns False if they closed the window without saving.
    """
    existing = _load_existing()
    saved    = [False]

    # ── Root window ──────────────────────────────────────────────────────────
    root = tk.Tk()
    root.title("إعداد جسر NT Commerce")
    root.configure(bg=CLR_BG)
    root.resizable(False, False)

    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    w, h = 600, 680
    root.geometry(f"{w}x{h}+{(sw - w)//2}+{(sh - h)//2}")

    try:
        root.iconbitmap(default="")
    except Exception:
        pass

    # ── Styles ───────────────────────────────────────────────────────────────
    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("TEntry",
                    padding=6,
                    relief="flat",
                    borderwidth=1,
                    fieldbackground="white")
    style.configure("TCombobox",
                    padding=6,
                    relief="flat",
                    borderwidth=1,
                    fieldbackground="white")
    style.map("TCombobox", fieldbackground=[("readonly", "white")])

    # ── Header ───────────────────────────────────────────────────────────────
    hdr = tk.Frame(root, bg=CLR_HEADER, height=72)
    hdr.pack(fill="x")
    hdr.pack_propagate(False)

    tk.Label(hdr,
             text="NT Commerce — جسر الشحن المحلي",
             bg=CLR_HEADER, fg="white",
             font=("Segoe UI", 14, "bold")).pack(expand=True)

    # ── Scrollable body ───────────────────────────────────────────────────────
    canvas    = tk.Canvas(root, bg=CLR_BG, highlightthickness=0)
    scrollbar = ttk.Scrollbar(root, orient="vertical", command=canvas.yview)
    body      = tk.Frame(canvas, bg=CLR_BG)

    body.bind("<Configure>",
              lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=body, anchor="nw", width=w)
    canvas.configure(yscrollcommand=scrollbar.set)

    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    def _scroll(event):
        canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
    root.bind_all("<MouseWheel>", _scroll)

    PAD = {"padx": 24, "pady": 4}

    def section_header(text):
        fr = tk.Frame(body, bg=CLR_HEADER, height=3)
        fr.pack(fill="x", padx=24, pady=(18, 0))
        tk.Label(body, text=text, bg=CLR_BG, fg=CLR_HEADER,
                 font=("Segoe UI", 11, "bold"), anchor="e",
                 justify="right").pack(fill="x", **PAD)

    def field(label, hint="", show="", initial=""):
        tk.Label(body, text=label, bg=CLR_BG, fg=CLR_LABEL,
                 font=("Segoe UI", 9, "bold"), anchor="e",
                 justify="right").pack(fill="x", **PAD)
        var = tk.StringVar(value=initial)
        e   = ttk.Entry(body, textvariable=var, show=show,
                        font=("Consolas", 10))
        e.pack(fill="x", **PAD)
        if hint:
            tk.Label(body, text=hint, bg=CLR_BG, fg=CLR_HINT,
                     font=("Segoe UI", 8), anchor="e",
                     justify="right").pack(fill="x", padx=24)
        return var

    # ── Section 1: Cloud connection ───────────────────────────────────────────
    section_header("① بيانات الاتصال بالسحابة")

    var_url    = field(
        "رابط التطبيق السحابي  Cloud URL",
        hint="مثال: https://my-shop.replit.app",
        initial=existing.get("cloud_url", ""))
    var_tenant = field(
        "معرّف المحل  Tenant ID",
        hint="من لوحة الإدارة ← إعدادات الشحن",
        initial=existing.get("tenant_id", ""))
    var_secret = field(
        "المفتاح السري  Bridge Secret",
        hint="من لوحة الإدارة ← إعدادات الشحن ← مفتاح الجسر",
        show="•",
        initial=existing.get("bridge_secret", ""))

    # Test button + status label
    test_fr = tk.Frame(body, bg=CLR_BG)
    test_fr.pack(fill="x", padx=24, pady=8)
    status_lbl = tk.Label(test_fr, text="", bg=CLR_BG,
                          font=("Segoe UI", 9), anchor="w")
    status_lbl.pack(side="right", padx=8)

    def _do_test():
        import requests
        url    = var_url.get().strip().rstrip("/")
        tenant = var_tenant.get().strip()
        secret = var_secret.get().strip()
        if not (url and tenant and secret):
            status_lbl.config(text="⚠ أدخل الحقول الثلاثة أولاً", fg=CLR_ERROR)
            return
        status_lbl.config(text="⏳ جاري الاتصال…", fg=CLR_HINT)
        root.update_idletasks()

        def _test():
            try:
                resp = requests.get(
                    f"{url}/api/recharge/bridge/status",
                    headers={"X-Bridge-Secret": secret, "X-Tenant-ID": tenant},
                    timeout=8)
                if resp.status_code == 200:
                    root.after(0, lambda: status_lbl.config(
                        text="✅ الاتصال ناجح!", fg=CLR_SUCCESS))
                elif resp.status_code == 403:
                    root.after(0, lambda: status_lbl.config(
                        text="❌ رُفض الوصول — تحقق من المفتاح السري و Tenant ID",
                        fg=CLR_ERROR))
                else:
                    root.after(0, lambda: status_lbl.config(
                        text=f"❌ HTTP {resp.status_code} — تحقق من الرابط",
                        fg=CLR_ERROR))
            except Exception as exc:
                root.after(0, lambda: status_lbl.config(
                    text=f"❌ لا يمكن الاتصال: {exc!s:.60}",
                    fg=CLR_ERROR))

        threading.Thread(target=_test, daemon=True).start()

    tk.Button(test_fr,
              text="  اختبار الاتصال  ",
              bg="#f3f4f6", fg=CLR_LABEL,
              relief="flat", bd=0,
              font=("Segoe UI", 9),
              cursor="hand2",
              command=_do_test).pack(side="left")

    # ── Section 2: Modems ─────────────────────────────────────────────────────
    section_header("② إعداد المودمات (اتركها فارغة إن لم تكن لديك)")

    tk.Label(body,
             text="أدخل رقم المنفذ COM لكل شريحة — ابحث في مدير الأجهزة (Device Manager)\n"
                  "مثال: COM3  —  COM4  —  COM5   |   Linux: /dev/ttyUSB0",
             bg=CLR_BG, fg=CLR_HINT,
             font=("Segoe UI", 8), justify="right", anchor="e",
             wraplength=548).pack(fill="x", padx=24, pady=(0, 6))

    existing_modems = {m.get("network", ""): m for m in existing.get("modems", [])}
    modem_vars = []

    for net_key, net_ar, bal_ussd, slot in NETWORKS:
        ex = existing_modems.get(net_key, {})
        fr = tk.LabelFrame(body, text=f"  {net_ar} ({net_key})  ",
                           bg=CLR_BG, fg=CLR_LABEL,
                           font=("Segoe UI", 9, "bold"),
                           padx=10, pady=6)
        fr.pack(fill="x", padx=24, pady=4)

        row1 = tk.Frame(fr, bg=CLR_BG)
        row1.pack(fill="x", pady=2)
        tk.Label(row1, text="منفذ COM:", bg=CLR_BG, fg=CLR_LABEL,
                 font=("Segoe UI", 9), width=10, anchor="e").pack(side="right")
        v_port = tk.StringVar(value=ex.get("port", ""))
        ttk.Entry(row1, textvariable=v_port,
                  font=("Consolas", 10), width=14).pack(side="right", padx=4)

        tk.Label(row1, text="PIN (اختياري):", bg=CLR_BG, fg=CLR_LABEL,
                 font=("Segoe UI", 9), width=14, anchor="e").pack(side="right")
        v_pin = tk.StringVar(value=ex.get("pin", ""))
        ttk.Entry(row1, textvariable=v_pin,
                  font=("Consolas", 10), width=8, show="•").pack(side="right", padx=4)

        modem_vars.append((net_key, bal_ussd, slot, v_port, v_pin))

    # ── Section 3: Advanced (collapsed) ──────────────────────────────────────
    section_header("③ إعدادات متقدمة (اختيارية)")

    adv_fr = tk.Frame(body, bg=CLR_BG)
    adv_fr.pack(fill="x", padx=24)

    row_adv = tk.Frame(adv_fr, bg=CLR_BG)
    row_adv.pack(fill="x")

    var_poll = tk.StringVar(value=str(existing.get("poll_interval", "5")))
    tk.Label(row_adv, text="تكرار الاستقصاء (ثانية):", bg=CLR_BG, fg=CLR_LABEL,
             font=("Segoe UI", 9), anchor="e").pack(side="right")
    ttk.Entry(row_adv, textvariable=var_poll,
              font=("Consolas", 10), width=6).pack(side="right", padx=4)

    var_bal = tk.StringVar(value=str(existing.get("balance_interval", "3600")))
    tk.Label(row_adv, text="فحص الرصيد كل (ثانية):", bg=CLR_BG, fg=CLR_LABEL,
             font=("Segoe UI", 9), anchor="e").pack(side="right", padx=(24, 0))
    ttk.Entry(row_adv, textvariable=var_bal,
              font=("Consolas", 10), width=8).pack(side="right", padx=4)

    # ── Save button ───────────────────────────────────────────────────────────
    tk.Frame(body, bg=CLR_BG, height=12).pack()

    def _save():
        url    = var_url.get().strip().rstrip("/")
        tenant = var_tenant.get().strip()
        secret = var_secret.get().strip()

        if not url:
            messagebox.showerror("خطأ", "أدخل رابط التطبيق السحابي (Cloud URL)")
            return
        if not url.startswith("http"):
            messagebox.showerror("خطأ", "الرابط يجب أن يبدأ بـ https://")
            return
        if not tenant:
            messagebox.showerror("خطأ", "أدخل معرّف المحل (Tenant ID)")
            return
        if not secret:
            messagebox.showerror("خطأ", "أدخل المفتاح السري (Bridge Secret)")
            return

        # Build modem list — skip empty COM ports
        modems = []
        for net_key, bal_ussd, slot, v_port, v_pin in modem_vars:
            port = v_port.get().strip()
            if not port:
                continue
            modems.append({
                "network":      net_key,
                "port":         port,
                "pin":          v_pin.get().strip(),
                "balance_ussd": bal_ussd,
                "slot_id":      int(slot),
            })

        if not modems:
            ok = messagebox.askyesno(
                "تحذير",
                "لم تُدخل أي مودم.\n"
                "هل تريد الحفظ بدون مودمات وإعدادها لاحقاً؟")
            if not ok:
                return

        try:
            poll_interval    = int(var_poll.get()) if var_poll.get().strip() else 5
            balance_interval = int(var_bal.get())  if var_bal.get().strip()  else 3600
        except ValueError:
            poll_interval    = 5
            balance_interval = 3600

        cfg = {
            "cloud_url":      url,
            "tenant_id":      tenant,
            "bridge_secret":  secret,
            "modems":         modems,
            "poll_interval":    poll_interval,
            "balance_interval": balance_interval,
            "log_max_lines":    1000,
        }
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception as exc:
            messagebox.showerror("خطأ في الحفظ", str(exc))
            return

        saved[0] = True
        messagebox.showinfo("تم الحفظ", "تم حفظ الإعداد بنجاح ✅\nسيبدأ البرنامج الآن.")
        root.destroy()

    tk.Button(body,
              text="  💾  حفظ وبدء التشغيل  ",
              bg=CLR_BTN, fg=CLR_BTN_FG,
              relief="flat", bd=0,
              font=("Segoe UI", 11, "bold"),
              cursor="hand2",
              padx=20, pady=10,
              command=_save).pack(pady=12)

    tk.Label(body,
             text="يمكنك تعديل config.json يدوياً في أي وقت.",
             bg=CLR_BG, fg=CLR_HINT,
             font=("Segoe UI", 8)).pack(pady=(0, 20))

    root.protocol("WM_DELETE_WINDOW", lambda: (
        messagebox.showinfo("إلغاء",
                            "لم يتم الحفظ. يمكنك تشغيل البرنامج مرة أخرى للإعداد."),
        root.destroy()
    ))

    root.mainloop()
    return saved[0]


if __name__ == "__main__":
    run_wizard()
