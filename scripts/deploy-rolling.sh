#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ombers/ombers-communicator"
SERVICE_NAME="ombers-communicator"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (or sudo)."
  exit 1
fi

rsync -a --delete ./ "${APP_DIR}/"
chown -R omber:omber "${APP_DIR}"

systemctl daemon-reload
systemctl restart "${SERVICE_NAME}"
systemctl is-active --quiet "${SERVICE_NAME}"

curl -fsS "http://127.0.0.1:${PHONE_PORT:-8080}/health" >/dev/null
curl -fsS "http://127.0.0.1:${MACHINE_PORT:-8081}/health" >/dev/null

echo "Deploy finished and health checks passed."
