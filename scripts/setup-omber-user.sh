#!/usr/bin/env bash
set -euo pipefail

# One-time host setup for running Ombers Communicator as non-root user "omber".
APP_USER="omber"
APP_GROUP="omber"
APP_DIR="/opt/ombers/ombers-communicator"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (or with sudo)."
  exit 1
fi

if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${APP_GROUP}"
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd \
    --system \
    --gid "${APP_GROUP}" \
    --home-dir "/nonexistent" \
    --shell "/usr/sbin/nologin" \
    --comment "Ombers Communicator service user" \
    "${APP_USER}"
fi

install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0750 "${APP_DIR}"

echo "User/group '${APP_USER}' created or already exists."
echo "Directory prepared: ${APP_DIR}"
echo "Next: copy project files into ${APP_DIR}, then install and restart systemd service."
