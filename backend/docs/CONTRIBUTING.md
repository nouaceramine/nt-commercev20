# دليل المساهمة - NT Commerce

## هيكل المشروع
- `server.py` - الخادم الرئيسي (FastAPI)
- `robots/` - الروبوتات الذكية
- `services/` - خدمات مساعدة (إشعارات، SMS، بريد)
- `routes/` - مسارات API مقسمة
- `models/` - نماذج Pydantic
- `utils/` - أدوات مساعدة (auth, pagination, errors)
- `tests/` - اختبارات

## أسلوب الكتابة
- Python: PEP 8
- استخدم `async/await` لجميع عمليات DB
- استثني `_id` من جميع استجابات MongoDB
- استخدم `datetime.now(timezone.utc)` بدل `datetime.utcnow()`

## تشغيل الاختبارات
```bash
cd backend
pytest tests/ -v --cov=. --cov-report=html
```

## إضافة روبوت جديد
1. أنشئ ملف في `robots/`
2. أضف الكلاس مع methods: `start()`, `stop()`, `run_once()`
3. سجله في `robot_manager.py`

## قواعد API
- جميع المسارات تبدأ بـ `/api`
- المصادقة عبر JWT Bearer token
- استخدم `Depends(get_super_admin)` للمسارات الإدارية
