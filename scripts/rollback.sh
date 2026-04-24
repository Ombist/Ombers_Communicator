#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <release_dir>"
  exit 1
fi

TARGET_RELEASE="$1"
APP_DIR="/opt/ombers/ombers-communicator"
SERVICE_NAME="ombers-communicator"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (or sudo)."
  exit 1
fi

if [[ ! -d "${TARGET_RELEASE}" ]]; then
  echo "Release directory not found: ${TARGET_RELEASE}"
  exit 1
fi

rsync -a --delete "${TARGET_RELEASE}/" "${APP_DIR}/"
chown -R omber:omber "${APP_DIR}"
systemctl restart "${SERVICE_NAME}"
systemctl is-active --quiet "${SERVICE_NAME}"

echo "Rollback completed: ${TARGET_RELEASE}"
