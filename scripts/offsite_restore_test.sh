#!/bin/bash
# p354: Monthly off-site restore drill — proves the OFF-SITE copy (Backblaze B2)
# is end-to-end restorable, closing the loop that p123's weekly test leaves open
# (the weekly test restores the LOCAL daily archive only).
#
# Chain under test:  B2 remote  ->  rclone download  ->  GPG AES256 decrypt
# (.backup_key)  ->  tar extract (p302 full package)  ->  mongorestore of the
# largest tenant into a scratch DB  ->  per-collection doc-count validation
# ->  drop scratch  ->  record in main_db.platform_restore_tests
# (kind=offsite_b2_restore, read by core/diagnostics)  ->  alert.sh on failure.
set -u
BASE="/opt/ntcommerce/backups"
LOG="$BASE/offsite_restore_test.log"
TS=$(date '+%Y-%m-%d %H:%M:%S')
KEYFILE="/opt/ntcommerce/.backup_key"
REMOTE="offsite:ntcommerce-backups"
SCRATCH="restore_test_offsite"
WORK="/tmp/offsite_drill.$$"
TMPREP="/tmp/offsite_drill_report.$$"

fail() {  # fail <message> — log, alert, cleanup, exit 1
  echo "[$TS] ALERT $1" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "$1"
  rm -rf "$WORK" "$TMPREP" 2>/dev/null
  docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" \
    --eval "db.getSiblingDB('$SCRATCH').dropDatabase()" >/dev/null 2>&1
  exit 1
}

echo "[$TS] start" >> "$LOG"

[ -f "$KEYFILE" ] || fail "مفتاح تشفير النسخ الخارجية مفقود — تدريب الاستعادة مستحيل!"
rclone listremotes 2>/dev/null | grep -q '^offsite:$' || fail "وجهة rclone 'offsite:' غير مهيأة — لا يمكن اختبار النسخة الخارجية!"

# 1) latest package on the REMOTE (not the local stage)
LATEST=$(rclone lsf "$REMOTE" --files-only 2>/dev/null | grep -E '^ntbackup_.*\.tar\.gz\.gpg$' | sort | tail -1)
[ -z "$LATEST" ] && fail "لا توجد حزم مشفرة على الوجهة الخارجية (B2)!"

mkdir -p "$WORK"

# 2) download from B2
if ! rclone copyto "$REMOTE/$LATEST" "$WORK/pkg.gpg" --retries 3 --low-level-retries 5 >>"$LOG" 2>&1; then
  fail "فشل تنزيل الحزمة من الوجهة الخارجية: $LATEST"
fi
RSIZE=$(du -h "$WORK/pkg.gpg" | cut -f1)

# 3) decrypt with the same key the nightly job uses
if ! gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEYFILE" \
     -o "$WORK/pkg.tar.gz" -d "$WORK/pkg.gpg" 2>>"$LOG"; then
  fail "فشل فك تشفير الحزمة الخارجية — المفتاح لا يطابق؟ ($LATEST)"
fi

# 4) the p302 package must contain everything needed for full DR
LISTING=$(tar -tzf "$WORK/pkg.tar.gz" 2>>"$LOG") || fail "حزمة الاستعادة الخارجية تالفة (tar)!"
for REQ in mongo.archive.gz backend.env frontend.env docker-compose.yml; do
  echo "$LISTING" | grep -q "[./]$REQ$" || fail "الحزمة الخارجية تنقصها $REQ!"
done
tar -xzf "$WORK/pkg.tar.gz" -C "$WORK" 2>>"$LOG" || fail "فشل استخراج الحزمة الخارجية!"
ARCHIVE=$(find "$WORK" -name mongo.archive.gz | head -1)
[ -f "$ARCHIVE" ] || fail "mongo.archive.gz غير موجود بعد الاستخراج!"

