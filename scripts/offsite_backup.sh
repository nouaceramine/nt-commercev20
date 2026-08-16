#!/bin/bash
# p128: Encrypted off-site backup — encrypts the latest daily mongodump with
# GPG (AES256) and pushes it via rclone to the configured "offsite:" remote.
# Without an rclone remote it stages the encrypted archive locally under
# backups/offsite_ready/ and alerts that the remote is missing.
set -u
BASE="/opt/ntcommerce/backups"
LOG="$BASE/offsite_backup.log"
TS=$(date '+%Y-%m-%d %H:%M:%S')
KEYFILE="/opt/ntcommerce/.backup_key"
STAGE="$BASE/offsite_ready"
REMOTE="offsite:ntcommerce-backups"
KEEP_LOCAL=7

echo "[$TS] start" >> "$LOG"

[ -f "$KEYFILE" ] || { echo "[$TS] ALERT no backup key $KEYFILE" >> "$LOG"; /opt/ntcommerce/scripts/alert.sh "مفتاح تشفير النسخ الخارجية مفقود!"; exit 1; }

ARCHIVE=$(ls -t "$BASE"/daily/*/mongo.archive.gz 2>/dev/null | head -1)
[ -z "$ARCHIVE" ] && { echo "[$TS] ALERT no daily archive" >> "$LOG"; /opt/ntcommerce/scripts/alert.sh "لا توجد نسخة يومية لتشفيرها!"; exit 1; }

STAMP=$(basename "$(dirname "$ARCHIVE")")
mkdir -p "$STAGE"
ENC="$STAGE/mongo_$STAMP.archive.gz.gpg"

# 1) encrypt (symmetric AES256, passphrase from root-only keyfile)
if ! gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEYFILE" \
     --symmetric --cipher-algo AES256 -o "$ENC" "$ARCHIVE" 2>>"$LOG"; then
  echo "[$TS] ALERT gpg encryption failed" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "فشل تشفير النسخة الخارجية!"
  exit 1
fi

# 2) push off-site if the rclone remote exists
if rclone listremotes 2>/dev/null | grep -q '^offsite:$'; then
  if rclone copy "$ENC" "$REMOTE" --retries 3 --low-level-retries 5 >>"$LOG" 2>&1; then
    DEST="offsite-remote"
    rclone delete "$REMOTE" --min-age 30d >>"$LOG" 2>&1 || true
  else
    echo "[$TS] ALERT rclone push failed" >> "$LOG"
    /opt/ntcommerce/scripts/alert.sh "فشل رفع النسخة المشفرة خارج السيرفر!"
    exit 1
  fi
else
  DEST="local-stage-only-NO-REMOTE"
  echo "[$TS] WARN rclone remote 'offsite:' not configured — staged locally only" >> "$LOG"
fi

# 3) local staging retention
ls -t "$STAGE"/mongo_*.gpg 2>/dev/null | tail -n +$((KEEP_LOCAL+1)) | xargs -r rm -f

ESIZE=$(du -h "$ENC" | cut -f1)
echo "[$TS] OK $ENC ($ESIZE) -> $DEST" >> "$LOG"
exit 0
