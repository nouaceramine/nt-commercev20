# NT Commerce - نظام إدارة المبيعات والمخزون

<div align="center">

![NT Commerce Logo](https://img.shields.io/badge/NT_Commerce-SaaS-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-2.0.0-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge)

**نظام SaaS متكامل لإدارة المبيعات والمخزون | يدعم العربية والفرنسية**

[العربية](#العربية) | [Français](#français) | [English](#english)

</div>

---

## 📋 نظرة عامة

NT Commerce هو نظام إدارة مبيعات ومخزون متعدد المستأجرين (Multi-tenant SaaS) مصمم خصيصاً للأسواق العربية والفرنكوفونية. يوفر حلاً متكاملاً لإدارة نقاط البيع، المخزون، الزبائن، الموردين، والتقارير المالية.

## ✨ الميزات الرئيسية

### 🛒 نقطة البيع (POS)
- واجهة سريعة وسهلة الاستخدام
- 18 اختصار قابل للتخصيص للمنتجات
- دعم قارئ الباركود
- طباعة حرارية (58mm / 80mm)
- إدارة الحصص اليومية
- دعم طرق دفع متعددة (نقدي، بطاقة، آجل)

### 📦 إدارة المخزون
- تتبع المخزون في الوقت الحقيقي
- تنبيهات المخزون المنخفض
- دعم مستودعات متعددة
- إدارة المنتجات المعيبة
- تاريخ حركة المخزون

### 👥 إدارة العملاء
- ملفات تعريف العملاء
- نظام الديون والمستحقات
- سجل المشتريات
- نقاط الولاء

### 📊 التقارير والتحليلات
- لوحة تحكم شاملة
- تقارير المبيعات (يومي/أسبوعي/شهري/سنوي)
- تحليل الأرباح
- تقارير المخزون
- تصدير Excel/PDF

### 🏢 SaaS Multi-tenant
- إدارة مشتركين متعددة
- خطط اشتراك مرنة
- فواتير Stripe تلقائية
- لوحة تحكم المدير الأعلى

### 🌐 دعم اللغات
- العربية (RTL)
- الفرنسية
- تبديل فوري بين اللغات

---

## 🛠️ التقنيات المستخدمة

### Backend
- **FastAPI** - إطار عمل Python سريع
- **MongoDB** - قاعدة بيانات NoSQL
- **JWT** - نظام المصادقة
- **Pydantic** - التحقق من البيانات

### Frontend
- **React 18** - مكتبة واجهة المستخدم
- **Tailwind CSS** - تنسيق الواجهة
- **Shadcn/UI** - مكونات جاهزة
- **Recharts** - الرسوم البيانية
- **i18n** - دعم اللغات

### التكاملات
- **Stripe** - معالجة المدفوعات
- **SendGrid** - إرسال البريد الإلكتروني
- **OpenAI GPT-4o** - المساعد الذكي

---

## 🚀 التثبيت والتشغيل

### المتطلبات
- Python 3.11+
- Node.js 18+
- MongoDB 6+

### تثبيت Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# أو: venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### تثبيت Frontend

```bash
cd frontend
yarn install
```

### إعداد متغيرات البيئة

**Backend (.env)**
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=ntcommerce
JWT_SECRET=your-secret-key
STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG...
OPENAI_API_KEY=sk-...
```

**Frontend (.env)**
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### تشغيل التطبيق

```bash
# Backend
cd backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (في terminal آخر)
cd frontend
yarn start
```

---

## 📁 هيكل المشروع

```
/app
├── backend/
│   ├── server.py           # الخادم الرئيسي (FastAPI)
│   ├── routes/              # المسارات المنفصلة
│   │   ├── saas_routes.py   # مسارات SaaS
│   │   ├── system_errors.py # مسارات الأخطاء
│   │   └── database_routes.py
│   ├── models/
│   │   └── schemas.py       # نماذج Pydantic
│   ├── tests/               # اختبارات الوحدة
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/           # صفحات التطبيق
│   │   ├── components/      # المكونات
│   │   │   └── ui/          # Shadcn components
│   │   ├── hooks/           # React hooks
│   │   └── lib/             # المكتبات المساعدة
│   ├── public/
│   └── package.json
│
├── memory/
│   └── PRD.md               # متطلبات المنتج
│
└── test_reports/            # تقارير الاختبارات
```

---

## 🔐 الأمان

- تشفير JWT للمصادقة
- تشفير كلمات المرور بـ bcrypt
- CORS محدد
- Rate limiting
- فصل قواعد البيانات حسب المستأجر
- التحقق من الصلاحيات (RBAC)

---

## 📱 واجهات API الرئيسية

### المصادقة
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/auth/login` | تسجيل الدخول |
| POST | `/api/auth/register` | إنشاء حساب |
| GET | `/api/auth/me` | الملف الشخصي |

### المنتجات
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/products` | قائمة المنتجات |
| POST | `/api/products` | إضافة منتج |
| PUT | `/api/products/{id}` | تعديل منتج |
| DELETE | `/api/products/{id}` | حذف منتج |

### المبيعات
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/sales` | قائمة المبيعات |
| POST | `/api/sales` | إنشاء عملية بيع |
| GET | `/api/sales/{id}` | تفاصيل البيع |

### التقارير
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/stats` | إحصائيات لوحة التحكم |
| GET | `/api/reports/sales` | تقرير المبيعات |
| GET | `/api/reports/products` | تقرير المنتجات |

---

## 🧪 الاختبارات

```bash
# تشغيل اختبارات Backend
cd backend
pytest tests/ -v

# تشغيل اختبارات Frontend
cd frontend
yarn test
```

---

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT.

---

## 👨‍💻 المساهمة

نرحب بمساهماتكم! يرجى:
1. Fork المشروع
2. إنشاء branch جديد
3. إجراء التغييرات
4. إرسال Pull Request

---

## 📞 الدعم

- 📧 البريد: support@ntcommerce.com
- 📚 التوثيق: [docs.ntcommerce.com](https://docs.ntcommerce.com)

---

<div align="center">

**صنع بـ ❤️ للأسواق العربية والفرنكوفونية**

</div>
