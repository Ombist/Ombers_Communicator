#!/usr/bin/env bash
# Generate a minimal **lab-only** server cert and client CA for docker-compose.mtls.example.yml.
# Do not use in production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NGINX_DIR="$ROOT/nginx"
mkdir -p "$NGINX_DIR"
cd "$NGINX_DIR"

if [[ -f server-fullchain.pem && -f server-privkey.pem && -f client-ca-chain.pem ]]; then
  echo "PEMs already exist in $NGINX_DIR — delete them to regenerate."
  exit 0
fi

openssl req -x509 -newkey rsa:2048 -sha256 -days 30 -nodes \
  -keyout server-privkey.pem -out server-fullchain.pem \
  -subj "/CN=localhost/O=OmbersDevLab"

# For optional client verify, Nginx needs a CA file; reuse a self-signed as placeholder CA
# (real deployments must use a dedicated client-issuing CA — see docs/nginx-mtls-ingress.md).
cp server-fullchain.pem client-ca-chain.pem

echo "Wrote $NGINX_DIR/{server-fullchain.pem,server-privkey.pem,client-ca-chain.pem}"
echo "Run from repo root: docker compose -f docker-compose.mtls.example.yml up --build"
