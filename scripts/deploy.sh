#!/bin/bash
# p131: One-command frontend deploy with instant rollback support.
# Keeps the last 5 builds under /var/www/ntcommerce-releases/ and flips a
# symlink-free copy pointer file. Usage:
#   deploy.sh            — build + deploy current source
#   deploy.sh --rollback — restore the previous build instantly
set -euo pipefail
FE="/opt/ntcommerce/frontend"
REL="/var/www/ntcommerce-releases"
LIVE="/var/www/ntcommerce"
LOG="/var/log/ntcommerce_deploy.log"
TS=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$REL"

if [ "${1:-}" = "--rollback" ]; then
  PREV=$(ls -t "$REL" | sed -n '2p')
  [ -z "$PREV" ] && { echo "[$TS] ROLLBACK FAILED: no previous release" >> "$LOG"; exit 1; }
  rm -rf "${LIVE}.new"
  cp -r "$REL/$PREV" "${LIVE}.new"
  # preserve hashed assets accumulated across releases (never delete rule)
  cp -rn "$LIVE/static/." "${LIVE}.new/static/" 2>/dev/null || true
  rm -rf "${LIVE}.old" && mv "$LIVE" "${LIVE}.old" && mv "${LIVE}.new" "$LIVE"
  echo "[$TS] ROLLBACK OK -> $PREV" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "تم التراجع عن واجهة frontend إلى الإصدار $PREV" || true
  echo "Rolled back to $PREV"
  exit 0
fi

STAMP=$(date +%Y%m%d_%H%M%S)
echo "[$TS] build start" >> "$LOG"
cd "$FE"
npm run build >> "$LOG" 2>&1

# stage new release
mkdir -p "$REL/$STAMP"
cp -r build/. "$REL/$STAMP/"
# carry over ALL historical hashed chunks (never delete old bundles mid-serve)
for OLD in $(ls -t "$REL" | grep -v "^$STAMP$"); do
  cp -rn "$REL/$OLD/static/." "$REL/$STAMP/static/" 2>/dev/null || true
  break
done

# atomic-ish swap
rm -rf "${LIVE}.new"
cp -r "$REL/$STAMP" "${LIVE}.new"
rm -rf "${LIVE}.old" && mv "$LIVE" "${LIVE}.old" && mv "${LIVE}.new" "$LIVE"

# keep last 5 releases
ls -t "$REL" | tail -n +6 | xargs -r -I{} rm -rf "$REL/{}"

echo "[$TS] deploy OK release=$STAMP" >> "$LOG"
echo "Deployed release $STAMP (rollback: $0 --rollback)"
