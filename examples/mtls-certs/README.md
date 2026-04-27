# Example TLS + mTLS material for `docker-compose.mtls.example.yml`

This directory is **not** populated with real secrets in git. Before running Compose:

1. Generate a **server** key + cert (and full chain) for `server_name` you use in `nginx/ombers.conf`.
2. Create a **client CA** and optionally client certs for probes.
3. Place files next to `ombers.conf`:

| File | Purpose |
|------|---------|
| `nginx/server-fullchain.pem` | Server leaf + intermediates |
| `nginx/server-privkey.pem` | Server private key |
| `nginx/client-ca-chain.pem` | PEM bundle trusted for **client** cert verification |

Quick **lab** self-signed (not for production):

```bash
cd examples/mtls-certs
./gencerts.sh
```

Then from the **Ombers_Communicator** directory:

```bash
docker compose -f docker-compose.mtls.example.yml up --build
```

For production, use Let’s Encrypt or your internal PKI and follow [docs/nginx-mtls-ingress.md](../../docs/nginx-mtls-ingress.md).

The bundled `nginx/ombers.conf` uses **`ssl_verify_client optional`** so you can hit `/health` without a client cert while testing; switch to **`on`** per runbook before production.
