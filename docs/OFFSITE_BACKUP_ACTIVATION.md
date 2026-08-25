# تفعيل النسخ الاحتياطي السحابي (offsite) — دليل المالك

**الحالة:** البنية كاملة وتعمل يومياً منذ p128، وحُسّنت في p302 لتشمل ملفات البيئة والإعدادات.
**الناقص الوحيد:** حساب تخزين سحابي (10 دقائق لإنجازه مرة واحدة).

---

## ماذا يحدث يومياً (تلقائياً)

| الوقت | المهمة |
|---|---|
| 04:00 | `daily_backup.sh` — mongodump مضغوط + backend.env + frontend.env + docker-compose.yml → `backups/daily/` (احتفاظ 14 يوماً محلياً) |
| 04:30 | `offsite_backup.sh` — يحزّم النسخة اليومية كاملة ويشفّرها AES-256 ثم يرفعها إلى السحابة (احتفاظ 30 يوماً سحابياً) |
| الأحد 05:00 | `weekly_restore_test.sh` — اختبار استرجاع حقيقي أسبوعي |

حالياً يظهر في `backups/offsite_backup.log` يومياً: `WARN rclone remote 'offsite:' not configured` — أي أن الرفع السحابي معطّل حتى تُنجز الخطوات أدناه.

## الخطوة 1 — إنشاء حساب التخزين (موصى به: Backblaze B2)

1. سجّل في https://www.backblaze.com/b2/cloud-storage.html — **أول 10GB مجانية** (استهلاكنا ≈ 0.3GB/شهر أي مجاني فعلياً).
2. أنشئ Bucket باسم: `ntcommerce-backups` (Files are private).
3. من App Keys أنشئ مفتاحاً بصلاحية القراءة/الكتابة على هذا الـ bucket، واحفظ: `keyID` و `applicationKey`.

*(بديل: Google Drive مجاني 15GB — الإعداد أطول قليلاً لأنه يتطلب مصادقة OAuth عبر متصفح).*

## الخطوة 2 — إعداد rclone على الخادم

```bash
ssh root@<الخادم>
rclone config
```

- `n` (remote جديد) → الاسم: **`offsite`** (حرفياً — السكربت يبحث عن هذا الاسم)
- Storage → اختر `b2` (Backblaze B2)
- أدخل `account` = keyID ثم `key` = applicationKey
- بقية الأسئلة: Enter (افتراضي) → ثم `q` للخروج

تحقق: `rclone listremotes` يجب أن يُظهر `offsite:`

## الخطوة 3 — التفعيل والتحقق

```bash
# تشغيل فوري (أو انتظر الموعد اليومي 04:30)
/opt/ntcommerce/scripts/offsite_backup.sh

# يجب أن ترى ملفاً مثل:
rclone ls offsite:ntcommerce-backups
#   ntbackup_2026-08-26_0430.tar.gz.gpg

# وتأكد أن اللوج لم يعد يحذّر:
tail -2 /opt/ntcommerce/backups/offsite_backup.log
```

## خطوة حرجة — احفظ مفتاح التشفير خارج الخادم الآن

النسخ السحابية مشفّرة؛ **بدون هذا المفتاح لا يمكن فكها إذا ضاع الخادم**:

```bash
cat /opt/ntcommerce/.backup_key
```

انسخ الناتج إلى مدير كلمات المرور / مكان آمن offline. هذا المفتاح لا يغادر الخادم أبداً بأي طريقة أخرى.

## الاسترجاع عند الكارثة (على خادم جديد)

```bash
# 1) جلب أحدث نسخة من السحابة
rclone copy offsite:ntcommerce-backups/ntbackup_YYYY-MM-DD_HHMM.tar.gz.gpg /root/

# 2) فك التشفير (ستُطلب عبارة المفتاح المحفوظة)
gpg -d ntbackup_YYYY-MM-DD_HHMM.tar.gz.gpg > ntbackup.tar.gz

# 3) فك الحزمة — تجد: mongo.archive.gz + backend.env + frontend.env + docker-compose.yml
tar -xzf ntbackup.tar.gz -C /root/restore/

# 4) استرجاع قاعدة البيانات داخل حاوية Mongo
docker cp /root/restore/mongo.archive.gz ntcommerce-mongodb:/tmp/
docker exec ntcommerce-mongodb mongorestore --archive=/tmp/mongo.archive.gz --gzip
```

## ملاحظات

- الحجم اليومي ≈ 8MB مضغوطاً ومشفراً → التكلفة الشهرية على B2: **$0** ضمن المجاني.
- الاحتفاظ السحابي 30 يوماً يُدار تلقائياً (لا حاجة لتنظيف يدوي).
- آخر 7 حزم مشفّرة تبقى أيضاً على الخادم في `backups/offsite_ready/` كطبقة إضافية.
- الكود المصدري محمي أصلاً بخط مستقل: git push يومي إلى GitHub (04:00).
