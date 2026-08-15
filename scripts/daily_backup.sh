#!/bin/bash
# p89: NT Commerce daily backup — mongodump (gzip) + env/compose configs, 14-day retention.
set -u
BASE="/opt/ntcommerce/backups/daily"
STAMP="$(date +%Y-%m-%d_%H%M)"
DEST="$BASE/$STAMP"
LOG="$BASE/backup.log"
mkdir -p "$DEST"

echo "[$(date -Is)] start $STAMP" >> "$LOG"

# 1) Mongo dump inside the container, then copy out
if docker exec ntcommerce-mongodb mongodump --archive=/tmp/ntc_backup.archive --gzip >/dev/null 2>>"$LOG"; then
  docker cp ntcommerce-mongodb:/tmp/ntc_backup.archive "$DEST/mongo.archive.gz" 2>>"$LOG"
  docker exec ntcommerce-mongodb rm -f /tmp/ntc_backup.archive >/dev/null 2>&1
  SIZE=$(du -h "$DEST/mongo.archive.gz" | cut -f1)
  echo "[$(date -Is)] mongo OK ($SIZE)" >> "$LOG"
else
  echo "[$(date -Is)] MONGO DUMP FAILED" >> "$LOG"
fi

# 2) Configs + secrets (small, critical for a full restore)
cp /opt/ntcommerce/backend/.env "$DEST/backend.env" 2>/dev/null
cp /opt/ntcommerce/frontend/.env "$DEST/frontend.env" 2>/dev/null
cp /opt/ntcommerce/docker-compose.yml "$DEST/docker-compose.yml" 2>/dev/null
[ -f /opt/ntcommerce/yalidine_proxy.py ] && cp /opt/ntcommerce/yalidine_proxy.py "$DEST/yalidine_proxy.py"

# 3) Retention: drop backups older than 14 days
find "$BASE" -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf {} \; 2>>"$LOG"

echo "[$(date -Is)] done $STAMP" >> "$LOG"
