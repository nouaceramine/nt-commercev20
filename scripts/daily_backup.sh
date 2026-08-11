#!/bin/bash
# NT Commerce — daily MongoDB backup with 14-day retention
# Dumps every tenant DB + platform DB to a dated archive.
set -u
BACKUP_DIR="/opt/ntcommerce/backups/daily"
LOG="/var/log/ntcommerce_backup.log"
RETENTION_DAYS=14
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

DBS=$(docker exec ntcommerce-mongodb mongosh --quiet --eval \
  'db.adminCommand({listDatabases:1}).databases.map(d=>d.name).filter(n=>n==="ntcommerce"||n.startsWith("tenant_")).join(" ")' 2>/dev/null)

if [ -z "$DBS" ]; then
  log "ERROR: could not list databases — mongod unreachable?"
  exit 1
fi

FAIL=0
for DB in $DBS; do
  OUT="$BACKUP_DIR/${DB}_${DATE}.archive"
  if docker exec ntcommerce-mongodb mongodump --db "$DB" --archive > "$OUT" 2>>"$LOG"; then
    SIZE=$(du -h "$OUT" | cut -f1)
    log "OK $DB ($SIZE)"
  else
    log "FAIL $DB"
    FAIL=1
  fi
done

# retention
DELETED=$(find "$BACKUP_DIR" -name "*.archive" -mtime +$RETENTION_DAYS -delete -print | wc -l)
[ "$DELETED" -gt 0 ] && log "rotated $DELETED archives older than ${RETENTION_DAYS}d"

DISK=$(df -h / | awk 'NR==2{print $5}')
log "done (fail=$FAIL) disk=$DISK"
exit $FAIL
