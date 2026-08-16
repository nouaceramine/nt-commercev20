#!/bin/bash
# NT Commerce — health monitor (every 15 min via cron)
# Checks backend API, docker containers, nginx, disk. Logs ALERT lines on failure.
set -u
LOG="/var/log/ntcommerce_monitor.log"
TS=$(date '+%Y-%m-%d %H:%M:%S')
ALERTS=""

# 1) backend API through nginx (as users see it)
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/api/health)
[ "$CODE" != "200" ] && ALERTS="$ALERTS api_health=$CODE"

# 2) frontend bundle
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/)
[ "$CODE" != "200" ] && ALERTS="$ALERTS frontend=$CODE"

# 3) docker containers
for C in ntcommerce-backend-1 ntcommerce-mongodb ntcommerce-redis; do
  STATE=$(docker inspect -f '{{.State.Status}}' "$C" 2>/dev/null || echo "missing")
  [ "$STATE" != "running" ] && ALERTS="$ALERTS container:$C=$STATE"
done

# 4) nginx
systemctl is-active --quiet nginx || ALERTS="$ALERTS nginx=inactive"

# 5) disk
USE=$(df / | awk 'NR==2{gsub("%","",$5); print $5}')
[ "$USE" -ge 85 ] && ALERTS="$ALERTS disk=${USE}%"

if [ -n "$ALERTS" ]; then
  echo "[$TS] ALERT$ALERTS" >> "$LOG"
  /opt/ntcommerce/scripts/alert.sh "تنبيه صحة النظام:$ALERTS"
  exit 1
else
  echo "[$TS] OK disk=${USE}%" >> "$LOG"
  exit 0
fi
