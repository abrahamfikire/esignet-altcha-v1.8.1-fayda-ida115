#!/usr/bin/env bash
# Ensure VeriFayda python artifactory is running (default :18080 to avoid VPN on :8080).
set -euo pipefail
DC="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$DC/.env" ]]; then set -a; # shellcheck disable=SC1091
  source "$DC/.env"; set +a; fi
LOG="/tmp/verifayda-artifactory.log"
PORT="${ARTIFACTORY_PORT:-${ARTIFACTORY_HOST_PORT:-18080}}"
HOST="${ARTIFACTORY_HOST:-127.0.0.1}"

if curl -sf -o /dev/null "http://${HOST}:${PORT}/logo.png"; then
  size="$(curl -sS -o /dev/null -w '%{size_download}' "http://${HOST}:${PORT}/logo.png")"
  echo "Artifactory already up on ${HOST}:${PORT} (logo ${size} bytes)"
  exit 0
fi

echo "Starting artifactory on ${HOST}:${PORT}..."
pids="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
for pid in $pids; do
  kill "$pid" 2>/dev/null || true
done
sleep 1

nohup python3 "$DC/scripts/serve-verifayda-artifactory.py" --host "$HOST" --port "$PORT" >>"$LOG" 2>&1 &
echo "  pid $! (log $LOG)"

for i in $(seq 1 30); do
  if curl -sf -o /dev/null "http://${HOST}:${PORT}/logo.png"; then
    size="$(curl -sS -o /dev/null -w '%{size_download}' "http://${HOST}:${PORT}/logo.png")"
    echo "Artifactory UP — logo ${size} bytes"
    exit 0
  fi
  sleep 1
done

echo "Artifactory failed to start. Tail $LOG:"
tail -20 "$LOG" || true
exit 1
