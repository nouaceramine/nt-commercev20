# NT Commerce — Runbooks للطوارئ (p136)

> سيناريوهات الطوارئ الخمسة الأهم. كل الأوامر تُنفَّذ على السيرفر `root@168.231.81.154`.

---

## 1) الـ Backend لا يستجيب (API down)

**الأعراض:** https://nt-commerce.net/api/health لا يرجع 200؛ تنبيه `api_health=` في `/var/log/ntcommerce_monitor.log`.

```bash
# 1. شاهد السبب
docker logs ntcommerce-backend-1 --tail 50
# 2. أعد التشغيل
docker restart ntcommerce-backend-1
# 3. تحقق بعد ~25 ثانية
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/openapi.json
# 4. إن استمر الفشل: تراجع عن آخر تغيير
cd /opt/ntcommerce && git log --oneline -5
git revert HEAD && docker restart ntcommerce-backend-1
```

**ملاحظة:** `docker restart` لا يعيد قراءة `.env` — بعد تعديل الأسرار استخدم `cd /opt/ntcommerce && docker-compose up -d backend`.

---

## 2) MongoDB متوقف

**الأعراض:** `container:ntcommerce-mongodb=exited` في سجل المراقب.

```bash
docker logs ntcommerce-mongodb --tail 30
docker start ntcommerce-mongodb
# تحقق من الـ Replica Set (يجب PRIMARY)
docker exec ntcommerce-mongodb mongosh --quiet 'mongodb://localhost:27017/admin' --eval 'rs.status().myState'
# ثم أعد تشغيل الـ backend ليعيد الاتصال
docker restart ntcommerce-backend-1
```

**إن كان القرص ممتلئاً** → انظر السيناريو 3. **إن فسدت البيانات** → السيناريو 4.

---

## 3) القرص ممتلئ (≥85%)

**الأعراض:** تنبيه `disk=NN%`.

```bash
df -h /
# أكبر المستهلكين عادة:
du -sh /opt/ntcommerce/backups/* /var/lib/docker 2>/dev/null | sort -rh | head
# تنظيف آمن:
docker system prune -f                              # صور وحاويات مهجورة
ls -t /opt/ntcommerce/backups/daily | tail -n +15 | xargs -r -I{} rm -rf /opt/ntcommerce/backups/daily/{}
journalctl --vacuum-size=200M                       # سجلات النظام
```

**لا تحذف أبداً:** `frontend/build/static/js/main.*.js` القديمة أثناء عمل المستخدمين، ولا `/opt/ntcommerce/backups/daily` الأحدث 14 يوماً.

---

## 4) استعادة قاعدة البيانات من النسخة الاحتياطية

**متى:** فقدان بيانات / فساد / استعادة نقطة زمنية (آخر 24 ساعة).

```bash
# 1. اختر النسخة (اليومية المحلية)
ls -t /opt/ntcommerce/backups/daily/

# 2. (أ) استعادة كاملة لقاعدة واحدة إلى قاعدة جديدة للفحص أولاً:
docker cp /opt/ntcommerce/backups/daily/YYYY-MM-DD_HHMM/mongo.archive.gz ntcommerce-mongodb:/tmp/r.gz
docker exec ntcommerce-mongodb mongorestore --archive=/tmp/r.gz --gzip \
  --nsInclude='tenant_XXX.*' --nsFrom='tenant_XXX.*' --nsTo='recovered_check.*'

# 2. (ب) استعادة فعلية (تحل محل البيانات الحالية للقاعدة المحددة):
docker exec ntcommerce-mongodb mongosh --quiet 'mongodb://localhost:27017/admin' \
  --eval 'db.getSiblingDB("tenant_XXX").dropDatabase()'
docker exec ntcommerce-mongodb mongorestore --archive=/tmp/r.gz --gzip --nsInclude='tenant_XXX.*'
docker exec ntcommerce-mongodb rm -f /tmp/r.gz

# 3. من النسخة الخارجية المشفرة (إن ضاعت المحلية):
gpg --batch --pinentry-mode loopback --passphrase-file /opt/ntcommerce/.backup_key \
  -d /opt/ntcommerce/backups/offsite_ready/mongo_YYYY-MM-DD_HHMM.archive.gz.gpg > /tmp/mongo.archive.gz

# 4. أعد تشغيل الـ backend وتحقق
docker restart ntcommerce-backend-1
```

**التحقق الدوري التلقائي:** `weekly_restore_test.sh` كل أحد 05:00 — النتائج في `platform_restore_tests` و`/opt/ntcommerce/backups/restore_test.log`.

---

## 5) التراجع الفوري عن واجهة Frontend

**متى:** نشر بناء جديد ثم ظهر عطل في الواجهة.

```bash
# تراجع فوري للإصدار السابق (ثوانٍ):
/opt/ntcommerce/scripts/deploy.sh --rollback
# تحقق:
curl -s https://nt-commerce.net/index.html | grep -o 'main\.[a-z0-9]*\.js'
# الإصدارات المحفوظة (آخر 5):
ls -t /var/www/ntcommerce-releases/
# العودة للأمام: نشر جديد عادي
/opt/ntcommerce/scripts/deploy.sh
```

---

## مرجع سريع

| المورد | المكان |
|---|---|
| سجلات الحاويات الحية | https://nt-commerce.net/logs/ (Dozzle — admin) |
| مقاييس أداء المسارات | `GET /api/system/apm` (super admin) |
| أخطاء النظام المجمّعة | `GET /api/system-logs` (super admin) |
| بيئة التجربة | https://nt-commerce.net:8443 |
| CI | GitHub Actions → workflow `CI` |
| التنبيهات | تيليغرام عند ضبط `/opt/ntcommerce/.alert.env` |
