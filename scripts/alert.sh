#!/bin/bash
# p124: shared alert dispatcher — sends a Telegram message when configured.
# Config: /opt/ntcommerce/.alert.env  (TELEGRAM_BOT_TOKEN=..., TELEGRAM_CHAT_ID=...)
# Usage:  /opt/ntcommerce/scripts/alert.sh "message text"
# Silently no-ops when the config is missing so callers never break.
set -u
MSG="${1:-}"
[ -z "$MSG" ] && exit 0
CONF="/opt/ntcommerce/.alert.env"
[ -f "$CONF" ] || exit 0
# shellcheck disable=SC1090
. "$CONF"
[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && exit 0
[ -z "${TELEGRAM_CHAT_ID:-}" ] && exit 0

TEXT="🚨 NT Commerce $(hostname)
$MSG"
curl -s --max-time 10 -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  --data-urlencode text="$TEXT" >/dev/null 2>&1 || true
exit 0
