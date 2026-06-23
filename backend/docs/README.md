# NT Commerce - منصة محاسبة ذكية مدعومة بالذكاء الاصطناعي

## نظرة عامة
NT Commerce هي منصة SaaS متكاملة لإدارة المبيعات والمخزون والمحاسبة، مبنية باستخدام FastAPI + MongoDB + React.

## المتطلبات
- Python 3.11+
- MongoDB 7+
- Node.js 18+

## التشغيل

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd frontend
yarn install
yarn start
```

## بيانات الاختبار
| الدور | البريد | كلمة المرور |
|-------|--------|-------------|
| مدير عام | admin@ntcommerce.com | Admin@2024 |
| مستأجر | ncr@ntcommerce.com | Test@123 |

## الهيكل
```
backend/
├── server.py           # الخادم الرئيسي
├── robots/             # الروبوتات الذكية
│   ├── robot_manager.py
│   ├── inventory_robot.py
│   ├── debt_robot.py
│   └── report_robot.py
├── services/           # الخدمات
│   ├── notification_service.py
│   ├── sms_service.py
│   └── email_service.py
├── routes/             # المسارات
├── models/             # النماذج
├── utils/              # الأدوات المساعدة
├── tests/              # الاختبارات
└── config/             # الإعدادات
```

## الروبوتات الذكية

### روبوت المخزون (Inventory Robot)
- مراقبة المخزون المنخفض
- توصيات إعادة الطلب
- توقع نفاد المخزون (ML)
- تنظيف البيانات القديمة

### روبوت الديون (Debt Robot)
- متابعة الديون المستحقة
- إرسال تذكيرات تلقائية
- تحليل أداء التحصيل

### روبوت التقارير (Report Robot)
- تقارير يومية/أسبوعية/شهرية
- إنشاء PDF تلقائي
- إرسال بالبريد الإلكتروني

## API Endpoints - الروبوتات
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | /api/robots/status | حالة جميع الروبوتات |
| POST | /api/robots/restart/{name} | إعادة تشغيل روبوت |
| POST | /api/robots/run/{name} | تشغيل يدوي |
| POST | /api/robots/stop-all | إيقاف الكل |
| POST | /api/robots/start-all | تشغيل الكل |

## الترخيص
ملكية خاصة - NT Commerce
