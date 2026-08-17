#!/bin/bash
# p124: shared alert dispatcher — sends a Telegram message when configured.
# Config sources (in order):
#   1. /opt/ntcommerce/.alert.env  (TELEGRAM_BOT_TOKEN=..., TELEGRAM_CHAT_ID=...)
#   2. p153: DB-backed config set from the SaaS UI, fetched via internal API
# Usage:  /opt/ntcommerce/scripts/alert.sh "message text"
# Silently no-ops when no config is available so callers never break.
set -u
MSG="${1:-}"
[ -z "$MSG" ] && exit 0

CONF="/opt/ntcommerce/.alert.env"
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
else
  # p153: fall back to the DB-backed config (set from /saas-admin/email-settings)
  ENV_FILE="/opt/ntcommerce/.env"
  ALERT_INTERNAL_KEY=""
  if [ -f "$ENV_FILE" ]; then
    ALERT_INTERNAL_KEY=$(grep -E '^ALERT_INTERNAL_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"')
  fi
  if [ -n "$ALERT_INTERNAL_KEY" ]; then
    RESP=$(curl -s --max-time 8 -H "X-Internal-Key: ${ALERT_INTERNAL_KEY}" \
      http://localhost:8001/api/internal/alert-config 2>/dev/null || true)
    TELEGRAM_BOT_TOKEN=$(printf '%s' "$RESP" | sed -n 's/.*"token"[": ]*"\([^"]*\)".*/\1/p')
    TELEGRAM_CHAT_ID=$(printf '%s' "$RESP" | sed -n 's/.*"chat_id"[": ]*"\([^"]*\)".*/\1/p')
    export TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
  fi
fi

[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && exit 0
[ -z "${TELEGRAM_CHAT_ID:-}" ] && exit 0

TEXT="🚨 NT Commerce $(hostname)
$MSG"
curl -s --max-time 10 -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  --data-urlencode text="$TEXT" >/dev/null 2>&1 || true
exit 0