# 5) pick the largest tenant DB as the sample (same rule as the weekly test)
TENANT_DB=$(docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" --eval '
  var dbs = db.adminCommand({listDatabases:1}).databases
    .filter(d => d.name.startsWith("tenant_"))
    .sort((a,b) => b.sizeOnDisk - a.sizeOnDisk);
  print(dbs.length ? dbs[0].name : "")')
[ -z "$TENANT_DB" ] && fail "لا توجد قاعدة مستأجر لاختبار الاستعادة الخارجية!"

# 6) restore ONLY that namespace into the scratch DB
docker cp "$ARCHIVE" ntcommerce-mongodb:/tmp/offsite_drill.archive.gz
docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" \
  --eval "db.getSiblingDB('$SCRATCH').dropDatabase()" >/dev/null 2>&1

docker exec ntcommerce-mongodb mongorestore --archive=/tmp/offsite_drill.archive.gz --gzip \
  --nsInclude="${TENANT_DB}.*" \
  --nsFrom="${TENANT_DB}.*" --nsTo="${SCRATCH}.*" > "$TMPREP" 2>&1
RC=$?
[ "$RC" != "0" ] && cat "$TMPREP" >> "$LOG"
docker exec ntcommerce-mongodb rm -f /tmp/offsite_drill.archive.gz >/dev/null 2>&1

FAILED_DOCS=$(grep -oE '[0-9]+ document\(s\) failed to restore' "$TMPREP" | grep -oE '^[0-9]+' | head -1)
FAILED_DOCS=${FAILED_DOCS:-0}
if [ "$RC" != "0" ] || [ "$FAILED_DOCS" != "0" ]; then
  fail "فشل تدريب الاستعادة الخارجية! rc=$RC failed_docs=$FAILED_DOCS pkg=$LATEST"
fi

# 7) expected counts = what mongorestore reported restoring, per collection
EXPECTED=$(grep -oE "finished restoring \`${SCRATCH}\.[^\`]+\` \([0-9]+ document" "$TMPREP" | \
  sed -E "s/finished restoring \`${SCRATCH}\.([^\`]+)\` \(([0-9]+) document/\1 \2/")
rm -f "$TMPREP"

# 8) actual counts in scratch
MISMATCHES=""
CHECKED=0
DOCS=0
while read -r COL WANT; do
  [ -z "$COL" ] && continue
  GOT=$(docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/$SCRATCH" --eval "print(db.getCollection('$COL').countDocuments({}))")
  CHECKED=$((CHECKED+1))
  DOCS=$((DOCS+GOT))
  if [ "$GOT" != "$WANT" ]; then
    MISMATCHES="$MISMATCHES $COL:$WANT!=$GOT"
  fi
done <<< "$EXPECTED"

# 9) drop scratch + cleanup
docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" \
  --eval "db.getSiblingDB('$SCRATCH').dropDatabase()" >/dev/null 2>&1
rm -rf "$WORK"

# 10) record result (started_at mirrors the backend-service schema so
#     core/diagnostics — which sorts by started_at — sees this drill too)
OKVAL="false"; [ -z "$MISMATCHES" ] && OKVAL="true"
docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/ntcommerce" --eval "
  db.platform_restore_tests.insertOne({
    kind: 'offsite_b2_restore',
    source_package: '$LATEST', package_size: '$RSIZE', tenant_db: '$TENANT_DB',
    collections_checked: $CHECKED, docs_restored: $DOCS,
    mismatches: '$MISMATCHES', ok: $OKVAL,
    at: new Date().toISOString(), started_at: new Date()
  })" >/dev/null 2>&1

if [ -z "$MISMATCHES" ]; then
  echo "[$TS] OK pkg=$LATEST ($RSIZE) tenant=$TENANT_DB collections=$CHECKED docs=$DOCS" >> "$LOG"
  exit 0
else
  echo "[$TS] ALERT mismatches pkg=$LATEST:$MISMATCHES" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "تدريب الاستعادة الخارجية وجد اختلافات:$MISMATCHES"
  exit 1
fi
