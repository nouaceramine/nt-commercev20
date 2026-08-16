#!/bin/bash
# p123: Weekly restore test — proves the REAL daily mongodump archive is restorable.
# Restores the largest tenant DB from the latest daily archive into a scratch
# namespace inside the mongo container, validates restored doc counts against the
# counts mongorestore itself reported from the archive (not against the live DB,
# which drifts after backup time), then drops the scratch DB and records the
# result in main_db.platform_restore_tests.
set -u
BASE="/opt/ntcommerce/backups/daily"
LOG="/opt/ntcommerce/backups/restore_test.log"
TS=$(date '+%Y-%m-%d %H:%M:%S')
SCRATCH="restore_test_weekly"
TMPREP="/tmp/restore_test_report.$$"

echo "[$TS] start" >> "$LOG"

# 1) latest daily archive
ARCHIVE=$(ls -t "$BASE"/*/mongo.archive.gz 2>/dev/null | head -1)
if [ -z "$ARCHIVE" ]; then
  echo "[$TS] ALERT no daily archive found" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "لا توجد نسخة يومية للاختبار!"
  exit 1
fi
SIZE=$(du -h "$ARCHIVE" | cut -f1)

# 2) pick the largest tenant DB as the sample
TENANT_DB=$(docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" --eval '
  var dbs = db.adminCommand({listDatabases:1}).databases
    .filter(d => d.name.startsWith("tenant_"))
    .sort((a,b) => b.sizeOnDisk - a.sizeOnDisk);
  print(dbs.length ? dbs[0].name : "")')

if [ -z "$TENANT_DB" ]; then
  echo "[$TS] ALERT no tenant DB found" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "لا توجد قاعدة مستأجر لاختبار الاستعادة!"
  exit 1
fi

# 3) restore ONLY that namespace into the scratch DB
docker cp "$ARCHIVE" ntcommerce-mongodb:/tmp/restore_test.archive.gz
docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" \
  --eval "db.getSiblingDB('$SCRATCH').dropDatabase()" >/dev/null 2>&1

docker exec ntcommerce-mongodb mongorestore --archive=/tmp/restore_test.archive.gz --gzip \
  --nsInclude="${TENANT_DB}.*" \
  --nsFrom="${TENANT_DB}.*" --nsTo="${SCRATCH}.*" > "$TMPREP" 2>&1
RC=$?
[ "$RC" != "0" ] && cat "$TMPREP" >> "$LOG"
docker exec ntcommerce-mongodb rm -f /tmp/restore_test.archive.gz >/dev/null 2>&1

FAILED_DOCS=$(grep -oE '[0-9]+ document\(s\) failed to restore' "$TMPREP" | grep -oE '^[0-9]+' | head -1)
FAILED_DOCS=${FAILED_DOCS:-0}

if [ "$RC" != "0" ] || [ "$FAILED_DOCS" != "0" ]; then
  echo "[$TS] ALERT restore rc=$RC failed_docs=$FAILED_DOCS archive=$ARCHIVE" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "فشل اختبار الاستعادة الأسبوعي! rc=$RC failed=$FAILED_DOCS"
  rm -f "$TMPREP"
  exit 1
fi

# 4) expected counts = what mongorestore reported restoring, per collection
EXPECTED=$(grep -oE "finished restoring \`${SCRATCH}\.[^\`]+\` \([0-9]+ document" "$TMPREP" | \
  sed -E "s/finished restoring \`${SCRATCH}\.([^\`]+)\` \(([0-9]+) document/\1 \2/")
rm -f "$TMPREP"

# 5) actual counts in scratch
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

# 6) drop scratch
docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/admin" \
  --eval "db.getSiblingDB('$SCRATCH').dropDatabase()" >/dev/null 2>&1

# 7) record result in main DB
OKVAL="false"; [ -z "$MISMATCHES" ] && OKVAL="true"
docker exec ntcommerce-mongodb mongosh --quiet "mongodb://localhost:27017/ntcommerce" --eval "
  db.platform_restore_tests.insertOne({
    kind: 'weekly_mongodump_restore',
    source_archive: '$ARCHIVE', archive_size: '$SIZE', tenant_db: '$TENANT_DB',
    collections_checked: $CHECKED, docs_restored: $DOCS,
    mismatches: '$MISMATCHES', ok: $OKVAL,
    at: new Date().toISOString()
  })" >/dev/null 2>&1

if [ -z "$MISMATCHES" ]; then
  echo "[$TS] OK archive=$ARCHIVE ($SIZE) tenant=$TENANT_DB collections=$CHECKED docs=$DOCS" >> "$LOG"
  exit 0
else
  echo "[$TS] ALERT mismatches archive=$ARCHIVE:$MISMATCHES" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "اختبار الاستعادة وجد اختلافات:$MISMATCHES"
  exit 1
fi
